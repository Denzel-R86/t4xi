import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingPrice } from "@/lib/pricing/engine";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { quoteFingerprint, type AirportContext } from "@/lib/pricing/service";
import { classifyLuggage } from "@/lib/pricing/luggage";
import { readPriceSnapshot } from "@/lib/pricing/snapshot-store";
import { sendBookingEmails, normalizeLocale } from "@/lib/notifications/booking-email";
import { rateLimit, clientIp } from "@/lib/security/rate-limit";
import { buildRegistration, registerFlightMonitoring } from "@/lib/flight-monitoring/service";

/**
 * POST /api/bookings
 *
 * Legt een boeking vast. Server-side only (service-role client → Node runtime,
 * nooit gecachet). De service-role key blijft op de server; hij wordt nooit in
 * de response of naar de client gelekt.
 *
 * Anti-spam/misbruik (Stap 9f), vóór alles: payload-size guard → rate limiting
 * (max 5 pogingen / 10 min per IP+user-agent, 429) → honeypot (stil accepteren
 * zonder DB-write). Verdachte pogingen worden server-side gelogd.
 *
 * Flow:
 *   1. input valideren (types + formaten)
 *   2. pickup/dropoff normaliseren en de AUTORITATIEVE prijs ophalen via de
 *      centrale calculateBookingPrice() (pass-through om getPricingQuote;
 *      bron van waarheid: fixed_route_prices)
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

// ── Anti-spam/misbruik (Stap 9f) ─────────────────────────────────────────────
const RATE_MAX = 5; // pogingen
const RATE_WINDOW_MS = 10 * 60_000; // per 10 minuten
const MAX_BODY_BYTES = 4096; // ruime bovengrens voor een boeking-JSON
/** Verborgen veld dat bots invullen; echte formulieren sturen het niet mee. */
const HONEYPOT_FIELD = "website";

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
  const ip = clientIp(request);
  const ua = request.headers.get("user-agent") ?? "unknown";

  // 0a. Payload-size guard — lees de ruwe body één keer, begrens de grootte.
  const rawBody = await request.text();
  if (rawBody.length > MAX_BODY_BYTES) {
    console.warn(`[bookings] payload te groot (${rawBody.length} tekens) ip=${ip}`);
    return json(413, { ok: false, error: "payload_too_large", message: "Aanvraag te groot." });
  }

  // 0b. Rate limiting per IP + user-agent (elke poging telt, ook ongeldige).
  const rl = rateLimit(`bookings:${ip}|${ua}`, RATE_MAX, RATE_WINDOW_MS);
  if (rl.limited) {
    console.warn(`[bookings] rate-limit overschreden ip=${ip} ua="${ua.slice(0, 80)}"`);
    return NextResponse.json(
      {
        ok: false,
        error: "rate_limited",
        message: "Te veel boekingspogingen. Probeer het over een paar minuten opnieuw, of bel ons.",
      },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  // 1. Body parsen (uit de al gelezen tekst).
  let body: Body;
  try {
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return bad("Body moet een JSON-object zijn.");
    }
    body = parsed as Body;
  } catch {
    return bad("Body is geen geldige JSON.");
  }

  // 1b. Honeypot — als het verborgen veld gevuld is, is dit vrijwel zeker een bot.
  //     Stil accepteren: neutrale success, GEEN DB-write (bot leert niets).
  const honeypot = body[HONEYPOT_FIELD];
  if (typeof honeypot === "string" && honeypot.trim() !== "") {
    console.warn(`[bookings] honeypot geraakt ip=${ip} ua="${ua.slice(0, 80)}"`);
    return json(200, {
      ok: true,
      status: "pending",
      quoteOnRequest: true,
      message: "Boeking ontvangen.",
    });
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
  // Vluchtnummer: normaliseren naar hoofdletters zonder scheidingstekens, zodat
  // "kl 1234" en "KL-1234" dezelfde waarde opleveren. De RPC normaliseert nog een
  // keer — de database is de laatste verdedigingslinie, niet de eerste.
  const flightNumber = str(body.flightNumber).toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (pickup.length < 3) return bad("Ophaaladres is verplicht (min. 3 tekens).");
  if (dropoff.length < 3) return bad("Bestemming is verplicht (min. 3 tekens).");
  if (!DATE_RE.test(date)) return bad("Datum is verplicht (YYYY-MM-DD).");
  if (!TIME_RE.test(time)) return bad("Tijd is verplicht (HH:MM).");
  if (name.length < 2) return bad("Naam is verplicht.");
  if (email === "" || !EMAIL_RE.test(email)) return bad("Geldig e-mailadres is verplicht.");
  if (phone.replace(/[^0-9+]/g, "").length < 8) return bad("Geldig telefoonnummer is verplicht.");

  // Bagage fail-closed: alleen exact bekende categorieën. 'overleg' (onbekende
  // bagage) mag geen bindende auto-boeking opleveren → handmatige beoordeling /
  // offerte op aanvraag. Lege/onbekende/willekeurige tekst → harde validatiefout.
  const luggageClass = classifyLuggage(luggage);
  if (luggageClass.kind === "invalid") {
    return bad("Kies een geldige bagage-optie.");
  }
  const luggageOnRequest = luggageClass.kind === "on_request";

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

  // 3. Bindende prijs bepalen via de quote-lock-resolver (retour = ride_type
  //    'retour'). De client stuurt NOOIT een prijs. resolveBookingPrice:
  //      a) quoteId aanwezig → gebruikt exact het gelockte snapshotbedrag (geen
  //         Google, geen herberekening; prijs/bron/btw/luchthaven uit de snapshot);
  //      b) geen quoteId → alleen een deterministische vaste route of offerte-op-
  //         aanvraag (routing UIT, dus nooit een bindende dynamische prijs zonder
  //         geaccepteerde snapshot).
  const returnTrip = rideType === "retour";
  const now = new Date();
  const outcome = await resolveBookingPrice(
    {
      pickup,
      dropoff,
      returnTrip,
      passengers: persons,
      departureAt: amsterdamDepartureIso(date, time) ?? undefined,
      quoteId: str(body.quoteId) || null,
    },
    { now, readSnapshot: readPriceSnapshot }
  );
  if (outcome.kind === "error") {
    return json(outcome.status, { ok: false, error: outcome.error, message: outcome.message });
  }

  let priceEuros: number | null = null;
  let quoteOnRequest = true;
  let returnApplied = false;
  let lockedQuoteId: string | null = null; // te consumeren snapshot (pad a)
  const currency: "EUR" = "EUR";
  const airport: AirportContext = outcome.airport;
  // 'overleg'-bagage → NOOIT bindend: forceer offerte op aanvraag (handmatige
  // beoordeling), ongeacht een gelockte prijs. De snapshot wordt dan niet
  // geconsumeerd en de RPC (die 'overleg' óók fail-closed weigert) wordt overgeslagen.
  if (outcome.kind === "priced" && !luggageOnRequest) {
    priceEuros = outcome.priceEuros;
    returnApplied = outcome.returnApplied;
    lockedQuoteId = outcome.lockedQuoteId;
    quoteOnRequest = false;
  }
  // outcome.kind === "on_request" (of overleg) → offerte op aanvraag (prijs null).

  // 3b. Vluchtnummer — verplicht zodra één zijde een luchthaven is.
  //
  // T4XI belooft de vluchtstatus te volgen en het ophaalmoment aan te passen bij
  // vertraging. Die belofte wordt handmatig uitgevoerd en is zonder vluchtnummer
  // onuitvoerbaar. Het veld is hier dus geen formaliteit: zonder nummer kan de
  // dienst niet geleverd worden.
  //
  // OOK bij "offerte op aanvraag". Ritten vanaf Schiphol hebben nog geen vaste
  // route, dus `quote.available` is false — maar het blijft een luchthavenrit.
  // De luchthavencontext komt daarom uit de service en niet uit `available`.
  //
  // De richting wordt server-side afgeleid en nooit door de klant gekozen:
  // luchthaven als vertrek → arrival, luchthaven als bestemming → departure.
  // `airport` is hierboven gezet: uit de snapshot (quote-lock) of uit de service.
  if (airport.isAirportTransfer && flightNumber === "") {
    return bad(
      airport.isAirportPickup
        ? "Vul uw aankomende vluchtnummer in — daarmee volgen wij uw vlucht en passen wij het ophaalmoment aan."
        : "Vul uw vertrekkende vluchtnummer in, zodat wij de rit daarop kunnen plannen."
    );
  }
  if (flightNumber !== "" && !/^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/.test(flightNumber)) {
    return bad("Vluchtnummer lijkt niet te kloppen. Bijvoorbeeld: KL1234.");
  }
  // Een vluchtnummer zonder luchthaven aan een van beide zijden slaat nergens op;
  // we slaan het dan niet op in plaats van het stilzwijgend te bewaren.
  const flightDirection = airport.isAirportTransfer ? airport.flightDirection : null;
  const flightNumberToStore = airport.isAirportTransfer ? flightNumber : "";

  // 4. Wegschrijven via de service-role client. Twee paden:
  const supabase = serviceRoleClient();
  if (!supabase) {
    return json(503, {
      ok: false,
      error: "unavailable",
      message: "Boekingen zijn tijdelijk niet beschikbaar. Bel of WhatsApp ons.",
    });
  }

  let data: unknown;
  let error: { message: string } | null;

  if (lockedQuoteId) {
    // a) QUOTE-LOCK → TRANSACTIONEEL + IDEMPOTENT: de RPC vergrendelt de snapshot,
    //    valideert (bestaan/vervaldatum/ongebruikt/fingerprint/bron/capaciteit),
    //    maakt de boeking met exact total_cents, markeert de snapshot als gebruikt
    //    en koppelt hem. Retry met dezelfde quoteId → DEZELFDE boeking (geen tweede
    //    boeking, geen tweede betaling, geen tweede Google-call).
    ({ data, error } = await supabase.rpc("create_booking_from_snapshot", {
      p_quote_id: lockedQuoteId,
      p_expected_fingerprint: quoteFingerprint({ pickup, dropoff, returnTrip }),
      p_ride_type: rideType,
      p_from_address: pickup,
      p_to_address: dropoff,
      p_ride_date: date,
      p_ride_time: time,
      p_vehicle: vehicle || null,
      p_persons: persons,
      p_luggage: luggage || null,
      p_customer_name: name,
      p_customer_phone: phone,
      p_customer_email: email,
      p_from_lat: coord(body.fromLat),
      p_from_lon: coord(body.fromLon),
      p_to_lat: coord(body.toLat),
      p_to_lon: coord(body.toLon),
      p_flight_number: flightNumberToStore || null,
      p_flight_direction: flightDirection,
    }));
    if (error) {
      // Herkenbare quote-lock-fouten → duidelijke, klantvriendelijke validatiefout.
      const lockMap: Record<string, [number, string, string]> = {
        QUOTE_NOT_FOUND: [409, "quote_not_found", "Uw prijsofferte is niet (meer) gevonden. Vernieuw de prijs en probeer opnieuw."],
        QUOTE_EXPIRED: [409, "quote_expired", "Uw prijs is verlopen. Vernieuw de prijs en accepteer die opnieuw."],
        QUOTE_MISMATCH: [409, "quote_mismatch", "De rit is gewijzigd ten opzichte van de getoonde prijs. Vernieuw de prijs."],
        QUOTE_INVALID_SOURCE: [422, "quote_invalid", "De prijsofferte is ongeldig. Vernieuw de prijs."],
        INVALID_VEHICLE_CLASS: [422, "invalid_vehicle_class", "De gekozen voertuigklasse is niet (meer) beschikbaar. Vernieuw de prijs."],
        INVALID_LUGGAGE: [422, "invalid_luggage", "Kies een geldige bagage-optie."],
        CAPACITY_EXCEEDED: [422, "capacity_exceeded", "Te veel passagiers of bagage voor de gekozen voertuigklasse."],
        INVALID_PERSONS: [400, "invalid_persons", "Ongeldig aantal passagiers."],
        QUOTE_CONSUMED_NO_BOOKING: [409, "quote_conflict", "De prijsofferte wordt al verwerkt. Probeer het zo opnieuw."],
      };
      for (const key of Object.keys(lockMap)) {
        if (error.message.includes(key)) {
          const [code, err, msg] = lockMap[key];
          return json(code, { ok: false, error: err, message: msg });
        }
      }
      // Anders: val door naar de generieke create_booking-foutafhandeling hieronder.
    }
  } else {
    // b) Geen lock → deterministische vaste route of offerte-op-aanvraag (prijs uit
    //    resolveBookingPrice, routing stond uit). Geen snapshot om te koppelen.
    ({ data, error } = await supabase.rpc("create_booking", {
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
      p_flight_number: flightNumberToStore || null,
      p_flight_direction: flightDirection,
    }));
  }

  if (error) {
    // Validatie-excepties uit de RPC → 400; overige → 500 (geen interne details lekken).
    const known = /Ongeldig|Datum ligt/i.test(error.message);
    return json(known ? 400 : 500, {
      ok: false,
      error: known ? "invalid_input" : "server_error",
      message: known ? error.message : "Er ging iets mis bij het vastleggen van de boeking.",
    });
  }

  const row = (Array.isArray(data) ? data[0] : data) as
    | { booking_ref?: string; booking_id?: string; price_euros?: number }
    | null
    | undefined;
  // Bij de lock-RPC is de bindende prijs exact het snapshotbedrag uit de DB.
  if (lockedQuoteId && typeof row?.price_euros === "number") {
    priceEuros = row.price_euros;
  }
  const bookingRef = row?.booking_ref as string | undefined;
  // Intern UUID: capability-sleutel voor de betaalstap. Alleen aan de
  // boekingseigenaar teruggegeven (in de response op zijn eigen boeking).
  const bookingId = row?.booking_id as string | undefined;
  if (!bookingRef) {
    return json(500, {
      ok: false,
      error: "server_error",
      message: "Boeking kon niet worden bevestigd.",
    });
  }

  // 5. Notificaties (best-effort): mag de boeking nooit breken of de response
  //    veranderen. email_sent wordt alleen true als BEIDE mails slagen.
  try {
    const emails = await sendBookingEmails({
      bookingRef,
      rideType,
      pickup,
      dropoff,
      date,
      time,
      vehicle: vehicle || null,
      persons,
      luggage: luggage || null,
      flightNumber: flightNumberToStore || null,
      flightDirection,
      price: priceEuros,
      currency,
      quoteOnRequest,
      returnApplied,
      customerName: name,
      customerPhone: phone,
      customerEmail: email,
      // Taal van de klantmail: uit de boeking, server-side gevalideerd. De URL
      // is niet betrouwbaar zodra de request server-side wordt verwerkt; een
      // ongeldige of ontbrekende waarde valt veilig terug op "nl".
      locale: normalizeLocale(body.locale),
    });
    if (emails.sent) {
      const { error: updErr } = await supabase
        .from("bookings")
        .update({ email_sent: true })
        .eq("booking_ref", bookingRef);
      if (updErr) console.error("[bookings] email_sent-update faalde:", updErr.message);
    }
  } catch (e) {
    console.error("[bookings] notificatie-laag fout:", e instanceof Error ? e.message : e);
  }

  // 5b. Vluchtmonitoring (best-effort, Sprint 7.8A): registreer elke luchthavenrit
  //     met vluchtnummer zodat de poller de status kan volgen. Mag de boeking nooit
  //     breken; idempotent via UNIQUE booking_id. Geen pricing/Stripe.
  await registerFlightMonitoring(
    supabase,
    buildRegistration({
      bookingId,
      flightNumber: flightNumberToStore,
      scheduleDate: date,
      direction: flightDirection,
    })
  );

  return json(201, {
    ok: true,
    bookingRef,
    bookingId,
    status: "pending",
    quoteOnRequest,
    price: priceEuros,
    currency,
    returnApplied,
    ...(quoteOnRequest ? { message: QUOTE_ON_REQUEST } : {}),
  });
}
