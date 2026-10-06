import { expect, test, type Page } from "@playwright/test";
import { blurActive, defaultMasks, HIDE_OVERLAYS, imagesReady, open, RIDE, settle, stabilize, type QuoteMode } from "./support/harness";

/**
 * Hero (Arrival) en SentencePattern op de homepage (§10b).
 * Prijs komt uitsluitend uit de gemockte /api/pricing/quote.
 */

const hero = (page: Page) =>
  page.locator("section").filter({ has: page.getByRole("heading", { level: 1 }) }).first();
const sentence = (page: Page) =>
  page.locator("div.border-t").filter({ has: page.getByRole("combobox", { name: "Vertrek" }) }).first();
const stamp = (page: Page) => sentence(page).locator('[aria-live="polite"]');

async function fillAddresses(page: Page) {
  await page.getByRole("combobox", { name: "Vertrek" }).fill("Amsterdam Zuidas");
  const to = page.getByRole("combobox", { name: "Bestemming" });
  await to.fill("Schiphol");
  // Blur zodat er geen suggestielijst openstaat in de opname.
  await to.blur();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

async function fillRide(page: Page) {
  await page.getByLabel("Datum", { exact: true }).first().fill(RIDE.date);
  await page.getByLabel("Tijd", { exact: true }).first().fill(RIDE.time);
  await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
  await blurActive(page);
}

async function heroWithQuote(page: Page, mode: QuoteMode, expected: RegExp) {
  await stabilize(page, { quote: mode });
  await open(page, "/");
  await fillAddresses(page);
  await fillRide(page);
  await expect(stamp(page)).toContainText(expected);
  await expect(stamp(page)).toHaveAttribute("aria-busy", "false");
}

async function heroShot(page: Page, name: string) {
  const h = hero(page);
  await imagesReady(h);
  await settle(page);
  await expect(h).toHaveScreenshot(name, { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
}

test.describe("Hero (Arrival)", () => {
  test("leeg", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await heroShot(page, "hero-leeg.png");
  });

  test("ingevuld", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await fillAddresses(page);
    await expect(stamp(page)).toContainText("Kies datum, tijd en bagage");
    await heroShot(page, "hero-ingevuld.png");
  });

  test("prijs ready", async ({ page }) => {
    await heroWithQuote(page, "ready", /Uw vaste prijs/);
    await expect(stamp(page)).toContainText("89");
    await heroShot(page, "hero-prijs-ready.png");
  });

  test("onrequest", async ({ page }) => {
    await heroWithQuote(page, "onrequest", /Offerte op aanvraag/);
    await heroShot(page, "hero-onrequest.png");
  });

  test("error", async ({ page }) => {
    await heroWithQuote(page, "error", /Prijs even niet beschikbaar/);
    await heroShot(page, "hero-error.png");
  });
});

test.describe("SentencePattern", () => {
  test("leeg", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await expect(sentence(page)).toHaveScreenshot("zin-leeg.png", { stylePath: HIDE_OVERLAYS });
  });

  test("focus op veld", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await page.getByRole("combobox", { name: "Vertrek" }).focus();
    await settle(page);
    await expect(sentence(page)).toHaveScreenshot("zin-focus.png", { stylePath: HIDE_OVERLAYS });
  });

  test("suggesties open", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const from = page.getByRole("combobox", { name: "Vertrek" });
    await from.focus();
    // Lokale dataset levert direct; PDOK/Places zijn gemockt (leeg). Wacht op
    // beide antwoorden zodat de lijst daarna niet meer verspringt.
    const places = page.waitForResponse(/\/api\/places/);
    await from.pressSequentially("Schiphol");
    await places;
    await expect(page.getByRole("listbox")).toBeVisible();
    await expect(page.getByRole("option").first()).toBeVisible();
    await settle(page);
    // De lijst valt buiten de zin-container: neem de hero, zodat het hele
    // overlay-paneel in beeld is.
    await expect(hero(page)).toHaveScreenshot("zin-suggesties-open.png", { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
  });

  test("quote loading", async ({ page }) => {
    const mocks = await stabilize(page, { quote: "hang" });
    await open(page, "/");
    await fillAddresses(page);
    await fillRide(page);
    await expect.poll(() => mocks.quoteCalls()).toBeGreaterThan(0);
    await expect(stamp(page)).toContainText("Prijs berekenen");
    await expect(sentence(page)).toHaveScreenshot("zin-quote-loading.png", { stylePath: HIDE_OVERLAYS });
  });

  test("ready", async ({ page }) => {
    await heroWithQuote(page, "ready", /Uw vaste prijs/);
    await expect(sentence(page)).toHaveScreenshot("zin-ready.png", { stylePath: HIDE_OVERLAYS });
  });
});
