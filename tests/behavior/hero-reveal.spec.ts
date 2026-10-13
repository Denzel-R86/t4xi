import { expect, test, type Page, type Route } from "@playwright/test";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";
import { fillAddress, openAddress, sentenceRoot } from "../visual/support/sentence";

/**
 * Gedragscheck H-1 (F-14): automatisch scrollen naar de prijsregel in de hero, met een
 * bewust vastgehouden prijsaanvraag. Regressietest voor de fout uit 9315a8d: bij een
 * invoerwijziging scrolde de pagina al vóór de nieuwe response (verouderde uitkomst +
 * nieuwe invoer telde als "nieuwe rit"). Scenario 2 faalt op de code van vóór die fix.
 *
 * Draait via `npm run test:behavior` (playwright.behavior.config.ts) in WebKit met het
 * iPhone 13-profiel en in Chromium 375; in CI in de Visual regression-job.
 * Let op: Playwright-WebKit is geen echte iOS-Safari.
 */

const sentence = (page: Page) =>
  sentenceRoot(page);
const stamp = (page: Page) => sentence(page).locator('[aria-live="polite"]');

type Gate = { pending: Route[]; bodies: Record<string, unknown>[]; release(): Promise<void> };

/** Houdt elk quote-verzoek vast tot release(); antwoord = vaste fixture (zelfde prijs). */
async function delayedQuotes(page: Page): Promise<Gate> {
  const gate: Gate = {
    pending: [],
    bodies: [],
    async release() {
      const routes = gate.pending.splice(0);
      for (const r of routes) {
        await r
          .fulfill({ status: 200, contentType: "application/json", body: fixture("quote-ready") })
          .catch(() => {}); // afgebroken verzoek (AbortController) mag stil vallen
      }
    },
  };
  await page.route("**/api/pricing/quote", (route) => {
    gate.bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    gate.pending.push(route);
  });
  return gate;
}

async function recordScrolls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrolls: { behavior?: string; block?: string; t: number }[] };
    w.__scrolls = [];
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
      const o = typeof arg === "object" ? arg : {};
      w.__scrolls.push({ behavior: o.behavior, block: o.block, t: performance.now() });
      return orig.call(this, arg as ScrollIntoViewOptions);
    };
  });
}
const scrolls = (page: Page) =>
  page.evaluate(() => (window as unknown as { __scrolls: { behavior?: string; t: number }[] }).__scrolls);
const resetScrolls = (page: Page) =>
  page.evaluate(() => ((window as unknown as { __scrolls: unknown[] }).__scrolls = []));

/** Zet de bovenkant van de zin net in beeld, zodat de resultaatregel onder de vouw valt. */
async function placeResultBelowFold(page: Page) {
  await page.evaluate(() => {
    const root = [...document.querySelectorAll("div.border-t")].find((d) =>
      d.querySelector('[role="combobox"][aria-label]')
    ) as HTMLElement;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    window.scrollBy({ top: root.getBoundingClientRect().top - (vh - 110), behavior: "instant" });
  });
  await page.waitForTimeout(150);
  const g = await geometry(page);
  expect(g.sentenceTop, "bovenkant zin in beeld").toBeLessThan(g.vh);
  expect(g.resultBottom, "resultaat onder de vouw").toBeGreaterThan(g.vh);
}

async function geometry(page: Page) {
  return page.evaluate(() => {
    const root = [...document.querySelectorAll("div.border-t")].find((d) =>
      d.querySelector('[role="combobox"][aria-label]')
    ) as HTMLElement;
    const result = root.querySelector('[aria-live="polite"]') as HTMLElement;
    const r = result.getBoundingClientRect();
    return {
      vh: window.visualViewport?.height ?? window.innerHeight,
      scrollY: window.scrollY,
      sentenceTop: root.getBoundingClientRect().top,
      resultTop: r.top,
      resultBottom: r.bottom,
      active: (document.activeElement?.getAttribute("aria-label") ?? document.activeElement?.tagName) || null,
    };
  });
}

