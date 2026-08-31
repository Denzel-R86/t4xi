/**
 * Operationele alerts voor de communicatielaag.
 *
 * Er draait geen Sentry of alerting-dienst in dit project. Wat er wél is, is
 * Vercel-logging — daarom één herkenbaar prefix waarop een log drain of
 * log-alert kan filteren. Elke regel die hier uitkomt betekent dat er een
 * bericht NIET is verstuurd of niet te dedupliceren viel; dat mag nooit stil
 * in de ruis verdwijnen.
 *
 * Bewust geen boekingsinhoud in de tekst: alleen code, sleutel en oorzaak.
 */

export const ALERT_PREFIX = "[ALERT][communication]";

export type AlertCode =
  | "idempotency_store_unavailable"
  | "idempotency_store_missing"
  | "schema_regression"
  | "delivery_blocked"
  | "delivery_unlogged"
  | "settle_failed";

export function operationalAlert(code: AlertCode, detail: string): void {
  console.error(`${ALERT_PREFIX} ${code} — ${detail}`);
}
