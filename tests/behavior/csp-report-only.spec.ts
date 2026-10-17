import { expect, test, type Page } from "@playwright/test";
import { open, RIDE, stabilize } from "../visual/support/harness";
import { fakeStripe } from "../visual/support/fake-stripe";

/**
 * S1 (masterplan §9): de report-only nonce-CSP uit proxy.ts geeft op de
 * kernpagina's NUL violations — vóórdat de eigenaar tot enforce besluit.
 *
 * Meetpunt: een `securitypolicyviolation`-listener (addInitScript, dus vóór elk
 * paginascript) plus console-meldingen met "Content Security Policy". Alleen
 * report-only-violations tellen hier; de afgedwongen policy blijft ongewijzigd.
 * Offline harness: alles buiten localhost wordt door stabilize() afgebroken.
 *
 * Draait op webkit-iphone13 + chromium-375 (zonder tag) en chromium-1280 (@desktop).
 */

type Violation = { directive: string; blocked: string; disposition: string; sample: string };

const FULL = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;

async function watchCsp(page: Page) {
  await page.addInitScript(() => {
    const list: unknown[] = [];
    (window as unknown as { __csp: unknown[] }).__csp = list;
    document.addEventListener("securitypolicyviolation", (e) => {
      list.push({ directive: e.effectiveDirective, blocked: e.blockedURI, disposition: e.disposition, sample: e.sample });
    });
  });
  const consoleCsp: string[] = [];
  page.on("console", (msg) => {
    if (/Content[- ]Security[- ]Policy/i.test(msg.text())) consoleCsp.push(msg.text());
  });
  return {
    async violations(): Promise<Violation[]> {
      return page.evaluate(() => (window as unknown as { __csp: Violation[] }).__csp ?? []);
    },
    consoleCsp,
  };
}

async function expectClean(page: Page, csp: Awaited<ReturnType<typeof watchCsp>>, label: string) {
  // Even wachten: violations worden asynchroon gedispatcht.
  await page.waitForTimeout(300);
  const violations = await csp.violations();
  const report = [...violations.map((v) => `${v.disposition} ${v.directive} ${v.blocked} ${v.sample}`), ...csp.consoleCsp];
  expect(report, `${label}: CSP-violations`).toEqual([]);
}

async function expectReportOnlyHeader(page: Page, path: string) {
  const response = await page.request.get(path);
  const header = response.headers()["content-security-policy-report-only"];
  expect(header, `${path}: report-only header`).toMatch(/script-src 'nonce-[A-Za-z0-9+/]{22}==' 'strict-dynamic'/);
  return header;
}

const pages: { name: string; path: string }[] = [
  { name: "homepage (Sanity-content + SanityLive)", path: "/" },
  { name: "/tarieven", path: "/tarieven" },
  { name: "Sanity/SEO-landingspagina [slug]", path: "/taxi-almere-schiphol" },
  { name: "/en homepage", path: "/en" },
];

for (const tag of ["", " @desktop"]) {
  test.describe(`Report-only CSP: 0 violations${tag}`, () => {
    for (const p of pages) {
      test(`${p.name}${tag}`, async ({ page }) => {
        const csp = await watchCsp(page);
        await stabilize(page);
        await expectReportOnlyHeader(page, p.path);
        await open(page, p.path);
        // Scrollen activeert lazy content (reveal, afbeeldingen). mouse.wheel bestaat niet in mobiel WebKit.
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(500);
        await expectClean(page, csp, p.path);
      });
    }

    test(`/boeken t/m betaalstap (nep-Stripe als window.Stripe)${tag}`, async ({ page }) => {
      const csp = await watchCsp(page);
      await fakeStripe(page);
      await stabilize(page, { quote: "ready", booking: "ok" });
      await bookToPayment(page);
      await expectClean(page, csp, "/boeken betaalstap");
    });

    test(`/boeken betaalstap: Stripe.js via loadStripe-injectie (strict-dynamic)${tag}`, async ({ page }) => {
      // Zonder window.Stripe voegt @stripe/stripe-js zelf <script src=js.stripe.com>
      // toe. Dat script draagt geen nonce: alleen 'strict-dynamic' laat het toe.
      // De echte host is offline; page.route serveert een nep-Stripe.js.
      const csp = await watchCsp(page);
      await stabilize(page, { quote: "ready", booking: "ok" });
      let served = 0;
      await page.route("https://js.stripe.com/**", (route) => {
        served += 1;
        return route.fulfill({ status: 200, contentType: "application/javascript", body: FAKE_STRIPE_JS });
      });
      await bookToPayment(page);
      expect(served, "Stripe.js werd niet via de loader opgehaald").toBeGreaterThan(0);
      await expectClean(page, csp, "/boeken met geïnjecteerde Stripe.js");
    });
  });
}

