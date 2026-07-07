import type { FactorProvider } from "../types";

/** Vaste luchthaven-opslag (afgeleid van de bestaande airport_surcharge). */
export const AIRPORT_PREMIUM = 6;

export const airportFactor: FactorProvider = {
  key: "airport",
  stage: "additive",
  compute: (ctx) => {
    const isAirport =
      (ctx.pickupIsAirport ?? false) ||
      (ctx.dropoffIsAirport ?? ctx.serviceType === "airport");
    return isAirport
      ? {
          amount: AIRPORT_PREMIUM,
          confidence: 1,
          explanation: `Luchthaven-opslag €${AIRPORT_PREMIUM}`,
          dataStatus: "active",
        }
      : {
          amount: 0,
          confidence: 1,
          explanation: "Geen luchthaven-eindpunt",
          dataStatus: "active",
        };
  },
};
