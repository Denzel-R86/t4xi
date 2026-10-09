/**
 * Experience 2.0 PR 2.4 — stappenweergave van het boekingsformulier.
 *
 * Pure helpers zonder React: de stappen Route → Rit → Gegevens → Bevestigen zijn
 * uitsluitend een WEERGAVE van één formulierstate (masterplan §3, regel 127).
 * Niets hier verandert de payload of de regels; `firstBookingFieldError` is de
 * letterlijke volgorde van de checks die `BookingSection.handleSubmit` al deed,
 * nu met het veld erbij zodat de UI daarheen kan focussen (F-13).
 */

export const BOOKING_STEPS = ["route", "rit", "gegevens", "bevestigen"] as const;
export type BookingStep = (typeof BOOKING_STEPS)[number];

export type BookingField =
  | "pickup"
  | "dropoff"
  | "date"
  | "time"
  | "returnDate"
  | "returnTime"
  | "persons"
  | "luggage"
  | "flight"
  | "returnFlight"
  | "name"
  | "phone"
  | "email";

/** DOM-id per veld. Adresvelden: id van de wrapper rond AddressAutocomplete. */
export const BOOKING_FIELD_ID: Record<BookingField, string> = {
  pickup: "f-pickup",
  dropoff: "f-dropoff",
  date: "f-date",
  time: "f-time",
  returnDate: "f-return-date",
  returnTime: "f-return-time",
  persons: "f-persons",
  luggage: "f-luggage",
  flight: "f-flight",
  returnFlight: "f-return-flight",
  name: "f-name",
  phone: "f-phone",
  email: "f-email",
};

export const BOOKING_FIELD_STEP: Record<BookingField, BookingStep> = {
  pickup: "route",
  dropoff: "route",
  date: "rit",
  time: "rit",
  returnDate: "rit",
  returnTime: "rit",
  persons: "rit",
  luggage: "rit",
  flight: "rit",
  returnFlight: "rit",
  name: "gegevens",
  phone: "gegevens",
  email: "gegevens",
};

/** Id van de foutmelding onder een veld (doel van `aria-describedby`). */
export function fieldErrorId(field: BookingField): string {
  return `${BOOKING_FIELD_ID[field]}-error`;
}

/** Omgekeerde lookup: DOM-id → veld (voor native `invalid`-events). */
export function fieldForElementId(id: string): BookingField | null {
  for (const [field, fieldId] of Object.entries(BOOKING_FIELD_ID)) {
    if (fieldId === id) return field as BookingField;
  }
  return null;
}

export function stepIndex(step: BookingStep): number {
  return BOOKING_STEPS.indexOf(step);
}

export type StepStatus = "complete" | "current" | "upcoming";

export function stepStatus(step: BookingStep, current: BookingStep): StepStatus {
  const diff = stepIndex(step) - stepIndex(current);
  return diff < 0 ? "complete" : diff === 0 ? "current" : "upcoming";
}

export function nextStep(step: BookingStep): BookingStep {
  return BOOKING_STEPS[Math.min(stepIndex(step) + 1, BOOKING_STEPS.length - 1)];
}

export function previousStep(step: BookingStep): BookingStep {
  return BOOKING_STEPS[Math.max(stepIndex(step) - 1, 0)];
}

/**
 * Startstap: een deep-link met beide adressen (hero, tariefzoeker) slaat de
 * Route-stap over — die is dan al ingevuld. Alleen weergave; geen state.
 */
export function initialBookingStep(opts: { hasPickup: boolean; hasDropoff: boolean }): BookingStep {
  return opts.hasPickup && opts.hasDropoff ? "rit" : "route";
}

/** Boodschap-sleutels uit `messages/*.json` → `booking`. Ongewijzigd t.o.v. vóór 2.4. */
export type BookingValidationKey =
  | "valAdres"
  | "valDatumTijd"
  | "valBagage"
  | "valVluchtAankomst"
  | "valRetourMoment"
  | "valVluchtRetourAankomst";

export type BookingFieldError = { field: BookingField; messageKey: BookingValidationKey };

export type BookingValidationInput = {
  hasPickup: boolean;
  hasDropoff: boolean;
  date: string;
  time: string;
  luggage: string;
  rideType: "enkel" | "retour";
  returnDate: string;
  returnTime: string;
  flightRequired: boolean;
  flightNumber: string;
  returnFlightRequired: boolean;
  returnFlightNumber: string;
  /** Toetst het volledige vertrekmoment (Europe/Amsterdam); geïnjecteerd voor tests. */
  isFutureDeparture: (date: string, time: string) => boolean;
};

