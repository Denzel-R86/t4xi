/**
 * Ontvangerspolicy — vangrail tegen echte mail vanuit een testomgeving.
 *
 * Tot 2026-09-07 stond `RESEND_FROM` lokaal op de Resend-sandboxafzender. Die
 * werkte als onbedoelde beveiliging: Resend levert daarmee uitsluitend aan het
 * adres van de accounteigenaar, dus een test kon geen echte klant bereiken.
 * Sinds die afzender gelijkgetrokken is met productie, is die vangrail weg —
 * één verkeerd testadres verstuurt nu een geloofwaardige T4XI-mail naar een
 * echte ontvanger.
 *
 * Deze policy vervangt dat toeval door een expliciete regel: **buiten productie
 * geldt default-deny.** Ontbreekt de allowlist of is hij leeg, dan gaat er niets
 * uit. Een blokkade is nadrukkelijk géén `skipped` — dat is de stand voor een
 * bewust inactief kanaal en leest als "in orde". Een geweigerde ontvanger is een
 * incident en hoort als zodanig gerapporteerd te worden.
 *
 * In productie verandert er niets: daar wordt nooit geblokkeerd.
 */

import { getAppEnv, type EnvLike } from "@/lib/config/environment";

export const ALLOWLIST_ENV = "COMMUNICATION_RECIPIENT_ALLOWLIST";

/**
 * Resend-simulatoradressen. Die bereiken per definitie geen mens en worden
 * actief gebruikt om het delivered- en bouncepad te bewijzen, dus ze staan
 * altijd toe — ook zonder allowlist.
 */
export const SIMULATOR_RECIPIENTS: readonly string[] = [
  "delivered@resend.dev",
  "bounced@resend.dev",
  "complained@resend.dev",
];

/**
 * Normaliseert een ontvanger tot een vergelijkbaar adres. Haalt een eventuele
 * weergavenaam weg ("T4XI <a@b.nl>" → "a@b.nl") en maakt hoofdletters en
 * witruimte irrelevant, zodat `A@B.NL ` niet langs een allowlist met `a@b.nl`
 * kan glippen.
 */
export function normalizeRecipient(value: string): string {
  const raw = typeof value === "string" ? value : "";
  const angled = /<([^>]*)>/.exec(raw);
  return (angled ? angled[1] : raw).trim().toLowerCase();
}

/** Splitst één ontvangerveld op komma's/puntkomma's; lege delen vallen weg. */
export function splitRecipients(value: string | readonly string[]): string[] {
  const parts = Array.isArray(value) ? value : String(value ?? "").split(/[,;]/);
  return parts.flatMap((part) => {
    const normalized = normalizeRecipient(String(part));
    return normalized ? [normalized] : [];
  });
}

export function parseAllowlist(raw: string | undefined): Set<string> {
  const entries = String(raw ?? "")
    .split(/[,;\s]+/)
    .map(normalizeRecipient)
    .filter(Boolean);
  return new Set(entries);
}

export type RecipientDecision =
  | { allowed: true }
  | {
      allowed: false;
      /** `allowlist_empty` = niets geconfigureerd; `not_allowlisted` = adres staat er niet in. */
      reason: "allowlist_empty" | "not_allowlisted";
      /** De ontvanger(s) die de blokkade veroorzaakten. */
      blocked: string[];
    };

/**
 * Beoordeelt álle ontvangers vóór verzending. Eén niet-toegestaan adres
 * blokkeert het hele bericht: een bericht deels versturen zou betekenen dat een
 * onbedoelde ontvanger hem alsnog krijgt.
 *
 * De omgeving komt uit `getAppEnv()` en nooit rechtstreeks uit `NODE_ENV`; een
 * onbekende waarde valt daar veilig terug op non-productie, dus op deny.
 */
export function checkRecipients(
  recipients: string | readonly string[],
  env: EnvLike = process.env
): RecipientDecision {
  if (getAppEnv(env) === "production") return { allowed: true };

  const targets = splitRecipients(recipients);
  if (targets.length === 0) return { allowed: true };

  const allowed = parseAllowlist(env[ALLOWLIST_ENV]);
  for (const simulator of SIMULATOR_RECIPIENTS) allowed.add(simulator);

  const configured = parseAllowlist(env[ALLOWLIST_ENV]).size > 0;
  const blocked = targets.filter((target) => !allowed.has(target));
  if (blocked.length === 0) return { allowed: true };

  return {
    allowed: false,
    reason: configured ? "not_allowlisted" : "allowlist_empty",
    blocked,
  };
}
