import { expect, test, type Locator, type Page } from "@playwright/test";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";

/**
 * F-30: UW RIT toont de prijsopbouw uitsluitend uit `priceBreakdown` van de server.
 * Retour heen 14:30, terug 23:30 → Ritprijs € 184,00 + Nachttarief retour € 15,30
 * = € 199,30 (zoals productie). Elke regel draagt zijn serverveld (`data-source`).
 * Offline mocks; op 375 (en iPhone 13) en 1280 (@desktop).
 */

const finder = (page: Page) =>
  page.locator("div.max-w-3xl").filter({ has: page.getByRole("button", { name: /Bereken vaste prijs/ }) }).first();

async function fillAddress(page: Page, input: Locator, text: string) {
  const places = page.waitForResponse(/\/api\/places/);
  await input.fill(text);
  await places;
  await input.blur();
  await expect(page.getByRole("listbox")).toHaveCount(0);
}

async function nightReturn(page: Page) {
  await stabilize(page, { quote: "ready-retour" });
  // Na stabilize() geregistreerd = gaat vóór de gewone quote-mock.
  await page.route("**/api/pricing/quote", (route) =>
    route.fulfill({ status: 200, contentType: "application/json", body: fixture("quote-ready-retour-nacht") })
  );
  await open(page, "/tarieven");
  const f = finder(page);
  await fillAddress(page, f.getByLabel("Waar mogen wij u ophalen?"), "Amsterdam Zuidas");
  await fillAddress(page, f.getByLabel("Waar gaat de reis naartoe?"), "Schiphol");
  await f.getByLabel("Datum", { exact: true }).fill(RIDE.date);
  await f.getByLabel("Ophaaltijd", { exact: true }).fill(RIDE.time);
  await f.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
  await f.getByRole("radio", { name: "Retour" }).click();
  await f.getByLabel("Retourdatum").fill(RIDE.returnDate);
  await f.getByLabel("Retourtijd").fill("23:30");
  await f.getByRole("button", { name: /Bereken vaste prijs/ }).click();

  const opbouw = page.getByTestId("prijsopbouw");
  await expect(opbouw).toBeVisible();
  const rows = opbouw.locator("[data-source]");
  await expect(rows).toHaveCount(3);
  expect(await rows.evaluateAll((els) => els.map((e) => e.getAttribute("data-source")))).toEqual([
    "priceBreakdown.subtotalCents",
    "priceBreakdown.adjustments.night_return",
    "price",
  ]);
  const text = async (i: number) => (await rows.nth(i).innerText()).replace(/\s+/g, " ").trim();
  expect(await text(0)).toBe("Ritprijs € 184,00");
  expect(await text(1)).toBe("Nachttarief retour € 15,30");
  expect(await text(2)).toMatch(/^Vaste retourprijs · inclusief btw € 199,30$/i);
  // Retour: geen afstand/reistijd en geen wettelijke vergelijking (F-32 ongewijzigd).
  await expect(page.getByTestId("uw-rit")).not.toContainText("Indicatief maximum via taxameter");
  await expect(opbouw.locator('[data-source="distanceKm"]')).toHaveCount(0);
}

test("F-30: nachtretour toont servercomponenten die op € 199,30 sluiten", async ({ page }) => {
  await nightReturn(page);
});

test("F-30: nachtretour toont servercomponenten die op € 199,30 sluiten @desktop", async ({ page }) => {
  await nightReturn(page);
});
