import { defineConfig } from "@playwright/test";

/**
 * Visual-regression-gate (Experience 2.0 §10b, PR 0.3).
 *
 * Gezaghebbende baselines worden UITSLUITEND gemaakt en vergeleken in het
 * vastgepinde image mcr.microsoft.com/playwright:v<exacte @playwright/test-versie>-noble
 * (zie scripts/visual-docker.sh en .github/workflows/visual.yml). Snapshots staan
 * per platform in tests/visual/__screenshots__/<platform>/…; alleen `linux` wordt
 * gecommit — lokale macOS-runs zijn voor ontwikkeling en staan in .gitignore.
 *
 * Verwacht een productiebuild (`npm run build`) met CI-env en zonder secrets.
 */

const PORT = Number(process.env.VISUAL_PORT ?? 3103);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/visual",
  testMatch: "**/*.spec.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{platform}/{projectName}/{testFileName}/{arg}{ext}",
  outputDir: "./test-results/visual",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  // Geen retries: een flaky snapshot moet zichtbaar falen, niet stil slagen.
  retries: 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/visual" }]]
    : [["list"]],
  timeout: 60_000,
  expect: {
    toHaveScreenshot: {
      maxDiffPixelRatio: 0.001,
      animations: "disabled",
      caret: "hide",
      scale: "css",
    },
  },
  use: {
    baseURL: BASE_URL,
    browserName: "chromium",
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    colorScheme: "light",
    reducedMotion: "reduce",
    deviceScaleFactor: 1,
    serviceWorkers: "block",
    trace: "retain-on-failure",
    // Chromium formatteert <input type="date|time"> naar de browsertaal, niet
    // naar `locale`; zonder --lang tonen de velden mm/dd/yyyy en AM/PM.
    launchOptions: { args: ["--lang=nl-NL"] },
  },
  projects: [
    { name: "w375", use: { viewport: { width: 375, height: 812 } } },
    { name: "w768", use: { viewport: { width: 768, height: 1024 } } },
    { name: "w1280", use: { viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      // Server offline: Sanity/Supabase vallen altijd terug op de codefallback.
      NODE_OPTIONS: "--require ./tests/visual/support/offline-server.cjs",
    },
  },
});
