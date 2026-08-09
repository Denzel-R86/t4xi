import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const bookingSource = readFileSync("components/booking/BookingSection.tsx", "utf8");
const footerSource = readFileSync("components/sections/Footer.tsx", "utf8");
const iconSource = readFileSync("components/ui/Icon.tsx", "utf8");
const layoutSource = readFileSync("app/[locale]/layout.tsx", "utf8");
const homeSource = readFileSync("app/[locale]/page.tsx", "utf8");
const nl = JSON.parse(readFileSync("messages/nl.json", "utf8"));
const en = JSON.parse(readFileSync("messages/en.json", "utf8"));

test("contact: Instagram staat zichtbaar in de footer en in structured data", () => {
  const instagramUrl = "https://www.instagram.com/t4xi.nl/";

  assert.match(footerSource, new RegExp(instagramUrl.replaceAll(".", "\\.")));
  assert.match(footerSource, /icon: "instagram"/);
  assert.match(footerSource, /rel: "noopener noreferrer"/);
  assert.match(iconSource, /instagram:\s*\[/);
  assert.match(layoutSource, new RegExp(instagramUrl.replaceAll(".", "\\.")));
  assert.equal(nl.footer.instagram, "T4XI op Instagram");
  assert.equal(en.footer.instagram, "T4XI on Instagram");
});

test("contact: de boekingsfallback opent WhatsApp met gelokaliseerde tekst", () => {
  assert.match(bookingSource, /https:\/\/wa\.me\/31634744522\?text=/);
  assert.match(bookingSource, /encodeURIComponent\(t\("whatsappBericht"\)\)/);
  assert.match(bookingSource, /target="_blank"/);
  assert.match(bookingSource, /rel="noopener noreferrer"/);
  assert.match(bookingSource, /aria-label=\{t\("whatsappAria"\)\}/);
  assert.match(bookingSource, /min-h-\[44px\]/);
  assert.doesNotMatch(bookingSource, /href="tel:\+31634744522"/);
  assert.equal(nl.booking.ofWhatsapp, "Of stuur een WhatsApp naar");
  assert.equal(en.booking.ofWhatsapp, "Or send a WhatsApp to");
  assert.equal(nl.booking.whatsappBericht, "Hallo T4XI, ik wil graag een rit boeken.");
  assert.equal(en.booking.whatsappBericht, "Hello T4XI, I would like to book a ride.");
  assert.match(nl.booking.whatsappAria, /WhatsApp.*nieuw tabblad/);
  assert.match(en.booking.whatsappAria, /WhatsApp.*new tab/);
});

test("contact: het volledige werkgebied staat consequent in beide talen", () => {
  assert.equal(nl.footer.steden, "Amsterdam · Rotterdam · Almere · Den Haag");
  assert.equal(en.footer.steden, "Amsterdam · Rotterdam · Almere · The Hague");
  assert.equal(nl.home.specRegiosWaarde, "Amsterdam · Rotterdam · Almere · Den Haag");
  assert.equal(en.home.specRegiosWaarde, "Amsterdam · Rotterdam · Almere · The Hague");
  assert.match(homeSource, /t\("specRegiosWaarde"\)/);
  assert.doesNotMatch(homeSource, /AMS · RTM/);

  for (const city of ["Amsterdam", "Rotterdam", "Almere", "Den Haag"]) {
    assert.match(nl.footer.omschrijving, new RegExp(city));
    assert.match(nl.faq.a2, new RegExp(city));
    assert.match(nl.seo.contactDesc, new RegExp(city));
  }
  for (const city of ["Amsterdam", "Rotterdam", "Almere", "The Hague"]) {
    assert.match(en.footer.omschrijving, new RegExp(city));
    assert.match(en.faq.a2, new RegExp(city));
    assert.match(en.seo.contactDesc, new RegExp(city));
  }
});
