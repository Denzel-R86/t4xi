// Regressietests voor de PDOK-woonplaats-IO-laag. CONTRACT (2026-08-14): gooit
// bij elke echte storing (netwerk/timeout/HTTP/JSON), levert `null` uitsluitend
// bij een GESLAAGDE aanroep zonder relevant document — de caller moet dat
// onderscheid kunnen maken (zie service.ts's indeterminate-pad).
import { test } from "node:test";
import assert from "node:assert/strict";
import { settleOnFakeClock } from "./fake-timeout-clock";
import { lookupOfficialWoonplaats, PdokLookupError, PDOK_ZONE_LOOKUP_TIMEOUT_MS } from "./pdok-woonplaats";

function withFakeFetch<T>(impl: typeof fetch, run: () => Promise<T>): Promise<T> {
  const original = globalThis.fetch;
  globalThis.fetch = impl;
  return run().finally(() => {
    globalThis.fetch = original;
  });
}

function jsonResponse(body: unknown, init: { ok?: boolean } = {}): Response {
  return new Response(JSON.stringify(body), { status: init.ok === false ? 500 : 200 });
}

test("lookupOfficialWoonplaats: leeg adres → null, geen netwerkaanroep", async () => {
  let called = false;
  const result = await withFakeFetch(
    async () => {
      called = true;
      throw new Error("mag niet aangeroepen worden");
    },
    () => lookupOfficialWoonplaats("   ")
  );
  assert.equal(result, null);
  assert.equal(called, false);
});

test("lookupOfficialWoonplaats: geldig antwoord → woonplaatsnaam van het eerste document dat dat veld heeft", async () => {
  const result = await withFakeFetch(
    async () =>
      jsonResponse({
        response: {
          docs: [
            { type: "gemeente" }, // geen woonplaatsnaam-veld — moet overgeslagen worden
            { type: "woonplaats", woonplaatsnaam: "Eindhoven" },
            { type: "adres", woonplaatsnaam: "Eindhoven" },
          ],
        },
      }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, "Eindhoven");
});

test("lookupOfficialWoonplaats: adres-document met woonplaatsnaam als eerste → gebruikt direct", async () => {
  const result = await withFakeFetch(
    async () =>
      jsonResponse({
        response: {
          docs: [{ type: "adres", woonplaatsnaam: "Roermond" }],
        },
      }),
    () => lookupOfficialWoonplaats("Stadsweide 2, 6041TD Roermond")
  );
  assert.equal(result, "Roermond");
});

test("lookupOfficialWoonplaats: geslaagd, maar leeg docs-array → null (zekere 'geen match', geen fout)", async () => {
  const result = await withFakeFetch(
    async () => jsonResponse({ response: { docs: [] } }),
    () => lookupOfficialWoonplaats("onbestaand adres")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: geslaagd, alle documenten zonder woonplaatsnaam → null", async () => {
  const result = await withFakeFetch(
    async () => jsonResponse({ response: { docs: [{ type: "gemeente" }, { type: "gemeente" }] } }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: HTTP-fout (niet ok) → gooit PdokLookupError, NOOIT null", async () => {
  await assert.rejects(
    () => withFakeFetch(async () => jsonResponse({}, { ok: false }), () => lookupOfficialWoonplaats("Eindhoven")),
    PdokLookupError
  );
});

test("lookupOfficialWoonplaats: netwerkfout → gooit PdokLookupError, NOOIT null", async () => {
  await assert.rejects(
    () =>
      withFakeFetch(
        async () => {
          throw new Error("connection reset");
        },
        () => lookupOfficialWoonplaats("Eindhoven")
      ),
    PdokLookupError
  );
});

test("lookupOfficialWoonplaats: ongeldige JSON → gooit PdokLookupError, NOOIT null", async () => {
  await assert.rejects(
    () =>
      withFakeFetch(
        async () => new Response("dit is geen json", { status: 200 }),
        () => lookupOfficialWoonplaats("Eindhoven")
      ),
    PdokLookupError
  );
});

test("lookupOfficialWoonplaats: hangende fetch → begrensd door PDOK_ZONE_LOOKUP_TIMEOUT_MS, gooit PdokLookupError, geen onbeperkt wachten", async (t) => {
  // Nep-klok i.p.v. Date.now()-delta met marge — zie lib/pricing/fake-timeout-clock.ts.
  const { settledAtMs, result } = await settleOnFakeClock(
    t,
    () =>
      withFakeFetch(
        (_url, init) =>
          new Promise((_resolve, reject) => {
            const signal = init?.signal as AbortSignal | undefined;
            signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
          }),
        () => lookupOfficialWoonplaats("Eindhoven")
      ),
    PDOK_ZONE_LOOKUP_TIMEOUT_MS + 100
  );
  assert.equal(result.status, "rejected");
  if (result.status === "rejected") assert.ok(result.reason instanceof PdokLookupError, `verwacht PdokLookupError, kreeg ${String(result.reason)}`);
  assert.equal(settledAtMs, PDOK_ZONE_LOOKUP_TIMEOUT_MS, `verwacht exact ${PDOK_ZONE_LOOKUP_TIMEOUT_MS}ms, settelde op ${settledAtMs}ms`);
});
