import { expect, test } from "@playwright/test";
import { defaultMasks, HIDE_OVERLAYS, imagesReady, open, settle, stabilize } from "./support/harness";

/** Header en Footer (§10b) — gedeeld door alle pagina's, hier vastgelegd op home en /tarieven. */

const isDesktopNav = (width: number) => width >= 1024; // Tailwind `lg`: hamburger verdwijnt

async function headerShot(page: import("@playwright/test").Page, name: string) {
  const header = page.locator("body > header, header").first();
  const box = await header.boundingBox();
  if (!box) throw new Error("header niet zichtbaar");
  const viewport = page.viewportSize()!;
  // Viewport-clip i.p.v. element-screenshot: zo telt wat er ónder de sticky,
  // semi-transparante header ligt mee (relevant voor "gescrold").
  await expect(page).toHaveScreenshot(name, {
    clip: { x: 0, y: 0, width: viewport.width, height: Math.ceil(box.y + box.height) },
    mask: defaultMasks(page),
  });
}

test.describe("Header", () => {
  test("top", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await headerShot(page, "header-top.png");
  });

  test("gescrold", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    await page.mouse.wheel(0, 900);
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(500);
    await settle(page);
    await headerShot(page, "header-gescrold.png");
  });

  test("actieve nav", async ({ page }) => {
    await stabilize(page);
    await open(page, "/tarieven");
    if (isDesktopNav(page.viewportSize()!.width)) {
      await expect(page.getByRole("navigation", { name: "Hoofdnavigatie" }).locator('[aria-current="page"]')).toBeVisible();
      await headerShot(page, "header-actief-tarieven.png");
    } else {
      // Onder `lg` staat de actieve markering in het mobiele menu.
      await page.getByRole("button", { name: "Menu openen" }).click();
      const menu = page.locator("#mobile-nav");
      await expect(menu.locator('[aria-current="page"]')).toBeVisible();
      await expect(page.locator("header").first()).toHaveScreenshot("header-actief-tarieven.png", {
        mask: defaultMasks(page),
      });
    }
  });

  test("mobiel menu open", async ({ page }) => {
    test.skip(isDesktopNav(page.viewportSize()!.width), "Mobiel menu bestaat alleen onder 1024px");
    await stabilize(page);
    await open(page, "/");
    await page.getByRole("button", { name: "Menu openen" }).click();
    await expect(page.locator("#mobile-nav")).toBeVisible();
    await expect(page.locator("header").first()).toHaveScreenshot("header-mobiel-menu-open.png", {
      mask: defaultMasks(page),
    });
  });
});

test.describe("Footer", () => {
  test("footer", async ({ page }) => {
    await stabilize(page);
    await open(page, "/");
    const footer = page.getByRole("contentinfo");
    await footer.scrollIntoViewIfNeeded();
    await imagesReady(footer);
    await expect(footer).toHaveScreenshot("footer.png", { mask: defaultMasks(page), stylePath: HIDE_OVERLAYS });
  });

  test("mobiel met StickyCta-clearance", async ({ page }) => {
    test.skip(isDesktopNav(page.viewportSize()!.width), "StickyCta bestaat alleen onder 1024px");
    await stabilize(page);
    await open(page, "/");
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    await expect(page.getByRole("complementary", { name: "Snelle acties" })).toBeVisible();
    await settle(page);
    // Viewport-opname aan de onderkant: toont of de laatste footerregel vrij
    // blijft van de vaste actiebalk.
    await expect(page).toHaveScreenshot("footer-onderkant-met-stickycta.png", { mask: defaultMasks(page) });
  });
});
