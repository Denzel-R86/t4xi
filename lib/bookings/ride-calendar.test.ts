import assert from "node:assert/strict";
import { test } from "node:test";
import { buildRideIcs, escapeIcsText, foldIcsLine, rideIcsFilename } from "@/lib/bookings/ride-calendar";

const NOW = new Date("2026-10-01T08:00:00.000Z");

function unfold(ics: string): string[] {
  return ics.replace(/\r\n /g, "").split("\r\n");
}

const base = {
  reference: "T4X-2026-0042",
  description: "Referentie: T4X-2026-0042. Betaling ontvangen. Uw aanvraag is in behandeling.",
  tentative: true,
  now: NOW,
};

test("één rit: geldige VCALENDAR met Amsterdamse ophaaltijd, locatie en CRLF", () => {
  const ics = buildRideIcs({
    ...base,
    legs: [{ date: "2026-11-12", time: "14:30", location: "Amsterdam Zuidas", summary: "T4XI-rit: Amsterdam Zuidas → Schiphol" }],
  });
  assert.ok(ics);
  assert.ok(ics.startsWith("BEGIN:VCALENDAR\r\nVERSION:2.0\r\n"));
  assert.ok(ics.endsWith("END:VCALENDAR\r\n"));
  assert.doesNotMatch(ics.replace(/\r\n/g, ""), /\n|\r/, "alleen CRLF-regeleinden");
  const lines = unfold(ics);
  assert.ok(lines.includes("DTSTART;TZID=Europe/Amsterdam:20261112T143000"));
  assert.ok(lines.includes("DTSTAMP:20261001T080000Z"));
  assert.ok(lines.includes("UID:T4X-2026-0042-1@t4xi.nl"));
  assert.ok(lines.includes("LOCATION:Amsterdam Zuidas"));
  assert.ok(lines.includes("SUMMARY:T4XI-rit: Amsterdam Zuidas → Schiphol"));
  assert.ok(lines.includes("TZID:Europe/Amsterdam"));
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  // geen verzonnen eindtijd
  assert.ok(!lines.some((l) => l.startsWith("DTEND")));
});

test("aanvraag = TENTATIVE; alleen een bevestigde rit wordt CONFIRMED", () => {
  const legs = [{ date: "2026-11-12", time: "14:30", location: "A", summary: "S" }];
  assert.match(buildRideIcs({ ...base, legs }) ?? "", /\r\nSTATUS:TENTATIVE\r\n/);
  assert.match(buildRideIcs({ ...base, tentative: false, legs }) ?? "", /\r\nSTATUS:CONFIRMED\r\n/);
});

test("retour: twee events; de terugrit start op de ingevoerde bestemming", () => {
  const ics = buildRideIcs({
    ...base,
    legs: [
      { date: "2026-11-12", time: "14:30", location: "Amsterdam Zuidas", summary: "heen" },
      { date: "2026-11-19", time: "18:00", location: "Schiphol", summary: "terug" },
    ],
  });
  const lines = unfold(ics ?? "");
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 2);
  assert.ok(lines.includes("UID:T4X-2026-0042-2@t4xi.nl"));
  assert.ok(lines.includes("DTSTART;TZID=Europe/Amsterdam:20261119T180000"));
  assert.ok(lines.includes("LOCATION:Schiphol"));
});

test("escaping: komma, puntkomma, backslash en regeleinden uit vrije invoer", () => {
  assert.equal(escapeIcsText("Dorpsstraat 1, 1234 AB; Almere\\Poort\nachterom"), "Dorpsstraat 1\\, 1234 AB\\; Almere\\\\Poort\\nachterom");
  const ics = buildRideIcs({
    ...base,
    legs: [{ date: "2026-11-12", time: "14:30", location: "Kade 2, Almere\r\nEND:VEVENT\r\nBEGIN:VEVENT", summary: "x" }],
  });
  const lines = unfold(ics ?? "");
  // Injectie via het adres kan geen extra event of property maken.
  assert.equal(lines.filter((l) => l === "BEGIN:VEVENT").length, 1);
  assert.ok(lines.includes("LOCATION:Kade 2\\, Almere\\nEND:VEVENT\\nBEGIN:VEVENT"));
});

test("lange regels worden gevouwen op ≤ 75 octets zonder UTF-8-tekens te breken", () => {
  const long = `DESCRIPTION:${"é".repeat(60)}${"→".repeat(30)}`;
  const folded = foldIcsLine(long);
  for (const part of folded.split("\r\n")) {
    assert.ok(new TextEncoder().encode(part).length <= 75, part);
  }
  assert.equal(folded.replace(/\r\n /g, ""), long);
});

test("ongeldige datum/tijd → geen event; zonder enig geldig event → null", () => {
  assert.equal(buildRideIcs({ ...base, legs: [{ date: "12-11-2026", time: "14:30", location: "A", summary: "S" }] }), null);
  assert.equal(buildRideIcs({ ...base, legs: [{ date: "2026-11-12", time: "25:00", location: "A", summary: "S" }] }), null);
  assert.equal(buildRideIcs({ ...base, legs: [] }), null);
});

test("referentie kan UID en bestandsnaam niet breken", () => {
  const ics = buildRideIcs({ ...base, reference: "T4X/../x;y\r\nZ", legs: [{ date: "2026-11-12", time: "14:30", location: "A", summary: "S" }] });
  assert.ok(unfold(ics ?? "").includes("UID:T4XxyZ-1@t4xi.nl"));
  assert.equal(rideIcsFilename("T4X/../0042"), "t4xi-T4X0042.ics");
  assert.equal(rideIcsFilename(""), "t4xi-rit.ics");
});

test("geen persoonsgegevens buiten wat de aanroeper als locatie/tekst meegeeft", () => {
  const ics = buildRideIcs({ ...base, legs: [{ date: "2026-11-12", time: "14:30", location: "A", summary: "S" }] }) ?? "";
  assert.doesNotMatch(ics, /@(?!t4xi\.nl)/, "geen e-mailadres");
  assert.doesNotMatch(ics, /ORGANIZER|ATTENDEE|\+31/);
});
