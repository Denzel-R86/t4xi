/**
 * Taakoverdracht voor operations — pure module, geen netwerk, geen env.
 *
 * Een binnenkomende boeking of aanvraag is pas "afgehandeld" als iemand weet
 * WAT er moet gebeuren, DOOR WIE en VÓÓR WANNEER. Deze module leidt die
 * takenlijst deterministisch af uit de boeking zelf, zodat de interne mail een
 * echte overdracht is in plaats van alleen een melding.
 *
 * Bewust puur: `now` is een parameter, dus de uitkomst is testbaar en de
 * renderers doen geen I/O. Er staat nooit een verzonnen status in — alleen wat
 * uit de boekingsgegevens volgt.
 */

import { amsterdamDepartureIso } from "@/lib/pricing/departure-time";
import { PALETTE, escapeHtml } from "@/lib/communication/templates/brand";
import type { BookingStatus } from "@/lib/bookings/lifecycle";

export type HandoverOwner = "Dispatch" | "Administratie";

export type HandoverTask = {
  /** Stabiele sleutel — handig in tests en later in een takenbord. */
  id: string;
  title: string;
  detail: string;
  owner: HandoverOwner;
  /** Menselijk leesbare deadline; nooit een verzonnen tijdstip. */
  due: string;
  /** Vraagt actie vóór alles wat verder in de lijst staat. */
  critical: boolean;
};

/** Hoe dringend de overdracht is, afgeleid uit de tijd tot ophalen. */
export type HandoverUrgency = "direct" | "urgent" | "gepland";

export type BookingHandoverInput = {
  bookingRef: string;
  date: string;
  time: string;
  quoteOnRequest: boolean;
  price: number | null;
  vehicle: string | null;
  persons: number;
  luggage: string | null;
  flightNumber: string | null;
  flightDirection: "arrival" | "departure" | null;
  returnDate?: string | null;
  returnTime?: string | null;
  returnFlightNumber?: string | null;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  /**
   * Stand van de boeking. De takenlijst volgt de lifecycle: wat al gebeurd is,
   * staat er niet meer als taak in. Ontbreekt de waarde, dan is dit een verse
   * aanvraag — dat is precies de stand waarin de boekingsmail verstuurd wordt.
   */
  status?: BookingStatus;
  /** Stand uit Stripe (`payment_status`). Een betaalde rit vraagt geen controle meer. */
  paymentStatus?: string;
};

export type Handover = {
  urgency: HandoverUrgency;
  /** Uren tot ophalen; null bij een onleesbare datum/tijd (fail-open). */
  hoursUntilPickup: number | null;
  tasks: HandoverTask[];
};

const { ink: INK, accent: ACCENT, muted: MUTED, border: BORDER, overlay: OVERLAY, alarm: ALARM } = PALETTE;


/**
 * Nederlands mobiel/vast nummer naar een wa.me-doel (E.164 zonder plus).
 * Retourneert null zodra het nummer niet betrouwbaar te normaliseren is; een
 * kapotte link is erger dan geen link.
 */
