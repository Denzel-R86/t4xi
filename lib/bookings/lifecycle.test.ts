import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import {
  BOOKING_STATUSES,
  STATUS_EVENT,
  TERMINAL_STATUSES,
  allowedTransitions,
  canTransition,
  isBookingStatus,
} from "@/lib/bookings/lifecycle";

const migration = readFileSync(
  "supabase/migrations/20260830120000_booking_lifecycle_and_communication.sql",
  "utf8"
);

test("de gelukkige route loopt van aanvraag tot afgerond", () => {
  const happy = ["inquiry", "quoted", "confirmed", "assigned", "in_progress", "completed"] as const;
  for (let i = 0; i < happy.length - 1; i += 1) {
    assert.ok(canTransition(happy[i], happy[i + 1]), `${happy[i]} → ${happy[i + 1]} moet mogen`);
  }
});

test("annuleren mag vanuit elke lopende stand, nooit vanuit een eindstand", () => {
  for (const status of BOOKING_STATUSES) {
    const terminal = TERMINAL_STATUSES.includes(status);
    assert.equal(canTransition(status, "cancelled"), !terminal, `annuleren vanuit ${status}`);
  }
});

test("eindstanden hebben geen uitgaande overgangen", () => {
  for (const status of TERMINAL_STATUSES) {
    assert.deepEqual(allowedTransitions(status), []);
  }
});

test("terugspringen en stappen overslaan is verboden", () => {
  assert.equal(canTransition("confirmed", "inquiry"), false);
  assert.equal(canTransition("completed", "in_progress"), false);
  assert.equal(canTransition("cancelled", "confirmed"), false);
  assert.equal(canTransition("quoted", "assigned"), false, "chauffeur vóór bevestiging");
  assert.equal(canTransition("inquiry", "in_progress"), false);
  assert.equal(canTransition("confirmed", "completed"), false, "afronden zonder rit");
});

test("een stand naar zichzelf is geen geldige overgang", () => {
  for (const status of BOOKING_STATUSES) {
    assert.equal(canTransition(status, status), false);
  }
});

test("onbekende waarden worden niet als status geaccepteerd", () => {
  assert.equal(isBookingStatus("pending"), false, "de oude dode waarde hoort niet meer te bestaan");
  assert.equal(isBookingStatus("confirmed_paid"), false, "samengestelde standen zijn verboden");
  assert.equal(isBookingStatus(null), false);
  assert.equal(isBookingStatus("confirmed"), true);
});

test("elke stand behalve de beginstand levert een domeinevent op", () => {
  for (const status of BOOKING_STATUSES) {
    const event = STATUS_EVENT[status];
    if (status === "inquiry") assert.equal(event, null);
    else assert.match(String(event), /^booking\./);
  }
});

test("de migratie draagt dezelfde woordenlijst en dezelfde overgangen", () => {
  // De database is de autoriteit; deze module mag er niet van weglopen.
  for (const status of BOOKING_STATUSES) {
    assert.ok(migration.includes(`'${status}'`), `${status} ontbreekt in de migratie`);
  }
  assert.match(migration, /when 'inquiry'\s+then array\['quoted', 'confirmed', 'cancelled'\]/);
  assert.match(migration, /when 'in_progress' then array\['completed', 'cancelled'\]/);
  assert.match(migration, /bookings_status_check/);
  // Een overgang naar dezelfde stand is een geslaagde no-op, geen tweede event.
  assert.match(migration, /'changed', false/);
});
