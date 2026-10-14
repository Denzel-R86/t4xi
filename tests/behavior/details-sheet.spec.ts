import { expect, test, type Page, type Route } from "@playwright/test";
import path from "node:path";
import { fixture, open, RIDE, stabilize } from "../visual/support/harness";
import { detailsSheet, detailsTrigger, fillAddress, fillDetails, openDetails, sentenceRoot } from "../visual/support/sentence";

/**
 * Gedragscheck PR 2.6b (masterplan §6.5): op < 768px opent de zinregel
 * "op … om … met … en …" één bottom sheet met native pickers voor datum, tijd,
 * passagiers en bagage. Draait in WebKit (iPhone 13) en Chromium 375; de
 * desktopcontrole (@desktop) in Chromium 1280. Playwright-WebKit is geen echte iOS-Safari.
 */

const stamp = (page: Page) => sentenceRoot(page).locator('[aria-live="polite"]');
const activeInSheet = (page: Page) =>
  page.evaluate(() => Boolean(document.activeElement?.closest("dialog#hero-details-sheet")));

/** Houdt quote-verzoeken vast tot release(); antwoord = vaste fixture. */
async function heldQuotes(page: Page) {
  const pending: Route[] = [];
  const bodies: Record<string, unknown>[] = [];
  await page.route("**/api/pricing/quote", (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? "{}"));
    pending.push(route);
  });
  return {
    bodies,
    async release() {
      for (const r of pending.splice(0)) {
        await r.fulfill({ status: 200, contentType: "application/json", body: fixture("quote-ready") }).catch(() => {});
      }
    },
  };
}

async function recordScrolls(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __scrolls: number };
    w.__scrolls = 0;
    const orig = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function (arg?: boolean | ScrollIntoViewOptions) {
      w.__scrolls++;
      return orig.call(this, arg as ScrollIntoViewOptions);
    };
  });
}
const scrollCount = (page: Page) => page.evaluate(() => (window as unknown as { __scrolls: number }).__scrolls);

