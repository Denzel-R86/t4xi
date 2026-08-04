/**
 * Pure hulpfuncties voor de routezoeker op /tarieven.
 *
 * GEEN PRIJSLOGICA. De prijs komt uitsluitend van de autoritatieve Pricing
 * Engine (/api/pricing/quote → calculateBookingPrice → fixed_route_prices) en
 * wordt bij het boeken server-side opnieuw gevalideerd. Deze module bouwt alleen
 * links en teksten en formatteert reeds bevestigde waarden. Alles is puur en
 * apart getest (route-finder.test.ts).
 */

/** Eén ingevoerde tussenstop. `waitRequested` = extra wachttijd aangevraagd. */
export type StopInput = {
  label: string;
  waitRequested: boolean;
};

export type RouteFinderTrip = {
  pickup: string;
  dropoff: string;
  stops: StopInput[];
  returnTrip: boolean;
  passengers: number;
  bigLuggage: number;
  handLuggage: number;
  date?: string;
  time?: string;
  returnDate?: string;
  returnTime?: string;
  flightNumber?: string;
};

/** De vijf Schiphol-SEO-landingspagina's, per genormaliseerde stadsnaam. */
const SCHIPHOL_ROUTES: { keyword: string; slug: string; naam: string }[] = [
  { keyword: "amsterdam", slug: "taxi-amsterdam-schiphol", naam: "Amsterdam" },
  { keyword: "almere", slug: "taxi-almere-schiphol", naam: "Almere" },
  { keyword: "rotterdam", slug: "taxi-rotterdam-schiphol", naam: "Rotterdam" },
  { keyword: "den haag", slug: "taxi-den-haag-schiphol", naam: "Den Haag" },
  { keyword: "'s-gravenhage", slug: "taxi-den-haag-schiphol", naam: "Den Haag" },
  { keyword: "utrecht", slug: "taxi-utrecht-schiphol", naam: "Utrecht" },
];

const normalize = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/**
 * Koppelt een vrij ingevoerd ophaaladres aan één van de vijf Schiphol-routepagina's
 * — puur voor de secundaire "Bekijk {stad}–Schiphol"-link. NAVIGATIE, geen prijs:
 * een keyword-match volstaat hier, de prijs blijft van de engine komen.
 */
export function matchSchipholRoute(pickup: string): { slug: string; naam: string } | null {
  const p = normalize(pickup);
  for (const r of SCHIPHOL_ROUTES) {
    if (p.includes(r.keyword)) return { slug: r.slug, naam: r.naam };
  }
  return null;
}

/**
 * Deep-link naar /boeken met de reeds ingevulde ritgegevens. De server
 * herberekent de prijs altijd opnieuw — deze parameters zijn prefill, geen
 * prijsbron. Alleen zonder tussenstops te gebruiken: /boeken kent geen
 * tussenstops, dus die route loopt via een offerteaanvraag.
 */
export function buildBookingHref(trip: {
  pickup: string;
  dropoff: string;
  returnTrip?: boolean;
  passengers?: number;
}): string {
  const q = new URLSearchParams();
  q.set("pickup", trip.pickup);
  q.set("dropoff", trip.dropoff);
  if (trip.returnTrip) q.set("retour", "1");
  if (trip.passengers && trip.passengers > 1) q.set("persons", String(trip.passengers));
  return `/boeken?${q.toString()}`;
}

/** Volledige route als leesbare tekst: "A → tussenstop → B". */
export function routeSummary(pickup: string, stops: StopInput[], dropoff: string): string {
  return [pickup, ...stops.map((s) => s.label), dropoff]
    .map((s) => s.trim())
    .filter(Boolean)
    .join(" → ");
}

/**
 * Vrije, door de gebruiker zélf geïnitieerde offerteaanvraag (WhatsApp/e-mail).
 * Dit is geen analytics-log maar een bericht dat de klant bewust verstuurt, dus
 * de route en ritdetails mogen erin — ze zijn nodig om een prijs te maken.
 */
export function buildQuoteRequestText(trip: RouteFinderTrip): string {
  const lines: string[] = ["Hallo T4XI, ik wil graag een vaste prijs voor deze rit:"];
  lines.push(`Route: ${routeSummary(trip.pickup, trip.stops, trip.dropoff)}`);
  lines.push(`Type: ${trip.returnTrip ? "retour" : "enkele reis"}`);
  if (trip.date) lines.push(`Datum: ${trip.date}${trip.time ? ` ${trip.time}` : ""}`);
  if (trip.returnTrip && trip.returnDate) {
    lines.push(`Retour: ${trip.returnDate}${trip.returnTime ? ` ${trip.returnTime}` : ""}`);
  }
  lines.push(`Passagiers: ${trip.passengers}`);
  lines.push(`Bagage: ${trip.bigLuggage} grote koffers, ${trip.handLuggage} handbagage`);
  if (trip.flightNumber) lines.push(`Vluchtnummer: ${trip.flightNumber}`);
  if (trip.stops.some((s) => s.waitRequested)) lines.push("Graag extra wachttijd bij een tussenstop.");
  return lines.join("\n");
}

const WHATSAPP_NUMBER = "31634744522";

export function buildWhatsappHref(text: string): string {
  return `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(text)}`;
}

export function buildMailtoHref(subject: string, body: string): string {
  return `mailto:info@t4xi.nl?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** "75 min" → "1 u 15 min"; ≤60 blijft in minuten. */
export function formatDuration(minutes: number): string {
  if (!Number.isFinite(minutes) || minutes <= 0) return "";
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} u` : `${h} u ${m} min`;
}
