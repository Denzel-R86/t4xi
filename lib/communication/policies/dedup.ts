/**
 * Deduplicatiepolicy.
 *
 * De sleutel is opzettelijk afgeleid uit stabiele domeinidentiteit en niet uit
 * tijd of inhoud: hetzelfde event voor dezelfde ontvangergroep op hetzelfde
 * kanaal levert altijd dezelfde sleutel. Een Vercel-retry, een dubbel afgeleverd
 * Stripe-event of twee keer op dezelfde dashboardknop drukken kan daardoor nooit
 * betekenen dat een klant hetzelfde bericht twee keer krijgt.
 *
 * De sleutel wordt in de database geclaimd (unieke index) vóór het verzenden,
 * dus de garantie ligt niet bij deze functie maar bij de constraint.
 */

import type { Audience, CommunicationEventType } from "@/lib/communication/events";
import type { ChannelId } from "@/lib/communication/policies/channel";

export function dedupKey(input: {
  eventType: CommunicationEventType;
  subjectId: string;
  audience: Audience;
  channel: ChannelId;
}): string {
  return [input.eventType, input.subjectId, input.audience, input.channel].join(":");
}

/**
 * Kan er voor dit event überhaupt een duplicaat ontstaan?
 *
 * Bepalend is of de `subjectId` stabiel is over pogingen heen. Een boekings-
 * referentie en een factuurnummer zijn dat: dezelfde retry levert dezelfde
 * sleutel, dus zonder store kan hetzelfde bericht twee keer uitgaan.
 *
 * Bij een aanvraag is de `subjectId` een verse UUID per request. Twee inzendingen
 * zijn per definitie twee verschillende aanvragen en botsen nooit op één sleutel.
 * Daar valt dus niets te beschermen — en dan zou verzending blokkeren bij een
 * databasestoring alleen maar aanvragen kosten zonder enig duplicaat te voorkomen.
 */
export function duplicatesArePossible(eventType: CommunicationEventType): boolean {
  return eventType !== "lead.received";
}
