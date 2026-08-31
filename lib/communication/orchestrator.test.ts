import assert from "node:assert/strict";
import { test } from "node:test";
import { dispatch } from "@/lib/communication/orchestrator";
import type { CommunicationEvent } from "@/lib/communication/events";
import type { ClaimInput, DeliveryLog } from "@/lib/communication/delivery-log";
import type { BookingEmailData } from "@/lib/notifications/booking-email";
import type { LeadEmailData } from "@/lib/notifications/lead-email";

const booking: BookingEmailData = {
  bookingRef: "T4XI-TEST-2001",
  rideType: "enkel",
  pickup: "Utrecht Centraal",
  dropoff: "Schiphol Airport",
  date: "2026-09-18",
  time: "09:30",
  vehicle: "Premium voertuig",
  persons: 2,
  luggage: "1 koffer",
  flightNumber: null,
  flightDirection: null,
  price: 89.5,
  currency: "EUR",
  quoteOnRequest: false,
  returnApplied: false,
  customerName: "Sam Tester",
  customerPhone: "+31 6 12 34 56 78",
  customerEmail: "sam@example.com",
  locale: "nl",
};

const lead: LeadEmailData = {
  leadId: "lead-test-2",
  kind: "contact-business",
  locale: "nl",
  name: "Sam Tester",
  email: "sam@example.com",
  phone: "+31 6 12 34 56 78",
  fields: [{ label: "Vraag", value: "Kan dat?" }],
};

const bookingEvent: CommunicationEvent = {
  type: "booking.created",
  subjectType: "booking",
  subjectId: booking.bookingRef,
  bookingId: "00000000-0000-4000-8000-000000000001",
  locale: "nl",
  booking,
};

const leadEvent: CommunicationEvent = {
  type: "lead.received",
  subjectType: "lead",
  subjectId: lead.leadId,
  bookingId: null,
  locale: "nl",
  lead,
};

const ruimVooraf = new Date("2026-09-12T08:00:00Z");

/** Bootst de unieke dedup_key-index na: claimen kan maar één keer slagen. */
function fakeLog(
  options: { unavailable?: boolean; missing?: boolean; recordRecovers?: boolean } = {}
) {
  const claimed = new Set<string>();
  const rows: Array<{ input: ClaimInput; status?: string; skipReason?: string }> = [];
  const log: DeliveryLog = {
    async claim(input) {
      if (options.missing) return { outcome: "degraded", reason: "store_not_installed" };
      if (options.unavailable) return { outcome: "unavailable", reason: "connection refused" };
      if (claimed.has(input.dedupKey)) return { outcome: "duplicate", id: input.dedupKey };
      claimed.add(input.dedupKey);
      rows.push({ input });
      return { outcome: "claimed", id: input.dedupKey };
    },
    async settle(id, status, extra) {
      const row = rows.find((entry) => entry.input.dedupKey === id);
      if (row) {
        row.status = status;
        row.skipReason = extra?.skipReason;
      }
    },
    async record(input, status, extra) {
      // Bootst de tweede kans na: lukt de store nog steeds niet, dan niets.
      if (!options.recordRecovers && (options.unavailable || options.missing)) return false;
      rows.push({ input, status, skipReason: extra?.skipReason });
      return true;
    },
  };
  return { log, rows };
}

type Captured = { headers: Headers; body: Record<string, unknown> };

async function withProvider(
  respond: (call: number) => Response,
  run: (calls: Captured[]) => Promise<void>
) {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const previousOps = process.env.OPS_EMAIL;
  const calls: Captured[] = [];
  process.env.RESEND_API_KEY = "re_test_only";
  process.env.OPS_EMAIL = "booking@t4xi.nl";
  globalThis.fetch = async (_input, init) => {
    calls.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return respond(calls.length);
  };
  try {
    await run(calls);
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
    if (previousOps === undefined) delete process.env.OPS_EMAIL;
    else process.env.OPS_EMAIL = previousOps;
  }
}

const ok = () => new Response(JSON.stringify({ id: "msg_123" }), { status: 200 });

