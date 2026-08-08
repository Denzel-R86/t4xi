import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoices/invoice-pdf";
import { renderBookingConfirmationPdf } from "@/lib/documents/booking-confirmation-pdf";
import type { BookingEmailData } from "@/lib/notifications/booking-email";

const output = resolve("tmp", "invoice-previews");
const booking: BookingEmailData = {
  bookingRef: "T4XI-PREVIEW-1001", rideType: "luchthaven", pickup: "Amsterdam Centraal",
  dropoff: "Schiphol Airport", date: "2026-08-10", time: "09:30", vehicle: null,
  persons: 2, luggage: "1-2-koffers", flightNumber: "KL1008", flightDirection: "departure",
  price: 109, currency: "EUR", quoteOnRequest: false, returnApplied: false,
  customerName: "Alex de Vries", customerPhone: "+31612345678", customerEmail: "alex@example.com", locale: "nl",
};
const invoice: InvoiceData = {
  invoiceNumber: "F-2026-000001", invoiceIssuedAt: "2026-08-08T12:00:00Z",
  bookingRef: booking.bookingRef, customerEmail: booking.customerEmail, billingName: "De Vries Consultancy BV",
  billingAddress: "Herengracht 100", billingPostalCode: "1015 BS", billingCity: "Amsterdam",
  billingCountry: "Nederland", executingCarrierName: "Amsterdam Executive Taxi BV",
  pickup: booking.pickup, dropoff: booking.dropoff, rideDate: booking.date, rideTime: booking.time,
  amountPaidCents: 10900, currency: "eur", paidAt: "2026-08-08T11:55:00Z",
};

async function main(): Promise<void> {
  await mkdir(output, { recursive: true });
  const bookingPath = resolve(output, "boekingsbevestiging-preview.pdf");
  const invoicePath = resolve(output, "factuur-preview.pdf");
  await Promise.all([
    writeFile(bookingPath, renderBookingConfirmationPdf(booking)),
    writeFile(invoicePath, renderInvoicePdf(invoice)),
  ]);
  console.log(bookingPath);
  console.log(invoicePath);
}

void main();
