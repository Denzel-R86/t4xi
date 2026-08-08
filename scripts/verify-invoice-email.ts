import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { INVOICE_MONOGRAM_URL, renderInvoiceEmail } from "@/lib/invoices/invoice-email";
import { renderInvoicePdf, type InvoiceData } from "@/lib/invoices/invoice-pdf";

const preview: InvoiceData = {
  invoiceNumber: "F-2026-000001",
  invoiceIssuedAt: "2026-08-08T12:00:00Z",
  bookingRef: "T4XI-2026-1001",
  customerEmail: "preview@example.com",
  billingName: "Sanne de Vries",
  billingAddress: "Keizersgracht 100",
  billingPostalCode: "1015 CV",
  billingCity: "Amsterdam",
  billingCountry: "Nederland",
  executingCarrierName: "Noir Driving Services",
  pickup: "Amsterdam Centraal",
  dropoff: "Schiphol Airport",
  rideDate: "2026-08-10",
  rideTime: "09:30",
  amountPaidCents: 10900,
  currency: "eur",
  paidAt: "2026-08-08T11:55:00Z",
  paymentMethod: "iDEAL",
};

async function main(): Promise<void> {
  const outputDir = resolve("tmp", "invoice-email-previews");
  await mkdir(outputDir, { recursive: true });

  const mail = renderInvoiceEmail(preview);
  const htmlPath = resolve(outputDir, "invoice-email-paid.html");
  const textPath = resolve(outputDir, "invoice-email-paid.txt");
  const pdfPath = resolve(outputDir, `factuur-${preview.invoiceNumber}.pdf`);
  const localMonogramUrl = "../../public/t4xi-monogram-navy.png";

  await Promise.all([
    writeFile(htmlPath, mail.html.replaceAll(INVOICE_MONOGRAM_URL, localMonogramUrl), "utf8"),
    writeFile(textPath, `${mail.subject}\n\n${mail.text}\n`, "utf8"),
    writeFile(pdfPath, renderInvoicePdf(preview)),
  ]);

  console.log(htmlPath);
  console.log(textPath);
  console.log(pdfPath);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
