/**
 * F-39 — ops-login: limiet, progressieve lockout, Origin-check en geen
 * gebruikersnaam-enumeratie. Alleen zelf gegenereerde testwaarden; de tijd wordt
 * via Date.now gestuurd (de limiter leest Date.now).
 */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, test } from "node:test";
import { DELETE, POST } from "@/app/api/admin/session/route";
import { POST as postBooking } from "@/app/api/admin/bookings/route";
import { POST as postCarrier } from "@/app/api/admin/carriers/route";
import { POST as postInvoice } from "@/app/api/admin/invoices/route";

const ORIGIN = "https://www.t4xi.nl";
const realNow = Date.now;
const saved = {
  user: process.env.OPS_DASHBOARD_USERNAME,
  pass: process.env.OPS_DASHBOARD_PASSWORD,
};
let clock = Date.UTC(2026, 9, 14, 12, 0, 0);
let user = "";
let pass = "";
let ipSeq = 0;

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}

beforeEach(() => {
  // Elke test een eigen account en eigen IP's: de limiter-state is module-breed.
  user = `ops-${randomUUID().slice(0, 8)}`;
  pass = `pw-${randomUUID()}`;
  process.env.OPS_DASHBOARD_USERNAME = user;
  process.env.OPS_DASHBOARD_PASSWORD = pass;
  clock += 7 * 24 * 60 * 60_000;
  Date.now = () => clock;
});

afterEach(() => {
  Date.now = realNow;
  restore("OPS_DASHBOARD_USERNAME", saved.user);
  restore("OPS_DASHBOARD_PASSWORD", saved.pass);
});

const freshIp = () => `198.51.100.${(ipSeq += 1) % 250}${ipSeq > 250 ? `-${ipSeq}` : ""}`;

function login(username: string, password: string, ip: string, headers: Record<string, string> = { origin: ORIGIN }) {
  return POST(new Request(`${ORIGIN}/api/admin/session`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": ip, ...headers },
    body: JSON.stringify({ username, password }),
  }));
}

const advance = (ms: number) => { clock += ms; };

test("juiste credentials met eigen Origin geven een sessiecookie", async () => {
  const response = await login(user, pass, freshIp());
  assert.equal(response.status, 200);
  assert.match(response.headers.get("set-cookie") ?? "", /t4xi_ops_session=/);
});

test("pogingenlimiet per IP en per naam: de 11e poging binnen een minuut krijgt 429 met Retry-After", async () => {
  const ip = freshIp();
  for (let i = 0; i < 10; i += 1) assert.equal((await login(user, pass, ip)).status, 200);
  const limited = await login(user, pass, ip);
  assert.equal(limited.status, 429);
  assert.deepEqual(await limited.json(), { error: "too_many_attempts" });
  assert.ok(Number(limited.headers.get("retry-after")) > 0);
  assert.equal((await login(user, pass, freshIp())).status, 429, "ook de pogingenlimiet per naam is bereikt");
  // Nieuw account: alleen de IP-limiet blijft over.
  process.env.OPS_DASHBOARD_USERNAME = user = `ops-${randomUUID().slice(0, 8)}`;
  assert.equal((await login(user, pass, ip)).status, 429, "IP-limiet geldt ongeacht de naam");
  assert.equal((await login(user, pass, freshIp())).status, 200, "ander IP wordt niet geraakt");
  advance(61_000);
  assert.equal((await login(user, pass, ip)).status, 200, "limiet verloopt na het venster");
});

test("lockout escaleert (15 min → 1 uur) en verloopt; ook het juiste wachtwoord wacht", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) assert.equal((await login(user, "fout", ip)).status, 401);
  const first = await login(user, pass, ip);
  assert.equal(first.status, 429, "na 5 fouten dicht, ook met juist wachtwoord");
  const firstWait = Number(first.headers.get("retry-after"));
  assert.ok(firstWait > 60 && firstWait <= 15 * 60, `eerste lockout ≤ 15 min (${firstWait}s)`);

  advance(15 * 60_000 + 1000);
  for (let i = 0; i < 5; i += 1) assert.equal((await login(user, "fout", ip)).status, 401);
  const second = await login(user, pass, ip);
  assert.equal(second.status, 429);
  const secondWait = Number(second.headers.get("retry-after"));
  assert.ok(secondWait > firstWait, `tweede lockout duurt langer (${secondWait}s > ${firstWait}s)`);

  advance(secondWait * 1000 + 1000);
  assert.equal((await login(user, pass, ip)).status, 200, "lockout verloopt");
});

test("lockout per gebruikersnaam geldt ook vanaf wisselende IP's", async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await login(user, "fout", freshIp())).status, 401);
  assert.equal((await login(user, pass, freshIp())).status, 429);
});

test("lockout per IP geldt ook bij wisselende gebruikersnamen", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) assert.equal((await login(`gok-${i}`, "fout", ip)).status, 401);
  assert.equal((await login(user, pass, ip)).status, 429);
});

test("geen enumeratie: onbekende en bekende naam geven identieke fout- en lockoutantwoorden", async () => {
  const snapshot = async (response: Response) => ({
    status: response.status,
    body: await response.text(),
    cache: response.headers.get("cache-control"),
    cookie: response.headers.get("set-cookie"),
    retry: response.headers.get("retry-after"),
  });
  const known = await snapshot(await login(user, "fout", freshIp()));
  const unknown = await snapshot(await login(`onbekend-${randomUUID()}`, "fout", freshIp()));
  assert.deepEqual(unknown, known);
  assert.equal(known.status, 401);

  const ipA = freshIp();
  const ipB = freshIp();
  const other = `onbekend-${randomUUID()}`;
  for (let i = 0; i < 5; i += 1) {
    await login(user, "fout", ipA);
    await login(other, "fout", ipB);
  }
  assert.deepEqual(await snapshot(await login(other, "fout", ipB)), await snapshot(await login(user, "fout", ipA)));
});

