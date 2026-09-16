import { createHmac } from "node:crypto";

export const MAX_INGRESS_EVENTS = 100;
export type IngressScope = { wabaId: string; phoneNumberId: string };
export type IngressEvent = {
  event_key: string;
  event_type: "message" | "status" | "unsupported" | "invalid";
  result: "stored" | "ignored" | "rejected";
  reason: "text_received" | "unsupported_message" | "provider_status" | "unsupported_event" | "invalid_event" | "wrong_account";
  provider_message_id?: string;
  wa_id?: string;
  message_type?: "text" | "unsupported";
  text_body?: string;
  provider_timestamp?: string;
};
const record = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const providerId = (value: unknown): value is string => typeof value === "string" && /^[A-Za-z0-9_:.=+/-]{1,512}$/.test(value);
const senderId = (value: unknown): value is string => typeof value === "string" && /^[1-9][0-9]{6,14}$/.test(value);
function timestamp(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^[0-9]{1,12}$/.test(value)) return;
  const seconds = Number(value);
  if (seconds > 253402300799) return;
  return new Date(seconds * 1000).toISOString();
}

/** Only normalized text and identifiers survive. No contacts, names, media or raw payloads. */
export function normalizeWhatsAppEvents(payload: unknown, scope: IngressScope, fingerprintSecret: string): IngressEvent[] {
  const events: IngressEvent[] = [];
  const identity = [scope.wabaId, scope.phoneNumberId];
  const key = (value: unknown) => createHmac("sha256", fingerprintSecret).update(JSON.stringify(value)).digest("hex");
  const push = (event: IngressEvent) => {
    if (events.length >= MAX_INGRESS_EVENTS) throw new Error("too_many_events");
    events.push(event);
  };
  const ignored = (value: unknown, reason: IngressEvent["reason"] = "unsupported_event") => push({
    event_key: key([identity, reason, value]),
    event_type: reason === "wrong_account" || reason === "invalid_event" ? "invalid" : "unsupported",
    result: reason === "wrong_account" || reason === "invalid_event" ? "rejected" : "ignored", reason,
  });
  const root = record(payload);
  if (!root) throw new Error("invalid_envelope");
  if (root.object !== "whatsapp_business_account") {
    ignored(root);
    return events;
  }
  if (!Array.isArray(root.entry) || root.entry.length === 0) throw new Error("invalid_envelope");
  for (const rawEntry of root.entry) {
    const entry = record(rawEntry);
    if (entry?.id !== scope.wabaId) { ignored(rawEntry, "wrong_account"); continue; }
    if (!Array.isArray(entry.changes) || entry.changes.length === 0) { ignored(rawEntry, "invalid_event"); continue; }
    for (const rawChange of entry.changes) {
      const change = record(rawChange);
      if (change?.field !== "messages") { ignored(rawChange); continue; }
      const value = record(change.value);
      const metadata = record(value?.metadata);
      if (metadata?.phone_number_id !== scope.phoneNumberId) { ignored(rawChange, "wrong_account"); continue; }
      if (value?.messaging_product !== "whatsapp") { ignored(rawChange, "invalid_event"); continue; }
      let recognized = false;
      if (Array.isArray(value.messages) && value.messages.length) {
        recognized = true;
        for (const rawMessage of value.messages) {
          const message = record(rawMessage);
          const sentAt = timestamp(message?.timestamp);
          if (!providerId(message?.id) || !senderId(message?.from) || !sentAt || typeof message?.type !== "string") {
            ignored(rawMessage, "invalid_event"); continue;
          }
          const text = record(message.text)?.body;
          if (message.type === "text" && (typeof text !== "string" || !text.length || text.length > 4096 || text.includes("\u0000") || !text.isWellFormed())) {
            ignored(rawMessage, "invalid_event"); continue;
          }
          const isText = message.type === "text";
          push({
            // Stable across batches and body changes. SQL also enforces scoped provider-ID uniqueness.
            event_key: key([identity, "message", message.id]), event_type: "message",
            result: isText ? "stored" : "ignored", reason: isText ? "text_received" : "unsupported_message",
            provider_message_id: message.id, wa_id: message.from,
            message_type: isText ? "text" : "unsupported",
            ...(isText ? { text_body: text as string } : {}), provider_timestamp: sentAt,
          });
        }
      }
      if (Array.isArray(value.statuses) && value.statuses.length) {
        recognized = true;
        for (const rawStatus of value.statuses) {
          const status = record(rawStatus);
          if (!providerId(status?.id) || !timestamp(status?.timestamp) || !["sent", "delivered", "read", "failed", "deleted"].includes(String(status?.status))) {
            ignored(rawStatus, "invalid_event"); continue;
          }
          push({ event_key: key([identity, "status", status.id, status.status, status.timestamp]), event_type: "status", result: "ignored", reason: "provider_status" });
        }
      }
      if (!recognized) ignored(rawChange);
    }
  }
  return events;
}
