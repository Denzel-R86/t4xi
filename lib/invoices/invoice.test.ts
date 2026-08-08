import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { invoiceAmounts, renderInvoicePdf, type InvoiceData } from "@/lib/invoices/invoice-pdf";

const invoice: InvoiceData = {
  invoiceNumber: "F-2026-000001", invoiceIssuedAt: "2026-08-08T12:00:00Z",
  bookingRef: "T4XI-2026-1001", customerEmail: "klant@example.com",
  billingName: "Voorbeeld BV", billingAddress: "Klantstraat 10", billingPostalCode: "1234 AB",
  billingCity: "Amsterdam", billingCountry: "Nederland", executingCarrierName: "Taxi Partner BV",
  pickup: "Amsterdam Centraal", dropoff: "Schiphol Airport", rideDate: "2026-08-10",
  rideTime: "09:30", amountPaidCents: 10900, currency: "eur", paidAt: "2026-08-08T11:55:00Z",
};

test("btw-inclusief bedrag wordt exact verdeeld in netto + 9% btw", () => {
  assert.deepEqual(invoiceAmounts(10900), { netCents: 10000, vatCents: 900 });
  for (const cents of [1, 5700, 8950, 24950]) {
    const amounts = invoiceAmounts(cents);
    assert.equal(amounts.netCents + amounts.vatCents, cents);
  }
});

test("factuur-PDF is geldig en bevat fiscale kerngegevens en uitvoerder", () => {
  const pdf = renderInvoicePdf(invoice);
  const text = Buffer.from(pdf).toString("latin1");
  assert.match(text, /^%PDF-1\.4/);
  assert.match(text, /\/Subtype \/Image/);
  for (const expected of ["F-2026-000001", "Noir Driving Services", "Sterduinstraat 25", "NL003472098B32", "Taxi Partner BV", "EUR 100.00", "EUR 9.00", "EUR 109.00"]) {
    assert.ok(text.includes(expected), expected);
  }
  assert.match(text, /%%EOF\n$/);
});

test("migratie vergrendelt factuurnummers, PII en RPC's voor browserrollen", () => {
  const sql = readFileSync("supabase/migrations/20260808143000_booking_invoices.sql", "utf8");
  assert.match(sql, /invoice_number text unique/);
  assert.match(sql, /nextval\('public\.invoice_number_seq'\)/);
  assert.match(sql, /payment_status <> 'paid'/);
  assert.match(sql, /invoice_email_sent_at is not null/);
  assert.match(sql, /revoke all on table public\.booking_invoice_details from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.claim_booking_invoice\(uuid, text\) to service_role/);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all).*to\s+(anon|authenticated)/i);
});

test("uitvoerende bedrijven krijgen een vaste ID en alleen actieve keuzes zijn geldig", () => {
  const sql = readFileSync("supabase/migrations/20260808170000_executing_carriers.sql", "utf8");
  assert.match(sql, /create table if not exists public\.executing_carriers/);
  assert.match(sql, /id uuid primary key default gen_random_uuid\(\)/);
  assert.match(sql, /executing_carrier_id uuid[\s\S]*references public\.executing_carriers\(id\)/);
  assert.match(sql, /where c\.id = p_executing_carrier_id and c\.active = true/);
  assert.match(sql, /executing_carrier_name = excluded\.executing_carrier_name/);
  assert.match(sql, /revoke all on table public\.executing_carriers from public, anon, authenticated/);
  assert.doesNotMatch(sql, /grant\s+(select|insert|update|delete|all).*to\s+(anon|authenticated)/i);
});