test("Origin: vreemd, null of ontbrekend → 403 zonder dat de poging telt; Referer van de eigen site mag", async () => {
  const ip = freshIp();
  for (const headers of [{ origin: "https://evil.example" }, { origin: "null" }, {} as Record<string, string>]) {
    const response = await login(user, pass, ip, headers);
    assert.equal(response.status, 403);
    assert.deepEqual(await response.json(), { error: "forbidden_origin" });
  }
  assert.equal((await login(user, pass, ip, { referer: `${ORIGIN}/nl/dashboard/invoices` })).status, 200);
});

test("uitloggen en muterende admin-routes weigeren een vreemde Origin vóór de auth-check", async () => {
  const del = (headers: Record<string, string>) =>
    DELETE(new Request(`${ORIGIN}/api/admin/session`, { method: "DELETE", headers }));
  assert.equal((await del({ origin: "https://evil.example" })).status, 403);
  assert.equal((await del({})).status, 403);
  assert.equal((await del({ origin: ORIGIN })).status, 200);

  for (const [name, handler] of [["bookings", postBooking], ["carriers", postCarrier], ["invoices", postInvoice]] as const) {
    const make = (origin: string) => new Request(`${ORIGIN}/api/admin/${name}`, {
      method: "POST", headers: { origin, "content-type": "application/json" }, body: "{}",
    });
    assert.equal((await handler(make("https://evil.example"))).status, 403, `${name}: vreemde Origin`);
    assert.equal((await handler(make(ORIGIN))).status, 401, `${name}: eigen Origin, geen sessie → 401`);
  }
});

/** Absoluut eindtijdstip (ms) dat een 429 aankondigt. */
const lockEnd = (response: Response) => clock + Number(response.headers.get("retry-after")) * 1000;

test("IP-lockout: herhaalde pogingen tijdens de lockout schuiven het einde niet op", async () => {
  const ip = freshIp();
  for (let i = 0; i < 5; i += 1) assert.equal((await login(`gok-${randomUUID()}`, "fout", ip)).status, 401);
  const first = await login(user, pass, ip);
  assert.equal(first.status, 429);
  const end = lockEnd(first);
  for (let i = 0; i < 20; i += 1) {
    advance(30_000);
    const again = await login(i % 2 ? user : `gok-${i}`, i % 3 ? "fout" : pass, ip);
    assert.equal(again.status, 429);
    assert.equal(lockEnd(again), end, `poging ${i + 1} verschoof het einde`);
  }
  clock = end + 1000;
  assert.equal((await login(user, pass, ip)).status, 200, "na het oorspronkelijke einde weer open");
});

test("naam-lockout: pogingen vanaf andere IP's tijdens de lockout schuiven het einde niet op", async () => {
  for (let i = 0; i < 5; i += 1) assert.equal((await login(user, "fout", freshIp())).status, 401);
  const first = await login(user, pass, freshIp());
  assert.equal(first.status, 429);
  const end = lockEnd(first);
  for (let i = 0; i < 30; i += 1) {
    advance(20_000);
    const again = await login(user, i % 2 ? pass : "fout", freshIp());
    assert.equal(again.status, 429);
    assert.equal(lockEnd(again), end, `poging ${i + 1} verschoof het einde`);
  }
  clock = end + 1000;
  assert.equal((await login(user, pass, freshIp())).status, 200);
});

test("naam-lockout is nooit langer dan 15 min, ook na vele fouten vanaf vele IP's", async () => {
  for (let round = 0; round < 6; round += 1) {
    for (let i = 0; i < 5; i += 1) assert.equal((await login(user, "fout", freshIp())).status, 401, `ronde ${round}`);
    for (let i = 0; i < 10; i += 1) {
      const locked = await login(user, "fout", freshIp());
      assert.equal(locked.status, 429);
      const wait = Number(locked.headers.get("retry-after"));
      assert.ok(wait > 0 && wait <= 15 * 60, `ronde ${round}: naam-lockout ${wait}s > 15 min`);
    }
    advance(15 * 60_000 + 1000);
  }
  assert.equal((await login(user, pass, freshIp())).status, 200, "na afloop weer inloggen");
});

test("IP-escalatie blijft: 15 min → tot het uur om is → na 20 fouten een dag; daarna weer open", async () => {
  const ip = freshIp();
  const waits: number[] = [];
  // Pogingen tijdens een lockout tellen niet, dus elke ronde wacht de lockout eerst uit.
  for (let round = 0; round < 4; round += 1) {
    for (let i = 0; i < 5; i += 1) assert.equal((await login(`gok-${randomUUID()}`, "fout", ip)).status, 401, `ronde ${round}`);
    const locked = await login(user, pass, ip);
    assert.equal(locked.status, 429);
    waits.push(Number(locked.headers.get("retry-after")));
    advance(waits[round] * 1000 + 1000);
  }
  assert.ok(waits[0] <= 15 * 60, `eerste lockout ≤ 15 min (${waits[0]}s)`);
  assert.ok(waits[1] > waits[0], `tweede lockout langer (${waits[1]}s)`);
  assert.ok(waits[3] > 60 * 60, `na 20 fouten > 1 uur dicht (${waits.join(", ")}s)`);
  assert.equal((await login(user, pass, ip)).status, 200, "na afloop weer open");
});
