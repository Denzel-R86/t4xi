import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { classifyLuggage } from "@/lib/pricing/luggage";

export type ConversationOwner = { wabaId: string; phoneNumberId: string; waId: string };
export type BookingDraft = Partial<{
  pickup: string; dropoff: string; date: string; time: string;
  persons: number; luggage: string; rideType: "enkel" | "retour";
  returnDate: string; returnTime: string; flightNumber: string; returnFlightNumber: string;
  customerName: string; customerEmail: string;
}>;
export type FlowState = "collecting_booking" | "ready_for_quote" | "awaiting_confirmation" | "booking_requested" | "completed" | "handoff" | "cancelled" | "expired";
export type QuotedTrip = {
  quoteId: string; totalCents: number; currency: "EUR"; expiresAt: string;
  draftRevision: number;
  /** From the domain service's airport context, never guessed from address text. */
  outboundFlightRequired: boolean; returnFlightRequired: boolean;
};
export type Conversation = {
  id: string; owner: ConversationOwner; version: number; draftRevision: number;
  state: FlowState; draft: BookingDraft; quote: QuotedTrip | null;
  confirmationHash: string | null; commandId: string | null;
  booking: { id: string; reference: string; status: string } | null;
};
export type CustomerAction =
  | { type: "propose_fields"; fields: unknown }
  | { type: "confirm"; token: string }
  | { type: "handoff" }
  | { type: "cancel" };
export type ConversationEffect =
  | { type: "request_quote"; draft: BookingDraft; draftRevision: number }
  | { type: "show_quote"; quote: QuotedTrip; confirmationToken: string }
  | { type: "request_booking"; commandId: string; quoteId: string; draft: BookingDraft; customerPhone: string }
  | { type: "show_booking"; booking: NonNullable<Conversation["booking"]> }
  | { type: "handoff"; reason: string };
export type Decision = {
  accepted: boolean; reason: string; conversation: Conversation; effects: ConversationEffect[];
  /** Persist this metadata with the state CAS; never record the raw token/field values. */
  audit: { eventId: string; from: FlowState; to: FlowState; version: number; draftRevision: number; reason: string };
};
export type EventContext = { eventId: string; expectedVersion: number; now: Date };
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export const newConfirmationToken = () => randomBytes(32).toString("base64url");
export function newConversation(id: string, owner: ConversationOwner): Conversation {
  return { id, owner: { ...owner }, version: 0, draftRevision: 0, state: "collecting_booking", draft: {},
    quote: null, confirmationHash: null, commandId: null, booking: null };
}
function decision(previous: Conversation, context: EventContext, reason: string, next?: Conversation, effects: ConversationEffect[] = []): Decision {
  const conversation = next ? { ...next, version: previous.version + 1 } : previous;
  return { accepted: !!next, reason, conversation, effects,
    audit: { eventId: context.eventId, from: previous.state, to: conversation.state, version: conversation.version, draftRevision: conversation.draftRevision, reason } };
}
function validContext(c: Conversation, context: EventContext) {
  return !!context.eventId && context.expectedVersion === c.version && Number.isFinite(context.now.getTime());
}
const fieldNames = new Set(["pickup","dropoff","date","time","persons","luggage","rideType","returnDate","returnTime","flightNumber","returnFlightNumber","customerName","customerEmail"]);
function parsePatch(value: unknown): BookingDraft | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const patch: Record<string, string | number> = {};
  for (const [key, input] of Object.entries(value)) {
    if (!fieldNames.has(key)) return null;
    if (key === "persons") {
      if (typeof input !== "number" || !Number.isSafeInteger(input) || input < 1) return null;
      patch[key] = input;
    } else {
      if (typeof input !== "string" || input.length > 300 || !input.isWellFormed() || input.includes("\u0000")) return null;
      patch[key] = input.trim();
    }
  }
  if (!Object.keys(patch).length) return null;
  if (patch.rideType !== undefined && patch.rideType !== "enkel" && patch.rideType !== "retour") return null;
  if (patch.luggage !== undefined) {
    const luggage = classifyLuggage(patch.luggage as string);
    if (luggage.kind === "invalid") return null;
    patch.luggage = luggage.kind === "on_request" ? "overleg" : luggage.category;
  }
  return patch as BookingDraft;
}
/** Completeness only, not booking validation or a claim of availability. */
export function missingBookingFields(draft: BookingDraft): (keyof BookingDraft)[] {
  const required: (keyof BookingDraft)[] = ["pickup","dropoff","date","time","persons","luggage","rideType","customerName","customerEmail"];
  if (draft.rideType === "retour") required.push("returnDate", "returnTime");
  return required.filter(field => draft[field] === undefined || draft[field] === "");
}
function validSchedule(draft: BookingDraft, now: Date): boolean {
  if (!draft.date || !draft.time) return true;
  const departure = amsterdamDepartureIso(draft.date, draft.time);
  if (!departure || Date.parse(departure) <= now.getTime()) return false;
  if (draft.rideType === "retour" && draft.returnDate && draft.returnTime) {
    const returning = amsterdamDepartureIso(draft.returnDate, draft.returnTime);
    if (!returning || Date.parse(returning) <= Date.parse(departure)) return false;
  }
  return true;
}
const active = (state: FlowState) => ["collecting_booking", "ready_for_quote", "awaiting_confirmation"].includes(state);

