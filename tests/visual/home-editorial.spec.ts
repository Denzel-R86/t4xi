import { expect, test } from "@playwright/test";
import { defaultMasks, HIDE_OVERLAYS, open, settle, stabilize } from "./support/harness";

/**
 * Homepage editorial (PR 3.1): quiet proof en service principles, op 375/768/1280 (§10b).
 * Reduced motion staat aan in de config: de Reveal-inhoud is direct zichtbaar.
 * Baselines worden alleen in het vastgepinde Docker-image gemaakt (scripts/visual-docker.sh).
 */

test.describe("Homepage editorial", () => {
  test("quiet proof", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const section = page.locator('[data-editorial="quiet-proof"]');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByText("Uw prijs staat vast.")).toBeVisible();
    await expect(section.getByText("Geldige Nederlandse taxichauffeurskaart")).toBeVisible();
    await settle(page);
    await expect(section).toHaveScreenshot("quiet-proof.png", { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
  });

  test("service principles", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const section = page.locator('[data-editorial="principles"]');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole("listitem")).toHaveCount(3);
    await settle(page);
    await expect(section).toHaveScreenshot("service-principles.png", { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
  });
});
