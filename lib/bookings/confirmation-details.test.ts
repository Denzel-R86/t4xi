import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationFields, type ConfirmationDetails } from "@/lib/bookings/confirmation-details";
import { serverPaidProof, type ServerPaidProof } from "@/lib/payments/server-paid";

const ride: ConfirmationDetails = {
  bookingRef: "T4X-2026-0042",
  bookingStatus: "inquiry",
  date: "2026-11-12",
  time: "14:30",
  pickup: "Amsterdam Zuidas",
  dropoff: "Schiphol",
  returnTrip: false,
  returnDate: "",
  returnTime: "",
  passengers: 2,
  flightNumber: "",
  returnFlightNumber: "",
  email: "tester@example.test",
};
const PAID = serverPaidProof({ status: "paid", amountPaid: 8900 }, null);

test("ES 09: kernvelden eerst, in vaste volgorde", () => {
  assert.deepEqual(confirmationFields(ride, PAID), [
    "when", "pickup", "dropoff", "reference", "contact", "passengers", "vehicle", "paid",
  ]);
});

test("retour en vluchtnummers schuiven in op hun vaste plek", () => {
  assert.deepEqual(
    confirmationFields({ ...ride, returnTrip: true, returnDate: "2026-11-19", returnTime: "18:00", flightNumber: "KL1234", returnFlightNumber: "KL1235" }, PAID),
    ["when", "returnWhen", "pickup", "dropoff", "reference", "contact", "passengers", "flight", "returnFlight", "vehicle", "paid"]
  );
});

test("retour-vluchtnummer telt alleen bij een retourrit; leeg/ongeldig contact valt weg", () => {
  const fields = confirmationFields({ ...ride, returnFlightNumber: "KL1235", flightNumber: "  ", email: "geen-adres" }, PAID);
  assert.ok(!fields.includes("returnFlight"));
  assert.ok(!fields.includes("flight"));
  assert.ok(!fields.includes("contact"));
});

test("geen '€X betaald' zonder server-bewijs: pending, nagemaakt bewijs of bewijs zonder bedrag", () => {
  const forged = { amountCents: 8900, currency: "eur" } as unknown as ServerPaidProof;
  for (const payment of [null, forged, serverPaidProof({ status: "paid" }, null), serverPaidProof({ status: "pending", amountPaid: 8900 }, null)]) {
    assert.ok(!confirmationFields(ride, payment).includes("paid"));
  }
  // de rest van de volgorde blijft gelijk
  assert.deepEqual(confirmationFields(ride, null), ["when", "pickup", "dropoff", "reference", "contact", "passengers", "vehicle"]);
});
