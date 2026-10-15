import type { SchipholHealth } from "./types";

/**
 * Korte in-memory cache voor de Schiphol-health-check (F-41).
 *
 * Eén upstream-opvraag per TTL per warme instance, ongeacht het aantal bezoekers
 * of IP's; gelijktijdige aanvragen delen dezelfde lopende opvraag. Elke uitkomst
 * (ook een fout) wordt even lang bewaard, zodat een storing het quotum niet alsnog
 * leegtrekt. Per instance (F-37): over instances heen is het maximaal één opvraag
 * per TTL per instance.
 */
export const HEALTH_CACHE_TTL_MS = 60_000;

type Entry = { expiresAt: number; value: Promise<SchipholHealth> };
let entry: Entry | null = null;

export function cachedSchipholHealth(
  check: () => Promise<SchipholHealth>,
  now: number = Date.now()
): Promise<SchipholHealth> {
  if (entry && now < entry.expiresAt) return entry.value;
  const value = check().catch((error: unknown) => {
    // Een gegooide fout niet cachen: de volgende aanvraag mag opnieuw proberen.
    entry = null;
    throw error;
  });
  entry = { expiresAt: now + HEALTH_CACHE_TTL_MS, value };
  return value;
}

/** Alleen voor tests. */
export function resetSchipholHealthCache(): void {
  entry = null;
}