test("nonce: per request anders en op Next's eigen scripts", async ({ request }) => {
  const nonces = new Set<string>();
  for (let i = 0; i < 3; i++) {
    const res = await request.get("/tarieven");
    const header = res.headers()["content-security-policy-report-only"];
    const nonce = /'nonce-([^']+)'/.exec(header)?.[1];
    expect(nonce).toBeTruthy();
    nonces.add(nonce!);
    const html = await res.text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)].map((m) => m[0]);
    const executable = scripts.filter((s) => !/type="application\/ld\+json"/.test(s));
    expect(executable.length).toBeGreaterThan(0);
    for (const s of executable) expect(s, "script zonder (juiste) nonce").toContain(`nonce="${nonce}"`);
    // De afgedwongen CSP blijft ongewijzigd en zonder nonce.
    const enforced = res.headers()["content-security-policy"];
    expect(enforced).toContain("script-src 'self' 'unsafe-inline'");
    expect(enforced).not.toContain("nonce-");
  }
  expect(nonces.size).toBe(3);
});

/**
 * F-47: statisch voorgerenderde pagina's (●/○ in de build) hebben geen nonce —
 * Next zet die alleen bij dynamisch renderen. Onder de report-only policy geven
 * ze dus violations op Next's inline scripts. Verwacht te falen tot de eigenaar
 * kiest (dynamisch renderen of hash/SRI); slaagt hij ineens, dan meldt Playwright dat.
 */
test("F-47: statische pagina /diensten (Sanity) heeft nog geen nonce", async ({ page }) => {
  test.fail(true, "F-47: SSG-pagina's dragen geen nonce; enforce zou ze breken");
  const csp = await watchCsp(page);
  await stabilize(page);
  await open(page, "/diensten");
  await expectClean(page, csp, "/diensten");
});

async function bookToPayment(page: Page) {
  await open(page, `/boeken?${FULL}`);
  await page.getByRole("button", { name: "Volgende" }).click();
  await page.getByRole("textbox", { name: "Naam", exact: true }).fill("Behaviour Test");
  await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("+31612345678");
  await page.getByRole("textbox", { name: "E-mail", exact: true }).fill("behaviour@example.test");
  await page.getByRole("button", { name: "Volgende" }).click();
  await page.getByRole("button", { name: "Boeking bevestigen" }).click();
  await expect(page.getByRole("button", { name: "Nu betalen" })).toBeEnabled();
}

/** Minimale Stripe.js-vervanger (zelfde vorm als tests/visual/support/fake-stripe.ts). */
const FAKE_STRIPE_JS = `(() => {
  const handlers = {};
  const element = {
    mount(node) { const box = document.createElement("div"); box.setAttribute("data-fake-stripe", "payment-element"); box.style.height = "40px"; node.appendChild(box); setTimeout(() => (handlers.ready || []).forEach((cb) => cb({ elementType: "payment" })), 0); },
    on(event, cb) { (handlers[event] = handlers[event] || []).push(cb); return element; },
    off() { return element; }, update() {}, destroy() {}, unmount() {}, focus() {}, blur() {}, clear() {}, collapse() {},
  };
  const elements = { create: () => element, getElement: () => element, update() {}, fetchUpdates: async () => ({}), submit: async () => ({}) };
  const noop = async () => ({});
  const Stripe = () => ({ elements: () => elements, createToken: noop, createPaymentMethod: noop, confirmCardPayment: noop,
    confirmPayment: async () => ({ paymentIntent: { status: "succeeded" } }), _registerWrapper() {}, registerAppInfo() {} });
  Stripe.version = "dahlia";
  window.Stripe = Stripe;
})();`;
