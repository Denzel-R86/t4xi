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
    // Echte klik/tik zoals een klant: de StickyCta wijkt zolang de zin eronder
    // ligt (PR 2.6), dus de regel is ook onderaan het venster raakbaar.
    await sheetTrigger(page, field).click();
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

/**
 * Datum, tijd, passagiers en bagage (PR 2.6b):
 *  · ≥ 768px: de inline velden in de zin;
 *  · < 768px: de zinregel opent één sheet; "Klaar" schrijft de waarden in de zin.
 */
export type RideDetailsInput = { date?: string; time?: string; passengers?: number; luggage?: string };

export const detailsTrigger = (page: Page) => page.locator('button[aria-controls="hero-details-sheet"]');
export const detailsSheet = (page: Page) => page.locator("dialog#hero-details-sheet");

/** Opent de sheet (mobiel) zoals een klant: echte klik op de zinregel. */
export async function openDetails(page: Page) {
  await detailsTrigger(page).click();
  const sheet = detailsSheet(page);
  await expect(sheet).toBeVisible();
  return sheet;
}

export async function fillDetails(page: Page, ride: RideDetailsInput) {
  if (await detailsTrigger(page).isVisible()) {
    const sheet = await openDetails(page);
    if (ride.date !== undefined) await sheet.getByLabel("Datum", { exact: true }).fill(ride.date);
    if (ride.time !== undefined) await sheet.getByLabel("Tijd", { exact: true }).fill(ride.time);
    if (ride.passengers !== undefined) await sheet.getByLabel("Passagiers", { exact: true }).selectOption(String(ride.passengers));
    if (ride.luggage !== undefined) await sheet.getByLabel("Bagage", { exact: true }).selectOption(ride.luggage);
    await sheet.getByRole("button", { name: "Klaar" }).click();
    await expect(sheet).toBeHidden();
    // Focus keert asynchroon (native 'close') terug naar de zinregel.
    await expect(detailsTrigger(page)).toBeFocused();
    return;
  }
  if (ride.date !== undefined) await page.getByLabel("Datum", { exact: true }).first().fill(ride.date);
  if (ride.time !== undefined) await page.getByLabel("Tijd", { exact: true }).first().fill(ride.time);
  if (ride.passengers !== undefined)
    await page.getByLabel("Passagiers", { exact: true }).first().selectOption(String(ride.passengers));
  if (ride.luggage !== undefined) await page.getByLabel("Bagage", { exact: true }).first().selectOption(ride.luggage);
}
