import { expect, test, type Page } from "@playwright/test";
import { blurActive, defaultMasks, HIDE_OVERLAYS, imagesReady, open, RIDE, settle, stabilize, type QuoteMode } from "./support/harness";

/**
 * Booking (BookingSection) en de betaalstap op /boeken (§10b).
 *
 * Sinds PR 2.4 echte stappen (één formulier, één state; stappen = weergave):
 *   Route     → adressen ingevuld (deep-link), via "Terug" naar stap 1
 *   Rit       → datum, tijd en bagage gekozen; vaste prijs ready
 *   Gegevens  → verzenden faalt op de servervalidatie; fout staat bij het telefoonveld
 *   Bevestigen→ boeking ontvangen + betaalstap (create-intent gemockt, Stripe uit)
 */

const ROUTE = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol`;
const FULL = `${ROUTE}&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;

const submitButton = (page: Page) => page.getByRole("button", { name: "Boeking bevestigen" });
/** Het boekingsformulier (de betaalstap heeft een eigen form). Niet via de
 *  verzendknop: die staat sinds PR 2.4 alleen in de (zichtbare) stap Bevestigen. */
const bookingForm = (page: Page) => page.locator("form").filter({ has: page.locator("#f-name") });
/** De boekingskaart: ouder van het boekingsformulier. */
const card = (page: Page) => bookingForm(page).locator("xpath=..");
const price = (page: Page) => page.getByRole("region", { name: "Geschatte prijs" });
const nextButton = (page: Page) => page.getByRole("button", { name: "Volgende" });

async function openBooking(
  page: Page,
  query: string,
  mode: QuoteMode = "ready",
  booking: "ok" | "invalid-phone" = "ok"
) {
  const mocks = await stabilize(page, { quote: mode, booking });
  await open(page, `/boeken?${query}`);
  return mocks;
}

async function fillContact(page: Page, phone = "+31 6 00000000") {
  const form = bookingForm(page);
  await form.getByRole("textbox", { name: "Naam", exact: true }).fill("Visual Test");
  await form.getByLabel(/^Telefoon/).fill(phone);
  await form.getByLabel(/^E-mail/).fill("visual@example.test");
}

/** Rit → Gegevens → contact invullen → Bevestigen. */
async function toConfirm(page: Page, phone?: string) {
  await nextButton(page).click();
  await fillContact(page, phone);
  await nextButton(page).click();
  await expect(submitButton(page)).toBeVisible();
}

async function cardShot(page: Page, name: string) {
  await imagesReady(card(page));
  await settle(page);
  await expect(card(page)).toHaveScreenshot(name, { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
}

test.describe("Booking (BookingSection)", () => {
  test("stap Route", async ({ page }) => {
    await openBooking(page, ROUTE);
    await expect(price(page)).toContainText(/datum|tijd|bagage/i);
    // Deep-link met beide adressen start op Rit; terug naar Route voor de opname.
    await page.getByRole("button", { name: "Terug" }).click();
    await expect(page.getByRole("combobox", { name: "Van" })).toBeVisible();
    await cardShot(page, "booking-1-route.png");
  });

  test("stap Rit (prijs ready)", async ({ page }) => {
    await openBooking(page, FULL);
    await expect(price(page)).toContainText("89");
    await expect(price(page)).toHaveAttribute("aria-busy", "false");
    await cardShot(page, "booking-2-rit.png");
  });

  test("stap Gegevens met validatiefout", async ({ page }) => {
    // Servervalidatie op een te kort telefoonnummer: sinds PR 2.4 terug naar
    // Gegevens, met de fout bij het veld (F-13) en de focus erop.
    await openBooking(page, FULL, "ready", "invalid-phone");
    await expect(price(page)).toContainText("89");
    await toConfirm(page, "123");
    await submitButton(page).click();
    await expect(page.locator("#f-phone-error")).toBeVisible();
    await blurActive(page);
    await cardShot(page, "booking-3-gegevens-fout.png");
  });

  test("stap Bevestigen + betaalstap", async ({ page }) => {
    await openBooking(page, FULL);
    await expect(price(page)).toContainText("89");
    await toConfirm(page);
    const intent = page.waitForResponse(/\/api\/payments\/create-intent/);
    await submitButton(page).click();
    await intent;
    await expect(card(page)).toContainText("T4X-VISUAL-0001");
    await expect(card(page).locator("#betaling-kop")).toBeVisible();
    await cardShot(page, "booking-4-bevestigen-betaalstap.png");
  });
});
