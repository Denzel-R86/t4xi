/**
 * Kanaalpolicy.
 *
 * Het datamodel kent vier kanalen. Alleen `email` en `internal` dispatchen op
 * dit moment daadwerkelijk. `whatsapp` en `sms` zijn bewust wél gemodelleerd
 * maar níet actief: het activeren daarvan brengt providerkeuze, templategoed-
 * keuring, opt-in/consent, kosten en eigen delivery-semantiek met zich mee, en
 * dat hoort niet bij een lifecycle die nog moet stabiliseren.
 *
 * Een inactief kanaal is geen fout. De orchestrator legt zo'n bericht vast als
 * `skipped` met reden `channel_inactive`, zodat later precies te zien is welke
 * berichten via WhatsApp hadden moeten lopen.
 */

import type { Audience, CommunicationEventType } from "@/lib/communication/events";

export const CHANNELS = ["email", "whatsapp", "sms", "internal"] as const;
export type ChannelId = (typeof CHANNELS)[number];

export const ACTIVE_CHANNELS: readonly ChannelId[] = ["email", "internal"];

export function isChannelActive(channel: ChannelId): boolean {
  return ACTIVE_CHANNELS.includes(channel);
}

/**
 * Welke kanalen bij een event en ontvangergroep horen, in volgorde van voorkeur.
 * Operationele berichten (onderweg, aankomst) horen op termijn via WhatsApp te
 * gaan — een klant die buiten bij Schiphol staat hoort niet afhankelijk te zijn
 * van het openen van een e-mail. Die intentie staat hier al vast; het kanaal
 * dispatcht pas zodra het actief wordt gezet.
 */
const ROUTES: Partial<Record<CommunicationEventType, Partial<Record<Audience, readonly ChannelId[]>>>> = {
  "lead.received": { customer: ["email"], operations: ["internal"] },
  "booking.created": { customer: ["email"], operations: ["internal"] },
  "invoice.issued": { customer: ["email"] },
  "booking.driver_assigned": { customer: ["whatsapp", "email"] },
  "booking.in_progress": { customer: ["whatsapp"] },
};

export function channelsFor(
  event: CommunicationEventType,
  audience: Audience
): readonly ChannelId[] {
  return ROUTES[event]?.[audience] ?? [];
}
