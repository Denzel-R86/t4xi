import assert from "node:assert/strict";
import { test } from "node:test";
import {
  isMissingStore,
  supabaseDeliveryLog,
  unloggedDeliveryLog,
  type ClaimInput,
} from "@/lib/communication/delivery-log";
import { communicationSchemaReady } from "@/lib/config/environment";
import { duplicatesArePossible } from "@/lib/communication/policies/dedup";

test("een ontbrekende RPC wordt onderscheiden van een haperende database", () => {
  // Migratie nog niet toegepast — PostgREST en Postgres melden dat elk anders.
  assert.equal(isMissingStore({ code: "PGRST202", message: "Could not find the function" }), true);
  assert.equal(isMissingStore({ code: "42883", message: "function does not exist" }), true);

  // Echte storingen: hier is de bescherming weg en moet er geblokkeerd worden.
  assert.equal(isMissingStore({ code: "08006", message: "connection failure" }), false);
  assert.equal(isMissingStore({ code: "57014", message: "canceling statement due to timeout" }), false);
  assert.equal(isMissingStore({ code: "42501", message: "permission denied for function" }), false);
});

test("zonder databaseclient meldt het log zichzelf als degraded, niet als geclaimd", async () => {
  const result = await unloggedDeliveryLog.claim({
    dedupKey: "x",
    eventType: "booking.created",
    subjectType: "booking",
    subjectId: "T4XI-1",
    bookingId: null,
    templateId: "booking-confirmed",
    audience: "customer",
    channel: "email",
    locale: "nl",
    recipient: "sam@example.com",
  });
  // De orchestrator moet kunnen zien dát er geen bescherming is.
  assert.equal(result.outcome, "degraded");
});

test("alleen events met een stabiele subjectId kunnen dubbel uitgaan", () => {
  assert.equal(duplicatesArePossible("booking.created"), true, "boekingsreferentie is stabiel");
  assert.equal(duplicatesArePossible("invoice.issued"), true, "factuurnummer is stabiel");
  assert.equal(duplicatesArePossible("booking.confirmed"), true);
  assert.equal(duplicatesArePossible("lead.received"), false, "verse UUID per request");
});

test("na de uitrol is een ontbrekende RPC een regressie, geen migratiemoment", async () => {
  const missingFunction = { code: "PGRST202", message: "Could not find the function" };
  const supabase = { rpc: async () => ({ data: null, error: missingFunction }) };
  const input: ClaimInput = {
    dedupKey: "booking.created:T4XI-1:customer:email",
    eventType: "booking.created",
    subjectType: "booking",
    subjectId: "T4XI-1",
    bookingId: null,
    templateId: "booking-confirmed",
    audience: "customer",
    channel: "email",
    locale: "nl",
    recipient: "sam@example.com",
  };

  const previous = process.env.COMMUNICATION_SCHEMA_READY;
  try {
    // Vóór de uitrol: overgangsmoment, communicatie loopt door.
    delete process.env.COMMUNICATION_SCHEMA_READY;
    const during = await supabaseDeliveryLog(supabase as never).claim(input);
    assert.equal(during.outcome, "degraded");

    // Ná de uitrol: hetzelfde symptoom betekent nu een schema-regressie.
    process.env.COMMUNICATION_SCHEMA_READY = "true";
    const after = await supabaseDeliveryLog(supabase as never).claim(input);
    assert.equal(after.outcome, "unavailable");
    assert.equal(after.outcome === "unavailable" ? after.reason : "", "schema_regression");
  } finally {
    if (previous === undefined) delete process.env.COMMUNICATION_SCHEMA_READY;
    else process.env.COMMUNICATION_SCHEMA_READY = previous;
  }
});

test("de schema-vlag accepteert alleen een expliciete bevestiging", () => {
  assert.equal(communicationSchemaReady({ COMMUNICATION_SCHEMA_READY: "true" }), true);
  assert.equal(communicationSchemaReady({ COMMUNICATION_SCHEMA_READY: "1" }), true);
  assert.equal(communicationSchemaReady({ COMMUNICATION_SCHEMA_READY: "false" }), false);
  assert.equal(communicationSchemaReady({ COMMUNICATION_SCHEMA_READY: "" }), false);
  assert.equal(communicationSchemaReady({}), false, "onbekend is niet uitgerold");
});
