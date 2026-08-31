/**
 * Domeinevents — de enige invoer van de Communication Orchestrator.
 *
 * Een event beschrijft wat er in het domein is gebeurd, niet welk bericht er
 * moet uitgaan. Welke ontvanger, welk kanaal, welke taal en welke template
 * daarbij horen bepalen de policies; het event weet daar niets van.
 *
 * De payload leeft alleen tijdens de verwerking. In `communication_deliveries`
 * belandt uitsluitend het eventtype en de identificatie — nooit adressen,
 * prijzen, vluchtgegevens of berichttekst.
 */

import type { Locale } from "@/i18n/routing";
import type { BookingEmailData } from "@/lib/notifications/booking-email";
import type { LeadEmailData } from "@/lib/notifications/lead-email";
import type { InvoiceData } from "@/lib/invoices/invoice-pdf";

/** Waar het event over gaat; bepaalt hoe het log gegroepeerd wordt. */
export type SubjectType = "booking" | "lead" | "invoice";

export type CommunicationEventType =
  | "lead.received"
  | "booking.created"
  | "booking.quoted"
  | "booking.confirmed"
  | "booking.driver_assigned"
  | "booking.in_progress"
  | "booking.completed"
  | "booking.cancelled"
  | "invoice.issued";

type EventBase = {
  subjectType: SubjectType;
  /** Stabiele, mensleesbare sleutel: boekingsreferentie, lead-id, factuurnummer. */
  subjectId: string;
  /** Database-id van de boeking, voor zover die er is. Voedt de log-koppeling. */
  bookingId: string | null;
  /** Taal van de klant; interne berichten blijven altijd Nederlands. */
  locale: Locale;
};

export type CommunicationEvent =
  | (EventBase & { type: "lead.received"; subjectType: "lead"; lead: LeadEmailData })
  | (EventBase & { type: "booking.created"; subjectType: "booking"; booking: BookingEmailData })
  | (EventBase & {
      type: "invoice.issued";
      subjectType: "invoice";
      invoice: InvoiceData;
      /** Al gerenderde PDF (base64); de orchestrator maakt zelf geen documenten. */
      pdfBase64: string;
    })
  | (EventBase & {
      type:
        | "booking.quoted"
        | "booking.confirmed"
        | "booking.driver_assigned"
        | "booking.in_progress"
        | "booking.completed"
        | "booking.cancelled";
      subjectType: "booking";
      bookingRef: string;
    });

/** Ontvangergroep. Bepaalt taal- en kanaalkeuze, en staat in het log. */
export type Audience = "customer" | "operations";
