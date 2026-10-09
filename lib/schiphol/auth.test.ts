/**
 * Tests voor de OAuth2 client-credentials tokenprovider (lib/schiphol/auth.ts).
 * Geen echt netwerk: de token-endpoint-fetch wordt gestubd en de klok geïnjecteerd.
 * De module-cache wordt vóór elke relevante test gewist.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  getSchipholAccessToken,
  resetSchipholTokenCache,
  schipholCredentials,
} from "./auth";

const CREDS = { clientId: "cid", clientSecret: "secret" };

/** fetchImpl die één tokenrespons teruggeeft en de request vastlegt. */
function tokenFetch(
  status: number,
  body: unknown,
  capture?: (req: { url: string; init: RequestInit }) => void
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    capture?.({ url: String(url), init });
    return new Response(typeof body === "string" ? body : JSON.stringify(body), { status });
  }) as unknown as typeof fetch;
}

test("schipholCredentials — leest client_id/secret, null bij ontbreken", () => {
  assert.deepEqual(
    schipholCredentials({ SCHIPHOL_CLIENT_ID: "a", SCHIPHOL_CLIENT_SECRET: "b" }),
    { clientId: "a", clientSecret: "b" }
  );
  assert.equal(schipholCredentials({ SCHIPHOL_CLIENT_ID: "a" }), null);
  assert.equal(schipholCredentials({}), null);
  assert.equal(schipholCredentials({ SCHIPHOL_CLIENT_ID: " ", SCHIPHOL_CLIENT_SECRET: "b" }), null);
});

test("getSchipholAccessToken — ontbrekende credentials → not_configured (geen netwerk)", async () => {
  resetSchipholTokenCache();
  let called = false;
  const spy = (async () => {
    called = true;
    return new Response("{}", { status: 200 });
  }) as unknown as typeof fetch;
  const r = await getSchipholAccessToken({ fetchImpl: spy, credentials: null });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "not_configured");
  assert.equal(called, false);
});

test("getSchipholAccessToken — succes: POST client_credentials met audience, token terug", async () => {
  resetSchipholTokenCache();
  let seen: { url: string; init: RequestInit } | null = null;
  const r = await getSchipholAccessToken({
    credentials: CREDS,
    tokenUrl: "https://token.example/oauth/token",
    audience: "https://api.example/public",
    fetchImpl: tokenFetch(200, { access_token: "jwt-abc", expires_in: 1800 }, (req) => (seen = req)),
  });
  assert.equal(r.ok, true);
  if (!r.ok) return;
  assert.equal(r.token, "jwt-abc");

  const req = seen as unknown as { url: string; init: RequestInit };
  assert.equal(req.url, "https://token.example/oauth/token");
  assert.equal(req.init.method, "POST");
  const headers = req.init.headers as Record<string, string>;
  assert.equal(headers["Content-Type"], "application/json");
  const payload = JSON.parse(String(req.init.body));
  assert.equal(payload.grant_type, "client_credentials");
  assert.equal(payload.client_id, "cid");
  assert.equal(payload.client_secret, "secret");
  assert.equal(payload.audience, "https://api.example/public");
});

test("getSchipholAccessToken — cachet het token tot vlak vóór de expiry", async () => {
  resetSchipholTokenCache();
  let fetches = 0;
  const now = { ms: 1_000_000 };
  const counting = (async () => {
    fetches += 1;
    return new Response(JSON.stringify({ access_token: `jwt-${fetches}`, expires_in: 1800 }), { status: 200 });
  }) as unknown as typeof fetch;
  const deps = { credentials: CREDS, fetchImpl: counting, now: () => now.ms };

  const first = await getSchipholAccessToken(deps);
  assert.equal(first.ok && first.token, "jwt-1");

  // Binnen de levensduur: uit cache, geen nieuwe fetch.
  now.ms += 1000 * 1000; // +1000s, ruim binnen 1800−60s
  const second = await getSchipholAccessToken(deps);
  assert.equal(second.ok && second.token, "jwt-1");
  assert.equal(fetches, 1, "tweede call komt uit de cache");

  // Voorbij (expires_in − skew): vernieuwt.
  now.ms += 800 * 1000; // totaal +1800s → verlopen
  const third = await getSchipholAccessToken(deps);
  assert.equal(third.ok && third.token, "jwt-2");
  assert.equal(fetches, 2, "na expiry wordt een vers token opgehaald");
});

test("getSchipholAccessToken — 401/403 → unauthorized met status", async () => {
  for (const status of [401, 403]) {
    resetSchipholTokenCache();
    const r = await getSchipholAccessToken({
      credentials: CREDS,
      fetchImpl: tokenFetch(status, { error: "access_denied" }),
    });
    assert.equal(r.ok, false);
    if (r.ok) return;
    assert.equal(r.reason, "unauthorized");
    if (r.reason !== "unauthorized") return;
    assert.equal(r.status, status);
  }
});

test("getSchipholAccessToken — netwerkfout → network_error", async () => {
  resetSchipholTokenCache();
  const throwing = (async () => {
    throw new Error("down");
  }) as unknown as typeof fetch;
  const r = await getSchipholAccessToken({ credentials: CREDS, fetchImpl: throwing });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "network_error");
});

test("getSchipholAccessToken — non-2xx (500) → invalid_response", async () => {
  resetSchipholTokenCache();
  const r = await getSchipholAccessToken({
    credentials: CREDS,
    fetchImpl: tokenFetch(500, { error: "boom" }),
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "invalid_response");
  if (r.reason !== "invalid_response") return;
  assert.equal(r.status, 500);
});

test("getSchipholAccessToken — 200 zonder access_token → invalid_response", async () => {
  resetSchipholTokenCache();
  const r = await getSchipholAccessToken({
    credentials: CREDS,
    fetchImpl: tokenFetch(200, { expires_in: 1800 }),
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "invalid_response");
});

test("getSchipholAccessToken — ongeldige JSON → invalid_response", async () => {
  resetSchipholTokenCache();
  const r = await getSchipholAccessToken({
    credentials: CREDS,
    fetchImpl: tokenFetch(200, "niet-json{"),
  });
  assert.equal(r.ok, false);
  if (r.ok) return;
  assert.equal(r.reason, "invalid_response");
});
