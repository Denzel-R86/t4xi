/**
 * Boeking-metadata (geen pricing).
 *
 * Puur presentatie-hulp voor het boekingsformulier: het rit-type en het
 * afleiden van postcode/stad/stadsdeel uit een adresstring (de "adresdetectie"-
 * pills). Bevat GEEN prijslogica — de prijs komt uitsluitend van de
 * autoritatieve Pricing Engine via /api/pricing/quote.
 */

export type RitType = "enkel" | "retour" | "luchthaven" | "dagtocht";

// ── Vluchtnummer- en retourregels (geen pricing) ─────────────────────────────
//
// DE ENIGE plek waar het boekingsformulier, de payload-bouw en de validatie
// bepalen of een vluchtnummer verplicht/optioneel/verborgen is. De onderliggende
// luchthavencontext (pickupIsAirport/dropoffIsAirport) komt uit de autoritatieve
// Pricing Service (lib/pricing/service.ts, airportContext) — hier wordt niets
// opnieuw uit slugs of adresteksten afgeleid.

/** Zichtbaarheid/plicht van een vluchtnummerveld voor één ritdeel. */
export type FlightFieldState = "required" | "optional" | "hidden";

export type FlightFieldRules = {
  /** Heenrit-vluchtnummer. */
  outbound: FlightFieldState;
  /** Retourrit-vluchtnummer ("hidden" bij een enkele rit). */
  return: FlightFieldState;
};

/**
 * Bepaalt per ritdeel of het vluchtnummer verplicht, optioneel of verborgen is.
 *
 * Grondregel (spec): een vluchtnummer is alléén VERPLICHT wanneer de chauffeur
 * een AANKOMENDE vlucht moet monitoren — dus wanneer dat ritdeel VÁNAF een
 * luchthaven vertrekt (arrival). Náár een luchthaven toe (departure) is het veld
 * nuttig voor afstemming maar niet verplicht → "optional". Raakt dat ritdeel
 * geen luchthaven → "hidden".
 *
 * Retour keert de rit om: het retourdeel vertrekt vanaf de heen-bestemming en
 * eindigt op het heen-vertrek. Daarom:
 *   - heen verplicht   ⟺ pickup is luchthaven   (heen vertrekt vanaf luchthaven)
 *   - retour verplicht ⟺ dropoff is luchthaven  (retour vertrekt vanaf de dropoff)
 *
 * Gebaseerd op de vertrek-/bestemmingslocatie, niet op een "airport transfer"-label.
 */
export function flightFieldRules(input: {
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
  isReturn: boolean;
}): FlightFieldRules {
  const { pickupIsAirport, dropoffIsAirport, isReturn } = input;

  const outbound: FlightFieldState = pickupIsAirport
    ? "required" // heen vertrekt vanaf luchthaven → aankomst monitoren
    : dropoffIsAirport
      ? "optional" // heen gaat náár luchthaven → nuttig, niet verplicht
      : "hidden";

  let ret: FlightFieldState = "hidden";
  if (isReturn) {
    ret = dropoffIsAirport
      ? "required" // retour vertrekt vanaf luchthaven (de heen-dropoff) → aankomst monitoren
      : pickupIsAirport
        ? "optional" // retour gaat terug náár luchthaven → nuttig, niet verplicht
        : "hidden";
  }

  return { outbound, return: ret };
}

/** Vluchtrichting van een ritdeel; "arrival" = vertrekt vanaf de luchthaven. */
export type FlightDirection = "arrival" | "departure";

/**
 * Richting van het retourdeel. Het retourdeel pickt op bij de heen-dropoff:
 *   - dropoff is luchthaven → retour is een AANKOMST (arrival)
 *   - pickup is luchthaven  → retour gaat náár de luchthaven (departure)
 *   - anders                → geen luchthavendeel (null)
 */
export function returnFlightDirection(input: {
  pickupIsAirport: boolean;
  dropoffIsAirport: boolean;
}): FlightDirection | null {
  if (input.dropoffIsAirport) return "arrival";
  if (input.pickupIsAirport) return "departure";
  return null;
}

