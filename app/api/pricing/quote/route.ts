import { NextResponse } from "next/server";
import { calculateBookingPrice } from "@/lib/pricing/engine";
import { persistPriceSnapshot } from "@/lib/pricing/snapshot-store";
import {
  type PricingQuoteInput,
  type PricingQuoteResult,
  type UnavailableReason,
} from "@/lib/pricing/service";
import { isNightAdjustmentCode, type PriceSnapshot } from "@/lib/pricing/snapshot";
import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";

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
 * Quotes kunnen routegegevens en een eenmalige quote-lock bevatten. `force-dynamic`
 * voorkomt Next-caching, maar zet geen expliciet browser- of proxybeleid.
 */
function json(status: number, payload: Record<string, unknown>) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": PRIVATE_NO_STORE },
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
  // 1. Body parsen
  let body: RequestBody;
  try {
    const parsed = (await request.json()) as unknown;
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return badRequest("Body moet een JSON-object zijn.");
    }
    body = parsed as RequestBody;
  } catch {
    return badRequest("Body is geen geldige JSON.");
  }

  // 2. Input valideren (type-veilig)
  const { pickup, dropoff, vehicleClass, returnTrip, passengers, luggage, date, time, returnDate, returnTime } = body;

  if (typeof pickup !== "string" || pickup.trim() === "") {
    return badRequest("Veld 'pickup' is verplicht en moet een niet-lege string zijn.");
  }
  if (typeof dropoff !== "string" || dropoff.trim() === "") {
    return badRequest("Veld 'dropoff' is verplicht en moet een niet-lege string zijn.");
  }
  if (vehicleClass !== undefined && typeof vehicleClass !== "string") {
    return badRequest("'vehicleClass' moet een string zijn.");
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
  if (
    luggage !== undefined &&
    (typeof luggage !== "number" || !Number.isInteger(luggage) || luggage < 0)
  ) {
    return badRequest("'luggage' moet een geheel getal van 0 of hoger zijn.");
  }

  // Volledig afwezig is toegestaan. Zodra één deel wordt meegestuurd, moeten datum
  // én tijd geldig zijn; een clientfout mag niet stil op een andere verkeersinschatting
  // terugvallen dan de klant heeft aangevraagd.
  let departureAt: string | undefined;
  if (date !== undefined || time !== undefined) {
    if (typeof date !== "string" || typeof time !== "string") {
      return badRequest("'date' en 'time' moeten samen als strings worden meegestuurd.");
    }
    const normalizedDate = date.trim();
    const normalizedTime = time.trim();
    if (!isExistingCalendarDate(normalizedDate)) {
      return badRequest("'date' moet een bestaande datum in formaat YYYY-MM-DD zijn.");
    }
    departureAt = amsterdamDepartureIso(normalizedDate, normalizedTime) ?? undefined;
    if (!departureAt) {
      return badRequest("'time' moet een geldige tijd in formaat HH:MM zijn.");
    }
  }

  // Retour-vertrek (optioneel) → bepaalt het nachttarief van het retour-ritdeel.
  // Zodra één deel wordt meegestuurd, moeten retourdatum én -tijd geldig zijn.
  let returnDepartureAt: string | undefined;
  if (returnDate !== undefined || returnTime !== undefined) {
    if (typeof returnDate !== "string" || typeof returnTime !== "string") {
      return badRequest("'returnDate' en 'returnTime' moeten samen als strings worden meegestuurd.");
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
  }

  const input: PricingQuoteInput = {
    pickup: pickup.trim(),
    dropoff: dropoff.trim(),
    ...(vehicleClass !== undefined ? { vehicleClass } : {}),
    ...(returnTrip !== undefined ? { returnTrip } : {}),
    ...(passengers !== undefined ? { passengers } : {}),
    ...(luggage !== undefined ? { luggage } : {}),
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

  // 4. Resultaat → HTTP
  if (result.available) {
    // Snapshot ATOMAIR opslaan (best-effort: blokkeert de offerte nooit). Alleen
    // wanneer de opslag door de DB bevestigd is, geven we quoteId terug — nooit een
    // niet-opgeslagen id. quoteId is ADDITIEF: bestaande clients negeren het gewoon.
    let quoteId: string | undefined;
    if (snapshot) {
      const stored = await persistPriceSnapshot(snapshot);
      if (stored) quoteId = snapshot.quoteId;
    }
    // Getoonde prijs = snapshot-TOTAAL (incl. eventueel nachttarief), zodat wat de
    // klant ziet exact overeenkomt met wat de boeking (quote-lock) afrekent. Zonder
    // snapshot (zeldzaam) valt het terug op het basisbedrag.
    const displayPrice = snapshot ? snapshot.totalCents / 100 : result.price;
    // Nachttoeslag expliciet uit de per-ritdeel `night_*`-adjustments sommeren —
    // niet als total−subtotal, zodat toekomstige andere adjustments niet als "nacht"
    // worden gelabeld.
    const nightCents = (snapshot?.adjustments ?? [])
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
        // ADDITIEF (7.6.3C): quote-lock identifier; alleen aanwezig bij bevestigde opslag.
        ...(quoteId ? { quoteId } : {}),
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
