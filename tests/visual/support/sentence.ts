import { expect, type Page } from "@playwright/test";

/**
 * Adresinvoer in de hero-boekingszin, voor beide presentaties (PR 2.6):
 *  · ≥ 768px: het veld in de zin is zelf de combobox;
 *  · < 768px: de regel "Van"/"Naar" opent een bottom sheet met de combobox.
 * Zo gebruiken bestaande specs dezelfde stappen op elke breedte.
 */

export type AddressField = "Vertrek" | "Bestemming";
const SHEET = { Vertrek: "hero-from-sheet", Bestemming: "hero-to-sheet" } as const;

/** De hele zin (resultaatregel, CTA, sheets). */
export const sentenceRoot = (page: Page) => page.locator("div.hz-sentence").first();

/** De regel die op mobiel de sheet opent. */
export const sheetTrigger = (page: Page, field: AddressField) =>
  page.locator(`button[aria-controls="${SHEET[field]}"]`);

export const addressSheet = (page: Page, field: AddressField) => page.locator(`dialog#${SHEET[field]}`);

async function isMobileSentence(page: Page, field: AddressField) {
  return sheetTrigger(page, field).isVisible();
}

/** Maakt het adresveld klaar voor invoer (mobiel: sheet open) en geeft de combobox terug. */
export async function openAddress(page: Page, field: AddressField) {
  if (await isMobileSentence(page, field)) {
    // Klik zonder Playwright-scroll: in de H-1-scenario's ligt de regel bewust
    // onder in beeld, deels onder de StickyCta (F-14). Een gewone click() scrolt
    // de regel dan eerst naar het midden en verandert zo de uitgangssituatie
    // van de reveal-scroll. Echte tik-interactie toetst mobile-sheet.spec.ts.
    await sheetTrigger(page, field).evaluate((el: HTMLElement) => el.click());
    const sheet = addressSheet(page, field);
    await expect(sheet).toBeVisible();
    const input = sheet.getByRole("combobox", { name: field });
    await expect(input).toBeFocused();
    return input;
  }
  const input = page.getByRole("combobox", { name: field });
  await input.focus();
  return input;
}

/** Vrije tekst invullen zoals een klant dat doet; mobiel sluit Enter de sheet. */
export async function fillAddress(page: Page, field: AddressField, value: string) {
  const mobile = await isMobileSentence(page, field);
  const input = await openAddress(page, field);
  await input.fill(value);
  if (mobile) {
    await input.press("Enter");
    await expect(addressSheet(page, field)).toBeHidden();
    // De focus keert asynchroon (native 'close'-event) terug naar de regel;
    // wacht daarop, anders valt een latere blur() ervóór.
    await expect(sheetTrigger(page, field)).toBeFocused();
  }
}
