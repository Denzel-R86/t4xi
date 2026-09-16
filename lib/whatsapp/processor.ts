import { applyCustomerAction, newConversation, type Conversation, type CustomerAction, type Decision } from "./conversation";

export type ProcessingInput = { message: { id: string; text_body: string | null }; conversation: {
  id: string; waba_id: string; phone_number_id: string; wa_id: string; version: number;
  state: "active" | "handoff" | "closed"; booking_draft: Conversation["draft"]; flow: Conversation | null;
}; processed: boolean };
export interface ProcessingStore {
  load(messageId: string): Promise<ProcessingInput | null>;
  commit(messageId: string, version: number, decision: Decision): Promise<"committed" | "duplicate" | "conflict">;
}
/** No parser or worker is installed here. The deterministic decoder consumes the persisted message.
 * Only explicit CAS conflicts retry; unknown commit outcomes surface for same-message redelivery. */
export async function processInbound(store: ProcessingStore, messageId: string,
  decode: (message: ProcessingInput["message"]) => CustomerAction, now: () => Date = () => new Date()) {
  for (let attempt = 1; attempt <= 3; attempt++) {
    const input = await store.load(messageId);
    if (!input) throw new Error("INVALID_INBOUND");
    if (input.processed) return { result: "duplicate" as const, attempts: attempt };
    const row = input.conversation;
    const owner = { wabaId: row.waba_id, phoneNumberId: row.phone_number_id, waId: row.wa_id };
    const c = row.flow ?? { ...newConversation(row.id, owner), version: row.version, draft: row.booking_draft,
      state: row.state === "handoff" ? "handoff" as const : row.state === "closed" ? "cancelled" as const : "collecting_booking" as const };
    if (c.version !== row.version) throw new Error("CORRUPT_CONVERSATION_VERSION");
    const decision = applyCustomerAction(c, { eventId: messageId, expectedVersion: row.version, now: now() }, owner, decode(input.message));
    const result = await store.commit(messageId, row.version, decision);
    if (result !== "conflict") return { result, attempts: attempt };
  }
  throw new Error("CONVERSATION_RETRY_EXHAUSTED");
}
