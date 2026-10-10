import assert from "node:assert/strict";
import { test } from "node:test";
import { confirmationFields, type ConfirmationDetails } from "@/lib/bookings/confirmation-details";

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

test("ES 09: kernvelden eerst, in vaste volgorde", () => {
  assert.deepEqual(confirmationFields(ride), [
    "when", "pickup", "dropoff", "reference", "contact", "passengers", "vehicle", "paid",
  ]);
});

test("retour en vluchtnummers schuiven in op hun vaste plek", () => {
  assert.deepEqual(
    confirmationFields({ ...ride, returnTrip: true, returnDate: "2026-11-19", returnTime: "18:00", flightNumber: "KL1234", returnFlightNumber: "KL1235" }),
    ["when", "returnWhen", "pickup", "dropoff", "reference", "contact", "passengers", "flight", "returnFlight", "vehicle", "paid"]
  );
});

test("retour-vluchtnummer telt alleen bij een retourrit; leeg/ongeldig contact valt weg", () => {
  const fields = confirmationFields({ ...ride, returnFlightNumber: "KL1235", flightNumber: "  ", email: "geen-adres" });
  assert.ok(!fields.includes("returnFlight"));
  assert.ok(!fields.includes("flight"));
  assert.ok(!fields.includes("contact"));
});
