/**
 * Quote → booking-koppeling voor meetbaarheid (Experience 2.0, H-3 / F-04).
 *
 * Twee kolommen, twee betekenissen — bewust gescheiden:
 *
 *   · `bookings.quote_id`        = de GELOCKTE prijs-snapshot (quote-lock). Wordt
 *                                  uitsluitend door `create_booking_from_snapshot`
 *                                  gezet, heeft een partiële UNIEKE index en is de
 *                                  laatste verdediging tegen een dubbele boeking op
 *                                  dezelfde quote. Deze module raakt hem NIET aan.
 *   · `bookings.source_quote_id` = de quote die de klant zag toen hij boekte
 *                                  (attributie, geen lock, geen unieke index). Ook
 *                                  gevuld als de boeking alsnog "offerte op aanvraag"
 *                                  werd (handmatige bagagereview).
 *
 * Waarom niet gewoon `quote_id` vullen op het aanvraagpad: dan zou een latere,
 * geldige lock-boeking op dezelfde snapshot tegen de unieke index lopen en met
 * een 500 falen — een gedragswijziging van de quote-lock. Attributie mag de
 * lock nooit beïnvloeden.
 *
 * `source_quote_id` bestaat pas na migratie 20261006150000 (voorstel, vereist
 * akkoord eigenaar). Tot dan degradeert `persistSourceQuoteId` zonder fout: de
 * boeking slaagt altijd, er komt hooguit één PII-vrije waarschuwing in de log.
 */

/** Alle paden in POST /api/bookings die tot een boekingsrij leiden. */
export type BookingQuotePath =
  /** quoteId gevalideerd → create_booking_from_snapshot (bindende prijs). */
  | "snapshot_lock"
  /** quoteId gevalideerd, maar bagage vraagt handmatige review → create_booking zonder prijs. */
  | "quote_on_request_review"
  /** Geen quoteId, deterministische vaste route → create_booking met prijs. Geen snapshot. */
  | "fixed_route_without_quote"
  /** Geen prijs beschikbaar → create_booking als offerte op aanvraag. Geen snapshot. */
  | "on_request";

export type QuoteLinkInput = {
  /** Uitkomst van resolveBookingPrice (fouten zijn vóór dit punt al afgehandeld). */
  outcome:
    | { kind: "priced"; lockedQuoteId: string | null }
    | { kind: "on_request" };
  luggageNeedsManualReview: boolean;
};

export type QuoteLink = {
  path: BookingQuotePath;
  /** Snapshot die de lock-RPC consumeert; null = create_booking. */
  lockedQuoteId: string | null;
  /** Getoonde quote voor attributie; null = er bestond geen (gevalideerde) quote. */
  sourceQuoteId: string | null;
};

/**
 * Pure afleiding: welk boekingspad, welke lock en welke attributie-quote.
 *
 * `lockedQuoteId` volgt exact de bestaande regel van de route (alleen bij een
 * geprijsde uitkomst zonder handmatige bagagereview). `sourceQuoteId` is
 * uitsluitend een quoteId die resolveBookingPrice al heeft gevalideerd
 * (bestaat, niet verlopen, geldige bron, vingerafdruk klopt) — nooit rauwe
 * clientinvoer.
 */
export function resolveQuoteLink(input: QuoteLinkInput): QuoteLink {
  const { outcome, luggageNeedsManualReview } = input;
  if (outcome.kind === "on_request") {
    return { path: "on_request", lockedQuoteId: null, sourceQuoteId: null };
  }
  const validatedQuoteId = outcome.lockedQuoteId;
  if (validatedQuoteId === null) {
    // Geen quoteId → priced kan alleen een vaste route zijn; met bagagereview
    // wordt het een aanvraag, maar er is in beide gevallen geen snapshot.
    return {
      path: luggageNeedsManualReview ? "on_request" : "fixed_route_without_quote",
      lockedQuoteId: null,
      sourceQuoteId: null,
    };
  }
  if (luggageNeedsManualReview) {
    return { path: "quote_on_request_review", lockedQuoteId: null, sourceQuoteId: validatedQuoteId };
  }
  return { path: "snapshot_lock", lockedQuoteId: validatedQuoteId, sourceQuoteId: validatedQuoteId };
}

type DbError = { code?: string | null; message?: string | null };

/** Werkt `bookings` bij voor één id; de route levert de echte Supabase-aanroep. */
export type BookingPatcher = (
  bookingId: string,
  patch: { source_quote_id: string }
) => PromiseLike<{ error: DbError | null }>;

export type SourceQuoteLinkResult = "linked" | "skipped" | "schema_missing" | "error";

/**
 * PostgREST meldt een onbekende kolom als PGRST204 (schema cache); Postgres zelf
 * als 42703 (undefined_column). Beide = migratie nog niet toegepast.
 */
export function isMissingColumnError(error: DbError): boolean {
  return error.code === "PGRST204" || error.code === "42703";
}

let schemaMissingWarned = false;

/** Alleen voor tests: zet de eenmalige waarschuwing terug. */
export function resetSourceQuoteWarningForTests(): void {
  schemaMissingWarned = false;
}

/**
 * Best-effort: zet `source_quote_id` op de zojuist aangemaakte boeking.
 * Gooit nooit en verandert niets aan de response of de boeking zelf. Logt
 * uitsluitend een foutcode — geen ids, adressen of klantgegevens.
 */
export async function persistSourceQuoteId(
  patch: BookingPatcher,
  bookingId: string | null | undefined,
  sourceQuoteId: string | null
): Promise<SourceQuoteLinkResult> {
  if (!bookingId || !sourceQuoteId) return "skipped";
  try {
    const { error } = await patch(bookingId, { source_quote_id: sourceQuoteId });
    if (!error) return "linked";
    if (isMissingColumnError(error)) {
      if (!schemaMissingWarned) {
        schemaMissingWarned = true;
        console.warn(
          "[bookings] source_quote_id niet vastgelegd: kolom ontbreekt (migratie 20261006150000 nog niet toegepast)."
        );
      }
      return "schema_missing";
    }
    console.error(`[bookings] source_quote_id-koppeling faalde (code=${error.code ?? "onbekend"}).`);
    return "error";
  } catch (e) {
    console.error(
      `[bookings] source_quote_id-koppeling gooide een uitzondering (${e instanceof Error ? e.name : "onbekend"}).`
    );
    return "error";
  }
}
