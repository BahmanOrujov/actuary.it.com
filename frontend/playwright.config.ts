import { defineConfig } from "@playwright/test";

// Uses the Microsoft Edge already installed on Windows (no browser download needed).
// Set PW_CHANNEL=chromium after `npx playwright install chromium` to use Playwright's own build instead.
export default defineConfig({
  testDir: "./e2e",
  timeout: 8 * 60_000,
  use: { headless: true, channel: process.env.PW_CHANNEL ?? "msedge" },
});
