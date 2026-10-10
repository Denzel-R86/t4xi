import assert from "node:assert/strict";
import { test } from "node:test";
import { isServerPaid, serverPaidProof, type ServerPaidProof } from "@/lib/payments/server-paid";

const INTENT = { amount: 8900, currency: "eur" };

test("alleen status 'paid' van de server levert een bewijs", () => {
  for (const status of ["pending", "unpaid", "processing", "failed", "canceled", "PAID", "", undefined]) {
    assert.equal(serverPaidProof({ status, amountPaid: 8900 }, INTENT), null, String(status));
  }
  assert.equal(serverPaidProof(null, INTENT), null);
  assert.equal(serverPaidProof("paid", INTENT), null);
  const proof = serverPaidProof({ status: "paid", amountPaid: 8900, currency: "eur" }, INTENT);
  assert.ok(proof && isServerPaid(proof));
  assert.equal(proof.amountCents, 8900);
});

test("een intent zonder betaalde status is nooit genoeg", () => {
  assert.equal(serverPaidProof({}, INTENT), null);
  assert.equal(serverPaidProof(INTENT, INTENT), null);
});

test("bedrag: betaald bedrag van de server, anders het intentbedrag, anders geen bedrag", () => {
  assert.equal(serverPaidProof({ status: "paid", amountPaid: 7900 }, INTENT)?.amountCents, 7900);
  assert.equal(serverPaidProof({ status: "paid", amountPaid: null }, INTENT)?.amountCents, 8900);
  assert.equal(serverPaidProof({ status: "paid" }, null)?.amountCents, null);
  assert.equal(serverPaidProof({ status: "paid", amountPaid: -1 }, { amount: 0, currency: "eur" })?.amountCents, null);
  assert.equal(serverPaidProof({ status: "paid", currency: "<script>" }, null)?.currency, "eur");
});

test("nagemaakte bewijzen (directe props, cast, JSON na reload) worden geweigerd", () => {
  const forged = { amountCents: 8900, currency: "eur" } as unknown as ServerPaidProof;
  assert.equal(isServerPaid(forged), false);
  const real = serverPaidProof({ status: "paid", amountPaid: 8900 }, INTENT);
  assert.equal(isServerPaid(JSON.parse(JSON.stringify(real))), false);
  assert.equal(isServerPaid({ ...real }), false);
  assert.equal(isServerPaid(null), false);
  assert.ok(Object.isFrozen(real));
});
