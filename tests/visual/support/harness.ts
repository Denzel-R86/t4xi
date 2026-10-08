import { expect, type Locator, type Page, type Route } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

/**
 * Gedeelde determinisme-laag voor de visual-regression-gate (§10b, PR 0.3).
 *
 *  · vaste klok (page.clock) — "vandaag" is altijd FIXED_NOW;
 *  · prefers-reduced-motion: reduce (via playwright.config.ts);
 *  · /api/pricing/quote, /api/places, /api/payments/*, /api/bookings en PDOK via
 *    page.route() op fixtures — nooit live Supabase, Stripe of PDOK;
 *  · ALLE overige verzoeken buiten de testserver worden afgebroken (Stripe.js,
 *    Sanity Live, …), zodat er nooit een externe bron in een snapshot lekt;
 *  · fonts en zichtbare afbeeldingen geladen vóór elke opname.
 *
 * De server-kant (Sanity/Supabase in server components) is offline gemaakt via
 * tests/visual/support/offline-server.cjs: daar geldt altijd de codefallback.
 */

/** Vast moment: donderdag 1 oktober 2026, 10:00 in Amsterdam. */
export const FIXED_NOW = new Date("2026-10-01T08:00:00.000Z");
/** Vertrekmoment ruim na FIXED_NOW (anders weigert de UI een prijs). */
export const RIDE = { date: "2026-11-12", time: "14:30", returnDate: "2026-11-19", returnTime: "18:00" } as const;

const FIXTURES = path.join(__dirname, "..", "fixtures");
export function fixture(name: string): string {
  return readFileSync(path.join(FIXTURES, `${name}.json`), "utf8");
}

export type QuoteMode = "ready" | "ready-retour" | "ready-arrival" | "onrequest" | "error" | "hang";

const QUOTE_RESPONSES: Record<Exclude<QuoteMode, "hang">, { status: number; body: string }> = {
  ready: { status: 200, body: fixture("quote-ready") },
  "ready-retour": { status: 200, body: fixture("quote-ready-retour") },
  "ready-arrival": { status: 200, body: fixture("quote-ready-arrival") },
  onrequest: { status: 404, body: fixture("quote-onrequest") },
  error: { status: 503, body: fixture("quote-error") },
};

export type Mocks = {
  /** Wisselt het quote-antwoord voor volgende verzoeken. */
  setQuote(mode: QuoteMode): void;
  /** Aantal ontvangen quote-verzoeken (om op het antwoord te kunnen wachten). */
  quoteCalls(): number;
};

function json(route: Route, status: number, body: string) {
  return route.fulfill({ status, contentType: "application/json", body });
}

/**
 * Zet klok + netwerk-mocks op. Altijd aanroepen vóór de eerste page.goto().
 */
export async function stabilize(
  page: Page,
  opts: { quote?: QuoteMode; booking?: "ok" | "invalid-phone" } = {}
): Promise<Mocks> {
  let quoteMode: QuoteMode = opts.quote ?? "ready";
  let calls = 0;

  await page.clock.setFixedTime(FIXED_NOW);

  // Vangnet eerst registreren: Playwright matcht de laatst geregistreerde route
  // het eerst, dus de specifieke mocks hieronder gaan vóór dit vangnet.
  await page.route("**/*", (route) => {
    const { protocol, hostname } = new URL(route.request().url());
    const local = hostname === "localhost" || hostname === "127.0.0.1";
    if (!local && protocol !== "data:" && protocol !== "blob:") return route.abort("blockedbyclient");
    return route.fallback();
  });

  await page.route("https://api.pdok.nl/**", (route) => json(route, 200, fixture("pdok-empty")));
  await page.route("**/api/places**", (route) => json(route, 200, fixture("places-empty")));
  await page.route("**/api/pricing/quote", async (route) => {
    calls += 1;
    if (quoteMode === "hang") return; // nooit beantwoorden → UI blijft in "loading"
    const r = QUOTE_RESPONSES[quoteMode];
    return json(route, r.status, r.body);
  });
  // Het "invalid-phone"-antwoord is letterlijk de servervalidatie uit
  // app/api/bookings/route.ts (400 invalid_input).
  await page.route("**/api/bookings", (route) =>
    opts.booking === "invalid-phone"
      ? json(route, 400, fixture("booking-invalid-phone"))
      : json(route, 200, fixture("booking-ok"))
  );
  await page.route("**/api/payments/create-intent", (route) => json(route, 200, fixture("create-intent")));
  await page.route("**/api/payments/status**", (route) => json(route, 200, '{"status":"pending"}'));
  await page.route("**/api/flights/**", (route) => json(route, 404, '{"error":"not_found"}'));

  return {
    setQuote(mode) {
      quoteMode = mode;
    },
    quoteCalls: () => calls,
  };
}

