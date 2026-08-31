import assert from "node:assert/strict";
import { test } from "node:test";
import {
  buildBookingHandover,
  buildLeadHandover,
  handoverHtml,
  handoverText,
  urgencyPrefix,
  whatsappTarget,
  type BookingHandoverInput,
} from "@/lib/notifications/ops-handover";

const base: BookingHandoverInput = {
  bookingRef: "T4XI-TEST-1001",
  date: "2026-09-18",
  time: "09:30",
  quoteOnRequest: false,
  price: 89.5,
  vehicle: "Tesla Model Y",
  persons: 2,
  luggage: "1 koffer",
  flightNumber: null,
  flightDirection: null,
  customerName: "Sam Tester",
  customerPhone: "+31 6 12 34 56 78",
  customerEmail: "sam@example.com",
};

// Ruim vóór de rit: 12 september 2026, 10:00 Amsterdamse tijd.
const ruimVooraf = new Date("2026-09-12T08:00:00Z");
const ids = (input: BookingHandoverInput, now: Date) =>
  buildBookingHandover(input, now).tasks.map((task) => task.id);

test("elke boeking krijgt de vaste kern van taken in werkvolgorde", () => {
  assert.deepEqual(ids(base, ruimVooraf), ["contact", "assign", "payment", "invoice"]);
});

test("een offerte-op-aanvraag komt als kritieke taak vóór het klantcontact", () => {
  const handover = buildBookingHandover({ ...base, quoteOnRequest: true, price: null }, ruimVooraf);
  assert.equal(handover.tasks[0].id, "quote");
  assert.equal(handover.tasks[0].critical, true);
  assert.equal(handover.tasks[0].owner, "Administratie");
});

test("een ontbrekende prijs telt ook zonder quoteOnRequest als offerte-taak", () => {
  assert.ok(ids({ ...base, price: null }, ruimVooraf).includes("quote"));
});

test("de vluchttaak volgt de richting van de vlucht", () => {
  assert.ok(
    ids({ ...base, flightNumber: "KL1008", flightDirection: "arrival" }, ruimVooraf).includes(
      "flight-arrival"
    )
  );
  assert.ok(
    ids({ ...base, flightNumber: "KL1008", flightDirection: "departure" }, ruimVooraf).includes(
      "flight-departure"
    )
  );
  assert.ok(!ids(base, ruimVooraf).some((id) => id.startsWith("flight-")));
});

test("een retourrit levert een eigen planningstaak op", () => {
  const withReturn = { ...base, returnDate: "2026-09-20", returnTime: "18:45" };
  const task = buildBookingHandover(withReturn, ruimVooraf).tasks.find((t) => t.id === "return");
  assert.ok(task);
  assert.match(task.detail, /2026-09-20 om 18:45/);
});

test("urgentie schaalt mee met de tijd tot ophalen", () => {
  // 09:30 Amsterdam = 07:30 UTC in september (zomertijd).
  const dagErvoor = buildBookingHandover(base, new Date("2026-09-17T06:30:00Z"));
  const zelfdeOchtend = buildBookingHandover(base, new Date("2026-09-18T05:30:00Z"));
  assert.equal(buildBookingHandover(base, ruimVooraf).urgency, "gepland");
  assert.equal(dagErvoor.urgency, "gepland");
  assert.equal(zelfdeOchtend.urgency, "direct");

  const binnenDeDag = buildBookingHandover(base, new Date("2026-09-17T20:30:00Z"));
  assert.equal(binnenDeDag.urgency, "urgent");
  assert.equal(urgencyPrefix("urgent"), "[<24 UUR] ");
  assert.equal(urgencyPrefix("direct"), "[NU] ");
  assert.equal(urgencyPrefix("gepland"), "");
});

test("een verstreken ophaaltijd meldt dat expliciet in plaats van 0 uur", () => {
  const handover = buildBookingHandover(base, new Date("2026-09-18T10:00:00Z"));
  const contact = handover.tasks.find((t) => t.id === "contact");
  assert.equal(handover.urgency, "direct");
  assert.match(contact!.due, /al verstreken/);
});

