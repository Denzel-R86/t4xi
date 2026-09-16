import { isBookingStatus } from "@/lib/bookings/lifecycle";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { resolveBookingPrice } from "@/lib/pricing/engine";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { quoteFingerprint, type AirportContext } from "@/lib/pricing/service";
import { classifyLuggage } from "@/lib/pricing/luggage";
import { readPriceSnapshot } from "@/lib/pricing/snapshot-store";
import { normalizeLocale } from "@/lib/notifications/booking-email";
import { dispatch } from "@/lib/communication/orchestrator";
import { supabaseDeliveryLog } from "@/lib/communication/delivery-log";
import {
  buildTripMonitoringRegistration,
  registerFlightMonitoring,
} from "@/lib/flight-monitoring/service";

/** Shared server-side booking application service. HTTP abuse controls stay in the route.
 * Preserves existing validation, RPC boundaries and best-effort effects.
 * Callers must authorize the action before invoking this service.
 */
const MAX_PERSONS = 8;
const QUOTE_ON_REQUEST = "Offerte op aanvraag";
/**
 * Tijdelijke neutrale planningwaarde. De klant kiest geen merk of model en ook
 * oude/aangepaste clients kunnen geen specifieke voertuigbelofte afdwingen.
 */
const DEFAULT_BOOKING_VEHICLE = "Premium voertuig";

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const BOOKABLE_RIDE_TYPES = new Set(["direct", "enkel", "retour"]);

export type BookingInput = Record<string, unknown>;
export type BookingCreationResult = {
  status: number;
  payload: Record<string, unknown>;
};

