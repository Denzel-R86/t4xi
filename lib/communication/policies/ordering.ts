/**
 * Volgordepolicy.
 *
 * Voor sommige events mag de klant pas iets horen nadat de interne registratie
 * is gelukt. Een aanvraag is daar het duidelijkste geval: een bezoeker die "we
 * hebben je aanvraag ontvangen" leest terwijl operations die aanvraag nooit
 * kreeg, is erger dan een zichtbare foutmelding.
 *
 * Bij een boeking geldt dat níet: die staat al in de database voordat er
 * gecommuniceerd wordt. Klant- en ops-bericht mogen daar gewoon naast elkaar,
 * precies zoals vóór de orchestrator.
 */

import type { CommunicationEventType } from "@/lib/communication/events";

const OPERATIONS_GATES_CUSTOMER: readonly CommunicationEventType[] = ["lead.received"];

export function operationsGatesCustomer(eventType: CommunicationEventType): boolean {
  return OPERATIONS_GATES_CUSTOMER.includes(eventType);
}
