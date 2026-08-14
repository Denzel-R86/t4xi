// Regressietests voor de PDOK-woonplaats-IO-laag: bewijst dat elke fout,
// timeout of leeg antwoord `null` oplevert (fail-closed) en dat een geldig
// antwoord het EERSTE document met een `woonplaatsnaam`-veld gebruikt (dus
// nooit een `type:"gemeente"`-document, dat dat veld niet heeft).
import { test } from "node:test";
import assert from "node:assert/strict";
import { lookupOfficialWoonplaats, PDOK_ZONE_LOOKUP_TIMEOUT_MS } from "./pdok-woonplaats";

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

test("lookupOfficialWoonplaats: leeg docs-array → null", async () => {
  const result = await withFakeFetch(
    async () => jsonResponse({ response: { docs: [] } }),
    () => lookupOfficialWoonplaats("onbestaand adres")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: alle documenten zonder woonplaatsnaam (bv. uitsluitend gemeente-treffers) → null", async () => {
  const result = await withFakeFetch(
    async () => jsonResponse({ response: { docs: [{ type: "gemeente" }, { type: "gemeente" }] } }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: HTTP-fout (niet ok) → null, geen throw", async () => {
  const result = await withFakeFetch(
    async () => jsonResponse({}, { ok: false }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: netwerkfout (fetch gooit) → null, geen throw naar de caller", async () => {
  const result = await withFakeFetch(
    async () => {
      throw new Error("connection reset");
    },
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: ongeldige JSON → null, geen throw", async () => {
  const result = await withFakeFetch(
    async () => new Response("dit is geen json", { status: 200 }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  assert.equal(result, null);
});

test("lookupOfficialWoonplaats: hangende fetch → begrensd door PDOK_ZONE_LOOKUP_TIMEOUT_MS, null, geen onbeperkt wachten", async () => {
  const start = Date.now();
  const result = await withFakeFetch(
    (_url, init) =>
      new Promise((_resolve, reject) => {
        // Reageert zelf nooit — alleen de AbortSignal van de caller mag dit beëindigen.
        const signal = init?.signal as AbortSignal | undefined;
        signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      }),
    () => lookupOfficialWoonplaats("Eindhoven")
  );
  const elapsedMs = Date.now() - start;
  assert.equal(result, null);
  assert.ok(elapsedMs >= PDOK_ZONE_LOOKUP_TIMEOUT_MS - 20, `timeout ging te vroeg af: ${elapsedMs}ms`);
  assert.ok(elapsedMs < PDOK_ZONE_LOOKUP_TIMEOUT_MS + 300, `verwacht ~${PDOK_ZONE_LOOKUP_TIMEOUT_MS}ms, duurde ${elapsedMs}ms`);
});
