import { timingSafeEqual } from "node:crypto";

/**
 * Verificatieverkeer herkennen zonder de prijs te kunnen raken.
 *
 * WAAROM. Een verificatieronde via de echte publieke route levert observaties
 * met `is_synthetic = false` op, die als echt klantbewijs voor Gate 6.4
 * meetellen. Tot nu toe werd dat achteraf gecorrigeerd met een handmatige
 * lijst quote-id's (`event-shadow-test-traffic.ts`). Deze module maakt dat
 * vooraf mogelijk.
 *
 * WAT DE VLAG WEL EN NIET DOET. Een geldige header zet uitsluitend
 * `markObservationsSynthetic` op de engine-aanroep. Dat raakt alleen
 * `pricing_event_shadow_logs.is_synthetic`. De vlag kan de klantprijs niet
 * beïnvloeden: `observeEventFees` loopt ná de snapshotopbouw en `chargeable`
 * hangt uitsluitend aan `mode === "live"`. Er is geen pad van deze vlag naar
 * een bedrag, en een test bewijst dat de prijs met en zonder header identiek is.
 *
 * WAAROM DIT GEEN ACHTERDEUR IS. De functie is standaard UIT: zonder
 * `VERIFICATION_TOKEN` in de omgeving wordt de header volledig genegeerd, en de
 * route gedraagt zich exact zoals daarvoor. Met token kan een houder alleen zijn
 * EIGEN observatie uit een interne meting houden — niet goedkoper rijden, en niet
 * de observatie van een ander aanmerken, want de vlag geldt per aanroep. Het
 * zwaarste restrisico is dus dat iemand met het token zijn eigen verkeer
 * onzichtbaar maakt voor Gate 6.4; dat is een intern meetbelang, geen
 * klant- of geldbelang.
 *
 * WAT DIT NIET OPLOST — DE FUNNEL. De vlag raakt uitsluitend de observatielog
 * van het evenemententarief. De aanvraaglog `pricing_quote_logs` wordt NIET
 * gecorrigeerd: die tabel heeft geen enkele kolom die herkomst vastlegt (geen
 * synthetic, geen bron, geen user-agent), en `request_payload` bevat alleen
 * pickup, dropoff, bagage, passagiers, retour en voertuigklasse. Verificatie-
 * verkeer telt daar dus gewoon mee als prijsaanvraag.
 *
 * Dat is niet theoretisch: de funnel is extreem dun — op veel dagen nul echte
 * aanvragen — zodat een reeks machinale aanvragen op één ochtend de
 * conversiecijfers zichtbaar vertekent. Eén consistente classificatie die ook de
 * funnelrapportage dekt is bewust BUITEN de scope van deze module gehouden; dat
 * vraagt schema- en analyticswijzigingen met behoud van historische gegevens, en
 * hoort in een eigen PR. Tot die er is: lees funnelcijfers rond een
 * verificatieronde met dit voorbehoud.
 *
 * ZWAK TOKEN = UIT. Een te kort token wordt geweigerd en laat de functie uit
 * staan, zodat een slordig gezette variabele geen zwakke schakel wordt.
 */

/** De header die verificatieverkeer aanmerkt. */
export const VERIFICATION_HEADER = "x-t4xi-verification";

/**
 * Ondergrens voor het token. Korter dan dit is de functie UIT: een raadbaar
 * token zou de uitsluiting voor iedereen openzetten.
 */
export const MIN_VERIFICATION_TOKEN_LENGTH = 32;

/** Constant-time vergelijking; lengteverschil faalt zonder te gooien. */
function secretsMatch(a: string, b: string): boolean {
  const ba = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ba.length !== bb.length) return false;
  return timingSafeEqual(ba, bb);
}

/**
 * Is dit een aanroep die als verificatieverkeer geclassificeerd mag worden?
 *
 * Faalt dicht: bij twijfel, een ontbrekend of te kort token, of een ontbrekende
 * header is het antwoord `false` en telt de observatie gewoon mee. Een observatie
 * ten onrechte MEEtellen is conservatief; ten onrechte wegfilteren niet.
 */
export function isVerificationRequest(
  headers: Pick<Headers, "get">,
  env: Readonly<Record<string, string | undefined>> = process.env
): boolean {
  const token = (env.VERIFICATION_TOKEN ?? "").trim();
  if (token.length < MIN_VERIFICATION_TOKEN_LENGTH) return false;

  const provided = (headers.get(VERIFICATION_HEADER) ?? "").trim();
  if (provided.length === 0) return false;

  return secretsMatch(provided, token);
}
