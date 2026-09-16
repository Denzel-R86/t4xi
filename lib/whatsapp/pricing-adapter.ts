import { quoteTrip, type QuoteApplicationDependencies, type QuoteApplicationResult } from '@/lib/pricing/quote';
import type { BookingDraft } from './conversation';
import { PreEffectFailure, type WorkCommand, type WorkResult } from './worker';

/** Field projection only. All validation, pricing and snapshot writes stay shared. */
export function pricingInput(draft: BookingDraft): Record<string, unknown> {
  return { pickup: draft.pickup, dropoff: draft.dropoff, date: draft.date, time: draft.time,
    passengers: draft.persons, luggageCategory: draft.luggage, returnTrip: draft.rideType === 'retour',
    ...(draft.rideType === 'retour' ? { returnDate: draft.returnDate, returnTime: draft.returnTime } : {}) };
}
export async function quoteWhatsAppTrip(draft: BookingDraft, deps: QuoteApplicationDependencies = {}): Promise<QuoteApplicationResult> {
  return quoteTrip(pricingInput(draft), deps);
}
export function pricingAdapter(deps: QuoteApplicationDependencies = {}) {
  return {
    async prepare(command: WorkCommand) {
      if (command.kind !== 'request_quote' || !Number.isSafeInteger(command.payload.draftRevision)
        || !command.payload.draft || typeof command.payload.draft !== 'object' || Array.isArray(command.payload.draft)) throw new PreEffectFailure(false);
    },
    async execute(command: WorkCommand): Promise<WorkResult> {
      const result = await quoteWhatsAppTrip(command.payload.draft as BookingDraft, deps);
      // Only malformed input rejected before the engine is provably pre-effect.
      if (result.status === 400 && result.payload.error === 'invalid_input') throw new PreEffectFailure(false);
      if (result.status !== 200 || !result.snapshot || result.payload.available !== true) throw new Error('PRICING_OUTCOME_UNAVAILABLE');
      const snapshot = result.snapshot;
      return { type: 'quote', quote: { quoteId: snapshot.quoteId, totalCents: snapshot.totalCents, currency: 'EUR',
        expiresAt: snapshot.expiresAt, draftRevision: command.payload.draftRevision as number,
        outboundFlightRequired: result.payload.isAirportPickup === true,
        returnFlightRequired: (command.payload.draft as BookingDraft).rideType === 'retour' && result.payload.isAirportDropoff === true } };
    },
  };
}
