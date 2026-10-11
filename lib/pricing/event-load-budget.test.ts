// Bewaakt het laadbudget van de Event Pricing-configuratie.
//
// Waarom dit slot bestaat: op 2026-10-11 bleek `EVENT_LOAD_TIMEOUT_MS = 800`
// te krap voor een echte serverless-invocatie. Het laden kostte daar
// 538 / 766 / 919 / 950 ms — twee van de vier metingen gingen over het budget.
// Bij een overschrijding geeft de loader `null`, wordt de modus `off` en wordt
// er niets geëvalueerd of geobserveerd, zonder enig signaal. Negentien echte
// productiequotes leverden daardoor nul observaties op.
//
// Deze test pint vast dat het budget boven de gemeten werkelijkheid blijft én
// begrensd is, zodat een latere "optimalisatie" het defect niet stil herintroduceert.
import { test } from "node:test";
import assert from "node:assert/strict";

import {
  EVENT_LOAD_TIMEOUT_MS,
  EVENT_LOAD_RETRY_TIMEOUT_MS,
  EVENT_PRICING_CACHE_TTL_MS,
} from "@/lib/pricing/event-store";
import { SHADOW_LOG_TIMEOUT_MS } from "@/lib/pricing/event-shadow-log";

/** Hoogste laadtijd gemeten op een Vercel-deployment, Supabase eu-west-1. */
const GEMETEN_LAADTIJDEN_MS = [538, 766, 919, 950] as const;
const HOOGSTE_METING = Math.max(...GEMETEN_LAADTIJDEN_MS);

test("het laadbudget ligt boven de hoogste gemeten laadtijd, met marge", () => {
  assert.ok(
    EVENT_LOAD_TIMEOUT_MS > HOOGSTE_METING,
    `budget ${EVENT_LOAD_TIMEOUT_MS} ms moet boven de hoogste meting (${HOOGSTE_METING} ms) liggen`
  );
  assert.ok(
    EVENT_LOAD_TIMEOUT_MS >= HOOGSTE_METING * 2,
    `budget ${EVENT_LOAD_TIMEOUT_MS} ms geeft te weinig marge op ${HOOGSTE_METING} ms`
  );
});

test("het oude budget van 800 ms zou de helft van de metingen hebben afgekapt", () => {
  // Documenteert waarom de wijziging nodig was; faalt als iemand terugdraait.
  const afgekaptBijOud = GEMETEN_LAADTIJDEN_MS.filter((ms) => ms > 800).length;
  assert.equal(afgekaptBijOud, 2, "twee van de vier metingen lagen boven 800 ms");
  const afgekaptNu = GEMETEN_LAADTIJDEN_MS.filter((ms) => ms > EVENT_LOAD_TIMEOUT_MS).length;
  assert.equal(afgekaptNu, 0, "met het huidige budget wordt geen enkele meting afgekapt");
});

test("het budget blijft hard begrensd — geen onbeperkt wachten", () => {
  assert.ok(Number.isFinite(EVENT_LOAD_TIMEOUT_MS));
  assert.ok(
    EVENT_LOAD_TIMEOUT_MS <= 5_000,
    "een offerte mag nooit seconden wachten op configuratie die hij niet nodig heeft"
  );
});

test("de retry krijgt hetzelfde budget als de eerste poging", () => {
  assert.equal(EVENT_LOAD_RETRY_TIMEOUT_MS, EVENT_LOAD_TIMEOUT_MS);
});

test("twee pogingen passen samen binnen de cache-TTL", () => {
  // Anders kan een trage load de volgende aanvraag opnieuw koud laten beginnen.
  assert.ok(
    EVENT_LOAD_TIMEOUT_MS + EVENT_LOAD_RETRY_TIMEOUT_MS < EVENT_PRICING_CACHE_TTL_MS,
    "laden + retry moet ruim binnen de cache-TTL blijven"
  );
});

test("het laadbudget blijft ruimer dan het schrijfbudget", () => {
  // Het laden doet meerdere round trips, het schrijven één insert. Die
  // verhouding hoort te blijven; de metingen bevestigen hem (load 538–950 ms,
  // write 101–319 ms).
  assert.ok(
    EVENT_LOAD_TIMEOUT_MS > SHADOW_LOG_TIMEOUT_MS,
    "laden heeft meer round trips dan schrijven en hoort dus meer budget te hebben"
  );
});

test("het schrijfbudget is onaangeroerd gebleven", () => {
  // Expliciet vastgepind: het schrijfpad was niet de oorzaak en is niet gewijzigd.
  assert.equal(SHADOW_LOG_TIMEOUT_MS, 400);
});
