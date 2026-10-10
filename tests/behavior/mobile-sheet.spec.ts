import { expect, test, type Page } from "@playwright/test";
import path from "node:path";
import { open, RIDE, stabilize } from "../visual/support/harness";
import { addressSheet, fillAddress, openAddress, sentenceRoot, sheetTrigger } from "../visual/support/sentence";

/**
 * Gedragscheck PR 2.6 (masterplan §6.5): gestapelde mobiele zin + adres-sheet.
 * Draait in WebKit (iPhone 13) en Chromium 375. De F-16-check (bekende plek
 * met naam, quote-payload met volledig adres) draait daarnaast op desktop.
 */

const AIRPORT_ADDRESS = "Evert van de Beekstraat 202, 1118 CP Schiphol";
const AIRPORT_NAME = "Amsterdam Airport Schiphol (AMS)";

const stamp = (page: Page) => sentenceRoot(page).locator('[aria-live="polite"]');
const activeInSheet = (page: Page, id: string) =>
  page.evaluate((sheetId) => Boolean(document.activeElement?.closest(`dialog#${sheetId}`)), id);

/** Vangt elk quote-verzoek (body) en antwoordt met de gemockte vaste prijs. */
function recordQuotes(page: Page) {
  const bodies: Record<string, unknown>[] = [];
  page.on("request", (r) => {
    if (r.url().endsWith("/api/pricing/quote") && r.method() === "POST") bodies.push(JSON.parse(r.postData() ?? "{}"));
  });
  return bodies;
}

