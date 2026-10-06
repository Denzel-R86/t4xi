import { expect, test, type Page } from "@playwright/test";
import { defaultMasks, HIDE_OVERLAYS, imagesReady, open, RIDE, settle, stabilize, type QuoteMode } from "./support/harness";

/**
 * Booking (BookingSection) en de betaalstap op /boeken (§10b).
 *
 * De huidige UI is één formulier zonder echte stappen; de §10b-"stappen" zijn
 * hier de zichtbare toestanden van dat formulier:
 *   Route     → adressen ingevuld (deep-link), datum/bagage nog open
 *   Rit       → datum, tijd en bagage gekozen; vaste prijs ready
 *   Gegevens  → contactgegevens ingevuld, verzenden faalt met een foutmelding
 *   Bevestigen→ boeking ontvangen + betaalstap (create-intent gemockt, Stripe uit)
 */

const ROUTE = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol`;
const FULL = `${ROUTE}&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;

const submitButton = (page: Page) => page.getByRole("button", { name: "Boeking bevestigen" });
/** De boekingskaart: ouder van het boekingsformulier (de betaalstap heeft een eigen form). */
const card = (page: Page) => submitButton(page).locator("xpath=ancestor::form/..");
const price = (page: Page) => page.getByRole("region", { name: "Geschatte prijs" });

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
  const form = submitButton(page).locator("xpath=ancestor::form");
  await form.getByLabel("Naam", { exact: true }).fill("Visual Test");
  await form.getByLabel(/^Telefoon/).fill(phone);
  await form.getByLabel(/^E-mail/).fill("visual@example.test");
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
    await cardShot(page, "booking-1-route.png");
  });

  test("stap Rit (prijs ready)", async ({ page }) => {
    await openBooking(page, FULL);
    await expect(price(page)).toContainText("89");
    await expect(price(page)).toHaveAttribute("aria-busy", "false");
    await cardShot(page, "booking-2-rit.png");
  });

  test("stap Gegevens met validatiefout", async ({ page }) => {
    // Lege verplichte velden geven alleen de native browserballon (niet in een
    // screenshot), en zonder geldige prijs is de knop disabled. De zichtbare
    // validatiefout is daarom de servervalidatie op een te kort telefoonnummer.
    await openBooking(page, FULL, "ready", "invalid-phone");
    await expect(price(page)).toContainText("89");
    await fillContact(page, "123");
    await submitButton(page).click();
    await expect(card(page).getByRole("alert")).toBeVisible();
    await cardShot(page, "booking-3-gegevens-fout.png");
  });

  test("stap Bevestigen + betaalstap", async ({ page }) => {
    await openBooking(page, FULL);
    await expect(price(page)).toContainText("89");
    await fillContact(page);
    const intent = page.waitForResponse(/\/api\/payments\/create-intent/);
    await submitButton(page).click();
    await intent;
    await expect(card(page)).toContainText("T4X-VISUAL-0001");
    await expect(card(page).locator("#betaling-kop")).toBeVisible();
    await cardShot(page, "booking-4-bevestigen-betaalstap.png");
  });
});