/**
 * Retour moet STRIKT later liggen dan de heenrit. Vergelijkt vaste datum+tijd-
 * strings (YYYY-MM-DD / HH:MM) op minuutniveau. Retourneert false zodra een van
 * beide onvolledig of ongeldig is — de aanroeper controleert aanwezigheid apart
 * en toont dan de juiste melding.
 */
export function isReturnAfterOutbound(
  outboundDate: string,
  outboundTime: string,
  returnDate: string,
  returnTime: string
): boolean {
  if (!outboundDate || !returnDate) return false;
  const out = Date.parse(`${outboundDate}T${(outboundTime || "00:00")}:00`);
  const ret = Date.parse(`${returnDate}T${(returnTime || "00:00")}:00`);
  if (Number.isNaN(out) || Number.isNaN(ret)) return false;
  return ret > out;
}

/** Machineleesbare validatiefout; de UI mapt dit naar een NL/EN-tekst. */
export type BookingValidationError =
  | "address"
  | "flight_outbound"
  | "return_datetime_missing"
  | "return_not_after_outbound"
  | "flight_return";

/**
 * Zuivere validatie van het boekingsformulier — dezelfde volgorde en regels die
 * de client en de server hanteren. Geeft de eerste fout terug, of null.
 */
export function validateBookingForm(input: {
  hasPickup: boolean;
  hasDropoff: boolean;
  isReturn: boolean;
  flightRules: FlightFieldRules;
  outboundFlight: string;
  returnFlight: string;
  outboundDate: string;
  outboundTime: string;
  returnDate: string;
  returnTime: string;
}): BookingValidationError | null {
  if (!input.hasPickup || !input.hasDropoff) return "address";
  if (input.flightRules.outbound === "required" && input.outboundFlight.trim() === "") {
    return "flight_outbound";
  }
  if (input.isReturn) {
    if (input.returnDate.trim() === "" || input.returnTime.trim() === "") {
      return "return_datetime_missing";
    }
    if (
      !isReturnAfterOutbound(
        input.outboundDate,
        input.outboundTime,
        input.returnDate,
        input.returnTime
      )
    ) {
      return "return_not_after_outbound";
    }
    if (input.flightRules.return === "required" && input.returnFlight.trim() === "") {
      return "flight_return";
    }
  }
  return null;
}

/** Genormaliseerde payload naar POST /api/bookings. */
export type BookingPayload = {
  rideType: RitType;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  vehicle: string;
  persons: number;
  luggage: string;
  flightNumber: string;
  /** Alleen bij retour gevuld; anders lege strings. */
  returnDate: string;
  returnTime: string;
  returnFlightNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  locale: string;
  website: string;
};

/**
 * Bouwt de booking-payload uit de formulierwaarden. Retourvelden gaan alléén mee
 * bij ritsoort "retour". Vluchtnummers worden meegestuurd zodra hun veld niet
 * verborgen is (verplicht óf optioneel) — de server leidt richting en opslag zelf
 * opnieuw af en blijft de bron van waarheid.
 */
export function buildBookingPayload(input: {
  rideType: RitType;
  pickup: string;
  dropoff: string;
  date: string;
  time: string;
  vehicle: string;
  persons: number;
  luggage: string;
  flightNumber: string;
  returnDate: string;
  returnTime: string;
  returnFlightNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  locale: string;
  website: string;
  flightRules: FlightFieldRules;
}): BookingPayload {
  const isReturn = input.rideType === "retour";
  return {
    rideType: input.rideType,
    pickup: input.pickup,
    dropoff: input.dropoff,
    date: input.date,
    time: input.time,
    vehicle: input.vehicle,
    persons: input.persons,
    luggage: input.luggage,
    flightNumber:
      input.flightRules.outbound === "hidden" ? "" : input.flightNumber.trim(),
    returnDate: isReturn ? input.returnDate : "",
    returnTime: isReturn ? input.returnTime : "",
    returnFlightNumber:
      isReturn && input.flightRules.return !== "hidden"
        ? input.returnFlightNumber.trim()
        : "",
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    customerEmail: input.customerEmail,
    locale: input.locale,
    website: input.website,
  };
}

