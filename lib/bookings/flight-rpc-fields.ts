/**
 * Vluchtvelden voor `create_booking` / `create_booking_from_snapshot`.
 *
 * De database weigert een vluchtrichting zonder vluchtnummer
 * (`Vluchtrichting zonder vluchtnummer`, zie migratie 20260808103643). Sinds #27
 * is het vluchtnummer bij een vertrek naar de luchthaven optioneel; de route
 * stuurde de richting toch mee, waardoor zo'n boeking met een serverfout faalde.
 * Zonder vluchtnummer gaat de richting daarom niet mee naar de RPC. De
 * luchthavencontext voor notificaties en vluchtmonitoring blijft ongewijzigd.
 */
import type { FlightDirection } from "@/lib/pricing/service";

export function flightRpcFields(
  flightNumber: string,
  direction: FlightDirection | null
): { p_flight_number: string | null; p_flight_direction: FlightDirection | null } {
  const number = flightNumber.trim() === "" ? null : flightNumber;
  return { p_flight_number: number, p_flight_direction: number ? direction : null };
}
