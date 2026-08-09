import { test } from "node:test";
import assert from "node:assert/strict";
import {
  isPublicTransitQuery,
  rankAddressSuggestions,
  type AddressSuggestion,
} from "@/components/shared/AddressAutocomplete";

const suggestion = (
  id: string,
  label: string,
  source: AddressSuggestion["source"] = "pdok"
): AddressSuggestion => ({ id, label, source });

test("OV-intentie wordt op generieke termen herkend, niet op een hardcoded stad", () => {
  assert.equal(isPublicTransitQuery("Amsterdam Centraal"), true);
  assert.equal(isPublicTransitQuery("Utrecht CS"), true);
  assert.equal(isPublicTransitQuery("station Zwolle"), true);
  assert.equal(isPublicTransitQuery("Keizersgracht 10 Amsterdam"), false);
});

test("exacte OV-locatie komt vóór gedeeltelijke PDOK-adresmatches", () => {
  const ranked = rankAddressSuggestions("Amsterdam Centraal", [
    suggestion("pdok-1", "Amsterdam", "pdok"),
    suggestion("pdok-2", "Centrum, Amsterdam", "pdok"),
    suggestion("google-1", "Amsterdam Centraal, Stationsplein, Amsterdam", "google"),
  ]);
  assert.equal(ranked[0]?.id, "google-1");
});

test("dezelfde ranking werkt voor een andere stad en dedupliceert labels", () => {
  const ranked = rankAddressSuggestions("Utrecht Centraal", [
    suggestion("partial", "Utrecht", "pdok"),
    suggestion("exact", "Utrecht Centraal", "google"),
    suggestion("duplicate", "Utrecht Centraal", "pdok"),
  ]);
  assert.deepEqual(ranked.map((item) => item.id), ["exact", "partial"]);
});
