import type { Page } from "@playwright/test";

/**
 * Offline nep-Stripe voor de bevestigingsweergave (PR 2.5): een minimale
 * `window.Stripe` vóór de pagina laadt, zodat `loadStripe` hem direct gebruikt
 * en er nooit een verzoek naar js.stripe.com gaat. `confirmPayment` "slaagt";
 * de autoriteit blijft de gemockte /api/payments/status, net als in productie.
 *
 * Vereist een build met een (willekeurige) `pk_test_`-publishable key — zonder
 * key laadt de betaalstap Stripe nooit (lib/payments/stripe-client.ts). CI zet
 * die nep-key in .github/workflows/visual.yml.
 */
export async function fakeStripe(page: Page) {
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