test("een nieuwe boeking bereikt klant én operations, met PDF alleen voor de klant", async () => {
  const { log, rows } = fakeLog();
  await withProvider(ok, async (calls) => {
    const result = await dispatch(bookingEvent, { log, now: ruimVooraf });
    assert.equal(result.delivered, true);
    assert.equal(calls.length, 2);

    const customer = calls.find((call) => call.body.to === booking.customerEmail);
    const ops = calls.find((call) => call.body.to === "booking@t4xi.nl");
    assert.ok(customer && ops);

    // De REST-API verwacht snake_case; camelCase zou stil genegeerd worden.
    assert.equal(customer.body.reply_to, "booking@t4xi.nl");
    assert.ok(!("replyTo" in customer.body));

    const attachments = customer.body.attachments as Array<{ filename: string; content: string }>;
    assert.equal(attachments[0].filename, `boekingsbevestiging-${booking.bookingRef}.pdf`);
    assert.match(Buffer.from(attachments[0].content, "base64").toString("latin1"), /^%PDF-1\.4/);
    assert.equal(ops.body.attachments, undefined);

    // Beide berichten dragen een text/plain-deel.
    assert.ok(String(customer.body.text).length > 0);
    assert.ok(String(ops.body.text).includes("OVERDRACHT"));
  });

  assert.deepEqual(
    rows.map((row) => `${row.input.audience}:${row.input.channel}:${row.status}`).sort(),
    ["customer:email:sent", "operations:internal:sent"]
  );
  assert.deepEqual(
    rows.map((row) => row.input.templateId).sort(),
    ["booking-confirmed", "booking-received-ops"]
  );
});

test("de provider-idempotency-sleutel is de dedup-sleutel", async () => {
  const { log } = fakeLog();
  await withProvider(ok, async (calls) => {
    await dispatch(bookingEvent, { log, now: ruimVooraf });
    const keys = calls.map((call) => call.headers.get("Idempotency-Key")).sort();
    assert.deepEqual(keys, [
      `booking.created:${booking.bookingRef}:customer:email`,
      `booking.created:${booking.bookingRef}:operations:internal`,
    ]);
  });
});

test("hetzelfde event twee keer verwerken verstuurt niets extra", async () => {
  const { log, rows } = fakeLog();
  await withProvider(ok, async (calls) => {
    await dispatch(bookingEvent, { log, now: ruimVooraf });
    assert.equal(calls.length, 2);

    // Een Vercel-retry of dubbel afgeleverde webhook mag geen tweede bericht geven.
    const second = await dispatch(bookingEvent, { log, now: ruimVooraf });
    assert.equal(calls.length, 2, "er is een tweede keer verstuurd");
    assert.deepEqual(
      second.outcomes.map((outcome) => outcome.status),
      ["duplicate", "duplicate"]
    );
    assert.equal(second.delivered, true, "al afgeleverd telt als afgeleverd");
  });
  assert.equal(rows.length, 2, "een duplicaat mag geen extra logregel opleveren");
});

test("bij een aanvraag gaat de interne registratie vóór de bevestiging aan de klant", async () => {
  const { log } = fakeLog();
  await withProvider(ok, async (calls) => {
    const result = await dispatch(leadEvent, { log });
    assert.equal(calls.length, 2);
    assert.equal(calls[0].body.to, "booking@t4xi.nl", "operations hoort eerst");
    assert.equal(calls[1].body.to, lead.email);
    assert.equal(result.outcomes[0].audience, "operations");
    // De aanvrager mag zijn eigen bericht beantwoorden bij ops.
    assert.equal(calls[0].body.reply_to, lead.email);
  });
});

test("faalt de interne aanvraagmail, dan krijgt de klant geen bevestiging", async () => {
  const { log, rows } = fakeLog();
  await withProvider(
    (call) => (call === 1 ? new Response("nope", { status: 500 }) : ok()),
    async (calls) => {
      const result = await dispatch(leadEvent, { log });
      assert.equal(calls.length, 1, "er is toch een bevestiging verstuurd");
      assert.equal(result.delivered, false);

      const customer = result.outcomes.find((outcome) => outcome.audience === "customer");
      assert.equal(customer?.status, "skipped");
      assert.equal(customer?.reason, "operations_failed");
    }
  );
  assert.equal(rows[0].status, "failed");
});

test("een afwijzing door de provider wordt als mislukt vastgelegd, niet als verstuurd", async () => {
  const { log, rows } = fakeLog();
  await withProvider(
    () => new Response("invalid recipient", { status: 422 }),
    async () => {
      const result = await dispatch(bookingEvent, { log, now: ruimVooraf });
      assert.equal(result.delivered, false);
      assert.ok(result.outcomes.every((outcome) => outcome.status === "failed"));
      assert.match(String(result.outcomes[0].error), /resend_422/);
    }
  );
  assert.ok(rows.every((row) => row.status === "failed"));
});