export function whatsappTarget(phone: string): string | null {
  const raw = (phone ?? "").replace(/[^\d+]/g, "");
  if (!raw) return null;
  if (raw.startsWith("+")) {
    const digits = raw.slice(1);
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (raw.startsWith("00")) {
    const digits = raw.slice(2);
    return digits.length >= 8 && digits.length <= 15 ? digits : null;
  }
  if (raw.startsWith("0")) return `31${raw.slice(1)}`;
  if (raw.startsWith("31")) return raw;
  return null;
}

function hoursUntil(date: string, time: string, now: Date): number | null {
  const iso = amsterdamDepartureIso(date, time);
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now.getTime();
  return Number.isNaN(ms) ? null : ms / 3_600_000;
}

function urgencyOf(hours: number | null): HandoverUrgency {
  if (hours === null) return "gepland";
  if (hours < 4) return "direct";
  if (hours < 24) return "urgent";
  return "gepland";
}

/** Prefix voor het mailonderwerp, zodat de urgentie in de inbox zichtbaar is. */
export function urgencyPrefix(urgency: HandoverUrgency): string {
  if (urgency === "direct") return "[NU] ";
  if (urgency === "urgent") return "[<24 UUR] ";
  return "";
}

function contactDue(urgency: HandoverUrgency, hours: number | null): string {
  if (urgency === "direct") {
    if (hours === null) return "Nu direct bellen";
    if (hours < 0) return "Nu direct bellen — de geplande ophaaltijd is al verstreken";
    return `Nu direct bellen — ophalen over circa ${Math.round(hours)} uur`;
  }
  if (urgency === "urgent") return "Binnen 1 uur — de rit is binnen 24 uur";
  return "Binnen 2 uur tijdens kantooruren";
}

/**
 * Bouwt de takenlijst voor één boeking. Volgorde is de werkvolgorde: eerst wat
 * de klant blokkeert, dan de uitvoering, dan de administratie.
 */
export function buildBookingHandover(
  data: BookingHandoverInput,
  now: Date = new Date()
): Handover {
  const hoursUntilPickup = hoursUntil(data.date, data.time, now);
  const urgency = urgencyOf(hoursUntilPickup);
  const status: BookingStatus = data.status ?? "inquiry";
  const paid = data.paymentStatus === "paid";
  const tasks: HandoverTask[] = [];

  // Een geannuleerde rit vraagt niets meer van dispatch. Een afgeronde rit
  // alleen nog de administratieve afhandeling; die staat onderaan.
  if (status === "cancelled") {
    return { urgency: "gepland", hoursUntilPickup, tasks };
  }

  const beforeConfirmation = status === "inquiry" || status === "quoted";
  const beforeAssignment = beforeConfirmation || status === "confirmed";
  const rideStillAhead = status !== "completed";

  if (beforeConfirmation && (data.quoteOnRequest || data.price === null)) {
    tasks.push({
        id: "quote",
        title: "Stel de prijs vast en stuur de offerte",
        detail:
          "Deze aanvraag is bevestigd zonder bindende prijs. De klant heeft nog geen bedrag " +
          "gezien: bepaal het tarief en communiceer het schriftelijk voordat de rit wordt bevestigd.",
        owner: "Administratie",
        due: "Vóór de ritbevestiging",
        critical: true,
    });
  }

  if (beforeConfirmation) {
    tasks.push({
      id: "contact",
      title: "Bevestig de rit bij de klant",
      detail:
        `Bel of WhatsApp ${data.customerName} op ${data.customerPhone}. Bevestig het exacte ` +
        "ophaaladres, de ophaaltijd en het aantal koffers, en leg de afspraak vast in de boeking.",
      owner: "Dispatch",
      due: contactDue(urgency, hoursUntilPickup),
      critical: urgency !== "gepland",
    });
  }

  if (rideStillAhead && data.flightNumber && data.flightDirection === "arrival") {
    tasks.push({
        id: "flight-arrival",
        title: `Controleer de aankomststatus van vlucht ${data.flightNumber}`,
        detail:
          "De wachttijd van 60 minuten start bij de geregistreerde landing, niet bij de geplande " +
          "aankomsttijd. Controleer de status opnieuw op de dag zelf en stem de ophaallocatie " +
          "persoonlijk af met de klant.",
        owner: "Dispatch",
        due: "Bij bevestiging én opnieuw op de dag van de rit",
        critical: false,
    });
  } else if (rideStillAhead && data.flightNumber && data.flightDirection === "departure") {
    tasks.push({
        id: "flight-departure",
        title: `Stem de ophaaltijd af op vertrekvlucht ${data.flightNumber}`,
        detail:
          "Controleer de actuele vertrektijd en of de gekozen ophaaltijd genoeg marge geeft voor " +
          "inchecken en security. Wijkt de vlucht af, stel dan zelf een nieuwe ophaaltijd voor.",
        owner: "Dispatch",
        due: "Bij bevestiging én opnieuw op de dag van de rit",
        critical: false,
    });
  }

  if (rideStillAhead && data.returnDate && data.returnTime) {
    tasks.push({
        id: "return",
        title: "Plan de retourrit in",
        detail:
          `Retour op ${data.returnDate} om ${data.returnTime}` +
          (data.returnFlightNumber ? ` bij vlucht ${data.returnFlightNumber}` : "") +
          ". Zet de retourrit als aparte opdracht in de planning, zodat hij niet aan de heenrit blijft hangen.",
        owner: "Dispatch",
        due: "Tegelijk met de heenrit inplannen",
        critical: false,
    });
  }

  if (beforeAssignment) {
    tasks.push({
      id: "assign",
      title: "Wijs chauffeur en voertuig toe",
      detail:
        `${data.persons} passagier(s), bagage: ${data.luggage || "niet opgegeven"}. ` +
        (data.vehicle
          ? `Voorkeur van de klant: ${data.vehicle}. Bevestig of dit voertuig beschikbaar is.`
          : "Geen voertuigvoorkeur opgegeven; kies op basis van passagiers en bagage."),
      owner: "Dispatch",
      due: urgency === "direct" ? "Direct" : "Uiterlijk 12 uur vóór ophalen",
      critical: false,
    });
  }

  if (!paid) {
    tasks.push({
      id: "payment",
      title: "Controleer de betaalstatus",
      detail:
        "Deze boeking is aangemaakt met status 'pending'. Controleer of de online betaling is " +
        "geslaagd; zo niet, spreek de betaalwijze expliciet af vóór aanvang van de rit.",
      owner: "Administratie",
      due: "Vóór aanvang van de rit",
      critical: false,
    });
  }

  tasks.push({
    id: "invoice",
    title: "Geef de factuur uit",
    detail:
      `Vul in /dashboard/invoices de factuurnaam, het volledige factuuradres en het uitvoerende ` +
      `taxibedrijf in voor ${data.bookingRef}. De boekingsbevestiging bij de klant is nadrukkelijk geen factuur.`,
    owner: "Administratie",
    due: "Na afronding van de rit",
    critical: false,
  });

  return { urgency, hoursUntilPickup, tasks };
}

/** Takenlijst voor een lead/aanvraag: kort, met een expliciete reactietermijn. */
export function buildLeadHandover(input: {
  leadId: string;
  subject: string;
  name: string;
  email: string;
  phone: string;
}): Handover {
  const reach = input.phone ? `${input.phone} of ${input.email}` : input.email;
  return {
    urgency: "urgent",
    hoursUntilPickup: null,
    tasks: [
      {
        id: "lead-respond",
        title: "Neem persoonlijk contact op",
        detail:
          `${input.name} heeft een automatische ontvangstbevestiging gekregen met de toezegging ` +
          `van een reactie binnen één werkdag. Reageer inhoudelijk via ${reach}.`,
        owner: "Administratie",
        due: "Binnen 1 werkdag",
        critical: true,
      },
      {
        id: "lead-qualify",
        title: "Beoordeel en leg de aanvraag vast",
        detail:
          `Aanvraag ${input.leadId} — ${input.subject}. Bepaal of dit een offerte, een ` +
          "raamafspraak of een gewone boeking wordt, en leg de uitkomst vast bij de klant.",
        owner: "Administratie",
        due: "Binnen 1 werkdag",
        critical: false,
      },
    ],
  };
}

// ── rendering ────────────────────────────────────────────────────────────────

function actionButton(href: string, label: string): string {
  return `<a href="${escapeHtml(href)}" style="display:inline-block;margin:0 8px 8px 0;padding:9px 14px;border:1px solid ${BORDER};border-radius:999px;color:${ACCENT};font-size:12px;font-weight:700;text-decoration:none;">${escapeHtml(label)}</a>`;
}

/** Snelle acties voor dispatch: bellen, WhatsApp, mailen. */
export function quickActionsHtml(contact: { phone: string; email: string }): string {
  const wa = whatsappTarget(contact.phone);
  const buttons = [
    contact.phone ? actionButton(`tel:${contact.phone.replace(/\s/g, "")}`, "Bellen") : "",
    wa ? actionButton(`https://wa.me/${wa}`, "WhatsApp") : "",
    contact.email ? actionButton(`mailto:${contact.email}`, "E-mail") : "",
  ].join("");
  return buttons ? `<div style="margin:14px 0 0;">${buttons}</div>` : "";
}

function taskRow(task: HandoverTask, index: number): string {
  const dueColor = task.critical ? ALARM : MUTED;
  return `<tr>
    <td style="padding:14px 12px 14px 0;vertical-align:top;border-top:1px solid ${BORDER};">
      <div style="width:24px;height:24px;border-radius:999px;background:${OVERLAY};color:${ACCENT};font-size:12px;font-weight:700;line-height:24px;text-align:center;">${index + 1}</div>
    </td>
    <td style="padding:14px 0;vertical-align:top;border-top:1px solid ${BORDER};">
      <div style="color:${INK};font-size:14px;font-weight:700;line-height:1.35;">${escapeHtml(task.title)}</div>
      <div style="margin:4px 0 0;color:${MUTED};font-size:12px;line-height:1.55;">${escapeHtml(task.detail)}</div>
      <div style="margin:8px 0 0;font-size:11px;font-weight:700;letter-spacing:0.4px;text-transform:uppercase;">
        <span style="color:${MUTED};">${escapeHtml(task.owner)}</span>
        <span style="color:${BORDER};">&nbsp;·&nbsp;</span>
        <span style="color:${dueColor};">${escapeHtml(task.due)}</span>
      </div>
    </td>
  </tr>`;
}

/** Overdrachtsblok voor in de interne mail. */
export function handoverHtml(
  handover: Handover,
  contact?: { phone: string; email: string }
): string {
  const rows = handover.tasks.map(taskRow).join("");
  const lead =
    handover.urgency === "direct"
      ? "Deze rit staat op het punt te beginnen of is al verstreken. Pak taak 1 nu op."
      : handover.urgency === "urgent"
        ? "Deze rit is binnen 24 uur. Bevestig vandaag nog bij de klant."
        : "Loop de taken in volgorde af en vink ze af in de planning.";
  return `
    <h2 style="font-size:14px;margin:26px 0 2px;color:${INK};">Overdracht — wat er nu moet gebeuren</h2>
    <p style="margin:0 0 6px;color:${MUTED};font-size:12px;line-height:1.5;">${escapeHtml(lead)}</p>
    <table role="presentation" style="width:100%;border-collapse:collapse;">${rows}</table>
    ${contact ? quickActionsHtml(contact) : ""}`;
}

/** Platte-tekstvariant van de overdracht, voor de text/plain-versie van de mail. */
export function handoverText(handover: Handover): string {
  const lines = handover.tasks.map(
    (task, index) =>
      `${index + 1}. ${task.title}\n   ${task.detail}\n   ${task.owner} · ${task.due}`
  );
  return ["OVERDRACHT — WAT ER NU MOET GEBEUREN", "", ...lines].join("\n");
}