function json(status: number, payload: Record<string, unknown>): BookingCreationResult {
  return { status, payload };
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

export async function createBooking(body: BookingInput, options: { requireQuoteLock?: boolean } = {}): Promise<BookingCreationResult> {
  // 2. Velden valideren
  const pickup = str(body.pickup);
  const dropoff = str(body.dropoff);
  const date = str(body.date);
  const time = str(body.time);
  const returnDate = str(body.returnDate);
  const returnTime = str(body.returnTime);
  const name = str(body.customerName);
  const phone = str(body.customerPhone);
  const email = str(body.customerEmail).toLowerCase();
  const vehicle = DEFAULT_BOOKING_VEHICLE;
  const luggage = str(body.luggage);
  const rideType = str(body.rideType) || "direct";
  // Vluchtnummer: normaliseren naar hoofdletters zonder scheidingstekens, zodat
  // "kl 1234" en "KL-1234" dezelfde waarde opleveren. De RPC normaliseert nog een
  // keer — de database is de laatste verdedigingslinie, niet de eerste.
  const flightNumber = str(body.flightNumber).toUpperCase().replace(/[^A-Z0-9]/g, "");
  const returnFlightNumber = str(body.returnFlightNumber).toUpperCase().replace(/[^A-Z0-9]/g, "");

  if (pickup.length < 3) return bad("Ophaaladres is verplicht (min. 3 tekens).");
  if (dropoff.length < 3) return bad("Bestemming is verplicht (min. 3 tekens).");
  if (!DATE_RE.test(date)) return bad("Datum is verplicht (YYYY-MM-DD).");
  if (!TIME_RE.test(time)) return bad("Tijd is verplicht (HH:MM).");
  const departureAt = amsterdamDepartureIso(date, time);
  if (!departureAt) return bad("Datum of tijd bestaat niet.");
  if (!BOOKABLE_RIDE_TYPES.has(rideType)) return bad("Kies een geldige ritsoort.");
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

  // Volledig lokaal vertrekmoment valideren, niet alleen de kalenderdag. Zo kan
  // een rit voor eerder vandaag evenmin als toekomstige boeking worden opgeslagen.
  if (Date.parse(departureAt) <= Date.now()) return bad("Vertrekmoment ligt in het verleden.");

  const returnTrip = rideType === "retour";
  // Retour-vertrekinstant (ISO) — nodig voor het nachttarief van het retour-ritdeel
  // én voor de quote-lock-vingerafdruk (die de vertrektijden meeneemt).
  let returnDepartureAt: string | undefined;
  if (returnTrip) {
    if (!DATE_RE.test(returnDate)) return bad("Retourdatum is verplicht (YYYY-MM-DD).");
    if (!TIME_RE.test(returnTime)) return bad("Retourtijd is verplicht (HH:MM).");
    const outwardAt = departureAt;
    const returnAt = amsterdamDepartureIso(returnDate, returnTime);
    if (!outwardAt || !returnAt || Date.parse(returnAt) <= Date.parse(outwardAt)) {
      return bad("Het retourmoment moet na het vertrek van de heenrit liggen.");
    }
    returnDepartureAt = returnAt;
  } else if (returnDate || returnTime || returnFlightNumber) {
    return bad("Retourgegevens zijn alleen toegestaan bij een retourrit.");
  }

  let persons = 1;
  if (body.persons !== undefined) {
    if (typeof body.persons !== "number" || !Number.isInteger(body.persons) || body.persons < 1) {
      return bad("'persons' moet een positief geheel getal zijn.");
    }
    if (body.persons > MAX_PERSONS) return bad(`Maximaal ${MAX_PERSONS} passagiers.`);
    persons = body.persons;
  }
  const luggageNeedsManualReview =
    luggageClass.kind === "on_request" ||
    (luggageClass.kind === "binding" &&
      luggageClass.category === "3-koffers" &&
      persons > 3);

  const coord = (v: unknown): number | null =>
    typeof v === "number" && Number.isFinite(v) ? v : null;

  // 3. Bindende prijs bepalen via de quote-lock-resolver (retour = ride_type
  //    'retour'). De client stuurt NOOIT een prijs. resolveBookingPrice:
  //      a) quoteId aanwezig → gebruikt exact het gelockte snapshotbedrag (geen
  //         Google, geen herberekening; prijs/bron/btw/luchthaven uit de snapshot);
  //      b) geen quoteId → alleen een deterministische vaste route of offerte-op-
  //         aanvraag (routing UIT, dus nooit een bindende dynamische prijs zonder
  //         geaccepteerde snapshot).
  const now = new Date();
  const outcome = await resolveBookingPrice(
    {
      pickup,
      dropoff,
      returnTrip,
      passengers: persons,
      ...(luggageClass.kind === "binding" ? { luggage: luggageClass.pieces } : {}),
      departureAt,
      ...(returnDepartureAt !== undefined ? { returnDepartureAt } : {}),
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
  // Onbekende of gecombineerde capaciteit → NOOIT bindend: forceer offerte op
  // aanvraag, consumeer geen snapshot en sla de lock-RPC over.
  if (outcome.kind === "priced" && !luggageNeedsManualReview) {
    priceEuros = outcome.priceEuros;
    returnApplied = outcome.returnApplied;
    lockedQuoteId = outcome.lockedQuoteId;
    quoteOnRequest = false;
  }
  // outcome.kind === "on_request" (of overleg) → offerte op aanvraag (prijs null).

  // Command callers may require the existing idempotent path. Never silently
  // fall back to an unkeyed booking when a quote cannot be consumed.
  if (options.requireQuoteLock && !lockedQuoteId) {
    return json(409, { ok: false, error: "quote_lock_required", message: "Een bindende prijsofferte is vereist voor deze boeking." });
  }

  // 3b. Vluchtnummer — verplicht bij een luchthavenOPHALING (aankomende vlucht),
  // optioneel bij wegbrengen naar de luchthaven. Dit is exact dezelfde regel als
  // in BookingSection; formulier en server mogen elkaar hier nooit tegenspreken.
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
  const outboundFlightRequired =
    airport.isAirportTransfer && airport.flightDirection === "arrival";
  const returnFlightRequired =
    returnTrip && airport.isAirportTransfer && airport.flightDirection === "departure";
  if (outboundFlightRequired && flightNumber === "") {
    return bad(
      "Vul uw aankomende vluchtnummer in — daarmee volgen wij uw vlucht en passen wij het ophaalmoment aan."
    );
  }
  if (flightNumber !== "" && !/^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/.test(flightNumber)) {
    return bad("Vluchtnummer lijkt niet te kloppen. Bijvoorbeeld: KL1234.");
  }
  if (returnFlightNumber !== "" && !/^[A-Z0-9]{2,3}[0-9]{1,4}[A-Z]?$/.test(returnFlightNumber)) {
    return bad("Retourvluchtnummer lijkt niet te kloppen. Bijvoorbeeld: KL1234.");
  }
  if (returnFlightRequired && returnFlightNumber === "") {
    return bad("Vul het aankomende vluchtnummer van uw retourrit in.");
  }
  // Een vluchtnummer zonder luchthaven aan een van beide zijden slaat nergens op;
  // we slaan het dan niet op in plaats van het stilzwijgend te bewaren.
  const flightDirection = airport.isAirportTransfer ? airport.flightDirection : null;
  const flightNumberToStore = airport.isAirportTransfer ? flightNumber : "";
  const returnFlightNumberToStore =
    returnTrip && airport.isAirportTransfer ? returnFlightNumber : "";

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
      // Exact dezelfde prijsbepalende invoer als bij de preview. De vertrek-
      // instants horen bij de fingerprint omdat het nachttarief ervan afhangt.
      // Zonder deze velden week iedere geldige snapshot met datum/tijd af en
      // antwoordde de RPC met QUOTE_MISMATCH.
      p_expected_fingerprint: quoteFingerprint({
        pickup,
        dropoff,
        returnTrip,
        departureAt,
        ...(returnDepartureAt !== undefined ? { returnDepartureAt } : {}),
      }),
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
        INVALID_VEHICLE_CLASS: [422, "invalid_vehicle_class", "De voertuigklasse voor deze rit is niet (meer) beschikbaar. Vernieuw de prijs."],
        INVALID_LUGGAGE: [422, "invalid_luggage", "Kies een geldige bagage-optie."],
        CAPACITY_EXCEEDED: [422, "capacity_exceeded", "Het aantal passagiers of de bagage past niet binnen de beschikbare voertuigcapaciteit."],
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

  // Een retour is één betaalde boeking met twee operationele momenten. De
  // gestructureerde velden worden direct na de (eventueel transactionele)
  // creatie opgeslagen. Tijdens een gefaseerde deploy zonder de nieuwe kolommen
  // blijft een JSON-notitie als compatibele fallback bewaard.
  if (returnTrip && bookingId) {
    const returnDetails = {
      return_date: returnDate,
      return_time: returnTime,
      return_flight_number: returnFlightNumberToStore || null,
    };
    const { error: returnUpdateError } = await supabase
      .from("bookings")
      .update(returnDetails)
      .eq("id", bookingId);
    if (returnUpdateError) {
      console.error("[bookings] retourvelden-update faalde:", returnUpdateError.message);
      const { error: fallbackError } = await supabase
        .from("bookings")
        .update({ notes: JSON.stringify({ type: "return_schedule", ...returnDetails }) })
        .eq("id", bookingId);
      if (fallbackError) {
        console.error("[bookings] retourfallback-update faalde:", fallbackError.message);
      }
    }
  }

  // 5. Communicatie (best-effort): mag de boeking nooit breken of de response
  //    veranderen. De route kiest geen kanaal en roept geen template aan — hij
  //    publiceert het domeinevent en de orchestrator bepaalt de rest.
  //    email_sent blijft alleen true als er niets faalde.
  try {
    const communication = await dispatch({
      type: "booking.created",
      subjectType: "booking",
      subjectId: bookingRef,
      bookingId: bookingId ?? null,
      // Taal van de klantmail: uit de boeking, server-side gevalideerd. De URL
      // is niet betrouwbaar zodra de request server-side wordt verwerkt; een
      // ongeldige of ontbrekende waarde valt veilig terug op "nl".
      locale: normalizeLocale(body.locale),
      booking: {
        bookingRef,
        rideType,
        pickup,
        dropoff,
        date,
        time,
        returnDate: returnTrip ? returnDate : null,
        returnTime: returnTrip ? returnTime : null,
        returnFlightNumber: returnFlightNumberToStore || null,
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
        locale: normalizeLocale(body.locale),
      },
    }, { log: supabaseDeliveryLog(supabase) });
    if (communication.delivered) {
      const { error: updErr } = await supabase
        .from("bookings")
        .update({ email_sent: true })
        .eq("booking_ref", bookingRef);
      if (updErr) console.error("[bookings] email_sent-update faalde:", updErr.message);
    }
  } catch (e) {
    console.error("[bookings] communicatielaag fout:", e instanceof Error ? e.message : e);
  }

  // 5b. Vluchtmonitoring (best-effort, Sprint 7.8A). De tabel heeft bewust één
  //     rij per boeking; bij een retour krijgt daarom de aankomende vlucht
  //     (luchthavenophaling) prioriteit boven een optionele vertrekkende vlucht.
  //     Mag de boeking nooit breken; idempotent via UNIQUE booking_id.
  await registerFlightMonitoring(
    supabase,
    buildTripMonitoringRegistration({
      bookingId,
      outbound: {
        flightNumber: flightNumberToStore,
        scheduleDate: date,
        direction: flightDirection,
      },
      ...(returnTrip
        ? {
            returnLeg: {
              flightNumber: returnFlightNumberToStore,
              scheduleDate: returnDate,
              direction:
                flightDirection === "arrival"
                  ? "departure"
                  : flightDirection === "departure"
                    ? "arrival"
                    : null,
            },
          }
        : {}),
    })
  );

  // Creation may already be committed. Read the current persisted lifecycle;
  // never infer it from a default, the RPC response, or a previous attempt.
  let bookingStatus: unknown;
  try {
    if (bookingId) {
      const { data: persisted, error: statusError } = await supabase
        .from("bookings").select("status").eq("id", bookingId).single();
      if (!statusError) bookingStatus = persisted?.status;
    }
  } catch {
    // An unavailable read cannot establish that the preceding write failed.
  }
  if (!isBookingStatus(bookingStatus)) {
    return json(503, {
      ok: false,
      error: "booking_outcome_unknown",
      bookingId,
      bookingRef,
      message: "De boeking is mogelijk vastgelegd, maar de status kon niet worden bevestigd. Neem contact met ons op voordat u opnieuw boekt.",
    });
  }

  return json(201, {
    ok: true,
    bookingRef,
    bookingId,
    status: bookingStatus,
    quoteOnRequest,
    price: priceEuros,
    currency,
    returnApplied,
    ...(quoteOnRequest ? { message: QUOTE_ON_REQUEST } : {}),
  });
}