test("een onleesbare datum blokkeert de overdracht niet", () => {
  const handover = buildBookingHandover({ ...base, date: "geen-datum" }, ruimVooraf);
  assert.equal(handover.hoursUntilPickup, null);
  assert.equal(handover.urgency, "gepland");
  assert.ok(handover.tasks.length > 0);
});

test("de HTML escapet klantinvoer en biedt snelle acties", () => {
  const html = handoverHtml(
    buildBookingHandover({ ...base, customerName: '<img src=x onerror="alert(1)">' }, ruimVooraf),
    { phone: base.customerPhone, email: base.customerEmail }
  );
  assert.doesNotMatch(html, /<img src=x/);
  assert.match(html, /&lt;img src=x/);
  assert.match(html, /href="tel:\+31612345678"/);
  assert.match(html, /href="https:\/\/wa\.me\/31612345678"/);
  assert.match(html, /href="mailto:sam@example\.com"/);
});

test("de tekstvariant nummert de taken met eigenaar en deadline", () => {
  const text = handoverText(buildBookingHandover(base, ruimVooraf));
  assert.match(text, /OVERDRACHT/);
  assert.match(text, /1\. Bevestig de rit bij de klant/);
  assert.match(text, /Dispatch · Binnen 2 uur tijdens kantooruren/);
});

test("whatsappTarget normaliseert Nederlandse nummers en weigert onbruikbare invoer", () => {
  assert.equal(whatsappTarget("+31 6 12 34 56 78"), "31612345678");
  assert.equal(whatsappTarget("06-12345678"), "31612345678");
  assert.equal(whatsappTarget("0031612345678"), "31612345678");
  assert.equal(whatsappTarget("31612345678"), "31612345678");
  assert.equal(whatsappTarget(""), null);
  assert.equal(whatsappTarget("12345"), null);
});

test("een lead-overdracht belooft niet meer dan de bevestigingsmail toezegt", () => {
  const handover = buildLeadHandover({
    leadId: "lead-1",
    subject: "Nieuwe zakelijke contactaanvraag",
    name: "Sam Tester",
    email: "sam@example.com",
    phone: "+31 6 12 34 56 78",
  });
  assert.deepEqual(
    handover.tasks.map((t) => t.id),
    ["lead-respond", "lead-qualify"]
  );
  assert.match(handover.tasks[0].detail, /binnen één werkdag/);
  assert.equal(handover.tasks[0].critical, true);
});

test("de takenlijst volgt de lifecycle: wat gebeurd is, staat er niet meer in", () => {
  const bij = (status: BookingHandoverInput["status"], paymentStatus?: string) =>
    buildBookingHandover({ ...base, status, paymentStatus }, ruimVooraf).tasks.map((t) => t.id);

  // Een verse aanvraag zonder status gedraagt zich als vóór de lifecycle bestond.
  assert.deepEqual(bij(undefined), bij("inquiry"));

  assert.ok(bij("inquiry").includes("contact"));
  assert.ok(!bij("confirmed").includes("contact"), "een bevestigde rit hoeft geen bevestiging");
  assert.ok(bij("confirmed").includes("assign"));
  assert.ok(!bij("assigned").includes("assign"), "er hangt al een chauffeur aan");
  assert.ok(!bij("in_progress").includes("contact"));
});

test("een betaalde rit vraagt geen betaalcontrole meer", () => {
  const open = buildBookingHandover({ ...base }, ruimVooraf).tasks.map((t) => t.id);
  const paid = buildBookingHandover({ ...base, paymentStatus: "paid" }, ruimVooraf).tasks.map((t) => t.id);
  assert.ok(open.includes("payment"));
  assert.ok(!paid.includes("payment"));
  assert.ok(paid.includes("invoice"), "de factuur moet nog steeds uitgegeven worden");
});

test("een geannuleerde rit laat geen taken achter", () => {
  const handover = buildBookingHandover({ ...base, status: "cancelled" }, ruimVooraf);
  assert.deepEqual(handover.tasks, []);
  assert.equal(handover.urgency, "gepland", "een annulering is nooit urgent");
});

test("een afgeronde rit houdt alleen de administratie over", () => {
  const ids = buildBookingHandover(
    { ...base, status: "completed", flightNumber: "KL1008", flightDirection: "arrival" },
    ruimVooraf
  ).tasks.map((t) => t.id);
  assert.deepEqual(ids, ["payment", "invoice"]);
});