/** The only customer/parser entrypoint. It cannot install quotes, booking results or identities. */
export function applyCustomerAction(c: Conversation, context: EventContext, owner: ConversationOwner, action: CustomerAction): Decision {
  if (!validContext(c, context)) return decision(c, context, "stale_event");
  if (owner.wabaId !== c.owner.wabaId || owner.phoneNumberId !== c.owner.phoneNumberId || owner.waId !== c.owner.waId) return decision(c, context, "wrong_sender");
  if (action.type === "handoff" || action.type === "cancel") {
    if (!active(c.state) && c.state !== "booking_requested") return decision(c, context, "inactive");
    // Once a command exists, a chat cancellation cannot pretend the booking was cancelled.
    const handoff = action.type === "handoff" || c.state === "booking_requested";
    return decision(c, context, handoff ? "handoff_requested" : "conversation_cancelled", {
      ...c, state: handoff ? "handoff" : "cancelled", quote: null, confirmationHash: null,
    }, handoff ? [{ type: "handoff", reason: c.commandId ? "booking_result_pending" : "customer_request" }] : []);
  }
  if (!active(c.state)) return decision(c, context, "inactive");
  if (action.type === "propose_fields") {
    const patch = parsePatch(action.fields);
    if (!patch) return decision(c, context, "invalid_fields");
    const draft = { ...c.draft, ...patch };
    if (draft.rideType === "enkel") {
      delete draft.returnDate; delete draft.returnTime; delete draft.returnFlightNumber;
    }
    if (!validSchedule(draft, context.now)) return decision(c, context, "invalid_schedule");
    const draftRevision = c.draftRevision + 1;
    if (draft.luggage === "overleg") return decision(c, context, "manual_luggage", {
      ...c, draft, draftRevision, state: "handoff", quote: null, confirmationHash: null,
    }, [{ type: "handoff", reason: "manual_luggage" }]);
    const ready = missingBookingFields(draft).length === 0;
    return decision(c, context, ready ? "ready_for_quote" : "fields_updated", {
      ...c, draft, draftRevision, state: ready ? "ready_for_quote" : "collecting_booking", quote: null, confirmationHash: null,
    }, ready ? [{ type: "request_quote", draft: { ...draft }, draftRevision }] : []);
  }
  if (action.type === "confirm") {
    if (c.state !== "awaiting_confirmation" || !c.quote || !c.confirmationHash) return decision(c, context, "no_confirmation_pending");
    if (c.quote.draftRevision !== c.draftRevision) return decision(c, context, "quote_mismatch");
    if (Date.parse(c.quote.expiresAt) <= context.now.getTime() || !validSchedule(c.draft, context.now)) {
      return decision(c, context, "quote_expired", { ...c, state: "expired", quote: null, confirmationHash: null });
    }
    if (!/^[a-f0-9]{64}$/.test(c.confirmationHash) || typeof action.token !== "string" || action.token.length > 128
      || !timingSafeEqual(Buffer.from(hash(action.token), "hex"), Buffer.from(c.confirmationHash, "hex"))) return decision(c, context, "invalid_confirmation");
    const commandId = hash(JSON.stringify([c.id, c.draftRevision, c.quote.quoteId]));
    return decision(c, context, "booking_requested", { ...c, state: "booking_requested", confirmationHash: null, commandId }, [{
      type: "request_booking", commandId, quoteId: c.quote.quoteId, draft: { ...c.draft }, customerPhone: "+" + c.owner.waId,
    }]);
  }
  return decision(c, context, "unknown_action");
}

