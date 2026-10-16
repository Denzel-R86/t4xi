import { expect, test, type Page } from "@playwright/test";
import { open, RIDE, stabilize } from "../visual/support/harness";

/**
 * Gedragscheck F-26 (+ select-hoogte uit #92): op /boeken is ieder formulierveld
 * in een stap even breed als de andere velden in dezelfde kolombreedte, loopt
 * niet over, en is ≥ 44px hoog (WebKit negeert `min-height` op een native
 * <select>; gemeten 24px). Datum en tijd tonen hun waarde volledig.
 *
 * Draait in WebKit (iPhone 13-profiel), Chromium 375 en (via @desktop) Chromium
 * 1280. Playwright-WebKit is geen echte iOS-Safari: dit is een regressiecheck,
 * geen bewijs voor een echt iPhone.
 */

const FULL = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;
const RETOUR = `${FULL}&retour=1&returnDate=${RIDE.returnDate}&returnTime=${RIDE.returnTime}`;

type Field = {
  id: string;
  tag: string;
  type: string;
  width: number;
  height: number;
  cellWidth: number;
  span: string;
  scrollWidth: number;
  clientWidth: number;
  /** Alleen datum/tijd: benodigde breedte van de getoonde waarde vs. beschikbare ruimte. */
  valueFits?: { need: number; room: number; value: string };
};

/** Meet alle zichtbare velden in de actieve stap. */
async function measure(page: Page): Promise<Field[]> {
  return page.evaluate(() => {
    const panel = [...document.querySelectorAll<HTMLElement>(".booking-step")].find((p) => !p.hidden);
    if (!panel) throw new Error("geen actieve stap");
    const els = [
      ...panel.querySelectorAll<HTMLInputElement | HTMLSelectElement>(
        "input:not([type=hidden]):not([type=radio]):not([type=checkbox]), select, textarea"
      ),
    ].filter((e) => e.getClientRects().length > 0 && e.getAttribute("tabindex") !== "-1");
    const canvas = document.createElement("canvas").getContext("2d")!;
    return els.map((e) => {
      const r = e.getBoundingClientRect();
      // Cel = voorouder die direct kind is van een grid (span bepaalt de kolombreedte).
      let cell: HTMLElement = e;
      while (cell.parentElement && getComputedStyle(cell.parentElement).display !== "grid") cell = cell.parentElement;
      const cs = getComputedStyle(e);
      const f = {
        id: e.id || e.getAttribute("name") || e.tagName,
        tag: e.tagName.toLowerCase(),
        type: e.type,
        width: r.width,
        height: r.height,
        cellWidth: cell.getBoundingClientRect().width,
        span: getComputedStyle(cell).gridColumnEnd,
        scrollWidth: e.scrollWidth,
        clientWidth: e.clientWidth,
      } as {
        id: string; tag: string; type: string; width: number; height: number; cellWidth: number; span: string;
        scrollWidth: number; clientWidth: number; valueFits?: { need: number; room: number; value: string };
      };
      if (e.type === "date" || e.type === "time") {
        // Benadering van de native weergave: de langste gangbare notatie in de browsertaal.
        const [y, m, d] = (e.type === "date" ? e.value : "2026-01-01").split("-").map(Number);
        const [hh, mm] = (e.type === "time" ? e.value : "00:00").split(":").map(Number);
        const dt = new Date(y, m - 1, d, hh, mm);
        const lang = navigator.language;
        const shown =
          e.type === "date"
            ? [dt.toLocaleDateString(lang), dt.toLocaleDateString(lang, { day: "numeric", month: "short", year: "numeric" })]
            : [dt.toLocaleTimeString(lang, { hour: "numeric", minute: "2-digit" })];
        canvas.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        const longest = shown.reduce((a, b) => (canvas.measureText(b).width > canvas.measureText(a).width ? b : a));
        // Ruimte voor de waarde: inhoud minus native pickerknop (Chromium ~24px).
        const room = e.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight) - 24;
        f.valueFits = { need: canvas.measureText(longest).width, room, value: longest };
      }
      return f;
    });
  });
}

function expectSizes(fields: Field[], step: string) {
  expect(fields.length, `${step}: velden gevonden`).toBeGreaterThan(0);
  const groups = new Map<string, Field[]>();
  for (const f of fields) groups.set(f.span, [...(groups.get(f.span) ?? []), f]);
  for (const group of groups.values()) {
    const ref = group[0];
    for (const f of group) {
      expect(Math.abs(f.width - ref.width), `${step}: ${f.id} even breed als ${ref.id}`).toBeLessThanOrEqual(1);
      expect(Math.abs(f.width - f.cellWidth), `${step}: ${f.id} vult de kolom`).toBeLessThanOrEqual(1);
    }
  }
  for (const f of fields) {
    expect(f.scrollWidth, `${step}: ${f.id} loopt niet over`).toBeLessThanOrEqual(f.clientWidth);
    expect(f.height, `${step}: ${f.id} aanraakdoel ≥ 44px`).toBeGreaterThanOrEqual(44);
    if (f.valueFits) {
      expect(f.valueFits.need, `${step}: ${f.id} toont "${f.valueFits.value}" volledig`).toBeLessThanOrEqual(f.valueFits.room);
    }
  }
}

async function noPageOverflow(page: Page) {
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow, "geen horizontale paginascroll").toBeLessThanOrEqual(0);
}

for (const tag of ["", " @desktop"]) {
  test.describe(`F-26 veldmaten op /boeken${tag}`, () => {
    for (const locale of ["nl-NL", "en-US"] as const) {
      test.describe(locale, () => {
        test.use({ locale });

        test(`stap Rit (retour): datum, tijd en bagage even breed en hoog als de andere velden${tag}`, async ({ page }) => {
          await stabilize(page, { quote: "ready-retour" });
          await open(page, `/boeken?${RETOUR}`);
          await expect(page.locator("#f-luggage")).toBeVisible();
          await expect(page.locator("#f-flight")).toBeVisible();

          const fields = await measure(page);
          const ids = fields.map((f) => f.id);
          for (const id of ["f-date", "f-time", "f-return-date", "f-return-time", "f-persons", "f-luggage", "f-flight"]) {
            expect(ids, `stap Rit bevat ${id}`).toContain(id);
          }
          expect(fields.find((f) => f.id === "f-luggage")!.tag).toBe("select");
          expect(await page.locator("#f-date").inputValue()).toBe(RIDE.date);
          expect(await page.locator("#f-time").inputValue()).toBe(RIDE.time);
          expectSizes(fields, "Rit");
          await noPageOverflow(page);
        });
      });
    }

    test(`stappen Route en Gegevens: alle velden even breed en ≥ 44px${tag}`, async ({ page }) => {
      // Enkele rit: bij retour vanaf Schiphol is het retourvluchtnummer verplicht.
      await stabilize(page, { quote: "ready" });
      await open(page, `/boeken?${FULL}`);
      await expect(page.locator("#f-luggage")).toBeVisible();

      await page.getByRole("button", { name: "Terug" }).click();
      await expect(page.getByRole("combobox", { name: "Van" })).toBeVisible();
      expectSizes(await measure(page), "Route");
      await noPageOverflow(page);

      await page.getByRole("button", { name: "Volgende" }).click();
      await expect(page.locator("#f-luggage")).toBeVisible();
      await page.getByRole("button", { name: "Volgende" }).click();
      await expect(page.locator("#f-name")).toBeVisible();
      expectSizes(await measure(page), "Gegevens");
      await noPageOverflow(page);
    });
  });
}
