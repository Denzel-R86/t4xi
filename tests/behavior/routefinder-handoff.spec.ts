import { expect, test, type Page, type Route } from "@playwright/test";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";

/**
 * Gedragscheck PR 2.7: RouteFinder "UW RIT" → "Boek deze rit" → /boeken?h=1 via de
 * 2.3-handoff. Geen adres in de URL; /boeken toont de prijs voorlopig (geheugen,
 * nooit storage) tot de server bevestigt. F-28 en F-17 in dezelfde flow. Offline
 * mocks (harness); het adres is fictief.
 */

const ADDRESS = "Voorbeeldstraat 12, Almere";

const finder = (page: Page) =>
  page.locator("div.max-w-3xl").filter({ has: page.getByRole("button", { name: /Bereken vaste prijs/ }) }).first();
const ride = (page: Page) => page.getByTestId("uw-rit");
const priceRegion = (page: Page) => page.getByRole("region", { name: "Geschatte prijs" });
const currentStep = (page: Page) =>
  page.getByRole("navigation", { name: "Voortgang van uw boeking" }).locator('[aria-current="step"]');

async function compute(page: Page, opts: { retour?: boolean } = {}) {
  const f = finder(page);
  const pickup = f.getByLabel("Waar mogen wij u ophalen?");
  const places = page.waitForResponse(/\/api\/places/);
  await pickup.fill(ADDRESS);
  await places;
  // Vóór de prijs mag de lege-zoekmelding er staan (bewijst dat de F-17-check kan falen).
  await expect(f.getByText("Geen adressen gevonden")).toBeVisible();
  await pickup.blur();
  const to = f.getByLabel("Waar gaat de reis naartoe?");
  const places2 = page.waitForResponse(/\/api\/places/);
  await to.fill("Schiphol");
  await places2;
  await to.blur();
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

test.describe("RouteFinder → /boeken (PR 2.7)", () => {
  test("Boek deze rit → /boeken?h=1: voorlopige prijs, daarna serverbevestiging", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await open(page, "/tarieven");
    await compute(page);

    // Prijsopbouw uit serverwaarden; geen besparingsclaim (F-28).
    const card = ride(page);
    await expect(card).toContainText("89");
    await expect(card.locator('[data-source="distanceKm"]')).toContainText("26 km");
    await expect(card.locator('[data-source="estimatedDurationMin"]')).toContainText("28 min");
    await expect(card.locator('[data-source="price"]')).toContainText("89,00");
    await expect(card).toContainText("Indicatief maximum via taxameter");
    await expect(card).not.toContainText(/betaalt .* minder|%\)/);

    // F-17: het geprijsde adres opnieuw focussen → geen "Geen adressen gevonden".
    await finder(page).getByLabel("Waar mogen wij u ophalen?").focus();
    await expect(finder(page).getByText("Geen adressen gevonden")).toHaveCount(0);
    await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());

    const book = card.getByRole("link", { name: "Boek deze rit" });
    expect(await book.getAttribute("href")).toMatch(/\/boeken\?h=1$/);

    // Vanaf de klik (de adreszoekopdracht zelf is bewust invoer voor PDOK/places).
    urls.length = 0;
    const held: Route[] = [];
    await page.route("**/api/pricing/quote", (route) => void held.push(route));
    await book.click();
    await expect(page).toHaveURL(/\/boeken\?h=1$/);
    await expect(currentStep(page)).toContainText("Rit");
    await expect(page.locator("#f-pickup input")).toHaveValue(ADDRESS);

    const region = priceRegion(page);
    await expect(region).toHaveAttribute("data-price-state", "provisional");
    await expect(region).toContainText("89,00");
    await expect(region).not.toContainText(/Vaste prijs|Uw vaste prijs/);
    await expect.poll(() => held.length, { message: "hook rekent verifiërend" }).toBeGreaterThan(0);
    const body = JSON.parse(held.at(-1)!.request().postData() ?? "{}");
    expect(body).toMatchObject({ pickup: ADDRESS, dropoff: "Schiphol", date: RIDE.date, time: RIDE.time, luggageCategory: "1-2-koffers", passengers: 1, returnTrip: false });

    for (const r of held.splice(0)) {
      await r.fulfill({ status: 200, contentType: "application/json", body: fixture("quote-ready") }).catch(() => {});
    }
    await expect(region).toHaveAttribute("data-price-state", "ready");
    await expect(region).toContainText("Vaste prijs vooraf");
    await expect(region).toContainText("89");

    // Storage bevat alleen de gevalideerde rit, nooit een prijs.
    const stored = await page.evaluate(() => sessionStorage.getItem("t4xi:handoff:v1") ?? "");
    expect(stored).toContain('"quoteId":"visual-fixture-quote-ready"');
    expect(stored).not.toMatch(/"price"/);

    const leaks = urls.filter((u) => /voorbeeldstraat/i.test(decodeURIComponent(u)));
    expect(leaks, "geen adres in een URL na de klik").toEqual([]);
    expect(decodeURIComponent(page.url())).not.toMatch(/voorbeeldstraat|pickup=|dropoff=/i);
  });

  test("retour past niet in het handoff-formaat: bestaande deep-link blijft", async ({ page }) => {
    await stabilize(page, { quote: "ready-retour" });
    await open(page, "/tarieven");
    await compute(page, { retour: true });
    await expect(ride(page)).toContainText("170");
    const href = (await ride(page).getByRole("link", { name: "Boek deze rit" }).getAttribute("href")) ?? "";
    expect(href).toMatch(/\/boeken\?.*retour=1/);
  });
});
