// ─────────────────────────────────────────────────────────────────────────────
// Pure helper: zet een door de klant gekozen ritdatum + -tijd (Nederlandse
// wandkloktijd) om naar een absoluut UTC-instant (ISO-8601 "Z"), zodat de Routes
// API v2 een eenduidig `departureTime` krijgt.
//
// De boekingsformulieren tonen lokale tijd (Europe/Amsterdam). De server draait op
// Vercel doorgaans in UTC; `new Date("2026-08-10T14:30")` zou daar 14:30 UTC
// betekenen i.p.v. 14:30 Amsterdam. Daarom rekenen we de offset expliciet uit met
// Intl (DST-correct: 's winters UTC+1, 's zomers UTC+2).
// ─────────────────────────────────────────────────────────────────────────────

const TZ = "Europe/Amsterdam";

/** Offset (ms) van Europe/Amsterdam t.o.v. UTC op een gegeven instant: local − utc. */
function tzOffsetMs(instant: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(instant);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second")
  );
  return asUtc - instant.getTime();
}

/**
 * Nachttarief-venster: is de (Amsterdamse) ophaaltijd tussen 23:00 en 06:00?
 * Inclusief 23:00, exclusief 06:00 — dus [23:00, 06:00). Pure functie op een
 * absoluut instant; leest de LOKALE uur-component in Europe/Amsterdam (DST-correct).
 * Retourneert false bij een ongeldig instant (fail-open: geen toeslag bij twijfel).
 */
export function isNightTariff(departureIso: string | null | undefined): boolean {
  if (!departureIso) return false;
  const d = new Date(departureIso);
  if (Number.isNaN(d.getTime())) return false;
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hourCycle: "h23",
    hour: "2-digit",
  }).formatToParts(d);
  const hour = Number(parts.find((p) => p.type === "hour")?.value);
  if (Number.isNaN(hour)) return false;
  return hour >= 23 || hour < 6;
}

/**
 * Zet `date` ("YYYY-MM-DD") + `time` ("HH:MM") als Amsterdamse wandkloktijd om naar
 * een UTC ISO-8601-instant. Retourneert `null` bij een ongeldig formaat of een
 * onbestaande datum/tijd. Ook een niet-bestaande lokale tijd tijdens de overgang
 * naar zomertijd (bijvoorbeeld 02:30 op de spring-forward-dag) wordt geweigerd.
 */
export function amsterdamDepartureIso(date: string, time: string): string | null {
  const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec((date ?? "").trim());
  const t = /^(\d{2}):(\d{2})$/.exec((time ?? "").trim());
  if (!d || !t) return null;

  const year = Number(d[1]);
  const month = Number(d[2]);
  const day = Number(d[3]);
  const hour = Number(t[1]);
  const minute = Number(t[2]);
  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    return null;
  }

  // Date.UTC rolt ongeldige kalenderdatums stil door (31 februari → maart).
  // Vergelijk de componenten daarom expliciet voordat er een tijdzonecorrectie
  // plaatsvindt.
  const calendarProbe = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarProbe.getUTCFullYear() !== year ||
    calendarProbe.getUTCMonth() !== month - 1 ||
    calendarProbe.getUTCDate() !== day
  ) {
    return null;
  }

  // Neem de wandkloktijd eerst als UTC en corrigeer iteratief met de lokale offset.
  // Rond een DST-wissel kan de offset op de eerste gok afwijken van de offset op
  // het uiteindelijke instant.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);
  let candidateMs = guessUtc - tzOffsetMs(new Date(guessUtc));
  candidateMs = guessUtc - tzOffsetMs(new Date(candidateMs));
  const result = new Date(candidateMs);
  if (Number.isNaN(result.getTime())) return null;

  // Fail closed als de gekozen Amsterdamse wandkloktijd niet bestaat. Bij de
  // najaarswissel bestaan sommige tijden tweemaal; één van beide instants is dan
  // geldig en levert exact dezelfde lokale componenten op.
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(result);
  const local = (type: Intl.DateTimeFormatPartTypes) =>
    Number(parts.find((part) => part.type === type)?.value);
  if (
    local("year") !== year ||
    local("month") !== month ||
    local("day") !== day ||
    local("hour") !== hour ||
    local("minute") !== minute
  ) {
    return null;
  }
  return result.toISOString();
}