/** Navigeer en wacht tot hydratatie, netwerk en fonts rustig zijn. */
export async function open(page: Page, url: string) {
  await page.goto(url, { waitUntil: "networkidle" });
  await fontsReady(page);
}

export async function fontsReady(page: Page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(
      Array.from(document.fonts).map((f) => (f.status === "unloaded" ? f.load().catch(() => null) : f.loaded.catch(() => null)))
    );
  });
}

/** Wacht tot alle zichtbare afbeeldingen binnen `scope` echt geladen zijn. */
export async function imagesReady(scope: Locator) {
  const imgs = scope.locator("img");
  const count = await imgs.count();
  for (let i = 0; i < count; i++) {
    const img = imgs.nth(i);
    if (!(await img.isVisible())) continue;
    await img.scrollIntoViewIfNeeded();
    await expect
      .poll(() => img.evaluate((el: HTMLImageElement) => el.complete && el.naturalWidth > 0), { timeout: 15_000 })
      .toBe(true);
  }
}

/** Maskers die op elke opname gelden. */
export function defaultMasks(page: Page): Locator[] {
  return [
    // Stripe Elements-iframe (§10b): nooit in een baseline.
    page.locator('iframe[src*="stripe"], iframe[name^="__privateStripe"]'),
    // Server-gerenderd jaartal in de footer — page.clock raakt de server niet.
    page.getByText(/©\s*\d{4}\s*T4XI\.nl/),
  ];
}

/** CSS die sticky header en StickyCta uit component-opnames haalt. */
export const HIDE_OVERLAYS = path.join(__dirname, "hide-overlays.css");

/**
 * Haalt focus weg vóór gewone toestand-opnames (ready/loading/error), zodat
 * een geselecteerd segment in date/time-velden niet in de baseline belandt.
 * Focus-toestanden zetten hun focus daarna expliciet.
 */
export async function blurActive(page: Page) {
  await page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
}

/**
 * Wacht tot de pagina stilstaat en geeft de browser daarna twee frames om te
 * schilderen.
 *
 * Productcode scrollt met `scrollIntoView({ behavior: "smooth" })` (o.a. de
 * RouteFinder na "Bereken vaste prijs"). Chromium animeert dat óók bij
 * `reducedMotion: "reduce"`, en de animatie start pas na de quote-debounce.
 * Een opname midden in die scroll legt een tussentoestand vast: tekst in een
 * element op een fractionele paginapositie (bv. de bagage-select) snapt dan
 * per run 1px anders. Daarom: wacht tot scrollX/scrollY 10 frames gelijk zijn.
 */
export async function settle(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        let last = "";
        let still = 0;
        const deadline = performance.now() + 5_000;
        const tick = () => {
          const pos = `${window.scrollX},${window.scrollY}`;
          still = pos === last ? still + 1 : 0;
          last = pos;
          if (still >= 10 || performance.now() > deadline) resolve();
          else requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      })
  );
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
  );
}