test("een gemodelleerd maar inactief kanaal verstuurt niets en zegt waarom", async () => {
  const { log, rows } = fakeLog();
  const assigned: CommunicationEvent = {
    type: "booking.driver_assigned",
    subjectType: "booking",
    subjectId: booking.bookingRef,
    bookingId: null,
    locale: "nl",
    bookingRef: booking.bookingRef,
  };
  await withProvider(ok, async (calls) => {
    // Stub-template: de kanaalpolicy is los van de templates testbaar.
    const result = await dispatch(assigned, {
      log,
      render: (_event, audience) =>
        audience === "customer"
          ? {
              templateId: "driver-assigned",
              to: booking.customerEmail,
              subject: "Chauffeur toegewezen",
              html: "<p>x</p>",
              text: "x",
            }
          : null,
    });

    // WhatsApp staat wél in de policy maar dispatcht niet; e-mail wel.
    assert.equal(calls.length, 1);
    const whatsapp = result.outcomes.find((outcome) => outcome.channel === "whatsapp");
    assert.equal(whatsapp?.status, "skipped");
    assert.equal(whatsapp?.reason, "channel_inactive");
    assert.equal(result.outcomes.find((outcome) => outcome.channel === "email")?.status, "sent");
    assert.equal(result.delivered, true);
  });

  const inactive = rows.find((row) => row.input.channel === "whatsapp");
  assert.equal(inactive?.status, "skipped");
  assert.equal(inactive?.skipReason, "channel_inactive");
});

test("een lifecycle-moment zonder template belooft niets en laat geen logregel achter", async () => {
  const { log, rows } = fakeLog();
  await withProvider(ok, async (calls) => {
    const result = await dispatch(
      {
        type: "booking.completed",
        subjectType: "booking",
        subjectId: booking.bookingRef,
        bookingId: null,
        locale: "nl",
        bookingRef: booking.bookingRef,
      },
      { log }
    );
    assert.equal(calls.length, 0);
    assert.equal(result.delivered, false);
    assert.ok(result.outcomes.every((outcome) => outcome.reason === "no_template"));
  });
  assert.equal(rows.length, 0);
});

test("zonder log wordt er nog steeds gecommuniceerd", async () => {
  await withProvider(ok, async (calls) => {
    const result = await dispatch(bookingEvent, { now: ruimVooraf });
    assert.equal(result.delivered, true);
    assert.equal(calls.length, 2);
  });
});

test("een onbereikbare idempotency-store blokkeert verzending in plaats van te gokken", async () => {
  const { log } = fakeLog({ unavailable: true });
  await withProvider(ok, async (calls) => {
    const result = await dispatch(bookingEvent, { log, now: ruimVooraf });

    // Juist bij een databasestoring zou doorgaan dubbele klantcommunicatie geven.
    assert.equal(calls.length, 0, "er is verstuurd zonder duplicaatbescherming");
    assert.equal(result.delivered, false);
    assert.ok(result.outcomes.every((outcome) => outcome.status === "blocked"));
    assert.equal(result.outcomes[0].reason, "idempotency_store_unavailable");
  });
});

test("een aanvraag gaat wél door zonder store, want twee inzendingen botsen nooit", async () => {
  // De subjectId van een lead is een verse UUID per request: er is geen duplicaat
  // om tegen te beschermen, dus blokkeren zou alleen aanvragen kosten.
  const { log } = fakeLog({ unavailable: true });
  await withProvider(ok, async (calls) => {
    const result = await dispatch(leadEvent, { log });
    assert.equal(calls.length, 2);
    assert.equal(result.delivered, true);

    // Maar het verlies van de logregel wordt wél als verlies gerapporteerd:
    // geen duplicaatrisico betekent niet dat vastleggen optioneel is.
    assert.ok(result.outcomes.every((outcome) => outcome.logged === false));
  });
});

test("zonder claim wordt de verzending achteraf alsnog vastgelegd", async () => {
  // Deduplicatie en observability zijn aparte verantwoordelijkheden: kon er niet
  // geclaimd worden maar is de database daarna weer bereikbaar, dan hoort de
  // aflevering alsnog in het log te staan.
  const { log, rows } = fakeLog({ unavailable: true, recordRecovers: true });
  await withProvider(ok, async (calls) => {
    const result = await dispatch(leadEvent, { log });
    assert.equal(calls.length, 2);
    assert.ok(result.outcomes.every((outcome) => outcome.logged === true));
  });
  assert.equal(rows.length, 2);
  assert.ok(rows.every((row) => row.status === "sent"));
});

test("zolang de migratie niet is toegepast blijft communicatie doorlopen", async () => {
  const { log, rows } = fakeLog({ missing: true });
  await withProvider(ok, async (calls) => {
    const result = await dispatch(bookingEvent, { log, now: ruimVooraf });
    assert.equal(calls.length, 2, "het overgangsmoment mag geen communicatie stilzetten");
    assert.equal(result.delivered, true);
    assert.ok(result.outcomes.every((outcome) => outcome.logged === false));
  });
  assert.equal(rows.length, 0, "zonder store valt er niets te loggen");
});
