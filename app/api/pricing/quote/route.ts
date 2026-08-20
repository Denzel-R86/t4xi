import { NextResponse } from "next/server";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { persistPriceSnapshot } from "@/lib/pricing/snapshot-store";
import {
  DEFAULT_VEHICLE_CLASS,
  type PricingQuoteInput,
  type PricingQuoteResult,
  type UnavailableReason,
} from "@/lib/pricing/service";
import { isNightAdjustmentCode, type PriceSnapshot } from "@/lib/pricing/snapshot";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { classifyLuggage } from "@/lib/pricing/luggage";
import { clientIp, rateLimit } from "@/lib/security/rate-limit";

/**
 * POST /api/pricing/quote
 *
 * Dunne HTTP-laag boven de bestaande pricing-service (lib/pricing/service.ts).
 * Bevat GEEN prijslogica: valideert input, roept getPricingQuote() aan en mapt
 * het resultaat naar HTTP-statuscodes. De service logt elke offerte zelf naar
 * pricing_quote_logs (best-effort, niet-blokkerend) — hier wordt niet apart
 * gelogd. Onbekende routes krijgen géén berekende prijs: "Offerte op aanvraag".
 *
 * Server-side only (service-role client) → Node.js runtime, nooit gecachet.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type RequestBody = Record<string, unknown>;

const PRIVATE_NO_STORE = "private, no-store, max-age=0";

/**
 * De klant kiest geen voertuigklasse. Deze waarde is onderdeel van het
 * server-side prijsbeleid en mag nooit uit de publieke request-body komen.
 */
const PUBLIC_QUOTE_VEHICLE_CLASS = DEFAULT_VEHICLE_CLASS;

// Demp dure Google Directions-aanroepen en vervuiling van pricing_quote_logs.
// IP-only (geen user-agent), zodat een caller de limiet niet met UA-rotatie omzeilt.
const RATE_MAX = 20;
const RATE_WINDOW_MS = 60_000;
const MAX_BODY_BYTES = 8_000;
const MAX_ADDRESS_CHARS = 300;

/**
 * Quotes kunnen routegegevens en een eenmalige quote-lock bevatten. `force-dynamic`
 * voorkomt Next-caching, maar zet geen expliciet browser- of proxybeleid.
 */
function json(
  status: number,
  payload: Record<string, unknown>,
  extraHeaders?: Record<string, string>
) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE, ...extraHeaders },
  });
}

/** 400 — malformed/onvolledige request (geen offertepoging). */
function badRequest(message: string) {
  return json(400, { available: false, error: "invalid_input", message });
}

/** `Date.UTC` normaliseert 31 februari stil naar maart; dit voorkomt die rollover. */
function isExistingCalendarDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

/** Mapt een niet-beschikbaar-reden naar de juiste HTTP-status. */
function statusForReason(reason: UnavailableReason): 400 | 404 | 422 | 500 {
  switch (reason) {
    case "invalid_input":
      return 400;
    case "capacity_exceeded":
      return 422;
    case "unknown_location":
    case "route_not_fixed":
      return 404;
    case "data_unavailable":
      return 500;
    default:
      return 500;
  }
}

