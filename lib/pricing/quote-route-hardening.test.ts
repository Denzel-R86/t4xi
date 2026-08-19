import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { POST as quote } from "@/app/api/pricing/quote/route";

const routeSource = readFileSync("app/api/pricing/quote/route.ts", "utf8");

function post(body: unknown): Request {
  return new Request("https://www.t4xi.nl/api/pricing/quote", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

function assertPrivateNoStore(response: Response): void {
  const value = response.headers.get("cache-control") ?? "";
  assert.match(value, /\bprivate\b/);
  assert.match(value, /\bno-store\b/);
}

test("quote: datum en tijd moeten samen worden aangeleverd", async () => {
  for (const extra of [{ date: "2026-08-10" }, { time: "08:00" }]) {
    const response = await quote(post({ pickup: "Amsterdam", dropoff: "Schiphol", ...extra }));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("quote: fout formaat, tijd en onbestaande kalenderdatum geven 400", async () => {
  for (const extra of [
    { date: "10-08-2026", time: "08:00" },
    { date: "2026-08-10", time: "99:99" },
    { date: "2026-02-31", time: "08:00" },
  ]) {
    const response = await quote(post({ pickup: "Amsterdam", dropoff: "Schiphol", ...extra }));
    assert.equal(response.status, 400);
    assertPrivateNoStore(response);
  }
});

test("quote: alle responsepaden lopen door de private/no-store helper", () => {
  assert.equal(routeSource.match(/NextResponse\.json/g)?.length, 1);
  assert.match(routeSource, /private, no-store, max-age=0/);
});

// ── 2026-08-19 (audit PR #23): server-side afdwinging van datum/tijd/bagage ──
// bewijst dat het rechtstreeks aanroepen van de API (UI omzeild) NOOIT alsnog
// een prijs, quoteId of snapshot oplevert zonder deze drie geldige velden.

test("quote: ontbrekende bagagecategorie geeft 400, geen prijs", async () => {
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00" })
  );
  assert.equal(response.status, 400);
  assertPrivateNoStore(response);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: ongeldige bagagecategorie geeft 400 (niet stil terugvallen op een default)", async () => {
  for (const luggageCategory of ["", "extra-grote-bagage", "handbagage; drop table", null, 42]) {
    const response = await quote(
      post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00", luggageCategory })
    );
    assert.equal(response.status, 400, `luggageCategory=${JSON.stringify(luggageCategory)} moet 400 geven`);
  }
});

test("quote: 'overleg' (offerte-op-aanvraag-bagage) is een GELDIGE, bewuste keuze — geen 400 op basis van bagage alleen", async () => {
  // 'overleg' is geen bindende categorie (zie lib/pricing/luggage.ts), maar wél
  // een bewuste, geldige keuze — mag dus niet op de bagage-check zelf stranden.
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2099-01-01", time: "10:00", luggageCategory: "overleg" })
  );
  const body = await response.json();
  assert.notEqual(body.message, "'luggageCategory' is verplicht: kies eerst uw bagage voordat een prijs opgevraagd wordt.");
});

test("quote: geldige bagage, maar datum in het verleden → 400, geen prijs (bypass van de UI mag nooit een prijs opleveren)", async () => {
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: "2020-01-01", time: "10:00", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  assertPrivateNoStore(response);
  const body = await response.json();
  assert.equal(body.available, false);
  assert.match(body.message, /verleden/);
  assert.equal("price" in body, false);
  assert.equal("quoteId" in body, false);
});

test("quote: gisteren (relatief t.o.v. nu) wordt geweigerd — bewijst dat de grens dynamisch is, geen hardcoded jaartal", async () => {
  const yesterday = new Date();
  yesterday.setUTCDate(yesterday.getUTCDate() - 2); // 2 dagen marge voor tijdzone-afronding rond middernacht
  const yyyy = yesterday.getUTCFullYear();
  const mm = String(yesterday.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(yesterday.getUTCDate()).padStart(2, "0");
  const response = await quote(
    post({ pickup: "Amsterdam", dropoff: "Schiphol", date: `${yyyy}-${mm}-${dd}`, time: "10:00", luggageCategory: "handbagage" })
  );
  assert.equal(response.status, 400);
  const body = await response.json();
  assert.match(body.message, /verleden/);
});
