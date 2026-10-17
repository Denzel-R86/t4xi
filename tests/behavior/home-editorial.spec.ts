import { expect, test, type Page } from "@playwright/test";
import { open, stabilize } from "../visual/support/harness";

/**
 * PR 3.1 (#98): quiet proof + service principles — tekst, grid en overflow op
 * 375/768/1280. Geen horizontale overflow, geen afgeknipte tekst; drie principes
 * ≥ 768px in drie gelijke kolommen, < 768px onder elkaar. Reduced motion (config):
 * alles direct zichtbaar.
 */

type Layout = { overflowX: number; clipped: string[]; items: { left: number; top: number; width: number }[] };

async function layout(page: Page): Promise<Layout> {
  return page.evaluate(() => {
    const root = document.documentElement;
    const scope = document.querySelectorAll<HTMLElement>('[data-editorial="quiet-proof"], [data-editorial="principles"]');
    const clipped: string[] = [];
    scope.forEach((s) =>
      s.querySelectorAll<HTMLElement>("p, h2, h3, span").forEach((el) => {
        if (el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== "visible") clipped.push(el.textContent!.slice(0, 40));
        const r = el.getBoundingClientRect();
        if (r.right > window.innerWidth + 0.5 || r.left < -0.5) clipped.push(`buiten venster: ${el.textContent!.slice(0, 40)}`);
      }),
    );
    const items = [...document.querySelectorAll<HTMLElement>('[data-editorial="principles"] li')].map((li) => {
      const r = li.getBoundingClientRect();
      return { left: Math.round(r.left), top: Math.round(r.top + window.scrollY), width: r.width };
    });
    return { overflowX: root.scrollWidth - root.clientWidth, clipped, items };
  });
}

async function check(page: Page, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await stabilize(page);
  await open(page, "/");
  const proof = page.locator('[data-editorial="quiet-proof"]');
  await expect(proof.getByRole("listitem")).toHaveText(["Uw prijs staat vast.", "Geldige Nederlandse taxichauffeurskaart"]);
  const principles = page.locator('[data-editorial="principles"]');
  await expect(principles.getByRole("heading", { level: 3 })).toHaveText([
    "Vaste prijs vooraf.",
    "Schiphol zonder gedoe.",
    "Gemakkelijk boeken.",
  ]);
  await expect(principles).not.toContainText("Ontspannen onderweg.");
  await expect(principles.locator("li span[aria-hidden]")).toHaveText(["01", "02", "03"]);
  await principles.scrollIntoViewIfNeeded();
  const l = await layout(page);
  expect(l.overflowX, `horizontale overflow op ${width}px`).toBeLessThanOrEqual(0);
  expect(l.clipped, `afgeknipte tekst op ${width}px`).toEqual([]);
  expect(l.items).toHaveLength(3);
  if (width >= 768) {
    expect(new Set(l.items.map((i) => i.top)).size, "één rij").toBe(1);
    const w = l.items.map((i) => i.width);
    expect(Math.max(...w) - Math.min(...w), "gelijke kolommen").toBeLessThanOrEqual(1);
  } else {
    expect(new Set(l.items.map((i) => i.left)).size, "één kolom").toBe(1);
  }
}

test("homepage editorial: tekst, grid en overflow op 375", async ({ page }) => {
  await check(page, 375);
});

test("homepage editorial: geen overflow op 320 (lang woord in quiet proof)", async ({ page }) => {
  await check(page, 320);
});

test("homepage editorial: tekst, grid en overflow op 768 @desktop", async ({ page }) => {
  await check(page, 768);
});

test("homepage editorial: tekst, grid en overflow op 1280 @desktop", async ({ page }) => {
  await check(page, 1280);
});
