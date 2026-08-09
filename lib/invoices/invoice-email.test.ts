import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderInvoiceEmail } from "@/lib/invoices/invoice-email";
import type { InvoiceData } from "@/lib/invoices/invoice-pdf";
import { trySendInvoice } from "@/lib/invoices/send-invoice";

const invoice: InvoiceData = {
  invoiceNumber: "F-2026-000001",
  invoiceIssuedAt: "2026-08-08T12:00:00Z",
  bookingRef: "T4XI-2026-1001",
  customerEmail: "klant@example.com",
  billingName: "Voorbeeld BV",
  billingAddress: "Klantstraat 10",
  billingPostalCode: "1234 AB",
  billingCity: "Amsterdam",
  billingCountry: "Nederland",
  executingCarrierName: "Taxi Partner BV",
  pickup: "Amsterdam Centraal",
  dropoff: "Schiphol Airport",
  rideDate: "2026-08-10",
  rideTime: "09:30",
  amountPaidCents: 10900,
  currency: "eur",
  paidAt: "2026-08-08T11:55:00Z",
  paymentMethod: "iDEAL",
};

test("factuurmail heeft premium T4XI-opmaak en fiscale herkenningspunten", () => {
  const mail = renderInvoiceEmail(invoice);
  assert.equal(mail.subject, "Uw betaalde factuur van T4XI — F-2026-000001");
  assert.match(mail.html, />Bedankt voor uw rit\.</);
  assert.match(mail.html, /src="https:\/\/www\.t4xi\.nl\/t4xi-monogram-navy\.png"/);
  assert.match(mail.html, /Totaal betaald/);
  assert.match(mail.html, /Voldaan via/);
  assert.match(mail.html, /€\s?109,00/);
  assert.match(mail.html, /F-2026-000001/);
  assert.doesNotMatch(mail.html, /Boekingsreferentie|T4XI-2026-1001/);
  assert.match(mail.html, />Betaald per</);
  assert.match(mail.html, />iDEAL</);
  assert.match(mail.html, /Taxi Partner BV/);
  assert.match(mail.html, /factuur-F-2026-000001\.pdf/);
  assert.match(mail.html, />Vertrek</);
  assert.match(mail.html, />Bestemming</);
  assert.match(mail.html, /doorsturen naar uw boekhouder/);
});

test("factuurmail bevat een volwaardige platte-tekstversie", () => {
  const mail = renderInvoiceEmail(invoice);
  assert.match(mail.text, /^Bedankt voor uw rit\./m);
  assert.match(mail.text, /Totaal betaald: €\s?109,00/);
  assert.match(mail.text, /Voldaan via: iDEAL/);
  assert.match(mail.text, /Betaald per: iDEAL/);
  assert.doesNotMatch(mail.text, /Boekingsreferentie|T4XI-2026-1001/);
  assert.match(mail.text, /Vertrek: Amsterdam Centraal/);
  assert.match(mail.text, /Bestemming: Schiphol Airport/);
  assert.match(mail.text, /Bijlage: factuur-F-2026-000001\.pdf/);
  assert.doesNotMatch(mail.text, /<[^>]+>/);
});

test("klantinvoer wordt ge-escaped in de factuurmail", () => {
  const injection = '<img src=x onerror="alert(1)"> & \'test\'';
  const mail = renderInvoiceEmail({
    ...invoice,
    billingName: injection,
    bookingRef: injection,
    pickup: injection,
    dropoff: injection,
    executingCarrierName: injection,
  });
  assert.doesNotMatch(mail.html, /<img src=x/);
  assert.match(mail.html, /&lt;img src=x onerror=&quot;alert\(1\)&quot;&gt; &amp; &#39;test&#39;/);
});

test("Resend ontvangt HTML, platte tekst en precies één factuur-PDF", async () => {
  const previousFetch = globalThis.fetch;
  const previousKey = process.env.RESEND_API_KEY;
  const requests: Array<{ headers: Headers; body: Record<string, unknown> }> = [];
  const completions: Array<Record<string, unknown>> = [];
  const claim = {
    ...invoice,
    status: "claimed",
    bookingId: "11111111-1111-4111-8111-111111111111",
    stripePaymentIntentId: "pi_test_invoice",
  };
  const supabase = {
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (name === "claim_booking_invoice") return { data: claim, error: null };
      completions.push(args);
      return { data: null, error: null };
    },
  };

  process.env.RESEND_API_KEY = "re_test_only";
  globalThis.fetch = async (_input, init) => {
    requests.push({ headers: new Headers(init?.headers), body: JSON.parse(String(init?.body)) });
    return new Response("{}", { status: 200 });
  };

  try {
    assert.deepEqual(await trySendInvoice(
      supabase as never,
      { bookingId: claim.bookingId },
      { resolvePaymentMethod: async () => "iDEAL" }
    ), {
      sent: true,
      status: "sent",
      invoiceNumber: invoice.invoiceNumber,
    });
  } finally {
    globalThis.fetch = previousFetch;
    if (previousKey === undefined) delete process.env.RESEND_API_KEY;
    else process.env.RESEND_API_KEY = previousKey;
  }

  assert.equal(requests.length, 1);
  const request = requests[0];
  assert.equal(request.headers.get("Idempotency-Key"), `invoice/${invoice.invoiceNumber}`);
  assert.equal(request.body.reply_to, "booking@t4xi.nl");
  assert.ok(!("replyTo" in request.body));
  assert.match(String(request.body.html), /Bedankt voor uw rit\./);
  assert.match(String(request.body.html), />iDEAL</);
  assert.match(String(request.body.text), /Voldaan via: iDEAL/);
  const attachments = request.body.attachments as Array<{ filename: string; content: string }>;
  assert.equal(attachments.length, 1);
  assert.equal(attachments[0].filename, `factuur-${invoice.invoiceNumber}.pdf`);
  assert.match(Buffer.from(attachments[0].content, "base64").toString("latin1"), /^%PDF-1\.4/);
  assert.deepEqual(completions, [{ p_booking_id: claim.bookingId, p_sent: true }]);
});

test("claim-RPC deelt alleen het PaymentIntent-ID met de servermailer", () => {
  const sql = readFileSync("supabase/migrations/20260808173000_invoice_payment_method_lookup.sql", "utf8");
  assert.match(sql, /'stripePaymentIntentId',\s*v_booking\.stripe_payment_intent_id/);
  assert.match(sql, /security definer/);
  assert.match(sql, /set search_path = ''/);
  assert.match(sql, /revoke all on function public\.claim_booking_invoice\(uuid, text\) from public, anon, authenticated/);
  assert.match(sql, /grant execute on function public\.claim_booking_invoice\(uuid, text\) to service_role/);
  assert.doesNotMatch(sql, /payment_method_details|card_number|last4/);
});
