import { expect, test, type Page } from "@playwright/test";
import { mkdirSync } from "node:fs";
import { stabilize } from "../visual/support/harness";

/**
 * PR 2.6: de mobiele StickyCta dekt de hero-zin ook vóór hydratie en zonder JS
 * nooit af. Op een pagina met de zin blijft de balk weg tot de client gemeten
 * heeft (`data-ready`); op pagina's zonder zin verandert niets.
 * WebKit (iPhone 13) en Chromium 375.
 */

const SHOTS = process.env.NOJS_SHOTS_DIR;
async function shot(page: Page, name: string) {
  if (!SHOTS) return;
  mkdirSync(SHOTS, { recursive: true });
  await page.screenshot({ path: `${SHOTS}/${test.info().project.name}-${name}.png` });
}

/** Overlap (px²) tussen de zichtbare balk en de zin-elementen; geen balk zichtbaar → []. */
async function overlaps(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".sticky-cta");
    if (!bar || getComputedStyle(bar).visibility === "hidden") return [] as number[];
    const b = bar.getBoundingClientRect();
    const root = document.querySelector<HTMLElement>("div.hz-sentence");
    if (!root) return [] as number[];
    return Array.from(root.querySelectorAll<HTMLElement>('button[aria-controls^="hero-"], input, select, [aria-live="polite"], a'))
      .filter((el) => !el.closest("dialog") && el.getClientRects().length > 0)
      .map((el) => {
        const r = el.getBoundingClientRect();
        const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
        const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
        return w > 0 && h > 0 ? w * h : 0;
      })
      .filter((a) => a > 0);
  });
}

const barVisible = (page: Page) =>
  page.evaluate(() => getComputedStyle(document.querySelector<HTMLElement>(".sticky-cta")!).visibility !== "hidden");

test.describe("StickyCta zonder JS @nojs", () => {
  test.use({ javaScriptEnabled: false });

  test("homepage: balk weg, geen overlap, hero-knop bereikbaar", async ({ page }) => {
    await stabilize(page);
    await page.goto("/", { waitUntil: "load" });
    expect(await barVisible(page), "balk verborgen zonder JS").toBe(false);
    expect(await overlaps(page)).toEqual([]);
    const cta = page.locator("div.hz-sentence").getByRole("link", { name: "Bekijk mijn vaste prijs" });
    await expect(cta).toBeVisible();
    expect(await cta.getAttribute("href")).toMatch(/\/boeken$/);
    await shot(page, "nojs-home");
  });

  test("pagina zonder zin (/diensten): balk zichtbaar zoals voorheen", async ({ page }) => {
    await stabilize(page);
    await page.goto("/diensten", { waitUntil: "load" });
    expect(await page.locator("div.hz-sentence").count()).toBe(0);
    expect(await barVisible(page), "balk zichtbaar zonder JS op een pagina zonder zin").toBe(true);
    await shot(page, "nojs-diensten");
  });
});

test.describe("StickyCta bij vertraagde hydratie", () => {
  test("tot hydratie nooit overlap; daarna de gewone regels", async ({ page }) => {
    await stabilize(page);
    // Alle JS-chunks 3 s vasthouden (CSS niet: die blokkeert de eerste weergave):
    // de server-HTML staat dan met stijlen maar zonder client-logica in beeld.
    await page.route(/\/_next\/static\/chunks\/.*\.js(\?.*)?$/, async (route) => {
      await new Promise((r) => setTimeout(r, 3000));
      await route.fallback();
    });
    const start = Date.now();
    await page.goto("/", { waitUntil: "commit" });
    await page.waitForSelector("div.hz-sentence");
    const samples: { t: number; overlap: number; visible: boolean }[] = [];
    const taken = new Set<number>();
    let ready = false;
    while (!ready && Date.now() - start < 20_000) {
      const t = Date.now() - start;
      const o = await overlaps(page);
      samples.push({ t, overlap: o.length, visible: await barVisible(page) });
      for (const s of [0, 1000, 2000]) {
        if (t >= s && !taken.has(s)) {
          taken.add(s);
          await shot(page, `vertraagd-t${s / 1000}s`);
        }
      }
      ready = await page.evaluate(() => document.querySelector(".sticky-cta")?.getAttribute("data-ready") === "true");
      if (!ready) await page.waitForTimeout(100);
    }
    test.info().annotations.push({ type: "samples", description: JSON.stringify(samples) });
    expect(ready, "client heeft gemeten").toBe(true);
    expect(samples.length, "meerdere metingen vóór hydratie").toBeGreaterThan(10);
    expect(samples.filter((s) => s.overlap > 0), "nooit overlap vóór hydratie").toEqual([]);
    expect(samples.filter((s) => s.visible && s.t < 2500), "geen zichtbare balk vóór hydratie").toEqual([]);

    // Na hydratie: zin ligt achter de balkstrook → balk weg; voorbij de hero → terug.
    await page.waitForLoadState("networkidle");
    expect(await overlaps(page)).toEqual([]);
    await shot(page, "na-hydratie");
    await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>("div.hz-sentence")!.getBoundingClientRect();
      window.scrollTo({ top: window.scrollY + r.bottom + 400, behavior: "instant" });
    });
    await expect(page.getByRole("complementary", { name: "Snelle acties" })).toBeVisible();
    await shot(page, "na-hydratie-voorbij-hero");
  });
});
