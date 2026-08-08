import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { isAuthorizedAdminRequest } from "@/lib/admin/basic-auth";
import { trySendInvoice } from "@/lib/invoices/send-invoice";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function db() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  return url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
}

export async function GET(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const [{ data: bookings, error }, { data: details, error: detailError }] = await Promise.all([
    supabase.from("bookings").select("id, booking_ref, customer_name, customer_email, from_address, to_address, ride_date, ride_time, price_euros, payment_status, paid_at").order("created_at", { ascending: false }).limit(100),
    supabase.from("booking_invoice_details").select("booking_id, billing_name, billing_address, billing_postal_code, billing_city, billing_country, executing_carrier_name, invoice_number, invoice_email_sent_at"),
  ]);
  if (error || detailError) return NextResponse.json({ error: "query_failed" }, { status: 500 });
  const byBooking = new Map((details ?? []).map((row) => [row.booking_id, row]));
  return NextResponse.json({ bookings: (bookings ?? []).map((row) => ({ ...row, invoice: byBooking.get(row.id) ?? null })) });
}

export async function POST(request: Request) {
  if (!(await isAuthorizedAdminRequest(request))) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const text = (key: string) => typeof body?.[key] === "string" ? String(body[key]).trim() : "";
  const bookingId = text("bookingId");
  const values = {
    billingName: text("billingName"), billingAddress: text("billingAddress"),
    billingPostalCode: text("billingPostalCode"), billingCity: text("billingCity"),
    billingCountry: text("billingCountry") || "Nederland", executingCarrierName: text("executingCarrierName"),
  };
  if (!/^[0-9a-f-]{36}$/i.test(bookingId) || Object.values(values).some((value) => value.length < 2)) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }
  const supabase = db();
  if (!supabase) return NextResponse.json({ error: "unavailable" }, { status: 503 });
  const { data, error } = await supabase.rpc("save_booking_invoice_details", {
    p_booking_id: bookingId,
    p_billing_name: values.billingName,
    p_billing_address: values.billingAddress,
    p_billing_postal_code: values.billingPostalCode,
    p_billing_city: values.billingCity,
    p_billing_country: values.billingCountry,
    p_executing_carrier_name: values.executingCarrierName,
  });
  if (error || data !== "saved") return NextResponse.json({ error: data ?? "save_failed" }, { status: data === "invoice_locked" ? 409 : 500 });
  const invoice = await trySendInvoice(supabase, { bookingId });
  return NextResponse.json({ ok: true, invoice });
}
