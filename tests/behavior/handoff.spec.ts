import { expect, test, type Page, type Route } from "@playwright/test";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";

/**
 * Gedragscheck PR 2.3 (masterplan §7): hero-zin → /boeken via sessionStorage-handoff.
 * De URL bevat nooit een adres; /boeken toont dezelfde route en dezelfde prijs en
 * rekent verifiërend; publieke deep-links blijven werken; geknoeide storage wordt
 * genegeerd. Het adres hieronder is fictief.
 */

const ADDRESS = "Voorbeeldstraat 12, Almere";

const sentence = (page: Page) =>
  page.locator("div.border-t").filter({ has: page.getByRole("combobox", { name: "Vertrek" }) }).first();
const progress = (page: Page) => page.getByRole("navigation", { name: "Voortgang van uw boeking" });
const currentStep = (page: Page) => progress(page).locator('[aria-current="step"]');
const priceRegion = (page: Page) => page.getByRole("region", { name: "Geschatte prijs" });

async function fillSentence(page: Page) {
  await page.getByRole("combobox", { name: "Vertrek" }).fill(ADDRESS);
  const to = page.getByRole("combobox", { name: "Bestemming" });
  await to.fill("Schiphol");
  await to.blur();
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByLabel("Datum", { exact: true }).first().fill(RIDE.date);
  await page.getByLabel("Tijd", { exact: true }).first().fill(RIDE.time);
  await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(sentence(page).locator('[aria-live="polite"]')).toContainText(/Uw vaste prijs[\s\S]*89/);
}

test.describe("Handoff hero → /boeken (PR 2.3)", () => {
  test("zin → klik → /boeken?h=1 met route en dezelfde prijs; geen adres in URL of href", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    const urls: string[] = [];
    page.on("request", (r) => urls.push(r.url()));
    await open(page, "/");
    await fillSentence(page);

    const confirm = sentence(page).getByRole("link", { name: "Bekijk mijn vaste prijs" });
    const href = (await confirm.getAttribute("href")) ?? "";
    expect(href).toMatch(/\/boeken\?h=1$/);

    // /boeken's quote wordt vastgehouden: zo is te zien dat de prijs direct uit de
    // hero komt (geheugen, géén storage) terwijl de verificatie nog loopt.
    const held: Route[] = [];
    await page.route("**/api/pricing/quote", (route) => void held.push(route));
    await confirm.click();
    await expect(page).toHaveURL(/\/boeken\?h=1$/);
    await expect(currentStep(page)).toContainText("Rit");
    await expect(page.locator("#f-pickup input")).toHaveValue(ADDRESS);
    await expect(priceRegion(page)).toContainText("89");
    await expect(priceRegion(page)).toContainText("wordt gecontroleerd");
    await expect.poll(() => held.length, { message: "hook rekent verifiërend" }).toBeGreaterThan(0);
    const body = JSON.parse(held.at(-1)!.request().postData() ?? "{}");
    expect(body).toMatchObject({ pickup: ADDRESS, dropoff: "Schiphol", date: RIDE.date, time: RIDE.time, luggageCategory: "1-2-koffers", passengers: 1 });

    // Verificatie landt → de serverprijs (zelfde bedrag) met de gewone notitie.
    for (const r of held.splice(0)) {
      await r.fulfill({ status: 200, contentType: "application/json", body: fixture("quote-ready") }).catch(() => {});
    }
    await expect(priceRegion(page)).toContainText("Vaste prijs vooraf");
    await expect(priceRegion(page)).toContainText("89");

    const leaks = urls.filter((u) => /voorbeeldstraat/i.test(decodeURIComponent(u)));
    expect(leaks, "geen adres in een opgevraagde URL").toEqual([]);
    expect(decodeURIComponent(page.url())).not.toMatch(/voorbeeldstraat|pickup=|dropoff=/i);
  });

  test("publieke deep-link blijft werken", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    await open(page, `/boeken?pickup=${encodeURIComponent("Almere Poort")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`);
    await expect(currentStep(page)).toContainText("Rit");
    await expect(page.locator("#f-pickup input")).toHaveValue("Almere Poort");
    await expect(priceRegion(page)).toContainText("89");
  });

  test("geknoeide storage: prijs genegeerd; ongeldige handoff → leeg formulier", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    page.on("console", (m) => m.type() === "error" && /hydrat/i.test(m.text()) && errors.push(m.text()));
    await page.addInitScript(
      ({ ride }) => {
        // Eén keer zaaien; het init-script draait bij elke navigatie opnieuw.
        if (sessionStorage.getItem("seeded")) return;
        sessionStorage.setItem("seeded", "1");
        sessionStorage.setItem(
          "t4xi:handoff:v1",
          JSON.stringify({ v: 1, writtenAt: Date.now(), ...ride, price: 1, quoteId: "forged" })
        );
      },
      { ride: { pickup: ADDRESS, dropoff: "Schiphol", date: RIDE.date, time: RIDE.time, persons: 1, luggage: "1-2-koffers" } }
    );
    await open(page, "/boeken?h=1");
    await expect(currentStep(page)).toContainText("Rit");
    await expect(priceRegion(page)).toContainText("89");
    await expect(priceRegion(page)).not.toContainText(/€\s*1,00/);

    await page.evaluate(() => sessionStorage.setItem("t4xi:handoff:v1", JSON.stringify({ v: 2, pickup: "x" })));
    await open(page, "/boeken?h=1");
    await expect(currentStep(page)).toContainText("Route");
    await expect(page.locator("#f-pickup input")).toHaveValue("");
    expect(errors, "volledige laadactie met handoff: geen hydratatiefout").toEqual([]);
  });
});

test.describe("Handoff-overgang desktop @desktop", () => {
  test("zonder reduced motion: view transition, JourneyLine op /boeken, geen consolefouten", async ({ page }) => {
    await stabilize(page, { quote: "ready" });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    const errors: string[] = [];
    page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      const w = window as unknown as { __vt: number };
      w.__vt = 0;
      const d = document as Document & { startViewTransition?: (cb: () => unknown) => unknown };
      const orig = d.startViewTransition?.bind(d);
      if (orig) d.startViewTransition = (cb) => ((w.__vt += 1), orig(cb));
    });
    await open(page, "/");
    await fillSentence(page);
    await sentence(page).getByRole("link", { name: "Bekijk mijn vaste prijs" }).click();
    await expect(page).toHaveURL(/\/boeken\?h=1$/);
    const line = page.locator(".hx-handoff-journey").first();
    await expect(line).toBeVisible();
    await expect(line).toContainText(/Voorbeeldstraat 12/i);
    await expect(line).toContainText(/Schiphol/i);
    await expect(priceRegion(page)).toContainText("89");
    expect(await page.evaluate(() => (window as unknown as { __vt: number }).__vt)).toBe(1);
    // Ruis van de harness (geblokkeerde externe bronnen, Sanity Live offline) telt niet.
    const real = errors.filter((e) => !/ERR_BLOCKED_BY_CLIENT|SanityLive/.test(e));
    expect(real, "geen hydratatie- of transitiefouten").toEqual([]);
  });
});
