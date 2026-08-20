import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const booking = readFileSync("components/booking/BookingSection.tsx", "utf8");
const addressAutocomplete = readFileSync("components/shared/AddressAutocomplete.tsx", "utf8");
const patterns = readFileSync("components/horizon/patterns.tsx", "utf8");
const horizonCss = readFileSync("components/horizon/horizon.css", "utf8");
const routeFinder = readFileSync("components/tarieven/RouteFinder.tsx", "utf8");
const destinationExplorer = readFileSync("components/tarieven/DestinationExplorer.tsx", "utf8");

test("primaire boekingsbediening heeft minimaal 44px aanraakhoogte", () => {
  assert.match(booking, /role="radio"[\s\S]*?className=\{`min-h-11/);
  assert.match(addressAutocomplete, /role="option"[\s\S]*?flex min-h-11 cursor-pointer/);
  assert.match(patterns, /role="option"[\s\S]*?block min-h-11 w-full/);
  assert.match(patterns, /hz-confirm-btn inline-flex min-h-11 items-center/);
});

test("compacte homepage-invoer wordt op mobiel niet kleiner dan 44px", () => {
  assert.match(
    horizonCss,
    /@media \(max-width: 767px\)[\s\S]*?input\.hz-blank,[\s\S]*?select\.hz-blank[\s\S]*?min-height: 44px/,
  );
  assert.match(horizonCss, /input\[type="time"\]\.hz-blank[\s\S]*?min-width: 7\.5ch/);
});

test("secundaire links in de boekingsflow halen minimaal 24px", () => {
  assert.match(booking, /href="\/dagtochten#aanvragen" className="inline-flex min-h-6 items-center/);
  assert.match(routeFinder, /href="tel:\+31634744522" className="inline-flex min-h-6 items-center/);
});

test("routekeuzes op de tarievenpagina halen 44px", () => {
  assert.match(routeFinder, /label className="mt-2 flex min-h-11 items-center/);
  assert.match(destinationExplorer, /className=\{`min-h-11 rounded-full/);
  assert.match(destinationExplorer, /inline-flex min-h-11 items-center justify-end text-right/);
});

test("browser-autofill houdt vertrek, bestemming en tussenstops uit elkaar", () => {
  assert.match(
    addressAutocomplete,
    /autoComplete=\{`section-\$\{autoCompleteSection\} street-address`\}/,
  );
  assert.match(booking, /autoCompleteSection="booking-pickup"/);
  assert.match(booking, /autoCompleteSection="booking-dropoff"/);
  assert.match(routeFinder, /autoCompleteSection="route-pickup"/);
  assert.match(routeFinder, /autoCompleteSection="route-dropoff"/);
  assert.match(routeFinder, /autoCompleteSection=\{`route-stop-\$\{i \+ 1\}`\}/);
});
