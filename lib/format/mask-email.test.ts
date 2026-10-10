import assert from "node:assert/strict";
import { test } from "node:test";
import { MASK, maskEmail } from "@/lib/format/mask-email";

test("gewoon adres: eerste 2 tekens + vaste maskering + volledig domein", () => {
  assert.equal(maskEmail("ronald.tester@gmail.com"), "ro••••@gmail.com");
  assert.equal(maskEmail("  ronald@gmail.com  "), "ro••••@gmail.com");
});

test("de maskering verraadt de lengte niet", () => {
  assert.equal(maskEmail("abc@example.test"), `ab${MASK}@example.test`);
  assert.equal(maskEmail("abcdefghijklmnop@example.test"), `ab${MASK}@example.test`);
});

test("korte namen: nooit het volledige lokale deel", () => {
  assert.equal(maskEmail("a@example.test"), `a${MASK}@example.test`);
  assert.equal(maskEmail("ab@example.test"), `a${MASK}@example.test`);
});

test("subdomeinen en plus-adressen: domein blijft staan, tag verdwijnt achter het masker", () => {
  assert.equal(maskEmail("jan@mail.office.example.co.uk"), `ja${MASK}@mail.office.example.co.uk`);
  assert.equal(maskEmail("jan+t4xi@example.test"), `ja${MASK}@example.test`);
});

test("unicode in het lokale deel wordt per teken (niet per code-unit) afgekapt", () => {
  assert.equal(maskEmail("😀😀😀@example.test"), `😀😀${MASK}@example.test`);
});

test("ongeldige invoer → null, nooit de ruwe invoer", () => {
  for (const bad of ["", "   ", "geen-apenstaartje", "@example.test", "jan@", "jan@localhost", "jan@@example.test",
    "jan @example.test", "jan@.example.test", "jan@example.test.", "jan@example..test", null, undefined, 42, {}]) {
    assert.equal(maskEmail(bad), null, String(bad));
  }
});
