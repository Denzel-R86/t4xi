import { NextResponse } from "next/server";
import {
  getPricingQuote,
  type PricingQuoteInput,
  type PricingQuoteResult,
  type UnavailableReason,
} from "@/lib/pricing/service";

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

/** 400 — malformed/onvolledige request (geen offertepoging). */
function badRequest(message: string) {
  return NextResponse.json(
    { available: false, error: "invalid_input", message },
    { status: 400 }
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
  const { pickup, dropoff, vehicleClass, returnTrip, passengers, luggage } = body;

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

  const input: PricingQuoteInput = {
    pickup: pickup.trim(),
    dropoff: dropoff.trim(),
    ...(vehicleClass !== undefined ? { vehicleClass } : {}),
    ...(returnTrip !== undefined ? { returnTrip } : {}),
    ...(passengers !== undefined ? { passengers } : {}),
    ...(luggage !== undefined ? { luggage } : {}),
  };

  // 3. Offerte ophalen (service logt zelf; logging blokkeert de offerte nooit)
  let result: PricingQuoteResult;
  try {
    result = await getPricingQuote(input);
  } catch {
    // Onverwachte serverfout — geen prijs lekken, geen fallback tonen.
    return NextResponse.json(
      { available: false, message: "Offerte op aanvraag" },
      { status: 500 }
    );
  }

  // 4. Resultaat → HTTP
  if (result.available) {
    return NextResponse.json(
      {
        available: true,
        price: result.price,
        currency: result.currency,
        singlePrice: result.singlePrice,
        returnPrice: result.returnPrice,
        returnApplied: result.returnApplied,
        vehicleClass: result.vehicleClass,
        distanceKm: result.distanceKm,
        estimatedDurationMin: result.estimatedDurationMin,
        vatRate: result.vatRate,
        source: result.source,
        // Stuurt het vluchtnummerveld in de boekingsflow aan: bij luchthavenritten
        // is dat verplicht, omdat wij anders de vluchtstatus niet kunnen volgen.
        isAirportTransfer: result.isAirportTransfer,
      },
      { status: 200 }
    );
  }

  // Niet beschikbaar → publiek contract: alleen available + message (geen interne reason).
  return NextResponse.json(
    { available: false, message: result.message },
    { status: statusForReason(result.reason) }
  );
}
