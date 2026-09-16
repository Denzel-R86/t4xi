import assert from "node:assert/strict";
import { test } from "node:test";
import { applyCustomerAction, acceptDomainQuote, acceptBookingResult, newConversation, newConfirmationToken, resumeConversation, type Conversation, type CustomerAction, type QuotedTrip } from "./conversation";
const owner = { wabaId: "100", phoneNumberId: "200", waId: "31612345678" };
const now = new Date("2026-09-10T10:00:00Z");
const ctx = (c: Conversation) => ({ eventId: `event-${c.version}`, expectedVersion: c.version, now });
const fields = { pickup: "Amsterdam", dropoff: "Utrecht", date: "2026-09-12", time: "12:00", persons: 2, luggage: "handbagage", rideType: "enkel", customerName: "Test", customerEmail: "test@example.com" };
const act = (c: Conversation, a: CustomerAction) => applyCustomerAction(c, ctx(c), owner, a);
const initial = () => newConversation("conversation-1", owner);
const ready = () => act(initial(), { type: "propose_fields", fields }).conversation;
const quote = (c: Conversation): QuotedTrip => ({ quoteId: "stored-snapshot-1", totalCents: 12345, currency: "EUR", expiresAt: "2026-09-10T11:00:00Z", draftRevision: c.draftRevision, outboundFlightRequired: false, returnFlightRequired: false });
function offered() { const c = ready(); const token = newConfirmationToken(); return { c: acceptDomainQuote(c, ctx(c), quote(c), token).conversation, token }; }
test("controlled flow only proposes effects and passes actual price/status through", () => {
  const c = ready(); assert.equal(c.state, "ready_for_quote"); assert.equal(c.booking, null);
  const token = newConfirmationToken(); const offer = acceptDomainQuote(c, ctx(c), quote(c), token);
  assert.equal(offer.conversation.quote?.totalCents, 12345);
  assert.equal(offer.effects[0].type, "show_quote");
  assert.ok(!JSON.stringify(offer.conversation).includes(token));
  const confirm = act(offer.conversation, { type: "confirm", token });
  assert.equal(confirm.effects.length, 1); assert.equal(confirm.effects[0].type, "request_booking");
  if (confirm.effects[0].type === "request_booking") assert.equal(confirm.effects[0].customerPhone, "+31612345678");
  assert.equal(confirm.conversation.booking, null);
  const actual = { id: "db-id", reference: "T4XI-123", status: "pending_review" };
  const done = acceptBookingResult(confirm.conversation, ctx(confirm.conversation), confirm.conversation.commandId!, actual);
  assert.deepEqual(done.conversation.booking, actual); assert.equal(done.conversation.state, "completed");
});
for (const key of ["price", "totalCents", "status", "bookingId", "customerPhone", "quote", "owner", "__proto__"]) {
  test(`parser cannot propose ${key}`, () => { const c = initial(); const d = act(c, { type: "propose_fields", fields: JSON.parse(`{"${key}":"forged"}`) }); assert.equal(d.accepted, false); assert.deepEqual(d.effects, []); assert.equal(d.conversation, c); });
}
for (const patch of [{ persons: 0 }, { persons: 1.5 }, { luggage: "unknown" }, { rideType: "unknown" }, { pickup: "\u0000" }, { pickup: "x".repeat(301) }, {}]) {
  test(`invalid fields rejected ${JSON.stringify(patch).slice(0, 60)}`, () => assert.equal(act(initial(), { type: "propose_fields", fields: patch }).reason, "invalid_fields"));
}
test("partial draft cannot produce a quote or booking", () => { const d = act(initial(), { type: "propose_fields", fields: { pickup: "Amsterdam" } }); assert.equal(d.conversation.state, "collecting_booking"); assert.deepEqual(d.effects, []); assert.equal(act(d.conversation, { type: "confirm", token: "yes" }).accepted, false); });
test("wrong sender and stale version have no effects", () => { const { c, token } = offered(); for (const key of Object.keys(owner)) { const d = applyCustomerAction(c, ctx(c), { ...owner, [key]: "999" }, { type: "confirm", token }); assert.equal(d.reason, "wrong_sender"); assert.deepEqual(d.effects, []); } assert.equal(applyCustomerAction(c, { ...ctx(c), expectedVersion: 0 }, owner, { type: "confirm", token }).reason, "stale_event"); });
test("duplicate confirmation never produces another command", () => { const { c, token } = offered(); const first = act(c, { type: "confirm", token }); const duplicate = act(first.conversation, { type: "confirm", token }); assert.equal(duplicate.accepted, false); assert.deepEqual(duplicate.effects, []); });
test("edits invalidate old quote and confirmation", () => { const { c, token } = offered(); const changed = act(c, { type: "propose_fields", fields: { persons: 3 } }).conversation; assert.equal(changed.quote, null); assert.equal(act(changed, { type: "confirm", token }).accepted, false); assert.equal(acceptDomainQuote(changed, ctx(changed), quote(c), token).reason, "quote_mismatch"); });
test("expired quote cannot request booking", () => { const { c, token } = offered(); const d = applyCustomerAction(c, { ...ctx(c), now: new Date("2026-09-10T11:00:00Z") }, owner, { type: "confirm", token }); assert.equal(d.conversation.state, "expired"); assert.deepEqual(d.effects, []); });
test("forged tokens and malformed saved hashes fail closed", () => { const { c } = offered(); assert.equal(act(c, { type: "confirm", token: "yes" }).reason, "invalid_confirmation"); assert.equal(act({ ...c, confirmationHash: "bad" }, { type: "confirm", token: "yes" }).reason, "invalid_confirmation"); });
test("past or reversed return dates rejected", () => { for (const extra of [{ date: "2026-09-09" }, { rideType: "retour", returnDate: "2026-09-11", returnTime: "12:00" }]) assert.equal(act(initial(), { type: "propose_fields", fields: { ...fields, ...extra } }).reason, "invalid_schedule"); });
test("domain-required flight data must be collected before offering", () => { const c = ready(); const d = acceptDomainQuote(c, ctx(c), { ...quote(c), outboundFlightRequired: true }, newConfirmationToken()); assert.equal(d.reason, "flight_required"); assert.deepEqual(d.effects, []); });
test("invalid authoritative quote still rejected", () => { const c = ready(); for (const extra of [{ totalCents: -1 }, { expiresAt: "invalid" }, { expiresAt: now.toISOString() }]) assert.equal(acceptDomainQuote(c, ctx(c), { ...quote(c), ...extra }, newConfirmationToken()).reason, "invalid_quote"); });
test("manual luggage hands off and operator can resume", () => { const d = act(initial(), { type: "propose_fields", fields: { luggage: "overleg" } }); assert.equal(d.conversation.state, "handoff"); assert.equal(resumeConversation(d.conversation, ctx(d.conversation)).conversation.state, "collecting_booking"); });
test("cancellation during booking preserves command and prevents replay/resume", () => { const { c, token } = offered(); const pending = act(c, { type: "confirm", token }).conversation; const handoff = act(pending, { type: "cancel" }).conversation; assert.equal(handoff.state, "handoff"); assert.equal(handoff.commandId, pending.commandId); assert.equal(resumeConversation(handoff, ctx(handoff)).accepted, false); const result = acceptBookingResult(handoff, ctx(handoff), pending.commandId!, { id: "1", reference: "actual", status: "pending" }); assert.equal(result.conversation.state, "handoff"); assert.deepEqual(result.effects, []); assert.equal(acceptBookingResult(result.conversation, ctx(result.conversation), pending.commandId!, { id: "2", reference: "wrong", status: "wrong" }).accepted, false); });
test("inputs remain unchanged and audit contains no draft/token", () => { const { c, token } = offered(); const before = JSON.stringify(c); const d = act(c, { type: "confirm", token }); assert.equal(JSON.stringify(c), before); for (const secret of [token, fields.customerEmail, owner.waId]) assert.ok(!JSON.stringify(d.audit).includes(secret)); });
