import { expect, test, type Locator, type Page } from "@playwright/test";
import { blurActive, defaultMasks, HIDE_OVERLAYS, open, RIDE, settle, stabilize, type QuoteMode } from "./support/harness";

/**
 * "UW RIT" in de RouteFinder (Experience 2.0 PR 2.7) — gerichte opnames van het
 * resultaatblok zelf, op 375 en 1280:
 *
 *   1  ready (enkele rit): JourneyLine, serverprijs, Boek deze rit, prijsopbouw
 *   2  ready (retour): zelfde blok, retourprijs uit de server
 *   3  F-17: ophaalveld opnieuw gefocust ná de prijs — geen "Geen adressen gevonden"
 */

const widths = [375, 1280];
test.beforeEach(({ page }) => {
  test.skip(!widths.includes(page.viewportSize()!.width), `alleen op ${widths.join(" en ")}px`);
});

const finder = (page: Page) =>
  page.locator("div.max-w-3xl").filter({ has: page.getByRole("button", { name: /Bereken vaste prijs/ }) }).first();
const ride = (page: Page) => page.getByTestId("uw-rit");

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
  await expect(ride(page)).toBeVisible();
}

const shot = { stylePath: HIDE_OVERLAYS };

test.describe("UW RIT (RouteFinder, PR 2.7)", () => {
  test("1 ready enkele rit", async ({ page }) => {
    await compute(page, "ready");
    await expect(ride(page)).toContainText("89");
    await blurActive(page);
    await settle(page);
    await expect(ride(page)).toHaveScreenshot("uw-rit-ready.png", { ...shot, mask: defaultMasks(page) });
  });

  test("2 ready retour", async ({ page }) => {
    await compute(page, "ready-retour", { retour: true });
    await expect(ride(page)).toContainText("170");
    await blurActive(page);
    await settle(page);
    await expect(ride(page)).toHaveScreenshot("uw-rit-retour.png", { ...shot, mask: defaultMasks(page) });
  });

  test("3 F-17: geprijsd adres opnieuw gefocust", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    await open(page, "/tarieven");
    const f = finder(page);
    const pickup = f.getByLabel("Waar mogen wij u ophalen?");
    const places = page.waitForResponse(/\/api\/places/);
    await pickup.fill("Voorbeeldstraat 12, Almere");
    await places;
    await expect(f.getByText("Geen adressen gevonden")).toBeVisible();
    await pickup.blur();
    await fillAddress(page, f.getByLabel("Waar gaat de reis naartoe?"), "Schiphol");
    await f.getByLabel("Datum", { exact: true }).fill(RIDE.date);
    await f.getByLabel("Ophaaltijd", { exact: true }).fill(RIDE.time);
    await f.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
    await f.getByRole("button", { name: /Bereken vaste prijs/ }).click();
    await expect(ride(page)).toContainText("89");
    await pickup.focus();
    await expect(f.getByText("Geen adressen gevonden")).toHaveCount(0);
    await settle(page);
    const field = pickup.locator("xpath=ancestor::div[contains(@class,'relative')][1]");
    await expect(field).toHaveScreenshot("uw-rit-f17-refocus.png", { ...shot, caret: "hide" });
  });
});
