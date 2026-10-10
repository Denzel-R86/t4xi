import { expect, test, type Page, type Route } from "@playwright/test";
import { HANDOFF_KEY, HANDOFF_TTL_MS } from "../../lib/booking-handoff";
import { blurActive, defaultMasks, FIXED_NOW, fixture, HIDE_OVERLAYS, imagesReady, open, RIDE, settle, stabilize } from "./support/harness";
import { fillAddress, sentenceRoot } from "./support/sentence";

/**
 * Handoff hero → /boeken (Experience 2.0 PR 2.3, besluit #70) — gerichte opnames.
 *
 * De voorlopige prijs leeft alleen in het geheugen van dezelfde JS-context, dus
 * elke toestand loopt via de echte hero-zin en de client-side navigatie (zoals
 * tests/behavior/handoff.spec.ts). /boeken's quote wordt expliciet vastgehouden
 * (in flight) en pas daarna beantwoord. Klok vast via stabilize() (FIXED_NOW, ook
 * voor de handoff-TTL); reduced motion uit de config schakelt de View Transition
 * uit (view-transition.ts), animaties staan uit via toHaveScreenshot.
 *
 *   1  voorlopig (quote in flight)     — 375 en 1280
 *   2  server: zelfde bedrag           — 375
 *   3  server: ander bedrag + melding  — 375 en 1280
 *   4  verlopen handoff → gewone /boeken — 375
 */

const ADDRESS = "Voorbeeldstraat 12, Almere";

const sentence = (page: Page) =>
  sentenceRoot(page);
const bookingForm = (page: Page) => page.locator("form").filter({ has: page.locator("#f-name") });
const card = (page: Page) => bookingForm(page).locator("xpath=..");
const price = (page: Page) => page.getByRole("region", { name: "Geschatte prijs" });
const nextButton = (page: Page) => page.getByRole("button", { name: "Volgende" });
const currentStep = (page: Page) =>
  page.getByRole("navigation", { name: "Voortgang van uw boeking" }).locator('[aria-current="step"]');

const onlyWidths = (page: Page, widths: number[]) =>
  test.skip(!widths.includes(page.viewportSize()!.width), `alleen op ${widths.join(" en ")}px`);

/** Hero invullen tot de vaste prijs (89) staat, dan klikken met /boeken's quote vastgehouden. */
async function handoffInFlight(page: Page): Promise<Route[]> {
  await stabilize(page, { quote: "ready" });
  await open(page, "/");
  await fillAddress(page, "Vertrek", ADDRESS);
  await fillAddress(page, "Bestemming", "Schiphol");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByLabel("Datum", { exact: true }).first().fill(RIDE.date);
  await page.getByLabel("Tijd", { exact: true }).first().fill(RIDE.time);
  await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
  await blurActive(page);
  await expect(sentence(page).locator('[aria-live="polite"]')).toContainText(/Uw vaste prijs[\s\S]*89/);

  const held: Route[] = [];
  await page.route("**/api/pricing/quote", (route) => void held.push(route));
  await sentence(page).getByRole("link", { name: "Bekijk mijn vaste prijs" }).click();
  await expect(page).toHaveURL(/\/boeken\?h=1$/);
  await expect.poll(() => held.length, { message: "quote van /boeken in flight" }).toBeGreaterThan(0);
  await expect(price(page)).toHaveAttribute("data-price-state", "provisional");
  return held;
}

async function answer(held: Route[], body: string) {
  for (const r of held.splice(0)) {
    await r.fulfill({ status: 200, contentType: "application/json", body }).catch(() => {});
  }
}

async function cardShot(page: Page, name: string) {
  await blurActive(page);
  await imagesReady(card(page));
  await settle(page);
  await expect(card(page)).toHaveScreenshot(name, { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
}

test.describe("Handoff hero → /boeken (PR 2.3)", () => {
  test("1 voorlopige prijs, verificatie in flight", async ({ page }) => {
    onlyWidths(page, [375, 1280]);
    await handoffInFlight(page);
    await expect(currentStep(page)).toContainText("Rit");
    await expect(page.locator(".hx-handoff-journey").first()).toContainText(/Voorbeeldstraat 12/);
    await expect(price(page)).toContainText("Voorlopige prijs uit uw zoekopdracht — wordt gecontroleerd…");
    await expect(price(page)).toContainText("89,00");
    await expect(price(page)).toHaveAttribute("aria-busy", "true");
    await expect(nextButton(page)).toBeDisabled();
    await cardShot(page, "handoff-1-voorlopig.png");
  });

  test("2 server bevestigt hetzelfde bedrag", async ({ page }) => {
    onlyWidths(page, [375]);
    const held = await handoffInFlight(page);
    await answer(held, fixture("quote-ready"));
    await expect(price(page)).toHaveAttribute("data-price-state", "ready");
    await expect(price(page)).toHaveAttribute("aria-busy", "false");
    await expect(price(page)).toContainText("Vaste prijs vooraf");
    await expect(price(page)).toContainText("89,00");
    await expect(price(page)).not.toContainText("Voorlopig");
    await expect(page.getByRole("status").filter({ hasText: "De prijs is bijgewerkt" })).toHaveCount(0);
    await expect(nextButton(page)).toBeEnabled();
    await cardShot(page, "handoff-2-zelfde-prijs.png");
  });

  test("3 server geeft een ander bedrag", async ({ page }) => {
    onlyWidths(page, [375, 1280]);
    const held = await handoffInFlight(page);
    const changed = { ...JSON.parse(fixture("quote-ready")), price: 97, subtotal: 97, singlePrice: 97, quoteId: "visual-handoff-changed" };
    await answer(held, JSON.stringify(changed));
    await expect(price(page)).toHaveAttribute("data-price-state", "ready");
    await expect(price(page)).toContainText("97,00");
    await expect(price(page)).not.toContainText("89,00");
    await expect(page.getByRole("status").filter({ hasText: "De prijs is bijgewerkt naar de actuele berekening." })).toBeVisible();
    await expect(nextButton(page)).toBeEnabled();
    await cardShot(page, "handoff-3-prijs-bijgewerkt.png");
  });

  test("4 verlopen handoff: geen voorlopige prijs, gewone /boeken", async ({ page }) => {
    onlyWidths(page, [375]);
    await stabilize(page, { quote: "ready" });
    // Eén minuut over de TTL (t.o.v. de bevroren klok); éénmalig zaaien.
    await page.addInitScript(
      ({ key, ride, writtenAt }) => {
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        sessionStorage.setItem(key, JSON.stringify({ v: 1, writtenAt, ...ride }));
      },
      {
        key: HANDOFF_KEY,
        ride: { pickup: ADDRESS, dropoff: "Schiphol", date: RIDE.date, time: RIDE.time, persons: 1, luggage: "1-2-koffers", quoteId: "visual-fixture-quote-ready" },
        writtenAt: FIXED_NOW.getTime() - HANDOFF_TTL_MS - 60_000,
      }
    );
    await open(page, "/boeken?h=1");
    await expect(currentStep(page)).toContainText("Route");
    await expect(page.locator("#f-pickup input")).toHaveValue("");
    await expect(page.locator(".hx-handoff-journey")).toHaveCount(0);
    await expect(price(page)).not.toHaveAttribute("data-price-state", "provisional");
    await expect(price(page)).not.toContainText("Voorlopig");
    await cardShot(page, "handoff-4-verlopen.png");
  });
});
