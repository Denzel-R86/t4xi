import { defineConfig, devices } from "@playwright/test";

/**
 * Gedragschecks (geen screenshots) op de productiebuild, met dezelfde offline server
 * en mocks als de visual-gate. Verwacht een `npm run build` met CI-env.
 */

const PORT = Number(process.env.BEHAVIOR_PORT ?? 3104);
const BASE_URL = `http://localhost:${PORT}`;

export default defineConfig({
  testDir: "./tests/behavior",
  testMatch: "**/*.spec.ts",
  outputDir: "./test-results/behavior",
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: process.env.CI
    ? [["list"], ["html", { open: "never", outputFolder: "playwright-report/behavior" }]]
    : [["list"]],
  timeout: 90_000,
  use: {
    baseURL: BASE_URL,
    locale: "nl-NL",
    timezoneId: "Europe/Amsterdam",
    reducedMotion: "reduce",
    serviceWorkers: "block",
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "webkit-iphone13",
      grepInvert: /@desktop/,
      use: { ...devices["iPhone 13"], locale: "nl-NL", reducedMotion: "reduce" },
    },
    {
      name: "chromium-375",
      grepInvert: /@desktop/,
      use: {
        browserName: "chromium",
        viewport: { width: 375, height: 812 },
        isMobile: true,
        hasTouch: true,
        launchOptions: { args: ["--lang=nl-NL"] },
      },
    },
    // PR 2.1: passagiers en JourneyLine staan alleen in de desktopzin (≥ 768px).
    {
      name: "chromium-1280",
      grep: /@desktop/,
      use: {
        browserName: "chromium",
        viewport: { width: 1280, height: 800 },
        launchOptions: { args: ["--lang=nl-NL"] },
      },
    },
  ],
  webServer: {
    command: `npx next start -p ${PORT}`,
    url: BASE_URL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      APP_ENV: "development",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: "--require ./tests/visual/support/offline-server.cjs",
    },
  },
});
