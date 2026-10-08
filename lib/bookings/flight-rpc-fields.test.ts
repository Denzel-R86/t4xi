import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { flightRpcFields } from "@/lib/bookings/flight-rpc-fields";

test("vertrek zonder vluchtnummer: geen richting naar de RPC (DB weigert richting zonder nummer)", () => {
  assert.deepEqual(flightRpcFields("", "departure"), { p_flight_number: null, p_flight_direction: null });
});

test("vertrek met vluchtnummer: nummer en richting gaan mee", () => {
  assert.deepEqual(flightRpcFields("KL1234", "departure"), { p_flight_number: "KL1234", p_flight_direction: "departure" });
});

test("aankomst met vluchtnummer blijft ongewijzigd", () => {
  assert.deepEqual(flightRpcFields("HV5131", "arrival"), { p_flight_number: "HV5131", p_flight_direction: "arrival" });
});

test("geen luchthavenrit: beide null", () => {
  assert.deepEqual(flightRpcFields("", null), { p_flight_number: null, p_flight_direction: null });
});

test("route gebruikt flightRpcFields voor beide boekings-RPC's", () => {
  const src = readFileSync("app/api/bookings/route.ts", "utf8");
  assert.equal(src.match(/\.\.\.flightRpcFields\(flightNumberToStore, flightDirection\)/g)?.length, 2);
  assert.ok(!/p_flight_direction:\s*flightDirection/.test(src), "richting mag niet los meer meegaan");
});
