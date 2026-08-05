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
 * Zet `date` ("YYYY-MM-DD") + `time` ("HH:MM") als Amsterdamse wandkloktijd om naar
 * een UTC ISO-8601-instant. Retourneert `null` bij een ongeldig formaat of een
 * onbestaande datum/tijd. Rondom de DST-overgang (het uur dat verspringt) kan het
 * resultaat één uur afwijken — acceptabel voor een verkeersinschatting.
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

  // Neem de wandkloktijd eerst als UTC, corrigeer dan met de tz-offset op dat moment.
  const guessUtc = Date.UTC(year, month - 1, day, hour, minute);
  const result = new Date(guessUtc - tzOffsetMs(new Date(guessUtc)));
  if (Number.isNaN(result.getTime())) return null;
  return result.toISOString();
}