async function blurActive(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

async function fillAll(page: Page, from = "Amsterdam Zuidas") {
  await fillAddress(page, "Vertrek", from);
  await fillAddress(page, "Bestemming", "Schiphol");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await page.getByLabel("Datum", { exact: true }).first().fill(RIDE.date);
  await page.getByLabel("Tijd", { exact: true }).first().fill(RIDE.time);
  await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
  await blurActive(page);
}

async function landAndSettle(page: Page, gate: Gate, prevBodies: number) {
  await expect.poll(() => gate.bodies.length, { message: "nieuw quote-verzoek" }).toBeGreaterThan(prevBodies);
  await expect(stamp(page)).toHaveAttribute("aria-busy", "true");
  const releasedAt = await page.evaluate(() => performance.now());
  await gate.release();
  await expect(stamp(page)).toContainText(/Uw vaste prijs/);
  await expect(stamp(page)).toHaveAttribute("aria-busy", "false");
  await page.waitForTimeout(1200); // ruim voorbij een eventuele smooth scroll
  return releasedAt;
}

test.describe("H-1 automatisch scrollen naar de prijs", () => {
  test("1+2+3+5: nieuwe rit één scroll; dubbele response geen; andere route zelfde prijs wel; reduced motion zonder animatie", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await recordScrolls(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");

    // (1) nieuwe rit, prijs komt onder de vouw binnen
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    await placeResultBelowFold(page);
    await resetScrolls(page);
    const before1 = await geometry(page);
    const rel1 = await landAndSettle(page, gate, 0);
    const s1 = await scrolls(page);
    expect(s1.every((x) => x.t >= rel1), "scroll pas bij binnenkomst van de prijs").toBe(true);
    const after1 = await geometry(page);
    expect(s1, "precies één scroll").toHaveLength(1);
    expect(after1.resultBottom).toBeLessThanOrEqual(after1.vh + 1);
    expect(after1.active, "focus ongewijzigd").toBe(before1.active);
    const price1 = await stamp(page).innerText();

    // (5) reduced motion: geen smooth-gedrag, positie direct bereikt
    expect(s1[0].behavior).toBe("auto");
    const scrollBehavior = await page.evaluate(() => getComputedStyle(document.documentElement).scrollBehavior);
    expect(scrollBehavior, "geen CSS smooth scroll onder reduced motion").toBe("auto");

    // (2) dubbele response voor dezelfde rit: tijd heen-en-terug binnen de debounce
    await placeResultBelowFold(page);
    await resetScrolls(page);
    const n2 = gate.bodies.length;
    const time = page.getByLabel("Tijd", { exact: true }).first();
    await time.fill("14:31");
    await time.fill(RIDE.time);
    await blurActive(page);
    const rel2 = await landAndSettle(page, gate, n2);
    test.info().annotations.push({ type: "scroll2", description: JSON.stringify({ rel2, s: await scrolls(page) }) });
    const last2 = gate.bodies.at(-1) as { time?: string; pickup?: string };
    expect(last2.time, "tweede verzoek voor dezelfde rit").toBe(RIDE.time);
    expect(last2.pickup).toBe("Amsterdam Zuidas");
    expect(await scrolls(page), "geen tweede scroll voor dezelfde rit").toHaveLength(0);

    // (3) andere route, zelfde prijs → telt als nieuw
    await placeResultBelowFold(page);
    await resetScrolls(page);
    const n3 = gate.bodies.length;
    await fillAddress(page, "Vertrek", "Almere Poort");
    await blurActive(page);
    await expect(page.getByRole("listbox")).toHaveCount(0);
    const rel3 = await landAndSettle(page, gate, n3);
    expect((gate.bodies.at(-1) as { pickup?: string }).pickup).toBe("Almere Poort");
    expect(await stamp(page).innerText(), "zelfde prijs").toBe(price1);
    const s3 = await scrolls(page);
    expect(s3, "andere route met dezelfde prijs scrolt één keer").toHaveLength(1);
    expect(s3[0].t, "scroll pas bij binnenkomst van de prijs").toBeGreaterThanOrEqual(rel3);
    expect(s3[0].behavior).toBe("auto");

    test.info().annotations.push({ type: "bodies", description: JSON.stringify(gate.bodies.map((b) => [b.pickup, b.time])) });
  });

  test("4: geen scroll tijdens adresinvoer, focus blijft in het adresveld", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await recordScrolls(page);
    await open(page, "/");
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    await placeResultBelowFold(page);
    // Klant gaat terug naar het adresveld terwijl de prijs nog laadt
    // (< 768px: de sheet opent; openen mag de pagina niet verschuiven).
    const scrollBeforeOpen = await page.evaluate(() => window.scrollY);
    await openAddress(page, "Vertrek");
    expect(await page.evaluate(() => window.scrollY), "invoer openen verschuift de pagina niet").toBe(scrollBeforeOpen);
    await resetScrolls(page);
    const before = await geometry(page);
    expect(before.active).toBe("Vertrek");
    await gate.release();
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    await page.waitForTimeout(1200);
    const after = await geometry(page);
    expect(await scrolls(page), "geen scroll tijdens adresinvoer").toHaveLength(0);
    expect(after.scrollY, "scrollpositie ongewijzigd").toBe(before.scrollY);
    expect(after.active, "focus blijft in Vertrek").toBe("Vertrek");
  });

  test("5b: zonder reduced motion wél smooth (controle dat 5 conditioneel is)", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await recordScrolls(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, "/");
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    await placeResultBelowFold(page);
    await resetScrolls(page);
    await landAndSettle(page, gate, 0);
    const s = await scrolls(page);
    expect(s).toHaveLength(1);
    expect(s[0].behavior).toBe("smooth");
    const g = await geometry(page);
    expect(g.resultBottom).toBeLessThanOrEqual(g.vh + 1);
  });
});

