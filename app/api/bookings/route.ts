import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { getPricingQuote } from "@/lib/pricing/service";

/**
 * POST /api/bookings
 *
 * Legt een boeking vast. Server-side only (service-role client → Node runtime,
 * nooit gecachet). De service-role key blijft op de server; hij wordt nooit in
 * de response of naar de client gelekt.
 *
 * Flow:
 *   1. input valideren (types + formaten)
 *   2. pickup/dropoff normaliseren en de AUTORITATIEVE prijs ophalen via
 *      getPricingQuote() (bron van waarheid: fixed_route_prices)
 *   3. onbekende route → geen prijs, maar de lead wél vastleggen als
 *      "Offerte op aanvraag" (quoteOnRequest = true)
 *   4. te veel passagiers/bagage voor de klasse → 422 (niet vastleggen)
 *   5. boeking schrijven via de SECURITY DEFINER RPC create_booking()
 *   6. booking reference teruggeven
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_PERSONS = 8;
const QUOTE_ON_REQUEST = "Offerte op aanvraag";
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

type Body = Record<string, unknown>;

function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, { status });
}
function bad(message: string) {
  return json(400, { ok: false, error: "invalid_input", message });
}

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Service-role client — uitsluitend server-side; key nooit naar de client. */
function serviceRoleClient(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(request: Request) {
  // 1. Body parsen
  let body: Body;
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return bad("Body moet een JSON-object zijn.");
    }
    body = parsed as Body;
  } catch {
    return bad("Body is geen geldige JSON.");
  }

  // 2. Velden valideren
  const pickup = str(body.pickup);
  const dropoff = str(body.dropoff);
  const date = str(body.date);
  const time = str(body.time);
  const name = str(body.customerName);
  const phone = str(body.customerPhone);
  const email = str(body.customerEmail).toLowerCase();
  const vehicle = str(body.vehicle);
  const luggage = str(body.luggage);
  const rideType = str(body.rideType) || "direct";

  if (pickup.length < 3) return bad("Ophaaladres is verplicht (min. 3 tekens).");
  if (dropoff.length < 3) return bad("Bestemming is verplicht (min. 3 tekens).");
  if (!DATE_RE.test(date)) return bad("Datum is verplicht (YYYY-MM-DD).");
  if (!TIME_RE.test(time)) return bad("Tijd is verplicht (HH:MM).");
  if (name.length < 2) return bad("Naam is verplicht.");
  if (email === "" || !EMAIL_RE.test(email)) return bad("Geldig e-mailadres is verplicht.");
  if (phone.replace(/[^0-9+]/g, "").length < 8) return bad("Geldig telefoonnummer is verplicht.");

  // Datum niet in het verleden (lokale dagvergelijking; RPC bewaakt dit ook).
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const rideDate = new Date(`${date}T00:00:00`);
  if (Number.isNaN(rideDate.getTime())) return bad("Ongeldige datum.");
  if (rideDate < today) return bad("Datum ligt in het verleden.");

  let persons = 1;
  if (body.persons !== undefined) {
    if (typeof body.persons !== "number" || !Number.isInteger(body.persons) || body.persons < 1) {
      return bad("'persons' moet een positief geheel getal zijn.");
    }
    if (body.persons > MAX_PERSONS) return bad(`Maximaal ${MAX_PERSONS} passagiers.`);
    persons = body.persons;
  }

  const coord = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // 3. Autoritatieve prijs ophalen (retour = ride_type 'retour')
  const returnTrip = rideType === "retour";
  const quote = await getPricingQuote({ pickup, dropoff, returnTrip, passengers: persons });

  let priceEuros: number | null = null;
  let quoteOnRequest = true;
  let currency: "EUR" = "EUR";
  let returnApplied = false;

  if (quote.available) {
    priceEuros = quote.price;
    currency = quote.currency;
    returnApplied = quote.returnApplied;
    quoteOnRequest = false;
  } else if (quote.reason === "capacity_exceeded") {
    return json(422, {
      ok: false,
      error: "capacity_exceeded",
      message: "Te veel passagiers of bagage voor deze voertuigklasse.",
    });
  }
  // unknown_location / route_not_fixed / data_unavailable → lead vastleggen als
  // "Offerte op aanvraag" (prijs null). We verliezen de klant niet.

  // 4. Schrijven via service-role RPC
  const supabase = serviceRoleClient();
  if (!supabase) {
    return json(503, {
      ok: false,
      error: "unavailable",
      message: "Boekingen zijn tijdelijk niet beschikbaar. Bel of WhatsApp ons.",
    });
  }

  const { data, error } = await supabase.rpc("create_booking", {
    p_ride_type: rideType,
    p_from_address: pickup,
    p_to_address: dropoff,
    p_ride_date: date,
    p_ride_time: time,
    p_vehicle: vehicle || null,
    p_persons: persons,
    p_luggage: luggage || null,
    p_price_euros: priceEuros,
    p_customer_name: name,
    p_customer_phone: phone,
    p_customer_email: email,
    p_from_lat: coord(body.fromLat),
    p_from_lon: coord(body.fromLon),
    p_to_lat: coord(body.toLat),
    p_to_lon: coord(body.toLon),
  });

  if (error) {
    // Validatie-excepties uit de RPC → 400; overige → 500 (geen interne details lekken).
    const known = /Ongeldig|Datum ligt/i.test(error.message);
    return json(known ? 400 : 500, {
      ok: false,
      error: known ? "invalid_input" : "server_error",
      message: known ? error.message : "Er ging iets mis bij het vastleggen van de boeking.",
    });
  }

  const row = Array.isArray(data) ? data[0] : data;
  const bookingRef = row?.booking_ref as string | undefined;
  if (!bookingRef) {
    return json(500, {
      ok: false,
      error: "server_error",
      message: "Boeking kon niet worden bevestigd.",
    });
  }

  return json(201, {
    ok: true,
    bookingRef,
    status: "pending",
    quoteOnRequest,
    price: priceEuros,
    currency,
    returnApplied,
    ...(quoteOnRequest ? { message: QUOTE_ON_REQUEST } : {}),
  });
}
