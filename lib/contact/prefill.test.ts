import assert from "node:assert/strict";
import { test } from "node:test";
import { contactPrefill } from "@/lib/contact/prefill";

test("zakelijke contactcontext laat alleen bekende zakelijke keuzes door", () => {
  assert.deepEqual(
    contactPrefill({ audience: "business", topic: "businessTransport" }),
    { audience: "business", topic: "businessTransport" }
  );
  assert.deepEqual(
    contactPrefill({ audience: "business", topic: "businessAgreement" }),
    { audience: "business", topic: "businessAgreement" }
  );
  assert.deepEqual(
    contactPrefill({ audience: "business", topic: "privateAirport" }),
    { audience: "business", topic: "" }
  );
  assert.deepEqual(
    contactPrefill({ audience: "business", topic: "<script>alert(1)</script>" }),
    { audience: "business", topic: "" }
  );
});

test("contactcontext valt zonder expliciete zakelijke keuze veilig terug op particulier", () => {
  assert.deepEqual(contactPrefill({}), { audience: "private", topic: "" });
  assert.deepEqual(
    contactPrefill({ audience: "unknown", topic: "businessTransport" }),
    { audience: "private", topic: "" }
  );
  assert.deepEqual(
    contactPrefill({ audience: ["business", "private"], topic: ["businessEvent", "privateRide"] }),
    { audience: "business", topic: "businessEvent" }
  );
});
