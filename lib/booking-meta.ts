/**
 * Boeking-metadata (geen pricing).
 *
 * Puur presentatie-hulp voor het boekingsformulier: het rit-type en het
 * afleiden van postcode/stad/stadsdeel uit een adresstring (de "adresdetectie"-
 * pills). Bevat GEEN prijslogica — de prijs komt uitsluitend van de
 * autoritatieve Pricing Engine via /api/pricing/quote.
 */

export type RitType = "enkel" | "retour" | "luchthaven" | "dagtocht";

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
