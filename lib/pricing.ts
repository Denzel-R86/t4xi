/**
 * T4XI prijs-engine — 1-op-1 port van de calculator uit het
 * t4xi_v14 bronbestand (index.html). Vaste richtprijzen per route,
 * retour ×1,8, dagtocht minimaal €295 of ×4.
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

export type PriceResult = { amount: string; note: string };

export function calcPrice(
  fromRaw: string,
  toRaw: string,
  type: RitType = "enkel",
  persons = 1,
  luggage = "handbagage"
): PriceResult {
  const from = fromRaw.toLowerCase();
  const to = toRaw.toLowerCase();
  if (!from || !to) return { amount: "—", note: "Vul adressen in" };

  let price: number | null = null;
  let note = "Richtprijs op basis van vaste T4XI-tarieven";

  const isSchiphol = from.includes("schiphol") || to.includes("schiphol");
  if (isSchiphol) {
    const origin = from.includes("schiphol") ? to : from;
    if (origin.includes("almere poort")) price = 102;
    else if (origin.includes("almere buiten")) price = 110;
    else if (origin.includes("almere")) price = 104;
    else if (origin.includes("rotterdam")) price = 119;
    else if (origin.includes("utrecht")) price = 110;
    else if (origin.includes("den haag") || origin.includes("the hague")) price = 107;
    else if (origin.includes("amsterdam zuidas")) price = 50;
    else if (origin.includes("amsterdam noord")) price = 65;
    else if (origin.includes("amsterdam")) price = 57;
  }
  if (price === null) {
    if ((from.includes("almere") && to.includes("amsterdam")) || (from.includes("amsterdam") && to.includes("almere"))) price = 45;
    else if ((from.includes("rotterdam") && to.includes("amsterdam")) || (from.includes("amsterdam") && to.includes("rotterdam"))) price = 109;
    else if ((from.includes("utrecht") && to.includes("amsterdam")) || (from.includes("amsterdam") && to.includes("utrecht"))) price = 69;
    else price = 79;
  }

  if (type === "retour") price = Math.round(price * 1.8);
  if (type === "dagtocht") {
    price = Math.max(295, price * 4);
    note = "Dagtocht: definitieve prijs afhankelijk van route, uren en kilometers";
  }
  if (luggage === "overleg" || (persons >= 4 && luggage === "3-koffers")) {
    note += " · bagage eerst afstemmen";
  } else if (luggage !== "handbagage") {
    note += " · bagage meegenomen in aanvraag";
  }
  if (persons > 4) note += " · maximaal 4 passagiers exclusief chauffeur";

  return { amount: `€${price}`, note };
}
