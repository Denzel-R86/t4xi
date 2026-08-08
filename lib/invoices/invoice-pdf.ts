import { readFileSync } from "node:fs";
import path from "node:path";
import { createSinglePagePdf } from "@/lib/documents/simple-pdf";
import { BEDRIJF } from "@/lib/legal";

export type InvoiceData = {
  invoiceNumber: string;
  invoiceIssuedAt: string;
  bookingRef: string;
  customerEmail: string;
  billingName: string;
  billingAddress: string;
  billingPostalCode: string;
  billingCity: string;
  billingCountry: string;
  executingCarrierName: string;
  pickup: string;
  dropoff: string;
  rideDate: string;
  rideTime: string;
  amountPaidCents: number;
  currency: string;
  paidAt: string;
};

export function invoiceAmounts(grossCents: number): { netCents: number; vatCents: number } {
  const vatCents = Math.round((grossCents * 9) / 109);
  return { vatCents, netCents: grossCents - vatCents };
}

function eur(cents: number): string {
  return `EUR ${(cents / 100).toFixed(2)}`;
}

export function renderInvoicePdf(data: InvoiceData): Uint8Array {
  const { netCents, vatCents } = invoiceAmounts(data.amountPaidCents);
  const issued = data.invoiceIssuedAt.slice(0, 10);
  const paid = data.paidAt.slice(0, 10);
  return createSinglePagePdf({
    title: `Factuur ${data.invoiceNumber}`,
    jpeg: {
      data: readFileSync(path.join(process.cwd(), "public", "t4xi-monogram-navy-on-fog.jpg")),
      pixelWidth: 240, pixelHeight: 236, x: 48, y: 773, width: 48, height: 47.2,
    },
    rects: [
      { x: 0, y: 754, width: 595, height: 88, color: "#F5F3F1" },
      { x: 0, y: 0, width: 595, height: 76, color: "#1F2730" },
      { x: 48, y: 360, width: 499, height: 42, color: "#28313B" },
      { x: 48, y: 242, width: 499, height: 92, color: "#EEEAE5" },
    ],
    lines: [
      { text: "FACTUUR", x: 414, y: 790, size: 18, bold: true },
      { text: BEDRIJF.rechtspersoon, x: 48, y: 706, size: 11, bold: true },
      { text: BEDRIJF.straat, x: 48, y: 690, size: 9 },
      { text: `${BEDRIJF.postcode} ${BEDRIJF.vestigingsplaats}`, x: 48, y: 676, size: 9 },
      { text: BEDRIJF.land, x: 48, y: 662, size: 9 },
      { text: `KvK ${BEDRIJF.kvk}  |  BTW ${BEDRIJF.btw ?? "-"}`, x: 48, y: 638, size: 9 },
      { text: "FACTUUR AAN", x: 334, y: 706, size: 9, bold: true, color: "#999694" },
      { text: data.billingName, x: 334, y: 686, size: 11, bold: true },
      { text: data.billingAddress, x: 334, y: 670, size: 9 },
      { text: `${data.billingPostalCode} ${data.billingCity}`, x: 334, y: 656, size: 9 },
      { text: data.billingCountry, x: 334, y: 642, size: 9 },
      { text: "Factuurnummer", x: 48, y: 590, size: 9, color: "#5F666D" },
      { text: data.invoiceNumber, x: 172, y: 590, size: 10, bold: true },
      { text: "Factuurdatum", x: 48, y: 570, size: 9, color: "#5F666D" },
      { text: issued, x: 172, y: 570, size: 10 },
      { text: "Betaaldatum", x: 48, y: 550, size: 9, color: "#5F666D" },
      { text: paid, x: 172, y: 550, size: 10 },
      { text: "Boekingsreferentie", x: 320, y: 590, size: 9, color: "#5F666D" },
      { text: data.bookingRef, x: 430, y: 590, size: 8, bold: true },
      { text: "Uitvoerend taxibedrijf", x: 320, y: 558, size: 9, color: "#5F666D" },
      { text: data.executingCarrierName, x: 320, y: 538, size: 9, bold: true },
      { text: "OMSCHRIJVING", x: 62, y: 376, size: 9, bold: true, color: "#F5F3F1" },
      { text: "BEDRAG EXCL. BTW", x: 398, y: 376, size: 9, bold: true, color: "#F5F3F1" },
      { text: `Taxivervoer op ${data.rideDate} om ${data.rideTime}`, x: 62, y: 316, size: 10, bold: true },
      { text: `${data.pickup} naar ${data.dropoff}`, x: 62, y: 296, size: 9, color: "#5F666D" },
      { text: eur(netCents), x: 438, y: 306, size: 10, bold: true },
      { text: "Subtotaal", x: 334, y: 218, size: 9 },
      { text: eur(netCents), x: 456, y: 218, size: 10 },
      { text: "BTW personenvervoer 9%", x: 334, y: 196, size: 9 },
      { text: eur(vatCents), x: 456, y: 196, size: 10 },
      { text: "TOTAAL BETAALD", x: 334, y: 164, size: 10, bold: true },
      { text: eur(data.amountPaidCents), x: 446, y: 164, size: 14, bold: true },
      { text: "Deze factuur is voldaan.", x: 48, y: 164, size: 10, bold: true, color: "#28313B" },
      { text: "booking@t4xi.nl  |  +31 6 34 74 45 22  |  t4xi.nl", x: 48, y: 38, size: 9, color: "#F5F3F1" },
    ],
  });
}
