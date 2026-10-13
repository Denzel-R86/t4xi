import { expect, test } from "@playwright/test";
import { defaultMasks, HIDE_OVERLAYS, open, settle, stabilize } from "./support/harness";
import { fillAddress, openAddress, sentenceRoot, sheetTrigger } from "./support/sentence";

/**
 * PR 2.6 (masterplan §6.5): gestapelde mobiele zin en adres-sheet, alleen op 375.
 * De sheet is een modale <dialog> in de top layer: opname van het venster.
 */

test.beforeEach(({ page }) => {
  test.skip(page.viewportSize()!.width !== 375, "alleen op 375px");
});

test.describe("Mobiele zin (375)", () => {
  test("gestapeld leeg", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await expect(sentenceRoot(page)).toHaveScreenshot("mobiel-zin-leeg.png", { stylePath: HIDE_OVERLAYS });
  });

  test("gestapeld met gekozen luchthaven", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await fillAddress(page, "Vertrek", "Amsterdam Zuidas");
    const to = await openAddress(page, "Bestemming");
    await to.pressSequentially("Schiphol");
    const first = page.getByRole("listbox").getByRole("option").first();
    await expect(first).toContainText("Amsterdam Airport Schiphol (AMS)");
    await first.click();
    await expect(sheetTrigger(page, "Bestemming")).toBeFocused();
    await expect(page.locator("dialog[open]")).toHaveCount(0);
    // Focus kan na het sluiten van de native dialog nog een keer terugkomen op de
    // trigger (:focus-visible-ring). Blijven blurren tot de focus twee frames lang
    // op <body> blijft; anders komt de ring incidenteel in de opname (F-36).
    await page.evaluate(async () => {
      const frame = () => new Promise((r) => requestAnimationFrame(() => r(null)));
      for (let i = 0; i < 20; i++) {
        (document.activeElement as HTMLElement | null)?.blur();
        await frame();
        await frame();
        if (document.activeElement === document.body) return;
      }
      throw new Error("focus bleef op de trigger");
    });
    // Vaste uitgangspositie: kiezen/sluiten laat de pagina op een wisselende
    // (fractionele) scrollpositie, wat de hairlines per run 1px laat verspringen.
    await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
    await page.mouse.move(0, 0);
    await settle(page);
    await expect(sentenceRoot(page)).toHaveScreenshot("mobiel-zin-luchthaven.png", { stylePath: HIDE_OVERLAYS });
  });

  test("sheet open", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await openAddress(page, "Vertrek");
    await settle(page);
    await expect(page).toHaveScreenshot("mobiel-sheet-open.png", { mask: defaultMasks(page) });
  });

  test("sheet met suggesties", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const input = await openAddress(page, "Bestemming");
    const places = page.waitForResponse(/\/api\/places/);
    await input.pressSequentially("Schiphol");
    await places;
    await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
    await settle(page);
    await expect(page).toHaveScreenshot("mobiel-sheet-suggesties.png", { mask: defaultMasks(page) });
  });
});
