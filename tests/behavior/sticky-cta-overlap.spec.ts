import { expect, test, type Page } from "@playwright/test";
import { open, stabilize } from "../visual/support/harness";
import { addressSheet, sentenceRoot, sheetTrigger } from "../visual/support/sentence";

/**
 * PR 2.6, F-14-rest: de mobiele StickyCta dekt nooit een deel van de hero-zin af
 * (Van, Naar, datum/tijd, passagiers/bagage, resultaatregel, hero-knop), op elke
 * scrollpositie, en ook niet de sheet. Draait in WebKit (iPhone 13, 390×664) en
 * Chromium 375×812. Echte tik, geen DOM-klik.
 */

const bar = (page: Page) => page.getByRole("complementary", { name: "Snelle acties" });

type Overlap = { scrollY: number; control: string; area: number };

/** Overlap (px²) tussen de zichtbare balk en elk bedieningselement van de zin. */
async function overlaps(page: Page): Promise<Overlap[]> {
  return page.evaluate(() => {
    const barEl = document.querySelector<HTMLElement>(".sticky-cta");
    if (!barEl || getComputedStyle(barEl).visibility === "hidden") return [];
    const b = barEl.getBoundingClientRect();
    const root = document.querySelector<HTMLElement>("div.hz-sentence")!;
    const controls = Array.from(
      root.querySelectorAll<HTMLElement>('button[aria-controls^="hero-"], input, select, [aria-live="polite"], a')
    ).filter((el) => !el.closest("dialog") && el.getClientRects().length > 0);
    return controls
      .map((el) => {
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        const label = el.getAttribute("aria-label") ?? el.getAttribute("aria-controls") ?? el.textContent?.trim().slice(0, 30) ?? el.tagName;
        return { scrollY: window.scrollY, control: label, area: w > 0 && h > 0 ? w * h : 0 };
      })
      .filter((o) => o.area > 0);
  });
}

async function scrollToY(page: Page, y: number) {
  await page.evaluate((top) => window.scrollTo({ top, behavior: "instant" }), y);
  // Meting loopt per frame (rAF) na het scroll-event.
  await page.evaluate(() => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))));
  await page.waitForTimeout(50);
}

/** Scrollt zo dat de onderkant van `el` net (4px) boven de onderrand van het venster staat. */
async function placeAtBottom(page: Page, selector: string) {
  const y = await page.evaluate((sel) => {
    const el = document.querySelector<HTMLElement>(sel)!;
    return Math.max(0, window.scrollY + el.getBoundingClientRect().bottom - (window.innerHeight - 4));
  }, selector);
  await scrollToY(page, y);
}

test.describe("PR 2.6 StickyCta dekt de hero-zin nooit af", () => {
  test("geen overlap op elke scrollpositie door de hero; balk terug voorbij de hero", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const end = await page.evaluate(
      () => window.scrollY + document.querySelector<HTMLElement>("div.hz-sentence")!.getBoundingClientRect().bottom + 200
    );
    const found: Overlap[] = [];
    for (let y = 0; y <= end; y += 20) {
      await scrollToY(page, y);
      found.push(...(await overlaps(page)));
    }
    expect(found, "balk overlapt geen zin-element").toEqual([]);
    // Voorbij de hero: balk weer zichtbaar (zin ligt boven de balk).
    await scrollToY(page, end + 400);
    await expect(bar(page)).toBeVisible();
  });

  test("ook met ingevulde zin en prijs geen overlap (resultaatregel + hero-knop)", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    await open(page, "/");
    for (const [field, value] of [["Vertrek", "Amsterdam Zuidas"], ["Bestemming", "Schiphol"]] as const) {
      await sheetTrigger(page, field).tap();
      const input = addressSheet(page, field).getByRole("combobox", { name: field });
      await input.fill(value);
      await input.press("Enter");
      await expect(addressSheet(page, field)).toBeHidden();
    }
    await page.getByLabel("Datum", { exact: true }).first().fill("2026-11-12");
    await page.getByLabel("Tijd", { exact: true }).first().fill("14:30");
    await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(sentenceRoot(page).locator('[aria-live="polite"]')).toContainText(/Uw vaste prijs/);
    const end = await page.evaluate(
      () => window.scrollY + document.querySelector<HTMLElement>("div.hz-sentence")!.getBoundingClientRect().bottom + 200
    );
    const found: Overlap[] = [];
    for (let y = 0; y <= end; y += 20) {
      await scrollToY(page, y);
      found.push(...(await overlaps(page)));
    }
    expect(found).toEqual([]);
  });

  test("echte tik op de onderste zinregel opent sheet of veld", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    // "Naar" als onderste regel in beeld.
    await placeAtBottom(page, 'button[aria-controls="hero-to-sheet"]');
    expect(await overlaps(page)).toEqual([]);
    await sheetTrigger(page, "Bestemming").tap();
    await expect(addressSheet(page, "Bestemming")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(addressSheet(page, "Bestemming")).toBeHidden();

    // Bagage (laatste zinregel) als onderste regel in beeld.
    await placeAtBottom(page, 'div.hz-sentence select[aria-label="Bagage"]');
    expect(await overlaps(page)).toEqual([]);
    const luggage = page.getByLabel("Bagage", { exact: true }).first();
    await luggage.tap();
    await expect(luggage).toBeFocused();

    // Hero-knop als onderste element: raakbaar (niet afgedekt).
    await placeAtBottom(page, "div.hz-sentence a");
    expect(await overlaps(page)).toEqual([]);
    const cta = sentenceRoot(page).getByRole("link", { name: "Bekijk mijn vaste prijs" });
    const box = (await cta.boundingBox())!;
    const hit = await page.evaluate(
      ([x, y]) => Boolean(document.elementFromPoint(x, y)?.closest("div.hz-sentence")),
      [box.x + box.width / 2, box.y + box.height / 2]
    );
    expect(hit, "hero-knop ontvangt de tik").toBe(true);
  });

  test("open sheet wordt niet door de balk afgedekt", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await scrollToY(page, 0);
    await sheetTrigger(page, "Vertrek").tap();
    const sheet = addressSheet(page, "Vertrek");
    await expect(sheet).toBeVisible();
    expect(await overlaps(page)).toEqual([]);
    const covered = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>("dialog#hero-from-sheet")!.getBoundingClientRect();
      const points = [0.1, 0.5, 0.9].flatMap((fx) => [d.bottom - 8, d.bottom - 60].map((y) => [d.left + d.width * fx, y]));
      return points.filter(([x, y]) => !document.elementFromPoint(x, y)?.closest("dialog#hero-from-sheet")).length;
    });
    expect(covered, "onderrand van de sheet is van de sheet zelf").toBe(0);
  });

  test("zin onder de vouw bij laden: balk zichtbaar; wijkt zodra de zin eronder schuift", async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 560 });
    await stabilize(page);
    await open(page, "/");
    const top = await page.evaluate(() => document.querySelector<HTMLElement>("div.hz-sentence")!.getBoundingClientRect().top);
    test.skip(top < 560, "zin staat bij laden al in beeld op dit profiel");
    await expect(bar(page)).toBeVisible();
    await scrollToY(page, top - 560 + 30);
    await expect(bar(page)).toBeHidden();
  });
});
