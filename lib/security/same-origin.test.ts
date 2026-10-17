import assert from "node:assert/strict";
import { test } from "node:test";
import { isSameOriginRequest } from "@/lib/security/same-origin";

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, { method: "POST", headers });
}

test("Origin-check: productie, preview en localhost op eigen host zijn toegestaan", () => {
  assert.equal(isSameOriginRequest(req("https://www.t4xi.nl/api/admin/session", { origin: "https://www.t4xi.nl" })), true);
  assert.equal(isSameOriginRequest(req("https://www.t4xi.nl/api/admin/session", { origin: "https://t4xi.nl" })), true);
  assert.equal(isSameOriginRequest(req("http://localhost:3000/api/admin/session", { origin: "http://localhost:3000" })), true);
  const preview = "https://t4xi-git-feature-x.vercel.app";
  assert.equal(isSameOriginRequest(req("http://internal/api/admin/session", {
    origin: preview, "x-forwarded-host": "t4xi-git-feature-x.vercel.app", "x-forwarded-proto": "https",
  })), true);
});

test("Origin-check: vreemde, null of ontbrekende Origin wordt geweigerd", () => {
  const url = "https://www.t4xi.nl/api/admin/session";
  assert.equal(isSameOriginRequest(req(url, { origin: "https://evil.example" })), false);
  assert.equal(isSameOriginRequest(req(url, { origin: "https://www.t4xi.nl.evil.example" })), false);
  assert.equal(isSameOriginRequest(req(url, { origin: "http://www.t4xi.nl" })), false, "http i.p.v. https");
  assert.equal(isSameOriginRequest(req(url, { origin: "null" })), false);
  assert.equal(isSameOriginRequest(req(url)), false, "geen Origin en geen Referer → weigeren");
  assert.equal(isSameOriginRequest(req("http://localhost:3000/x", { origin: "http://localhost:4000" })), false);
});

test("Origin-check: zonder Origin telt de Referer-origin; een vreemde Origin wint van een goede Referer", () => {
  const url = "https://www.t4xi.nl/api/admin/session";
  assert.equal(isSameOriginRequest(req(url, { referer: "https://www.t4xi.nl/nl/dashboard/invoices" })), true);
  assert.equal(isSameOriginRequest(req(url, { referer: "https://evil.example/www.t4xi.nl" })), false);
  assert.equal(isSameOriginRequest(req(url, { origin: "https://evil.example", referer: "https://www.t4xi.nl/" })), false);
});