const POSTCODE_AREAS: { re: RegExp; city: string; district: string }[] = [
  { re: /^111[78]/, city: "Schiphol", district: "Schiphol Airport" },
  { re: /^101[1-9]/, city: "Amsterdam", district: "Centrum" },
  { re: /^103[0-9]/, city: "Amsterdam", district: "Noord" },
  { re: /^108[0-9]/, city: "Amsterdam", district: "Zuidas / Zuid" },
  { re: /^10[0-9]{2}/, city: "Amsterdam", district: "Amsterdam" },
  { re: /^136[0-9]/, city: "Almere", district: "Almere Poort" },
  { re: /^131[0-9]/, city: "Almere", district: "Almere Stad" },
  { re: /^133[0-9]/, city: "Almere", district: "Almere Buiten" },
  { re: /^135[0-9]/, city: "Almere", district: "Almere Haven" },
  { re: /^13[0-9]{2}/, city: "Almere", district: "Almere" },
  { re: /^301[0-9]/, city: "Rotterdam", district: "Centrum" },
  { re: /^306[0-9]/, city: "Rotterdam", district: "Kralingen / Oost" },
  { re: /^30[0-9]{2}/, city: "Rotterdam", district: "Rotterdam" },
  { re: /^351[0-9]/, city: "Utrecht", district: "Centrum" },
  { re: /^35[0-9]{2}/, city: "Utrecht", district: "Utrecht" },
  { re: /^251[0-9]/, city: "Den Haag", district: "Centrum" },
  { re: /^25[0-9]{2}/, city: "Den Haag", district: "Den Haag" },
];

export function extractPostcode(value: string): string {
  const m = value.toUpperCase().match(/\b([1-9][0-9]{3})\s?([A-Z]{2})?\b/);
  if (!m) return "";
  return m[2] ? `${m[1]} ${m[2]}` : m[1];
}

export type AddressMeta = { postcode: string; city: string; district: string };

export function inferAddressMeta(value: string): AddressMeta {
  const lower = value.toLowerCase();
  const pc = extractPostcode(value);
  let city = "";
  let district = "";
  if (pc) {
    const area = POSTCODE_AREAS.find((a) => a.re.test(pc.replace(/\s/g, "")));
    if (area) {
      city = area.city;
      district = area.district;
    }
  }
  if (!city) {
    if (lower.includes("almere poort")) [city, district] = ["Almere", "Almere Poort"];
    else if (lower.includes("almere stad")) [city, district] = ["Almere", "Almere Stad"];
    else if (lower.includes("almere buiten")) [city, district] = ["Almere", "Almere Buiten"];
    else if (lower.includes("almere haven")) [city, district] = ["Almere", "Almere Haven"];
    else if (lower.includes("almere")) [city, district] = ["Almere", "Almere"];
    else if (lower.includes("zuidas")) [city, district] = ["Amsterdam", "Zuidas"];
    else if (lower.includes("amsterdam noord")) [city, district] = ["Amsterdam", "Amsterdam Noord"];
    else if (lower.includes("amsterdam centrum")) [city, district] = ["Amsterdam", "Centrum"];
    else if (lower.includes("amsterdam")) [city, district] = ["Amsterdam", "Amsterdam"];
    else if (lower.includes("rotterdam centrum")) [city, district] = ["Rotterdam", "Centrum"];
    else if (lower.includes("rotterdam")) [city, district] = ["Rotterdam", "Rotterdam"];
    else if (lower.includes("utrecht")) [city, district] = ["Utrecht", "Utrecht"];
    else if (lower.includes("den haag") || lower.includes("the hague"))
      [city, district] = ["Den Haag", "Den Haag"];
    else if (lower.includes("schiphol")) [city, district] = ["Schiphol", "Schiphol Airport"];
  }
  return { postcode: pc || "—", city: city || "—", district: district || "—" };
}