/**
 * PR 2.1 (desktop ≥ 768px): passagiers in de zin en de JourneyLine. Draait alleen in
 * het project chromium-1280 (tag @desktop); de mobiele zin heeft geen passagiersveld.
 */
const journey = (page: Page) => sentence(page).locator(".hz-jl");

test.describe("PR 2.1 boekingszin desktop @desktop", () => {
  test("passagiers wijzigen = nieuwe rit: nieuw verzoek met passengers en één reveal-scroll", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await recordScrolls(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    // Laag laptopvenster: alleen dan kan de resultaatregel onder de vouw vallen
    // terwijl de bovenkant van de zin in beeld is (op 1280×800 past alles).
    await page.setViewportSize({ width: 1280, height: 520 });
    await open(page, "/");
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    expect((gate.bodies[0] as { passengers?: number }).passengers, "standaard 1 passagier").toBe(1);
    await landAndSettle(page, gate, 0);

    await placeResultBelowFold(page);
    await resetScrolls(page);
    const n = gate.bodies.length;
    await page.getByLabel("Passagiers", { exact: true }).first().selectOption("3");
    await blurActive(page);
    const rel = await landAndSettle(page, gate, n);
    expect((gate.bodies.at(-1) as { passengers?: number }).passengers).toBe(3);
    const s = await scrolls(page);
    expect(s, "ander aantal passagiers scrolt één keer").toHaveLength(1);
    expect(s[0].t, "scroll pas bij binnenkomst van de prijs").toBeGreaterThanOrEqual(rel);
    const g = await geometry(page);
    expect(g.resultBottom).toBeLessThanOrEqual(g.vh + 1);
  });

  test("JourneyLine: empty → route → arrived bij ready (reduced motion direct)", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    await expect(journey(page)).toHaveAttribute("data-state", "empty");
    await expect(journey(page)).toHaveAttribute("aria-hidden", "true");
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    await expect(journey(page)).toHaveAttribute("data-state", "route");
    await landAndSettle(page, gate, 0);
    await expect(journey(page)).toHaveAttribute("data-state", "arrived");
    await expect(journey(page)).toHaveAttribute("role", "img");
    await expect(journey(page)).toHaveAttribute("aria-label", "Route van Amsterdam Zuidas naar Schiphol");
  });

  test("prijsreveal: ready → travelling → prijs na de reis (zonder reduced motion)", async ({ page }) => {
    await stabilize(page);
    const gate = await delayedQuotes(page);
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await open(page, "/");
    await fillAll(page);
    await expect.poll(() => gate.bodies.length).toBe(1);
    await gate.release();
    await expect(journey(page)).toHaveAttribute("data-state", "travelling");
    await expect(stamp(page)).not.toContainText(/Uw vaste prijs/);
    await expect(stamp(page)).toHaveAttribute("aria-busy", "true");
    await expect(journey(page)).toHaveAttribute("data-state", "arrived", { timeout: 3000 });
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    await expect(stamp(page)).toHaveAttribute("aria-busy", "false");
  });
});