/**
 * Eerste veldfout in exact de volgorde van de bestaande client-checks:
 * adres → datum/tijd → bagage → vlucht → retourmoment → retourvlucht.
 * `null` = de client-checks laten de boeking door (de server valideert altijd opnieuw).
 */
export function firstBookingFieldError(input: BookingValidationInput): BookingFieldError | null {
  if (!input.hasPickup || !input.hasDropoff) {
    return { field: input.hasPickup ? "dropoff" : "pickup", messageKey: "valAdres" };
  }
  if (!input.date || !input.time || !input.isFutureDeparture(input.date, input.time)) {
    return { field: !input.date ? "date" : !input.time ? "time" : "date", messageKey: "valDatumTijd" };
  }
  if (!input.luggage) {
    return { field: "luggage", messageKey: "valBagage" };
  }
  if (input.flightRequired && input.flightNumber.trim() === "") {
    return { field: "flight", messageKey: "valVluchtAankomst" };
  }
  if (input.rideType === "retour" && (!input.returnDate || !input.returnTime)) {
    return { field: input.returnDate ? "returnTime" : "returnDate", messageKey: "valRetourMoment" };
  }
  if (input.returnFlightRequired && input.returnFlightNumber.trim() === "") {
    return { field: "returnFlight", messageKey: "valVluchtRetourAankomst" };
  }
  return null;
}

/**
 * Stapwissel vooruit: alleen een fout in de huidige of een eerdere stap houdt
 * de klant tegen. Een fout in een latere stap komt pas aan bod als die stap
 * aan de beurt is.
 */
export function blocksStep(error: BookingFieldError | null, current: BookingStep): boolean {
  return error !== null && stepIndex(BOOKING_FIELD_STEP[error.field]) <= stepIndex(current);
}

/** Sleutels voor veldfouten die de UI zelf formuleert (native constraints en serverfouten). */
export type FieldMessageKey =
  | BookingValidationKey
  | "valVerplichtVeld"
  | "valEmail"
  | "valTelefoon"
  | "valNaam";

/**
 * Serverfouten (400 `invalid_input` uit app/api/bookings/route.ts) die bij één
 * contactveld horen. De teksten zijn letterlijk die van de server; een
 * broncode-lock in `steps.test.ts` bewaakt dat ze daar nog bestaan. Andere
 * serverfouten blijven een algemene melding.
 */
export const SERVER_FIELD_ERRORS: Record<string, { field: BookingField; messageKey: FieldMessageKey }> = {
  "Naam is verplicht.": { field: "name", messageKey: "valNaam" },
  "Geldig e-mailadres is verplicht.": { field: "email", messageKey: "valEmail" },
  "Geldig telefoonnummer is verplicht.": { field: "phone", messageKey: "valTelefoon" },
};

export function serverFieldError(
  message: unknown
): { field: BookingField; messageKey: FieldMessageKey } | null {
  return typeof message === "string" ? SERVER_FIELD_ERRORS[message] ?? null : null;
}

/**
 * Native constraint-validatie (`required`, `type=email`, `min`/`max`) → eigen
 * sleutel, of `null` = gebruik de browsertekst (`validationMessage`).
 * Alleen presentatie: de constraints zelf blijven de bestaande HTML-attributen.
 */
export function nativeValidityKey(
  validity: Pick<ValidityState, "valueMissing" | "typeMismatch">,
  field: BookingField | null
): FieldMessageKey | null {
  if (validity.valueMissing) {
    if (field === "luggage") return "valBagage";
    if (field === "date" || field === "time") return "valDatumTijd";
    if (field === "returnDate" || field === "returnTime") return "valRetourMoment";
    return "valVerplichtVeld";
  }
  if (validity.typeMismatch && field === "email") return "valEmail";
  return null;
}

/** Algemene (niet-veld)fout: soort bepaalt het icoon in de melding. */
export type GeneralErrorKind = "price" | "network" | "rate" | "server";

export function generalErrorIcon(kind: GeneralErrorKind): "info-circle" | "globe" | "clock" | "phone" {
  switch (kind) {
    case "price":
      return "info-circle";
    case "network":
      return "globe";
    case "rate":
      return "clock";
    default:
      // Serverfout: de tekst verwijst naar bellen, dus het telefoon-icoon klopt hier.
      return "phone";
  }
}
