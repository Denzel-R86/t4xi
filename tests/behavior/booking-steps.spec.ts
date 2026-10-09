import { expect, test, type Page } from "@playwright/test";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";

/**
 * Gedragscheck PR 2.4 (F-13, F-26): BookingSection als stappen Route → Rit →
 * Gegevens → Bevestigen, focus naar het eerste foutieve veld, en datum/tijd even
 * breed als de andere velden.
 *
 * Draait via `npm run test:behavior` in WebKit (iPhone 13-profiel) en Chromium 375.
 * Let op: Playwright-WebKit is geen echte iOS-Safari — F-26 is daar alleen als
 * regressiecheck te meten, niet als bewijs voor een echt iPhone.
 */

const FULL = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;

const progress = (page: Page) => page.getByRole("navigation", { name: "Voortgang van uw boeking" });
const currentStep = (page: Page) => progress(page).locator('[aria-current="step"]');
const next = (page: Page) => page.getByRole("button", { name: "Volgende" });

async function openBooking(page: Page, query: string) {
  await stabilize(page, { quote: "ready" });
  const bodies: Record<string, unknown>[] = [];
  // Na stabilize() geregistreerd = gaat vóór: vangt de payload op en antwoordt
  // met letterlijk de servervalidatie uit app/api/bookings/route.ts.
  await page.route("**/api/bookings", (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 400, contentType: "application/json", body: fixture("booking-invalid-phone") });
  });
  await open(page, `/boeken?${query}`);
  return bodies;
}

test.describe("BookingSection-stappen (PR 2.4)", () => {
  test("ongeldig telefoonnummer: focus, aria-invalid en gekoppelde melding op het telefoonveld", async ({ page }) => {
    const bodies = await openBooking(page, FULL);

    // Deep-link met beide adressen start op stap 2.
    await expect(currentStep(page)).toContainText("Rit");
    await expect(page.getByRole("heading", { level: 2, name: /Stap 2 van 4\s*Rit/ })).toBeVisible();
    await expect(page.getByRole("region", { name: "Geschatte prijs" })).toContainText("89");

    await next(page).click();
    await expect(currentStep(page)).toContainText("Gegevens");
    await expect(page.getByRole("heading", { level: 2, name: /Stap 3 van 4/ })).toBeFocused();
    await expect(progress(page).getByRole("button", { name: /Route/ })).toBeVisible();
    await expect(progress(page).getByRole("button", { name: /Rit/ })).toBeVisible();

    await page.getByRole("textbox", { name: "Naam", exact: true }).fill("Behaviour Test");
    await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("123");
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("behaviour@example.test");
    await next(page).click();
    await expect(currentStep(page)).toContainText("Bevestigen");
    await expect(page.getByRole("region", { name: "Gegevens" })).toContainText("behaviour@example.test");

    await page.getByRole("button", { name: "Boeking bevestigen" }).click();

    const phone = page.locator("#f-phone");
    await expect(currentStep(page)).toContainText("Gegevens");
    await expect(phone).toBeFocused();
    await expect(phone).toHaveAttribute("aria-invalid", "true");
    await expect(phone).toHaveAttribute("aria-describedby", /\bf-phone-error\b/);
    await expect(page.locator("#f-phone-error")).toHaveText("Vul een geldig telefoonnummer in.");
    await expect(phone).toHaveAccessibleDescription("Vul een geldig telefoonnummer in.");
    // Veldfout = geen algemene banner (F-13).
    const card = page.locator("form").filter({ has: phone }).locator("xpath=..");
    await expect(card.getByRole("alert")).toHaveCount(0);

    // Payload ongewijzigd: dezelfde sleutels en de waarden uit het formulier.
    expect(bodies).toHaveLength(1);
    expect(Object.keys(bodies[0])).toEqual([
      "rideType", "pickup", "dropoff", "quoteId", "date", "time", "returnDate", "returnTime",
      "persons", "luggage", "flightNumber", "returnFlightNumber", "customerName", "customerPhone",
      "customerEmail", "locale", "website",
    ]);
    expect(bodies[0]).toMatchObject({
      rideType: "enkel",
      pickup: "Amsterdam Zuidas",
      dropoff: "Schiphol",
      date: RIDE.date,
      time: RIDE.time,
      luggage: "1-2-koffers",
      customerName: "Behaviour Test",
      customerPhone: "123",
      customerEmail: "behaviour@example.test",
      locale: "nl",
      website: "",
    });

    // Typen in het veld haalt de fout weg.
    await phone.fill("+31 6 00000000");
    await expect(phone).not.toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#f-phone-error")).toHaveCount(0);
  });

  test("leeg verplicht veld: eigen melding bij het veld in plaats van de browserballon", async ({ page }) => {
    await openBooking(page, FULL);
    await next(page).click();
    await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("+31 6 00000000");
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("behaviour@example.test");
    await next(page).click();

    const name = page.locator("#f-name");
    await expect(currentStep(page)).toContainText("Gegevens");
    await expect(name).toBeFocused();
    await expect(name).toHaveAttribute("aria-invalid", "true");
    await expect(page.locator("#f-name-error")).toHaveText("Dit veld is verplicht.");
  });

  test("Route zonder bestemming: focus op het bestemmingsveld, Rit blijft dicht", async ({ page }) => {
    await openBooking(page, `pickup=${encodeURIComponent("Amsterdam Zuidas")}`);
    await expect(currentStep(page)).toContainText("Route");
    await next(page).click();

    const dropoff = page.getByRole("combobox", { name: "Naar" });
    await expect(currentStep(page)).toContainText("Route");
    await expect(dropoff).toBeFocused();
    await expect(dropoff).toHaveAttribute("aria-invalid", "true");
    await expect(dropoff).toHaveAccessibleDescription("Vul een ophaaladres en bestemming in.");
  });

  for (const locale of ["nl-NL", "en-US"] as const) {
    test.describe(`F-26 datum/tijd-breedte (${locale})`, () => {
      test.use({ locale });

      test("datum- en tijdveld zijn niet breder dan de andere velden", async ({ page }) => {
        await openBooking(page, `${FULL}&retour=1&returnDate=${RIDE.returnDate}&returnTime=${RIDE.returnTime}`);
        const box = async (sel: string) => {
          const b = await page.locator(sel).boundingBox();
          if (!b) throw new Error(`${sel} niet zichtbaar`);
          return b;
        };
        const persons = await box("#f-persons");
        const luggage = await box("#f-luggage");
        for (const sel of ["#f-date", "#f-time", "#f-return-date", "#f-return-time"]) {
          const b = await box(sel);
          expect(Math.abs(b.width - luggage.width), `${sel} breedte`).toBeLessThanOrEqual(1);
          expect(Math.abs(b.width - persons.width), `${sel} breedte vs passagiers`).toBeLessThanOrEqual(1);
        }
        const scrollOverflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
        expect(scrollOverflow).toBeLessThanOrEqual(0);
      });
    });
  }
});
