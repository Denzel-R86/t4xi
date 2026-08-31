import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { dispatch } from "@/lib/communication/orchestrator";
import {
  renderBookingEmails,
  type BookingEmailData,
} from "@/lib/notifications/booking-email";

const cases: Array<{ filename: string; data: BookingEmailData }> = [
  {
    filename: "booking-email-nl-retour.html",
    data: {
      bookingRef: "T4XI-PREVIEW-NL",
      rideType: "retour",
      pickup: "Amsterdam Centraal",
      dropoff: "Rotterdam Centraal",
      date: "2026-09-18",
      time: "09:30",
      vehicle: "Tesla Model Y",
      persons: 3,
      luggage: "2 koffers",
      flightNumber: null,
      flightDirection: null,
      price: 249.5,
      currency: "EUR",
      quoteOnRequest: false,
      returnApplied: true,
      customerName: "Sanne de Vries",
      customerPhone: "+31 6 12 34 56 78",
      customerEmail: "preview@example.com",
      locale: "nl",
    },
  },
  {
    filename: "booking-email-en-airport-arrival.html",
    data: {
      bookingRef: "T4XI-PREVIEW-EN",
      rideType: "luchthaven",
      pickup: "Schiphol Airport",
      dropoff: "Keizersgracht 100, Amsterdam",
      date: "2026-10-04",
      time: "14:15",
      vehicle: "Mercedes EQV",
      persons: 5,
      luggage: "4 suitcases",
      flightNumber: "KL1008",
      flightDirection: "arrival",
      price: 89,
      currency: "EUR",
      quoteOnRequest: false,
      returnApplied: false,
      customerName: "Alex Johnson",
      customerPhone: "+44 20 7946 0958",
      customerEmail: "preview@example.com",
      locale: "en",
    },
  },
  {
    filename: "booking-email-quote-on-request.html",
    data: {
      bookingRef: "T4XI-PREVIEW-QUOTE",
      rideType: "dagtocht",
      pickup: "Utrecht",
      dropoff: "Giethoorn",
      date: "2026-11-12",
      time: "08:00",
      vehicle: null,
      persons: 6,
      luggage: null,
      flightNumber: null,
      flightDirection: null,
      price: null,
      currency: "EUR",
      quoteOnRequest: true,
      returnApplied: false,
      customerName: "Noor Bakker",
      customerPhone: "+31 6 98 76 54 32",
      customerEmail: "preview@example.com",
      locale: "nl",
    },
  },
];

const productionMonogramUrl = "https://www.t4xi.nl/t4xi-monogram-navy.png";
const localMonogramUrl = "../../public/t4xi-monogram-navy.png";

function parseSendAddress(argv: string[]): string | null {
  if (!argv.includes("--send")) return null;
  const to = argv.find((arg) => arg.startsWith("--to="))?.slice("--to=".length).trim();
  if (!to || !/^\S+@\S+\.\S+$/.test(to)) {
    throw new Error("Gebruik --send --to=<testadres> met een geldig e-mailadres.");
  }
  if (!process.env.RESEND_API_KEY) {
    throw new Error("--send vereist RESEND_API_KEY in de environment.");
  }
  return to;
}

async function main(): Promise<void> {
  const outputDir = resolve("tmp", "booking-email-previews");
  await mkdir(outputDir, { recursive: true });

  for (const preview of cases) {
    const rendered = renderBookingEmails(preview.data);
    const path = resolve(outputDir, preview.filename);
    // De browserpreview gebruikt het lokale bestand; productie-HTML gebruikt de
    // publieke HTTPS-URL zodat mailclients nooit een lokaal pad ontvangen.
    const previewHtml = rendered.customerHtml.replaceAll(productionMonogramUrl, localMonogramUrl);
    await writeFile(path, previewHtml, "utf8");
    console.log(path);

    // De interne mail draagt de taakoverdracht; die moet net zo goed
    // controleerbaar zijn als de klantmail. Ook de platte-tekstdelen worden
    // weggeschreven, want die gaan echt mee in elke verzending.
    const opsPath = resolve(outputDir, preview.filename.replace(/\.html$/, "-ops.html"));
    await writeFile(opsPath, rendered.opsHtml.replaceAll(productionMonogramUrl, localMonogramUrl), "utf8");
    console.log(opsPath);

    const textPath = resolve(outputDir, preview.filename.replace(/\.html$/, ".txt"));
    await writeFile(textPath, `${rendered.customerText}\n\n---\n\n${rendered.opsText}`, "utf8");
    console.log(textPath);
  }

  const to = parseSendAddress(process.argv.slice(2));
  if (!to) return;

  // Veiligheidsrail voor handmatige verificatie: beide bestaande dispatches gaan
  // uitsluitend naar het expliciete testadres binnen dit proces.
  process.env.OPS_EMAIL = to;
  const booking = { ...cases[1].data, customerEmail: to };
  // Bewust via de orchestrator: dit is de enige verzendweg die in productie
  // gebruikt wordt, dus de handmatige test moet er precies zo doorheen lopen.
  const result = await dispatch({
    type: "booking.created",
    subjectType: "booking",
    subjectId: booking.bookingRef,
    bookingId: null,
    locale: booking.locale,
    booking,
  });
  if (!result.delivered) {
    const failed = result.outcomes.filter((outcome) => outcome.status !== "sent");
    throw new Error(`Testmail niet verzonden: ${JSON.stringify(failed)}`);
  }
  console.log(`Klant- en ops-testmail zijn beide verzonden naar ${to}.`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
