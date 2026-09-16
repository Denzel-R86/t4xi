import { createBooking } from '@/lib/bookings/create';
import { isBookingStatus } from '@/lib/bookings/lifecycle';
import { PreEffectFailure, type WorkCommand, type WorkResult } from './worker';
import type { BookingDraft } from './conversation';
/** Only existing service invocation and result classification; no booking writes. */
export function bookingAdapter() {
  return {
    async prepare(command: WorkCommand) {
      if (command.kind !== 'request_booking' || typeof command.payload.quoteId !== 'string'
        || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(command.payload.quoteId)
        || !command.payload.commandId || !command.payload.draft || typeof command.payload.draft !== 'object'
        || Array.isArray(command.payload.draft) || typeof command.payload.customerPhone !== 'string') throw new PreEffectFailure(false);
    },
    async execute(command: WorkCommand): Promise<WorkResult> {
      const draft = command.payload.draft as BookingDraft;
      const result = await createBooking({ ...draft, quoteId: command.payload.quoteId, customerPhone: command.payload.customerPhone }, { requireQuoteLock: true });
      const p = result.payload;
      if (result.status === 201 && p.ok === true && typeof p.bookingId === 'string' && typeof p.bookingRef === 'string' && isBookingStatus(p.status)) {
        return { type: 'booking', booking: { id: p.bookingId, reference: p.bookingRef, status: p.status } };
      }
      // Explicit validation rejection before write or a recognized SQL exception
      // (the RPC transaction rolls back). Generic 5xx/throws remain UNKNOWN.
      if ([400,409,422].includes(result.status) && p.error !== 'quote_conflict') throw new PreEffectFailure(false);
      throw new Error('BOOKING_OUTCOME_UNKNOWN');
    },
  };
}
