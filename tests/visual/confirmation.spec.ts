import { expect, test, type Page } from "@playwright/test";
import { defaultMasks, HIDE_OVERLAYS, open, RIDE, settle, stabilize } from "./support/harness";
import { fakeStripe } from "./support/fake-stripe";

/**
 * Bevestigingsweergave na het betalen (PR 2.5, §8 + guard besluit #72).
 *
 *   betaald  → server-status `paid`, bookingstatus `inquiry` (de enige toestand die
 *              de guard als "Betaling ontvangen" toelaat) — 375 en 1280
 *   pending  → server-status blijft `pending`: pending-kop, geen bedrag/agenda — 375
 *
 * Stripe offline via de nep-`window.Stripe` (support/fake-stripe.ts); de build
 * heeft een nep-`pk_test_`-key nodig (CI: visual.yml). JourneyLine staat door
 * `reducedMotion: "reduce"` direct in de eindstaat; dat wordt vóór de opname gecontroleerd.
 */

const FULL = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;
const view = (page: Page) => page.locator("section[data-booking-status]");

async function payBooking(page: Page, serverStatus: "paid" | "pending") {
  await fakeStripe(page);
  await stabilize(page, { quote: "ready", booking: "ok" });
  if (serverStatus === "paid") {
    // Na stabilize() geregistreerd = gaat vóór de standaard "pending"-mock.
    await page.route("**/api/payments/status**", (route) =>
      route.fulfill({
        status: 200,
        contentType: "application/json",
        body: '{"status":"paid","amountDue":8900,"amountPaid":8900,"currency":"eur","paidAt":"2026-10-01T08:00:05Z"}',
      })
    );
  }
  await open(page, `/boeken?${FULL}`);
  await page.getByRole("button", { name: "Volgende" }).click();
  await page.getByRole("textbox", { name: "Naam", exact: true }).fill("Visual Test");
  await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("+31 6 00000000");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("visual@example.test");
  await page.getByRole("button", { name: "Volgende" }).click();
  await page.getByRole("button", { name: "Boeking bevestigen" }).click();
  await page.getByRole("button", { name: "Nu betalen" }).click();
  await expect(view(page)).toHaveAttribute("data-payment", serverStatus, { timeout: 15_000 });
  await expect(view(page).locator(".hz-jl")).toHaveAttribute("data-state", "arrived");
}

async function shot(page: Page, name: string) {
  // De muis staat nog waar "Nu betalen" stond; na de herschikking zou die een
  // knop in hover zetten. Weg ermee vóór de opname.
  await page.mouse.move(0, 0);
  await view(page).scrollIntoViewIfNeeded();
  await settle(page);
  await expect(view(page)).toHaveScreenshot(name, { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
}

test.describe("Bevestigingsweergave (BookingConfirmation)", () => {
  test("betaald, aanvraag in behandeling", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name === "w768", "alleen 375 en 1280");
    await payBooking(page, "paid");
    await expect(view(page).locator('[data-field="paid"] dd')).toHaveText(/89,00 betaald/);
    await shot(page, "confirmation-paid.png");
  });

  test("betaling pending", async ({ page }, testInfo) => {
    test.skip(testInfo.project.name !== "w375", "alleen 375");
    await payBooking(page, "pending");
    await expect(view(page).locator('[data-field="paid"]')).toHaveCount(0);
    await shot(page, "confirmation-pending.png");
  });
});