/** Trusted domain adapter ONLY, after successful price-snapshot persistence. Not parser input. */
export function acceptDomainQuote(c: Conversation, context: EventContext, quote: QuotedTrip, token: string): Decision {
  if (!validContext(c, context)) return decision(c, context, "stale_event");
  if (c.state !== "ready_for_quote" || quote.draftRevision !== c.draftRevision) return decision(c, context, "quote_mismatch");
  if (!quote.quoteId || !Number.isSafeInteger(quote.totalCents) || quote.totalCents < 0 || quote.currency !== "EUR"
    || !Number.isFinite(Date.parse(quote.expiresAt)) || Date.parse(quote.expiresAt) <= context.now.getTime()
    || !/^[A-Za-z0-9_-]{43}$/.test(token) || typeof quote.outboundFlightRequired !== "boolean" || typeof quote.returnFlightRequired !== "boolean") return decision(c, context, "invalid_quote");
  if (!validSchedule(c.draft, context.now)) return decision(c, context, "invalid_schedule");
  if ((quote.outboundFlightRequired && !c.draft.flightNumber) || (quote.returnFlightRequired && !c.draft.returnFlightNumber)) {
    return decision(c, context, "flight_required", { ...c, state: "collecting_booking", quote: null, confirmationHash: null });
  }
  return decision(c, context, "quote_presented", { ...c, state: "awaiting_confirmation", quote: { ...quote }, confirmationHash: hash(token) }, [
    { type: "show_quote", quote: { ...quote }, confirmationToken: token },
  ]);
}

/** Trusted service result. The actual booking status is passed through, never synthesized. */
export function acceptBookingResult(c: Conversation, context: EventContext, commandId: string, booking: NonNullable<Conversation["booking"]>): Decision {
  if (!validContext(c, context)) return decision(c, context, "stale_event");
  if (c.booking || !c.commandId || c.commandId !== commandId || !["booking_requested", "handoff"].includes(c.state)) return decision(c, context, "unexpected_booking_result");
  if (!booking.id || !booking.reference || !booking.status) return decision(c, context, "invalid_booking_result");
  const state = c.state === "handoff" ? "handoff" : "completed";
  return decision(c, context, "booking_recorded", { ...c, state, booking: { ...booking }, quote: null, confirmationHash: null },
    state === "completed" ? [{ type: "show_booking", booking: { ...booking } }] : []);
}

/** Operator authorization must be checked outside this pure kernel; customers cannot invoke it. */
export function resumeConversation(c: Conversation, context: EventContext): Decision {
  if (!validContext(c, context)) return decision(c, context, "stale_event");
  if (c.state !== "handoff" || c.commandId || c.booking) return decision(c, context, "cannot_resume");
  return decision(c, context, "operator_resumed", { ...c, state: "collecting_booking", quote: null, confirmationHash: null });
}
