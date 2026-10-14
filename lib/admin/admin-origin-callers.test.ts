/**
 * F-39 — Origin-check tegen elk legitiem client-pad naar /api/admin/*.
 *
 * Inventaris (enige client: components/dashboard/InvoiceOperations.tsx, gerenderd op
 * /[locale]/dashboard/invoices; relatieve URL's, standaard fetch-modus → same-origin):
 *   GET    /api/admin/invoices  laden         (geen Origin-check: niet muterend)
 *   POST   /api/admin/session   inloggen
 *   DELETE /api/admin/session   uitloggen
 *   POST   /api/admin/carriers  vervoerder toevoegen
 *   POST   /api/admin/invoices  factuurgegevens opslaan
 *   POST   /api/admin/bookings  statusovergang
 * Er zijn geen server-side aanroepers van /api/admin/* (app/admin gebruikt Server
 * Actions, geen /api/admin). De broncheck hieronder faalt als er een aanroeper bijkomt.
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { execSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, test } from "node:test";
import { DELETE as deleteSession, POST as postSession } from "@/app/api/admin/session/route";
import { POST as postBooking } from "@/app/api/admin/bookings/route";
import { POST as postCarrier } from "@/app/api/admin/carriers/route";
import { GET as getInvoices, POST as postInvoice } from "@/app/api/admin/invoices/route";
import { createOpsSession } from "@/lib/admin/session";

const SITE = "https://www.t4xi.nl";
const PAGE = `${SITE}/nl/dashboard/invoices`;
const saved = {
  user: process.env.OPS_DASHBOARD_USERNAME,
  pass: process.env.OPS_DASHBOARD_PASSWORD,
  supaUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  supaKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
};
let user = "";
let pass = "";
let ipSeq = 0;

beforeEach(() => {
  user = `ops-${randomUUID().slice(0, 8)}`;
  pass = `pw-${randomUUID()}`;
  process.env.OPS_DASHBOARD_USERNAME = user;
  process.env.OPS_DASHBOARD_PASSWORD = pass;
  // Geen database: geldige verzoeken eindigen op 400/503, nooit op een echte write.
  delete process.env.NEXT_PUBLIC_SUPABASE_URL;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
});

afterEach(() => {
  for (const [name, value] of Object.entries({
    OPS_DASHBOARD_USERNAME: saved.user, OPS_DASHBOARD_PASSWORD: saved.pass,
    NEXT_PUBLIC_SUPABASE_URL: saved.supaUrl, SUPABASE_SERVICE_ROLE_KEY: saved.supaKey,
  })) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

/** Headers zoals een browser ze stuurt voor fetch() vanaf de dashboardpagina. */
function browserHeaders(site: "same-origin" | "cross-site", method: string): Record<string, string> {
  const from = site === "same-origin" ? SITE : "https://evil.example";
  const headers: Record<string, string> = {
    "sec-fetch-site": site,
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    referer: site === "same-origin" ? PAGE : `${from}/`,
    "x-forwarded-for": `192.0.2.${(ipSeq += 1) % 250}`,
  };
  // Browsers sturen Origin altijd bij niet-GET/HEAD, en bij GET alleen cross-origin.
  if (method !== "GET" || site === "cross-site") headers.origin = from;
  return headers;
}

type Path = {
  method: "GET" | "POST" | "DELETE";
  route: string;
  handler: (request: Request) => Promise<Response>;
  body?: () => unknown;
  withSession: boolean;
  /** Verwachte status voor een legitiem same-origin-verzoek (zonder database). */
  ok: number[];
};

const PATHS: Path[] = [
  { method: "GET", route: "/api/admin/invoices", handler: getInvoices, withSession: true, ok: [503] },
  { method: "POST", route: "/api/admin/session", handler: postSession, body: () => ({ username: user, password: pass }), withSession: false, ok: [200] },
  { method: "DELETE", route: "/api/admin/session", handler: deleteSession, withSession: true, ok: [200] },
  { method: "POST", route: "/api/admin/carriers", handler: postCarrier, body: () => ({ name: "Testvervoerder" }), withSession: true, ok: [503] },
  { method: "POST", route: "/api/admin/invoices", handler: postInvoice, body: () => ({ bookingId: randomUUID() }), withSession: true, ok: [400] },
  { method: "POST", route: "/api/admin/bookings", handler: postBooking, body: () => ({ bookingId: randomUUID(), to: "confirmed" }), withSession: true, ok: [503] },
];

async function send(path: Path, site: "same-origin" | "cross-site"): Promise<Response> {
  const headers = browserHeaders(site, path.method);
  if (path.withSession) headers.cookie = `t4xi_ops_session=${await createOpsSession()}`;
  if (path.body) headers["content-type"] = "application/json";
  return path.handler(new Request(`${SITE}${path.route}`, {
    method: path.method,
    headers,
    ...(path.body ? { body: JSON.stringify(path.body()) } : {}),
  }));
}

for (const path of PATHS) {
  test(`${path.method} ${path.route}: same-origin browserverzoek komt door de Origin-check`, async () => {
    const response = await send(path, "same-origin");
    assert.ok(path.ok.includes(response.status), `status ${response.status}, verwacht ${path.ok.join("/")}`);
  });

  test(`${path.method} ${path.route}: cross-site ${path.method === "GET" ? "wordt niet door de Origin-check geblokkeerd (niet muterend)" : "krijgt 403"}`, async () => {
    const response = await send(path, "cross-site");
    if (path.method === "GET") {
      assert.notEqual(response.status, 403);
      return;
    }
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "forbidden_origin" });
  });
}

test("inventaris: de enige aanroepers van /api/admin/* zijn de zes paden hierboven", () => {
  const hits = execSync(
    "git grep -n -E \"['\\\"\\`]/api/admin/\" -- components app lib ':!app/api' ':!*.test.ts' ':!lib/security/api-surface.ts'",
    { encoding: "utf8" }
  ).trim().split("\n");
  assert.deepEqual(hits.map((line) => line.split(":")[0]), Array(6).fill("components/dashboard/InvoiceOperations.tsx"));

  const source = readFileSync("components/dashboard/InvoiceOperations.tsx", "utf8");
  const calls = [...source.matchAll(/fetch\("(\/api\/admin\/[a-z]+)"(?:,\s*\{\s*(?:method:\s*"([A-Z]+)")?)?/g)]
    .map((m) => `${m[2] ?? "GET"} ${m[1]}`).sort();
  assert.deepEqual(calls, PATHS.map((p) => `${p.method} ${p.route}`).sort());
  // Relatief pad zonder afwijkende modus/credentials → altijd same-origin met Origin-header.
  assert.ok(!/fetch\("https?:/.test(source), "absolute admin-URL zou cross-origin kunnen zijn");
  assert.ok(!/mode:\s*"no-cors"|credentials:\s*"include"|referrerPolicy/.test(source), "afwijkende fetch-modus");
});
