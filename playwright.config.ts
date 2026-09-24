import { defineConfig, devices } from "playwright/test";

// `next dev` blocks its dev chunks for any host other than the one it serves
// (`localhost`), so a 127.0.0.1 page never hydrates.
const baseURL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";
const storageState = process.env.PLAYWRIGHT_ADMIN_STORAGE_STATE || undefined;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL,
    storageState,
    trace: "on-first-retry",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer:
    !process.env.PLAYWRIGHT_BASE_URL && storageState
      ? {
          command: "pnpm dev",
          url: baseURL,
          reuseExistingServer: !process.env.CI,
          timeout: 120_000,
        }
      : undefined,
});
