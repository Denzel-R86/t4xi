/**
 * Alle Nederlandse treinstations.
 *
 * Bron: Rijden de Treinen open data (NS-brondata), dataset stations-2023-09-nl
 * (september 2023 — op moment van schrijven de nieuwste NL-stationsdownload):
 *   https://opendata.rijdendetreinen.nl/public/stations/stations-2023-09-nl.csv
 * Licentie: CC0 (publiek domein, "Creative Commons Zero").
 * 397 brondatarijen, land NL. Coördinaten komen uit die dataset; `city` is per
 * station bevestigd via PDOK reverse-geocoding (`/reverse?type=woonplaats`) op
 * de stationscoördinaten, zodat elk station de officiële PDOK-woonplaats
 * draagt in plaats van een geraden plaatsnaam.
 *
 * Uitgesloten: stationcode SHL (Schiphol Airport) — zie EXCLUDED_STATION_CODES
 * hieronder voor de reden. 397 − 1 = 396 stations in `nsStations`.
 *
 * Ruwe data staat in `ns-stations.json` (gegenereerd, geen handmatig te
 * onderhouden bestand) — dit bestand zet die data om naar het gedeelde
 * `LocalLocation`-model.
 */
import type { LocalLocation } from "./local-locations";
import stationsData from "./ns-stations.json";

type RawStation = {
  code: string;
  name: string;
  aliases: string[];
  city: string;
  lat: number;
  lng: number;
};

// NS-station "Schiphol Airport" (SHL) ligt vrijwel op dezelfde plek als de
// luchthaven zelf en heet in de brondata zelfs letterlijk "Schiphol Airport"
// — identiek aan een bestaande alias van `airport-ams`. Zonder uitzondering
// wint dat stationsnaam-record de zoekopdracht "schip" (naam-prefix > alias-
// prefix), waardoor een klant bij de trein-perronentree belandt in plaats van
// bij de luchthaven-entry die de vlucht-/aankomstlogica draagt. Voor dit
// product (taxi's van/naar Schiphol) voegt een apart stationsrecord hier niets
// toe, dus laten we het uitsluitend hier bewust weg — de overige 396 stations
// blijven ongemoeid.
const EXCLUDED_STATION_CODES = new Set(["SHL"]);

export const nsStations: LocalLocation[] = (stationsData as RawStation[])
  .filter((s) => !EXCLUDED_STATION_CODES.has(s.code))
  .map((s) => ({
    id: `station-${s.code.toLowerCase()}`,
    name: s.name,
    aliases: s.aliases,
    address: s.name,
    city: s.city,
    country: "Nederland",
    latitude: s.lat,
    longitude: s.lng,
    type: "popular_destination",
    category: "station",
  }));
