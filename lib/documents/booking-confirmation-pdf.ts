import { readFileSync } from "node:fs";
import path from "node:path";
import { createSinglePagePdf } from "@/lib/documents/simple-pdf";
import type { BookingEmailData } from "@/lib/notifications/booking-email";

export function renderBookingConfirmationPdf(data: BookingEmailData): Uint8Array {
  const locale = data.locale === "en" ? "en" : "nl";
  const quote = locale === "en" ? "Quote on request" : "Offerte op aanvraag";
  const price = data.price === null || data.quoteOnRequest
    ? quote
    : `${data.currency || "EUR"} ${data.price.toFixed(2)}`;
  const labels = locale === "en"
    ? { title: "Booking request", ref: "Reference", route: "Route", date: "Date and time", return: "Return date and time", people: "Passengers", luggage: "Luggage", price: "Price", note: "This document confirms receipt of your request. It is not an invoice." }
    : { title: "Boekingsaanvraag", ref: "Referentie", route: "Route", date: "Datum en tijd", return: "Retourdatum en -tijd", people: "Passagiers", luggage: "Bagage", price: "Prijs", note: "Dit document bevestigt de ontvangst van uw aanvraag. Het is geen factuur." };

  return createSinglePagePdf({
    title: `${labels.title} ${data.bookingRef}`,
    jpeg: {
      data: readFileSync(path.join(process.cwd(), "public", "t4xi-monogram-navy-on-fog.jpg")),
      pixelWidth: 240, pixelHeight: 236, x: 48, y: 773, width: 48, height: 47.2,
    },
    rects: [
      { x: 0, y: 754, width: 595, height: 88, color: "#F5F3F1" },
      { x: 0, y: 0, width: 595, height: 76, color: "#1F2730" },
      { x: 48, y: 430, width: 499, height: 80, color: "#EEEAE5" },
    ],
    lines: [
      { text: labels.title.toUpperCase(), x: 48, y: 702, size: 10, bold: true, color: "#999694" },
      { text: data.customerName, x: 48, y: 666, size: 24, bold: true },
      { text: `${labels.ref}: ${data.bookingRef}`, x: 48, y: 632, size: 11 },
      { text: labels.route.toUpperCase(), x: 66, y: 480, size: 9, bold: true, color: "#5F666D" },
      { text: data.pickup, x: 66, y: 458, size: 13, bold: true },
      { text: `naar ${data.dropoff}`, x: 66, y: 438, size: 12 },
      { text: labels.date, x: 48, y: 386, size: 10, color: "#5F666D" },
      { text: `${data.date} om ${data.time}`, x: 210, y: 386, size: 11, bold: true },
      ...(data.returnDate && data.returnTime
        ? [
            { text: labels.return, x: 48, y: 354, size: 10, color: "#5F666D" },
            { text: `${data.returnDate} om ${data.returnTime}`, x: 210, y: 354, size: 11, bold: true },
          ]
        : []),
      { text: labels.people, x: 48, y: 322, size: 10, color: "#5F666D" },
      { text: String(data.persons), x: 210, y: 322, size: 11, bold: true },
      { text: labels.luggage, x: 48, y: 290, size: 10, color: "#5F666D" },
      { text: data.luggage ?? "-", x: 210, y: 290, size: 11, bold: true },
      { text: labels.price, x: 48, y: 238, size: 10, color: "#5F666D" },
      { text: price, x: 210, y: 234, size: 18, bold: true },
      { text: labels.note, x: 48, y: 166, size: 10, color: "#5F666D" },
      { text: "booking@t4xi.nl  |  +31 6 34 74 45 22", x: 48, y: 38, size: 9, color: "#F5F3F1" },
    ],
  });
}