export async function POST(request: Request) {
  // 0. Elke poging telt, ook malformed/ongeldige input: zo kan een caller de
  // limiter niet omzeilen terwijl die dure aanvragen voorbereidt.
  const ip = clientIp(request);
  const limit = rateLimit(`pricing-quote:${ip}`, RATE_MAX, RATE_WINDOW_MS);
  if (limit.limited) {
    return json(
      429,
      {
        available: false,
        error: "rate_limited",
        message: "Te veel prijsaanvragen. Probeer het over een minuut opnieuw.",
      },
      { "Retry-After": String(limit.retryAfterSec) }
    );
  }

  // 1. Body begrenzen en parsen. Ook binnen de toegestane 20 verzoeken mag een
  // caller geen onbeperkte JSON/adresstrings laten verwerken of loggen.
  let body: RequestBody;
  try {
    const rawBody = await request.text();
    if (new TextEncoder().encode(rawBody).byteLength > MAX_BODY_BYTES) {
      return json(413, {
        available: false,
        error: "payload_too_large",
        message: "Prijsaanvraag is te groot.",
      });
    }
    const parsed = JSON.parse(rawBody) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return badRequest("Body moet een JSON-object zijn.");
    }
    body = parsed as RequestBody;
  } catch {
    return badRequest("Body is geen geldige JSON.");
  }

  // 2. Input valideren (type-veilig)
  const { pickup, dropoff, returnTrip, passengers, luggageCategory, date, time, returnDate, returnTime } = body;

  if (typeof pickup !== "string" || pickup.trim() === "") {
    return badRequest("Veld 'pickup' is verplicht en moet een niet-lege string zijn.");
  }
  if (pickup.trim().length > MAX_ADDRESS_CHARS) {
    return badRequest(`Veld 'pickup' mag maximaal ${MAX_ADDRESS_CHARS} tekens bevatten.`);
  }
  if (typeof dropoff !== "string" || dropoff.trim() === "") {
    return badRequest("Veld 'dropoff' is verplicht en moet een niet-lege string zijn.");
  }
  if (dropoff.trim().length > MAX_ADDRESS_CHARS) {
    return badRequest(`Veld 'dropoff' mag maximaal ${MAX_ADDRESS_CHARS} tekens bevatten.`);
  }
  if (returnTrip !== undefined && typeof returnTrip !== "boolean") {
    return badRequest("'returnTrip' moet een boolean zijn.");
  }
  if (
    passengers !== undefined &&
    (typeof passengers !== "number" || !Number.isInteger(passengers) || passengers < 1)
  ) {
    return badRequest("'passengers' moet een positief geheel getal zijn.");
  }
  // 2026-08-19 (hotfix): een bewust gekozen bagagecategorie (zelfde catalogus als
  // /api/bookings, zie lib/pricing/luggage.ts) is verplicht vóórdat er een prijs
  // getoond wordt — óók "geen-bagage" moet expliciet gekozen zijn. Dit is de
  // server-side afdwinging naast de UI-gate in useRouteQuote/SentencePattern/
  // BookingSection; bypassen van de UI mag nooit alsnog een prijs opleveren
  // zonder een geldige bagagekeuze. Losstaand van het bestaande numerieke
  // 'luggage'-veld hierboven (capaciteitscontrole tegen vehicle_classes.max_luggage).
  const luggageClass = typeof luggageCategory === "string"
    ? classifyLuggage(luggageCategory)
    : { kind: "invalid" as const };
  if (luggageClass.kind === "invalid") {
    return badRequest("'luggageCategory' is verplicht: kies eerst uw bagage voordat een prijs opgevraagd wordt.");
  }

  // 2026-08-19 (hotfix): datum en tijd zijn niet langer optioneel — zonder een
  // geldig, niet-in-het-verleden vertrekmoment mag geen enkele prijs (vast of
  // dynamisch) berekend worden. Dit is de server-side afdwinging van dezelfde
  // regel die de UI al toepast: omzeilen van de UI mag nooit alsnog een prijs
  // opleveren zonder datum, tijd en bagage.
  if (typeof date !== "string" || date.trim() === "") {
    return badRequest("'date' is verplicht: kies eerst een datum voordat een prijs opgevraagd wordt.");
  }
  if (typeof time !== "string" || time.trim() === "") {
    return badRequest("'time' is verplicht: kies eerst een tijd voordat een prijs opgevraagd wordt.");
  }
  const normalizedDate = date.trim();
  const normalizedTime = time.trim();
  if (!isExistingCalendarDate(normalizedDate)) {
    return badRequest("'date' moet een bestaande datum in formaat YYYY-MM-DD zijn.");
  }
  const departureAt = amsterdamDepartureIso(normalizedDate, normalizedTime) ?? undefined;
  if (!departureAt) {
    return badRequest("'time' moet een geldige tijd in formaat HH:MM zijn.");
  }
  // 2026-08-19 (audit-correctie): "niet in het verleden" toetst het VOLLEDIGE
  // vertrekmoment (datum + tijd), niet alleen de datum — anders zou "vandaag,
  // maar een uur geleden" gewoon een geldige, bindbare prijs opleveren. Eerdere
  // versie toetste uitsluitend op dag-granulariteit; dat was zelf al een tweede,
  // aparte tijdzone-implementatie naast `amsterdamDepartureIso` — nu precies
  // ÉÉN mechanisme: `departureAt` is al het DST-correcte, Amsterdamse
  // vertrekinstant (fail-closed op een niet-bestaande lokale tijd, zie
  // amsterdamDepartureIso), simpelweg vergeleken met "nu". Dit dekt automatisch
  // alle vier de gevraagde gevallen: gisteren (altijd vóór nu), vandaag-met-
  // verstreken-tijd (vóór nu), vandaag-met-toekomstige-tijd (na nu), morgen
  // (na nu) — zonder een tweede datumvergelijking nodig te hebben.
  if (new Date(departureAt).getTime() < Date.now()) {
    return badRequest("'date'/'time' mogen niet in het verleden liggen.");
  }

  // Retour-vertrek → bepaalt het nachttarief van het retour-ritdeel en is daarom
  // onderdeel van de bindende fingerprint. Preview en boeking moeten exact
  // dezelfde ritstructuur valideren; anders ontstaat pas bij bevestigen een
  // onvermijdelijke QUOTE_MISMATCH.
  let returnDepartureAt: string | undefined;
  if (returnTrip === true) {
    if (
      typeof returnDate !== "string" ||
      returnDate.trim() === "" ||
      typeof returnTime !== "string" ||
      returnTime.trim() === ""
    ) {
      return badRequest("'returnDate' en 'returnTime' zijn verplicht voor een retourrit.");
    }
    const normalizedReturnDate = returnDate.trim();
    const normalizedReturnTime = returnTime.trim();
    if (!isExistingCalendarDate(normalizedReturnDate)) {
      return badRequest("'returnDate' moet een bestaande datum in formaat YYYY-MM-DD zijn.");
    }
    returnDepartureAt = amsterdamDepartureIso(normalizedReturnDate, normalizedReturnTime) ?? undefined;
    if (!returnDepartureAt) {
      return badRequest("'returnTime' moet een geldige tijd in formaat HH:MM zijn.");
    }
    if (Date.parse(returnDepartureAt) <= Date.parse(departureAt)) {
      return badRequest("Het retourmoment moet na het vertrek van de heenrit liggen.");
    }
  } else if (returnDate !== undefined || returnTime !== undefined) {
    return badRequest("Retourgegevens zijn alleen toegestaan bij een retourrit.");
  }

  const input: PricingQuoteInput = {
    pickup: pickup.trim(),
    dropoff: dropoff.trim(),
    // Autoritatief serverbeleid. Een eventueel binnenkomend `vehicleClass`-veld
    // wordt genegeerd, ook bij een bestaande interne klasse zoals `business`.
    vehicleClass: PUBLIC_QUOTE_VEHICLE_CLASS,
    ...(returnTrip !== undefined ? { returnTrip } : {}),
    ...(passengers !== undefined ? { passengers } : {}),
    // Capaciteit komt uitsluitend uit de gevalideerde categorie. Een los
    // publiek numeriek `luggage`-veld kan de gekozen categorie niet omzeilen.
    ...(luggageClass.kind === "binding" ? { luggage: luggageClass.pieces } : {}),
    ...(departureAt !== undefined ? { departureAt } : {}),
    ...(returnDepartureAt !== undefined ? { returnDepartureAt } : {}),
  };

  // 3. Offerte ophalen via de centrale prijsfunctie (quote = pass-through om
  //    getPricingQuote; service logt zelf; logging blokkeert de offerte nooit).
  //    ADDITIEF (7.6.3C): de bijbehorende immutable snapshot wordt meegeleverd.
  let result: PricingQuoteResult;
  let snapshot: PriceSnapshot | null;
  try {
    const computed = await calculateBookingPrice(input);
    result = computed.quote;
    snapshot = computed.snapshot;
  } catch {
    // Onverwachte serverfout — geen prijs lekken, geen fallback tonen.
    return json(500, { available: false, message: "Offerte op aanvraag" });
  }

  const needsManualLuggageReview =
    luggageClass.kind === "on_request" ||
    (luggageClass.kind === "binding" &&
      luggageClass.category === "3-koffers" &&
      (passengers ?? 1) > 3);
  if (needsManualLuggageReview) {
    // Geen prijs/quoteId/snapshot voor een combinatie die eerst operationeel
    // moet worden bevestigd. De al berekende context blijft beschikbaar voor
    // luchthavenvelden en de vooringevulde offerte-aanvraag.
    return json(404, {
      available: false,
      message: "Offerte op aanvraag",
      isAirportTransfer: result.airport.isAirportTransfer,
      pickupIsAirport: result.airport.pickupIsAirport,
      dropoffIsAirport: result.airport.dropoffIsAirport,
      isAirportPickup: result.airport.isAirportPickup,
      isAirportDropoff: result.airport.isAirportDropoff,
      flightDirection: result.airport.flightDirection,
    });
  }

  // 4. Resultaat → HTTP
  if (result.available) {
    // Een publiek getoonde vaste prijs is alleen geldig als de immutable snapshot
    // daadwerkelijk is opgeslagen. Zonder bevestigde lock zou de boeking later
    // opnieuw moeten rekenen en kan de prijs wijzigen of verdwijnen. Daarom
    // fail-closed: geen prijs lekken en de client laat opnieuw proberen.
    if (!snapshot) {
      return json(503, {
        available: false,
        error: "quote_lock_unavailable",
        message: "Prijs tijdelijk niet beschikbaar. Probeer het opnieuw.",
      });
    }
    const stored = await persistPriceSnapshot(snapshot);
    if (!stored) {
      return json(503, {
        available: false,
        error: "quote_lock_unavailable",
        message: "Prijs tijdelijk niet beschikbaar. Probeer het opnieuw.",
      });
    }
    // Getoonde prijs = snapshot-TOTAAL (incl. eventueel nachttarief), zodat wat de
    // klant ziet exact overeenkomt met wat de boeking (quote-lock) afrekent.
    const displayPrice = snapshot.totalCents / 100;
    // Nachttoeslag expliciet uit de per-ritdeel `night_*`-adjustments sommeren —
    // niet als total−subtotal, zodat toekomstige andere adjustments niet als "nacht"
    // worden gelabeld.
    const nightCents = snapshot.adjustments
      .filter((a) => isNightAdjustmentCode(a.code))
      .reduce((sum, a) => sum + a.amountCents, 0);
    const nightSurcharge = nightCents / 100;
    return json(200, {
        available: true,
        price: displayPrice,
        subtotal: result.price,
        nightSurcharge,
        currency: result.currency,
        singlePrice: result.singlePrice,
        returnPrice: result.returnPrice,
        returnApplied: result.returnApplied,
        vehicleClass: result.vehicleClass,
        distanceKm: result.distanceKm,
        estimatedDurationMin: result.estimatedDurationMin,
        vatRate: result.vatRate,
        source: result.source,
        // Luchthavencontext uit de service — de enige plek waar richting wordt
        // bepaald. Het formulier leidt hier niets zelf uit af.
        isAirportTransfer: result.airport.isAirportTransfer,
        pickupIsAirport: result.airport.pickupIsAirport,
        dropoffIsAirport: result.airport.dropoffIsAirport,
        isAirportPickup: result.airport.isAirportPickup,
        isAirportDropoff: result.airport.isAirportDropoff,
        flightDirection: result.airport.flightDirection,
        // Verplicht bij iedere vaste prijs: de opslag is hierboven bevestigd.
        quoteId: snapshot.quoteId,
      });
  }

  // Niet beschikbaar → publiek contract: geen interne `reason` naar buiten.
  //
  // De luchthavencontext gaat WEL mee. Een rit vanaf Schiphol zonder vaste route
  // krijgt "offerte op aanvraag", maar blijft een luchthavenrit: het formulier moet
  // het vluchtnummerveld tonen, anders kan de aankomst niet gevolgd worden en is de
  // belofte over wachttijd niet waar te maken.
  return json(statusForReason(result.reason), {
      available: false,
      message: result.message,
      isAirportTransfer: result.airport.isAirportTransfer,
      pickupIsAirport: result.airport.pickupIsAirport,
      dropoffIsAirport: result.airport.dropoffIsAirport,
      isAirportPickup: result.airport.isAirportPickup,
      isAirportDropoff: result.airport.isAirportDropoff,
      flightDirection: result.airport.flightDirection,
    });
}
