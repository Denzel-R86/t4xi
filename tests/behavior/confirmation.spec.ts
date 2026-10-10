import { readFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { open, RIDE, stabilize } from "../visual/support/harness";

/**
 * Gedragscheck PR 2.5 (§8, ES 08/09): het bevestigingsmoment na een gemockte,
 * server-bevestigde betaling.
 *
 * Stripe is volledig offline: een minimale nep-`window.Stripe` (addInitScript)
 * laat `confirmPayment` slagen; de autoriteit blijft de gemockte
 * `/api/payments/status` (eerst `pending`, daarna `paid`), net als in productie.
 * Vereist een build met een (willekeurige) `pk_test_`-publishable key — zonder key
 * laadt de betaalstap Stripe nooit (zie lib/payments/stripe-client.ts).
 */

const FULL = `pickup=${encodeURIComponent("Amsterdam Zuidas")}&dropoff=Schiphol&date=${RIDE.date}&time=${RIDE.time}&luggage=1-2-koffers`;
const EMAIL = "behaviour@example.test";
const CLAIM = /bevestigd|staat klaar|staat gepland/i;

async function fakeStripe(page: Page) {
  await page.addInitScript(() => {
    const handlers: Record<string, ((e: unknown) => void)[]> = {};
    const element = {
      mount(node: HTMLElement) {
        const box = document.createElement("div");
        box.setAttribute("data-fake-stripe", "payment-element");
        box.style.height = "40px";
        node.appendChild(box);
        setTimeout(() => (handlers.ready ?? []).forEach((cb) => cb({ elementType: "payment" })), 0);
      },
      on(event: string, cb: (e: unknown) => void) {
        (handlers[event] ??= []).push(cb);
        return element;
      },
      off() {
        return element;
      },
      update() {},
      destroy() {},
      unmount() {},
      focus() {},
      blur() {},
      clear() {},
      collapse() {},
    };
    const elements = {
      create: () => element,
      getElement: () => element,
      update() {},
      fetchUpdates: async () => ({}),
      submit: async () => ({}),
    };
    const noop = async () => ({});
    const Stripe = () => ({
      elements: () => elements,
      createToken: noop,
      createPaymentMethod: noop,
      confirmCardPayment: noop,
      confirmPayment: async () => ({ paymentIntent: { status: "succeeded" } }),
      _registerWrapper() {},
      registerAppInfo() {},
    });
    Object.assign(Stripe, { version: "dahlia" });
    (window as unknown as { Stripe: unknown }).Stripe = Stripe;
  });
}

test.describe("Bevestigingsmoment (PR 2.5)", () => {
  test("na een server-bevestigde betaling: statuskop, ES 09-volgorde, gemaskeerde e-mail en .ics", async ({ page }) => {
    await fakeStripe(page);
    await stabilize(page, { quote: "ready", booking: "ok" });
    // Na stabilize() geregistreerd = gaat vóór. Eerste poll nog `pending`, daarna `paid`.
    let polls = 0;
    await page.route("**/api/payments/status**", (route) => {
      polls += 1;
      const body = polls === 1
        ? '{"status":"pending"}'
        : '{"status":"paid","amountDue":8900,"amountPaid":8900,"currency":"eur","paidAt":"2026-10-01T08:00:05Z"}';
      return route.fulfill({ status: 200, contentType: "application/json", body });
    });

    await open(page, `/boeken?${FULL}`);
    await page.getByRole("button", { name: "Volgende" }).click();
    await page.getByRole("textbox", { name: "Naam", exact: true }).fill("Behaviour Test");
    await page.getByRole("textbox", { name: "Telefoon", exact: true }).fill("+31612345678");
    await page.getByRole("textbox", { name: "E-mail", exact: true }).fill(EMAIL);
    await page.getByRole("button", { name: "Volgende" }).click();
    await page.getByRole("button", { name: "Boeking bevestigen" }).click();

    const pay = page.getByRole("button", { name: "Nu betalen" });
    await expect(pay).toBeEnabled();
    await pay.click();

    // Betaling in behandeling (pending): nooit een bevestigingsclaim.
    const pending = page.getByRole("status").filter({ hasText: "Betaling ontvangen" });
    await expect(pending).toBeVisible();
    await expect(pending).not.toHaveText(CLAIM);

    // Server meldt `paid` → bevestigingsmoment; de kop volgt de bookingstatus (inquiry).
    const heading = page.getByRole("heading", { level: 2, name: "Betaling ontvangen. Uw aanvraag is in behandeling." });
    await expect(heading).toBeVisible({ timeout: 15_000 });
    await expect(heading).toBeFocused();
    const view = page.locator("section[data-booking-status]");
    await expect(view).toHaveAccessibleName("Betaling ontvangen. Uw aanvraag is in behandeling.");
    await expect(view).toHaveAttribute("data-booking-status", "inquiry");
    await expect(view).not.toHaveText(CLAIM);
    await expect(view).toContainText("Wij bevestigen uw rit via WhatsApp of e-mail.");
    // De oude "Boeking ontvangen"-melding en "Rond de betaling af" zijn weg.
    await expect(page.getByText("Rond hieronder de betaling af", { exact: false })).toHaveCount(0);

    // ES 09: vaste volgorde.
    const fields = await view.locator("[data-field]").evaluateAll((els) => els.map((el) => el.getAttribute("data-field")));
    expect(fields).toEqual(["when", "pickup", "dropoff", "reference", "contact", "passengers", "vehicle", "paid"]);
    const row = (field: string) => view.locator(`[data-field="${field}"] dd`);
    await expect(row("when")).toContainText("14:30");
    await expect(row("pickup")).toHaveText("Amsterdam Zuidas");
    await expect(row("dropoff")).toHaveText("Schiphol");
    await expect(row("reference")).toHaveText("T4X-VISUAL-0001");
    await expect(row("contact")).toHaveText("be••••@example.test");
    await expect(row("vehicle")).toHaveText("Premium voertuigklasse");
    // Bedrag uit de server-intent (create-intent-fixture: 8900 cent).
    await expect(row("paid")).toHaveText(/^€\s?89,00 betaald$/);
    // Het volledige adres staat nergens zichtbaar.
    await expect(page.getByText(EMAIL)).toBeHidden();
    await expect(view).not.toContainText(EMAIL);
    await expect(view).not.toContainText(/Tesla|Lynk/);

    // Reduced motion (config): JourneyLine direct in de eindstaat.
    await expect(view.locator(".hz-jl")).toHaveAttribute("data-state", "arrived");

    // Acties: WhatsApp (bestaand nummer) en .ics; geen "Bekijk boeking".
    await expect(view.getByRole("link", { name: /WhatsApp T4XI/ })).toHaveAttribute("href", /^https:\/\/wa\.me\/31634744522\?text=/);
    await expect(view.getByText(/Bekijk boeking/)).toHaveCount(0);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      view.getByRole("button", { name: "Voeg toe aan agenda" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("t4xi-T4X-VISUAL-0001.ics");
    const ics = readFileSync(await download.path(), "utf8");
    const lines = ics.replace(/\r\n /g, "").split("\r\n");
    expect(lines).toContain("DTSTART;TZID=Europe/Amsterdam:20261112T143000");
    expect(lines).toContain("LOCATION:Amsterdam Zuidas");
    expect(lines).toContain("STATUS:TENTATIVE");
    expect(lines).toContain("SUMMARY:T4XI-rit: Amsterdam Zuidas → Schiphol");
    expect(ics).not.toContain(EMAIL);
    expect(ics).not.toContain("+31612345678");
    expect(ics).not.toMatch(CLAIM);
  });
});
