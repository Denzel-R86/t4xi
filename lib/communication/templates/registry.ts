/**
 * Templateregister — één plek die zegt welk bericht bij welk event hoort.
 *
 * De bestaande renderers zijn bewust hergebruikt en niet herschreven: de
 * migratie naar de orchestrator mag niets aan de inhoud van klantcommunicatie
 * veranderen. Wat verandert is uitsluitend wie ze aanroept.
 *
 * Een event zonder template is geen fout maar een lege plek in de lifecycle.
 * De orchestrator legt dat vast als `skipped` met reden `no_template`, zodat het
 * log precies laat zien welke momenten nog geen communicatie hebben.
 */

import { renderBookingConfirmationPdf } from "@/lib/documents/booking-confirmation-pdf";
import { renderInvoiceEmail } from "@/lib/invoices/invoice-email";
import { renderBookingEmails } from "@/lib/notifications/booking-email";
import { renderLeadAck, renderLeadEmail } from "@/lib/notifications/lead-email";
import type { Audience, CommunicationEvent } from "@/lib/communication/events";
import { opsAddress } from "@/lib/communication/templates/brand";

export type RenderedMessage = {
  templateId: string;
  to: string;
  replyTo?: string;
  subject: string;
  html: string;
  text: string;
  attachments?: Array<{ filename: string; content: string }>;
};

/**
 * Rendert het bericht voor één event en ontvangergroep, of `null` wanneer er
 * (nog) geen template voor bestaat.
 */
export function renderTemplate(
  event: CommunicationEvent,
  audience: Audience,
  now: Date = new Date()
): RenderedMessage | null {
  const ops = opsAddress();

  if (event.type === "lead.received") {
    if (audience === "operations") {
      const mail = renderLeadEmail(event.lead);
      return {
        templateId: "lead-received",
        to: ops,
        replyTo: event.lead.email,
        subject: mail.subject,
        html: mail.html,
        text: mail.text,
      };
    }
    const mail = renderLeadAck(event.lead);
    return {
      templateId: "lead-acknowledged",
      to: event.lead.email,
      replyTo: ops,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    };
  }

  if (event.type === "booking.created") {
    const mail = renderBookingEmails(event.booking, now);
    if (audience === "operations") {
      return {
        templateId: "booking-received-ops",
        to: ops,
        replyTo: ops,
        subject: mail.opsSubject,
        html: mail.opsHtml,
        text: mail.opsText,
      };
    }
    return {
      templateId: "booking-confirmed",
      to: event.booking.customerEmail,
      replyTo: ops,
      subject: mail.customerSubject,
      html: mail.customerHtml,
      text: mail.customerText,
      attachments: [
        {
          filename: `boekingsbevestiging-${event.booking.bookingRef}.pdf`,
          content: Buffer.from(renderBookingConfirmationPdf(event.booking)).toString("base64"),
        },
      ],
    };
  }

  if (event.type === "invoice.issued") {
    if (audience !== "customer") return null;
    const mail = renderInvoiceEmail(event.invoice);
    return {
      templateId: "invoice",
      to: event.invoice.customerEmail,
      replyTo: ops,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
      attachments: [
        { filename: `factuur-${event.invoice.invoiceNumber}.pdf`, content: event.pdfBase64 },
      ],
    };
  }

  // Lifecycle-events (quoted, confirmed, driver_assigned, in_progress,
  // completed, cancelled) hebben nog geen template. Ze stromen wél door de
  // orchestrator en komen in het log terecht, zodat zichtbaar is welke
  // klantmomenten nog ontbreken — zonder alvast iets te beloven.
  return null;
}