async function fillAddresses(page: Page) {
  await fillAddress(page, "Vertrek", "Amsterdam Zuidas");
  await fillAddress(page, "Bestemming", "Schiphol");
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/** Zet de zinregel net boven de onderrand, zodat de resultaatregel onder de vouw valt. */
async function placeDetailsNearBottom(page: Page) {
  await page.evaluate(() => {
    const el = document.querySelector<HTMLElement>('button[aria-controls="hero-details-sheet"]')!;
    const vh = window.visualViewport?.height ?? window.innerHeight;
    window.scrollBy({ top: el.getBoundingClientRect().bottom - (vh - 8), behavior: "instant" });
  });
  await page.waitForTimeout(150);
  return page.evaluate(() => window.scrollY);
}

/** Overlap (px²) tussen de zichtbare StickyCta en de zin of de open sheet. */
async function barOverlap(page: Page) {
  return page.evaluate(() => {
    const bar = document.querySelector<HTMLElement>(".sticky-cta");
    if (!bar || getComputedStyle(bar).visibility === "hidden") return 0;
    const b = bar.getBoundingClientRect();
    const els = [
      document.querySelector<HTMLElement>("div.hz-sentence")!,
      document.querySelector<HTMLElement>("dialog#hero-details-sheet[open]"),
    ].filter((e): e is HTMLElement => Boolean(e));
    return els.reduce((sum, el) => {
      const r = el.getBoundingClientRect();
      const w = Math.min(r.right, b.right) - Math.max(r.left, b.left);
      const h = Math.min(r.bottom, b.bottom) - Math.max(r.top, b.top);
      return sum + (w > 0 && h > 0 ? w * h : 0);
    }, 0);
  });
}

test.describe("PR 2.6b mobiele detail-sheet (datum, tijd, passagiers, bagage)", () => {
  test("zinregel vervangt de inline velden; openen/sluiten zonder scrollsprong, focus terug", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const trigger = detailsTrigger(page);
    await expect(trigger).toBeVisible();
    // Lege waarden in stone-text, kleine letters via CSS (tekstinhoud: "Datum").
    await expect(trigger).toHaveText(/^op datum om tijd met 1 passagier en kies bagage\.$/i);
    expect((await trigger.boundingBox())!.height, "aanraakdoel ≥ 44px").toBeGreaterThanOrEqual(44);
    for (const label of ["Datum", "Tijd", "Passagiers", "Bagage"]) {
      await expect(sentenceRoot(page).getByLabel(label, { exact: true }).first(), `inline ${label} verborgen`).toBeHidden();
    }

    const y = await placeDetailsNearBottom(page);
    const sheet = await openDetails(page);
    await expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(await activeInSheet(page), "focus in de sheet").toBe(true);
    expect(await page.evaluate(() => window.scrollY), "geen scrollsprong bij openen").toBe(y);
    const box = (await sheet.boundingBox())!;
    const vp = page.viewportSize()!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    expect(box.y + box.height, "sheet onderaan het venster").toBeLessThanOrEqual(vp.height + 1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);

    await sheet.getByRole("button", { name: "Sluiten" }).click();
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(await page.evaluate(() => window.scrollY), "geen scrollsprong bij sluiten").toBe(y);
  });

  test("Bevestigen schrijft de waarden in de zin; Escape en Sluiten laten de zin ongewijzigd", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await fillDetails(page, { date: RIDE.date, time: RIDE.time, passengers: 2, luggage: "1-2-koffers" });
    const trigger = detailsTrigger(page);
    await expect(trigger).toContainText(/do 12 nov/);
    await expect(trigger).toContainText("14:30");
    await expect(trigger).toContainText("2 passagiers");
    await expect(trigger).toContainText("1–2 koffers");
    const written = await trigger.innerText();

    // Heropenen toont de waarden uit de zin.
    let sheet = await openDetails(page);
    await expect(sheet.getByLabel("Datum", { exact: true })).toHaveValue(RIDE.date);
    await expect(sheet.getByLabel("Tijd", { exact: true })).toHaveValue(RIDE.time);
    await expect(sheet.getByLabel("Passagiers", { exact: true })).toHaveValue("2");
    await expect(sheet.getByLabel("Bagage", { exact: true })).toHaveValue("1-2-koffers");
    // Escape: concept vervalt.
    await sheet.getByLabel("Tijd", { exact: true }).fill("09:15");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
    expect(await trigger.innerText()).toBe(written);
    // Sluiten: concept vervalt ook.
    sheet = await openDetails(page);
    await expect(sheet.getByLabel("Tijd", { exact: true }), "concept is opnieuw de zin").toHaveValue(RIDE.time);
    await sheet.getByLabel("Passagiers", { exact: true }).selectOption("4");
    await sheet.getByRole("button", { name: "Sluiten" }).click();
    await expect(sheet).toBeHidden();
    expect(await trigger.innerText()).toBe(written);
  });

  test("prijsaanvraag pas na Bevestigen en alleen met complete zin; payload ongewijzigd", async ({ page }) => {
    await stabilize(page);
    const gate = await heldQuotes(page);
    await open(page, "/");
    await fillAddresses(page);
    // Onvolledig (geen bagage): geen aanvraag.
    await fillDetails(page, { date: RIDE.date, time: RIDE.time });
    await page.waitForTimeout(700);
    expect(gate.bodies, "geen quote zonder bagage").toHaveLength(0);
    await expect(stamp(page)).toContainText("Kies datum, tijd en bagage");
    // Tijdens het kiezen in de sheet: geen aanvraag.
    const sheet = await openDetails(page);
    await sheet.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
    await sheet.getByLabel("Passagiers", { exact: true }).selectOption("3");
    await page.waitForTimeout(700);
    expect(gate.bodies, "geen quote zolang de sheet open is").toHaveLength(0);
    await sheet.getByRole("button", { name: "Bevestigen" }).click();
    await expect.poll(() => gate.bodies.length).toBe(1);
    expect(gate.bodies[0]).toMatchObject({
      pickup: "Amsterdam Zuidas",
      dropoff: "Schiphol",
      date: RIDE.date,
      time: RIDE.time,
      luggageCategory: "1-2-koffers",
      passengers: 3,
    });
    await gate.release();
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
  });

  test("focus-trap en inerte achtergrond", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await openDetails(page);
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Tab");
      expect(await activeInSheet(page), `Tab ${i + 1} blijft in de sheet`).toBe(true);
    }
    for (let i = 0; i < 7; i++) {
      await page.keyboard.press("Shift+Tab");
      expect(await activeInSheet(page), `Shift+Tab ${i + 1} blijft in de sheet`).toBe(true);
    }
    const moved = await page.evaluate(() => {
      const el = document.querySelector<HTMLElement>("header a, footer a");
      el?.focus();
      return document.activeElement === el;
    });
    expect(moved, "achtergrond neemt geen focus").toBe(false);
    expect(await activeInSheet(page)).toBe(true);
  });

  test("F-18/F-26: datum en tijd op volle breedte, niet afgekapt (sheet en zinregel)", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const sheet = await openDetails(page);
    await sheet.getByLabel("Datum", { exact: true }).fill(RIDE.date);
    await sheet.getByLabel("Tijd", { exact: true }).fill(RIDE.time);
    const m = await sheet.evaluate((d) => {
      const rect = (sel: string) => d.querySelector<HTMLElement>(sel)!.getBoundingClientRect();
      const field = (sel: string) => {
        const el = d.querySelector<HTMLInputElement>(sel)!;
        return { ...JSON.parse(JSON.stringify(el.getBoundingClientRect())), sw: el.scrollWidth, cw: el.clientWidth };
      };
      return {
        sheet: rect("div.grid"),
        date: field("#hero-details-sheet-date"),
        time: field("#hero-details-sheet-time"),
        luggage: rect("#hero-details-sheet-luggage"),
        passengers: rect("#hero-details-sheet-passengers"),
      };
    });
    test.info().annotations.push({ type: "veldmaten", description: JSON.stringify(m) });
    for (const k of ["date", "time", "passengers", "luggage"] as const) {
      expect(m[k].height, `${k}: aanraakdoel ≥ 44px (WebKit negeert min-height op select)`).toBeGreaterThanOrEqual(44);
    }
    for (const k of ["date", "time"] as const) {
      expect(Math.abs(m[k].width - m.luggage.width), `${k} even breed als bagage (F-26)`).toBeLessThanOrEqual(1);
      expect(m[k].right, `${k} binnen de sheet`).toBeLessThanOrEqual(m.sheet.right + 0.5);
      expect(m[k].sw, `${k} zonder horizontale overloop`).toBeLessThanOrEqual(m[k].cw);
    }
    await sheet.getByLabel("Bagage", { exact: true }).selectOption("1-2-koffers");
    await sheet.getByRole("button", { name: "Bevestigen" }).click();
    await expect(sheet).toBeHidden();
    // In de zinregel is de waarde tekst (geen veld): volledig, zonder afkappen.
    const trigger = detailsTrigger(page);
    await expect(trigger).toContainText("14:30");
    const clipped = await trigger.evaluate((b) =>
      Array.from(b.querySelectorAll<HTMLElement>(".hz-focus")).filter((s) => s.scrollWidth > s.clientWidth + 0.5 || s.getBoundingClientRect().right > b.getBoundingClientRect().right + 0.5).length
    );
    expect(clipped, "geen afgekapte waarde in de zinregel").toBe(0);
  });

  test("StickyCta dekt zinregel en open sheet niet af", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await placeDetailsNearBottom(page);
    expect(await barOverlap(page), "zinregel onderaan: geen overlap").toBe(0);
    await detailsTrigger(page).tap();
    const sheet = detailsSheet(page);
    await expect(sheet).toBeVisible();
    expect(await barOverlap(page), "sheet open: geen overlap").toBe(0);
    const covered = await page.evaluate(() => {
      const d = document.querySelector<HTMLElement>("dialog#hero-details-sheet")!.getBoundingClientRect();
      const pts = [0.1, 0.5, 0.9].flatMap((fx) => [d.bottom - 8, d.bottom - 40].map((y) => [d.left + d.width * fx, y]));
      return pts.filter(([x, y]) => !document.elementFromPoint(x, y)?.closest("dialog#hero-details-sheet")).length;
    });
    expect(covered, "onderrand (Bevestigen) is van de sheet").toBe(0);
  });

  test("H-1: één scroll na de prijs van de bevestigde rit; geen scroll zolang de sheet open is", async ({ page }) => {
    await stabilize(page);
    const gate = await heldQuotes(page);
    await recordScrolls(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    await fillAddresses(page);
    await placeDetailsNearBottom(page);
    await fillDetails(page, { date: RIDE.date, time: RIDE.time, luggage: "1-2-koffers" });
    await expect.poll(() => gate.bodies.length).toBe(1);
    const resultBelow = await page.evaluate(() => {
      const r = document.querySelector<HTMLElement>('div.hz-sentence [aria-live="polite"]')!.getBoundingClientRect();
      return r.bottom > (window.visualViewport?.height ?? window.innerHeight);
    });
    expect(resultBelow, "resultaat onder de vouw").toBe(true);
    expect(await scrollCount(page), "geen scroll vóór de prijs").toBe(0);
    await gate.release();
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    await page.waitForTimeout(300);
    expect(await scrollCount(page), "precies één scroll").toBe(1);

    // Nieuwe rit (andere tijd) terwijl de klant de sheet opnieuw opent: prijs landt
    // met de sheet open → geen scroll, en de rit telt als afgehandeld.
    await placeDetailsNearBottom(page);
    await fillDetails(page, { time: "15:00" });
    await expect.poll(() => gate.bodies.length).toBe(2);
    await openDetails(page);
    await gate.release();
    await expect(stamp(page)).toContainText(/Uw vaste prijs/);
    await page.waitForTimeout(300);
    expect(await scrollCount(page), "geen scroll met open sheet").toBe(1);
    await page.keyboard.press("Escape");
    await expect(detailsSheet(page)).toBeHidden();
    await page.waitForTimeout(300);
    expect(await scrollCount(page), "ook niet na sluiten").toBe(1);
  });

  test("reduced motion: geen slide; zonder reduced motion wel", async ({ page }) => {
    await stabilize(page);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await open(page, "/");
    const sheet = await openDetails(page);
    expect(await sheet.evaluate((d) => getComputedStyle(d).animationName)).toBe("none");
    await page.keyboard.press("Escape");
    await expect(sheet).toBeHidden();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await openDetails(page);
    expect(await sheet.evaluate((d) => getComputedStyle(d).animationName)).toBe("hz-sheet-in");
  });

  test("axe: sheet met waarden en ingevulde zinregel zonder WCAG-AA-overtredingen", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await page.addScriptTag({ path: path.join(process.cwd(), "node_modules/axe-core/axe.min.js") });
    const run = (selector: string) =>
      page.evaluate(async (sel) => {
        const axe = (window as unknown as { axe: { run: (ctx: unknown, opts: unknown) => Promise<{ violations: { id: string; impact: string; nodes: unknown[] }[] }> } }).axe;
        const r = await axe.run(sel, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"] } });
        return r.violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length})`);
      }, selector);
    expect(await run("div.hz-sentence"), "lege zin").toEqual([]);
    await fillDetails(page, { date: RIDE.date, time: RIDE.time, luggage: "1-2-koffers" });
    expect(await run("div.hz-sentence"), "ingevulde zinregel").toEqual([]);
    await openDetails(page);
    expect(await run("dialog#hero-details-sheet"), "sheet met waarden").toEqual([]);
  });
});

test.describe("PR 2.6b desktopzin ongewijzigd @desktop", () => {
  test("geen zinregel-knop of sheet; inline velden zichtbaar", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await expect(detailsTrigger(page)).toBeHidden();
    await expect(detailsSheet(page)).toBeHidden();
    for (const label of ["Datum", "Tijd", "Passagiers", "Bagage"]) {
      await expect(sentenceRoot(page).getByLabel(label, { exact: true }).first()).toBeVisible();
    }
  });
});
