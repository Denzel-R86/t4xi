import { expect, test, type Locator, type Page } from "@playwright/test";
import { blurActive, defaultMasks, HIDE_OVERLAYS, open, RIDE, settle, stabilize, type QuoteMode } from "./support/harness";

/** Quote-resultaat in de RouteFinder op /tarieven ("UW RIT"-kaart, §10b). */

const finder = (page: Page) =>
  page.locator("div.max-w-3xl").filter({ has: page.getByRole("button", { name: /Bereken vaste prijs/ }) }).first();

/**
 * Vul een adresveld en wacht op het (gemockte) externe suggestie-antwoord vóór
 * de blur. Anders kan een laat antwoord de lijst na de blur opnieuw openen.
 */
async function fillAddress(page: Page, input: Locator, text: string) {
  const places = page.waitForResponse(/\/api\/places/);
  await input.fill(text);
  await places;
  await input.blur();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

async function compute(page: Page, mode: QuoteMode, opts: { retour?: boolean } = {}) {
  await stabilize(page, { quote: mode });
  await open(page, "/tarieven");
  const f = finder(page);
  await fillAddress(page, f.getByLabel("Waar mogen wij u ophalen?"), "Amsterdam Zuidas");
  await fillAddress(page, f.getByLabel("Waar gaat de reis naartoe?"), "Schiphol");
  await f.getByLabel("Datum", { exact: true }).fill(RIDE.date);
  await f.getByLabel("Ophaaltijd", { exact: true }).fill(RIDE.time);
  await f.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
  if (opts.retour) {
    await f.getByRole("radio", { name: "Retour" }).click();
    await f.getByLabel("Retourdatum").fill(RIDE.returnDate);
    await f.getByLabel("Retourtijd").fill(RIDE.returnTime);
  }
  await f.getByRole("button", { name: /Bereken vaste prijs/ }).click();
}

async function finderShot(page: Page, name: string) {
  await blurActive(page);
  await settle(page);
  await expect(finder(page)).toHaveScreenshot(name, { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
}

test.describe("Quote-resultaat (RouteFinder)", () => {
  test("ready", async ({ page }) => {
    await compute(page, "ready");
    await expect(finder(page)).toContainText("89");
    await finderShot(page, "routefinder-ready.png");
  });

  test("onrequest", async ({ page }) => {
    await compute(page, "onrequest");
    await expect(finder(page).getByRole("link", { name: /WhatsApp/i }).first()).toBeVisible();
    await finderShot(page, "routefinder-onrequest.png");
  });

  test("met retour", async ({ page }) => {
    await compute(page, "ready-retour", { retour: true });
    await expect(finder(page)).toContainText("170");
    await finderShot(page, "routefinder-retour.png");
  });
});
