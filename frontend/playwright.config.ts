import { defineConfig, devices } from "@playwright/test";
import path from "node:path";

export default defineConfig({
  testDir: path.join(__dirname, "tests/e2e"),
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report", open: "never" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:4173/static/react/",
    trace: "on",
    video: "retain-on-failure",
    screenshot: "only-on-failure",
    viewport: { width: 1280, height: 720 },
  },
  expect: {
    timeout: 15000,
  },
  outputDir: "test-results",
  webServer: {
    command: "npm run dev -- --host 127.0.0.1 --port 4173 --strictPort",
    url: "http://127.0.0.1:4173/static/react/",
    reuseExistingServer: !process.env.CI,
    cwd: __dirname,
    timeout: 120_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"] },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"] },
    },
  ],
});
