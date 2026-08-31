/**
 * Retrypolicy.
 *
 * Onderscheidt tijdelijke van definitieve fouten. Een 4xx van de provider is
 * een afgewezen bericht — opnieuw proberen levert dezelfde afwijzing op en
 * verbrandt alleen quota. Een 5xx, een timeout of een netwerkfout is tijdelijk.
 *
 * Er wordt hier bewust niet automatisch herhaald binnen dezelfde request: de
 * boeking mag nooit wachten op een mailprovider. Het log houdt bij wat er open
 * staat, zodat een herstelronde later kan bepalen wat nog een kans verdient.
 */

export type FailureKind = "timeout" | "network" | "provider_4xx" | "provider_5xx" | "unknown";

export function classifyHttpStatus(status: number): FailureKind {
  if (status >= 500) return "provider_5xx";
  if (status >= 400) return "provider_4xx";
  return "unknown";
}

export function classifyError(error: unknown): FailureKind {
  if (error instanceof Error && (error.name === "TimeoutError" || error.name === "AbortError")) {
    return "timeout";
  }
  if (error instanceof TypeError) return "network";
  return "unknown";
}

export function isRetryable(kind: FailureKind): boolean {
  return kind !== "provider_4xx";
}

/** Hoeveel pogingen een bericht in totaal mag krijgen, over alle rondes heen. */
export const MAX_ATTEMPTS = 3;
