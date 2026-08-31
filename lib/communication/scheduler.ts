/**
 * Scheduling-contract.
 *
 * Getimede communicatie (rit-reminder, onderweg-bericht, reviewverzoek) en de
 * vluchtmonitor horen op één centrale planner te draaien. De beoogde implemen-
 * tatie is `pg_cron` + `pg_net` in Supabase: scheduling naast de data, zonder
 * afhankelijkheid van losse Vercel-crons.
 *
 * Die extensies staan in dit project nog niet aan en er is in deze fase bewust
 * geen enkele getimede klantflow gebouwd — een belofte zonder betrouwbare
 * trigger is erger dan geen belofte. Wat hier staat is uitsluitend het contract,
 * zodat de orchestrator straks niet rechtstreeks van `pg_cron` afhankelijk wordt.
 */

import type { CommunicationEvent } from "@/lib/communication/events";

/**
 * Een geplande job veroorzaakt een DOMEINEVENT — hij verstuurt zelf nooit iets.
 * Een reminder-job stuurt dus geen reminder maar veroorzaakt bijvoorbeeld
 * `trip.reminder_due`; de orchestrator bepaalt daarna taal, kanaal, template,
 * deduplicatie en verzending. Zo ontstaat er geen tweede communicatiesysteem
 * naast het bestaande.
 */
export type ScheduledDomainEvent = {
  /** Wanneer het event afgevuurd moet worden (absoluut ISO-8601 instant). */
  dueAt: string;
  event: CommunicationEvent;
  /** Stabiele sleutel, zodat opnieuw inplannen geen tweede taak oplevert. */
  scheduleKey: string;
};

export interface CommunicationScheduler {
  schedule(item: ScheduledDomainEvent): Promise<{ scheduled: boolean; reason?: string }>;
  cancel(scheduleKey: string): Promise<{ cancelled: boolean; reason?: string }>;
}

/**
 * Standaardimplementatie zolang er geen planner draait. Weigert expliciet in
 * plaats van stilzwijgend te slagen: een gepland bericht dat nergens landt is
 * een stille storing.
 */
export const unavailableScheduler: CommunicationScheduler = {
  async schedule() {
    return { scheduled: false, reason: "scheduler_not_configured" };
  },
  async cancel() {
    return { cancelled: false, reason: "scheduler_not_configured" };
  },
};
