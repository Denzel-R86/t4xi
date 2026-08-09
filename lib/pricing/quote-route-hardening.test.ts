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
