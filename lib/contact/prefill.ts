export const PRIVATE_CONTACT_TOPICS = [
  "privateRide",
  "privateAirport",
  "privateEvent",
  "privateOther",
] as const;

export const BUSINESS_CONTACT_TOPICS = [
  "businessTransport",
  "businessAgreement",
  "businessEvent",
  "businessOther",
] as const;

export type ContactAudience = "private" | "business";
export type PrivateContactTopic = (typeof PRIVATE_CONTACT_TOPICS)[number];
export type BusinessContactTopic = (typeof BUSINESS_CONTACT_TOPICS)[number];
export type ContactTopic = PrivateContactTopic | BusinessContactTopic | "";

type SearchValue = string | string[] | undefined;

function first(value: SearchValue): string {
  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

/**
 * Laat alleen bekende formulierkeuzes vanuit de URL door. Zo kan een campagne-
 * of landingspagina het formulier gericht openen zonder willekeurige querytekst
 * in de UI of de uiteindelijke leadmail te laten belanden.
 */
export function contactPrefill(searchParams: {
  audience?: SearchValue;
  topic?: SearchValue;
}): { audience: ContactAudience; topic: ContactTopic } {
  const audience: ContactAudience = first(searchParams.audience) === "business"
    ? "business"
    : "private";
  const requestedTopic = first(searchParams.topic);
  const allowedTopics: readonly string[] = audience === "business"
    ? BUSINESS_CONTACT_TOPICS
    : PRIVATE_CONTACT_TOPICS;

  return {
    audience,
    topic: allowedTopics.includes(requestedTopic) ? requestedTopic as ContactTopic : "",
  };
}