async function fillRide(page: Page) {
  await page.getByLabel("Datum", { exact: true }).first().fill(RIDE.date);
  await page.getByLabel("Tijd", { exact: true }).first().fill(RIDE.time);
  await page.getByLabel("Bagage", { exact: true }).first().selectOption("1-2-koffers");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Kiest de luchthaven uit de suggesties voor "Schiphol" en toetst F-16 in de lijst. */
async function chooseSchiphol(page: Page) {
  const input = await openAddress(page, "Bestemming");
  await input.pressSequentially("Schiphol");
  const first = page.getByRole("listbox").getByRole("option").first();
  await expect(first).toBeVisible();
  await expect(first).toContainText("Luchthaven");
  await expect(first).toContainText(AIRPORT_NAME);
  await first.click();
}

async function scrollToSentence(page: Page) {
  await page.evaluate(() => {
    const root = document.querySelector("div.hz-sentence") as HTMLElement;
    window.scrollBy({ top: root.getBoundingClientRect().top - 120, behavior: "instant" });
  });
  await page.waitForTimeout(150);
  return page.evaluate(() => window.scrollY);
}

test.describe("PR 2.6 mobiele zin + adres-sheet", () => {
  test("gestapelde zin: Van/Naar-regels, geen inline adresvelden, geen horizontale overflow", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await expect(sheetTrigger(page, "Vertrek")).toBeVisible();
    await expect(sheetTrigger(page, "Vertrek")).toContainText("Van");
    await expect(sheetTrigger(page, "Bestemming")).toContainText("Naar");
    await expect(page.getByRole("combobox", { name: "Vertrek" })).toHaveCount(0);
    await expect(page.getByLabel("Passagiers", { exact: true }).first()).toBeVisible();
    const from = await sheetTrigger(page, "Vertrek").boundingBox();
    const to = await sheetTrigger(page, "Bestemming").boundingBox();
    expect(to!.y, "Naar staat onder Van").toBeGreaterThan(from!.y + from!.height - 1);
    expect(from!.height, "aanraakdoel ≥ 44px").toBeGreaterThanOrEqual(44);
    await fillAddress(page, "Vertrek", "Hoofdweg 1234, 1111 AA Een Heel Lange Plaatsnaam Voor De Test");
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow, "geen horizontale scroll op 375").toBeLessThanOrEqual(0);
  });

  test("openen/sluiten met sluitknop: focus in het zoekveld, terug op de regel, geen scrollsprong", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const y = await scrollToSentence(page);
    await sheetTrigger(page, "Vertrek").click();
    const sheet = addressSheet(page, "Vertrek");
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole("combobox", { name: "Vertrek" })).toBeFocused();
    await expect(sheetTrigger(page, "Vertrek")).toHaveAttribute("aria-expanded", "true");
    expect(await page.evaluate(() => window.scrollY), "geen scrollsprong bij openen").toBe(y);
    const box = await sheet.boundingBox();
    const vw = page.viewportSize()!.width;
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(vw);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await sheet.getByRole("button", { name: "Sluiten" }).click();
    await expect(sheet).toBeHidden();
    await expect(sheetTrigger(page, "Vertrek")).toBeFocused();
    await expect(sheetTrigger(page, "Vertrek")).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => window.scrollY), "geen scrollsprong bij sluiten").toBe(y);
  });

  test("Escape sluit, focus terug, getypte tekst blijft (vrije tekst)", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const input = await openAddress(page, "Vertrek");
    await input.fill("Almere Poort");
    await page.keyboard.press("Escape");
    await expect(addressSheet(page, "Vertrek")).toBeHidden();
    await expect(sheetTrigger(page, "Vertrek")).toBeFocused();
    await expect(sheetTrigger(page, "Vertrek")).toContainText("Almere Poort");
  });

  test("focus-trap en inerte achtergrond", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await openAddress(page, "Vertrek");
    for (let i = 0; i < 4; i++) {
      await page.keyboard.press("Tab");
      expect(await activeInSheet(page, "hero-from-sheet"), `Tab ${i + 1} blijft in de sheet`).toBe(true);
    }
    for (let i = 0; i < 3; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await activeInSheet(page, "hero-from-sheet"), `Shift+Tab ${i + 1} blijft in de sheet`).toBe(true);
    }
    // De achtergrond is inert: focus erop lukt niet.
    const moved = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("header a, footer a");
      el?.focus();
      return document.activeElement === el;
    });
    expect(moved, "achtergrond neemt geen focus").toBe(false);
    expect(await activeInSheet(page, "hero-from-sheet")).toBe(true);
  });

  test("F-16: Schiphol als luchthaven met naam; quote en handoff krijgen het volledige adres", async ({ page }) => {
    await stabilize(page);
    const bodies = recordQuotes(page);
    await open(page, "/");
    await fillAddress(page, "Vertrek", "Amsterdam Zuidas");
    await chooseSchiphol(page);
    await expect(addressSheet(page, "Bestemming")).toBeHidden();
    await expect(sheetTrigger(page, "Bestemming")).toBeFocused();
    await expect(sheetTrigger(page, "Bestemming")).toContainText(AIRPORT_NAME);
    await expect(sheetTrigger(page, "Bestemming")).not.toContainText("Beekstraat");
    await fillRide(page);
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    const last = bodies.at(-1)!;
    expect(last).toMatchObject({ pickup: "Amsterdam Zuidas", dropoff: AIRPORT_ADDRESS, date: RIDE.date, time: RIDE.time, passengers: 1 });

    const n = bodies.length;
    await sentenceRoot(page).getByRole("link", { name: "Bekijk mijn vaste prijs" }).click();
    await expect(page).toHaveURL(/\/boeken\?h=1$/);
    await expect.poll(() => bodies.length, { message: "/boeken rekent verifiërend" }).toBeGreaterThan(n);
    expect(bodies.at(-1)).toMatchObject({ pickup: "Amsterdam Zuidas", dropoff: AIRPORT_ADDRESS });
  });

  test("reduced motion: geen slide; zonder reduced motion wel", async ({ page }) => {
    await stabilize(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    await openAddress(page, "Vertrek");
    const sheet = addressSheet(page, "Vertrek");
    expect(await sheet.evaluate((d) => getComputedStyle(d).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();

    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openAddress(page, "Vertrek");
    expect(await sheet.evaluate((d) => getComputedStyle(d).animationName)).toBe("hz-sheet-in");
  });

  test("axe: sheet met suggesties en gestapelde zin zonder WCAG-AA-overtredingen", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const run = (selector: string) =>
      page.evaluate(async (sel) => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
        const r = await axe.run(sel, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
        return r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
      }, selector);
    expect(await run("div.hz-sentence"), "gestapelde zin").toEqual([]);
    const input = await openAddress(page, "Bestemming");
    await input.pressSequentially("Schiphol");
    await expect(page.getByRole("listbox").getByRole("option").first()).toBeVisible();
    expect(await run("dialog#hero-to-sheet"), "sheet met suggesties").toEqual([]);
  });
});

test.describe("PR 2.6 F-16 desktopzin @desktop", () => {
  test("Schiphol: luchthaven met naam in lijst en veld; quote krijgt het volledige adres", async ({ page }) => {
    await stabilize(page);
    const bodies = recordQuotes(page);
    await open(page, "/");
    await fillAddress(page, "Vertrek", "Amsterdam Zuidas");
    await chooseSchiphol(page);
    await expect(page.getByRole("combobox", { name: "Bestemming" })).toHaveValue(AIRPORT_NAME);
    await fillRide(page);
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    expect(bodies.at(-1)).toMatchObject({ pickup: "Amsterdam Zuidas", dropoff: AIRPORT_ADDRESS });
  });
});
