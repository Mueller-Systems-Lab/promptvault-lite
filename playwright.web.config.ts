import { defineConfig } from "@playwright/test";

/**
 * Web-Mode E2E (issue #125 / G3) — REAL end-to-end:
 * promptvault-server (real HTTP, real core analysis) + Vite dev UI with
 * /api proxy. No Tauri IPC involved — this is the web/LAN path.
 *
 * Fixtures: tests/fixtures/web-vault (100% synthetic).
 * Run: pnpm exec playwright test -c playwright.web.config.ts
 */

const SERVER_PORT = 8080;
const UI_PORT = 1420;

export default defineConfig({
  testDir: "./tests/e2e",
  testMatch: /web-mode\.spec\.ts$/,
  timeout: 120_000,
  expect: { timeout: 15_000 },
  retries: 1,
  workers: 1,
  use: {
    baseURL: `http://localhost:${UI_PORT}`,
    headless: true,
    viewport: { width: 1280, height: 800 },
    screenshot: "off",
    trace: "retain-on-first-retry",
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: [
    {
      command: "cargo run -q -p promptvault-server",
      port: SERVER_PORT,
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PROMPTVAULT_SERVER_VAULT: `${process.cwd()}/tests/fixtures/web-vault`,
        PROMPTVAULT_SERVER_READ_ONLY: "1",
        // Test-Bind bleibt localhost (nur die UI spricht mit dem Server).
        PROMPTVAULT_SERVER_HOST: "127.0.0.1",
        CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || "",
      },
    },
    {
      command: "pnpm dev",
      port: UI_PORT,
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      env: {
        PROMPTVAULT_SERVER_URL: `http://127.0.0.1:${SERVER_PORT}`,
      },
    },
  ],
});
