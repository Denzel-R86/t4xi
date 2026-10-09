import { readdirSync, readFileSync } from "node:fs";

/**
 * Bronbestanden van het boekingsformulier sinds de split in PR 2.4:
 * `BookingSection.tsx` (state, validatie, submit) + `components/booking/steps/*`
 * (weergave per stap). Voor broncode-locks in tests: wat vroeger in één bestand
 * stond, moet nu in deze set staan.
 */
export const BOOKING_FORM_FILES: readonly string[] = [
  "components/booking/BookingSection.tsx",
  ...readdirSync("components/booking/steps")
    .filter((f) => f.endsWith(".tsx") || f.endsWith(".ts"))
    .sort()
    .map((f) => `components/booking/steps/${f}`),
];

export function readBookingFormSource(): string {
  return BOOKING_FORM_FILES.map((f) => readFileSync(f, "utf8")).join("\n");
}
