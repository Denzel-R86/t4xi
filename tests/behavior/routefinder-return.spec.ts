import { expect, test, type Locator, type Page } from "@playwright/test";
import { open, RIDE, stabilize } from "../visual/support/harness";

/**
 * F-29: routezoeker-retour (heen 14:30, terug 23:30) → "Boek deze rit" → /boeken.
 * Het retourmoment moet identiek zijn in de quote van de routezoeker, de quote van
 * /boeken en de boekings-POST — anders mist het nachttarief van het terug-ritdeel
 * of ontstaat een quote-mismatch. Offline mocks; stopt vóór betaling.
 */

const RETURN_TIME = "23:30";

const finder = (page: Page) =>
  page.locator("div.max-w-3xl").filter({ has: page.getByRole("button", { name: /Bereken vaste prijs/ }) }).first();
const currentStep = (page: Page) =>
  page.getByRole("navigation", { name: "Voortgang van uw boeking" }).locator('[aria-current="step"]');
const next = (page: Page) => page.getByRole("button", { name: "Volgende" });

async function fillAddress(page: Page, input: Locator, text: string) {
  const places = page.waitForResponse(/\/api\/places/);
  await input.fill(text);
  await places;
  await input.blur();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

test("F-29: retourmoment gelijk in routezoeker-quote, /boeken-quote en boekings-POST", async ({ page }) => {
  await stabilize(page, { quote: "ready-retour" });
  const quotes: { path: string; body: Record<string, unknown> }[] = [];
  // Na stabilize() geregistreerd = gaat vóór: alleen opnemen, dan de gewone mock.
  await page.route("**/api/pricing/quote", (route) => {
    quotes.push({ path: new URL(page.url()).pathname, body: JSON.parse(route.request().postData() ?? "{}") });
    return route.fallback();
  });
  const bookings: Record<string, unknown>[] = [];
  await page.route("**/api/bookings", (route) => {
    bookings.push(JSON.parse(route.request().postData() ?? "{}"));
    return route.fulfill({ status: 400, contentType: "application/json", body: '{"ok":false,"message":"stop"}' });
  });

  await open(page, "/tarieven");
  const f = finder(page);
  await fillAddress(page, f.getByLabel("Waar mogen wij u ophalen?"), "Amsterdam Zuidas");
  await fillAddress(page, f.getByLabel("Waar gaat de reis naartoe?"), "Schiphol");
  await f.getByLabel("Datum", { exact: true }).fill(RIDE.date);
  await f.getByLabel("Ophaaltijd", { exact: true }).fill(RIDE.time);
  await f.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
  await f.getByRole("radio", { name: "Retour" }).click();
  await f.getByLabel("Retourdatum").fill(RIDE.returnDate);
  await f.getByLabel("Retourtijd").fill(RETURN_TIME);
  await f.getByRole("button", { name: /Bereken vaste prijs/ }).click();
  await expect(f).toContainText("170");

  const finderQuote = quotes.filter((q) => q.path.endsWith("/tarieven")).at(-1)?.body;
  expect(finderQuote, "routezoeker deed een quote-aanvraag").toBeTruthy();
  expect(finderQuote).toMatchObject({
    returnTrip: true,
    date: RIDE.date,
    time: RIDE.time,
    returnDate: RIDE.returnDate,
    returnTime: RETURN_TIME,
  });

  const before = quotes.length;
  await f.getByRole("link", { name: "Boek deze rit" }).click();
  await expect(page).toHaveURL(/\/boeken\?/);
  expect(new URL(page.url()).searchParams.get("returnTime")).toBe(RETURN_TIME);
  await expect(currentStep(page)).toContainText("Rit");
  await expect.poll(() => quotes.length, { message: "/boeken rekent verifiërend" }).toBeGreaterThan(before);
  const bookingQuote = quotes.at(-1)!.body;
  expect(bookingQuote, "zelfde velden, zelfde waarden als de routezoeker").toEqual(finderQuote);
  await expect(page.getByRole("region", { name: "Geschatte prijs" })).toContainText("170");

  // Terugrit vanaf Schiphol = aankomst → retourvluchtnummer is verplicht (fictief).
  await page.getByLabel("Vluchtnummer terugrit").fill("KL1234");
  await next(page).click();
  await expect(currentStep(page)).toContainText("Gegevens");
  await page.getByRole("textbox", { name: "Naam", exact: true }).fill("Behaviour Test");
  await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("+31612345678");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("behaviour@example.test");
  await next(page).click();
  await expect(currentStep(page)).toContainText("Bevestigen");
  await page.getByRole("button", { name: "Boeking bevestigen" }).click();
  await expect.poll(() => bookings.length).toBe(1);
  expect(bookings[0]).toMatchObject({
    rideType: "retour",
    date: RIDE.date,
    time: RIDE.time,
    returnDate: finderQuote!.returnDate,
    returnTime: finderQuote!.returnTime,
    quoteId: "visual-fixture-quote-retour",
  });
});
