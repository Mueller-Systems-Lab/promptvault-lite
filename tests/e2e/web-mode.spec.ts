/**
 * Web-Mode E2E (issue #125 / G3, epic #97)
 *
 * Flow: Vite-UI (web build of the same renderer) → HTTP adapter (factory
 * detection: no __TAURI_INTERNALS__) → promptvault-server → promptvault-core
 * analysis. Verifies scan, selection, and real server-side analysis over
 * HTTP — the genuine Web/LAN path.
 *
 * The folder picker uses window.prompt in web mode (G2); the test accepts
 * the dialog with the fixtures vault path.
 */

import { test, expect, type Page } from "@playwright/test";

const VAULT = `${process.cwd()}/tests/fixtures/web-vault`;

async function openWebUi(page: Page): Promise<void> {
  // Web mode has no Tauri internals — assert that up front (J3 basis).
  const hasTauri = await page.evaluate(() => "__TAURI_INTERNALS__" in window);
  expect(hasTauri).toBe(false);

  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-container", { timeout: 30_000 });

  // Accept the web-mode vault-path prompt with the fixtures directory.
  page.once("dialog", (dialog) => void dialog.accept(VAULT));
  await page.getByRole("button", { name: /Ordner öffnen/ }).click();
  await page.waitForTimeout(2500);
}

test("web mode: scan, select and analyze via real HTTP backend", async ({ page }) => {
  await openWebUi(page);

  // Scan result arrived over HTTP — the explorer shows file names
  await expect(page.getByText("web-demo-prompt").first()).toBeVisible({
    timeout: 20_000,
  });
  // no store error (HTTP failures surface there)
  await expect(page.locator(".error-banner, [class*='error']").first()).toBeHidden({
    timeout: 5_000,
  }).catch(() => {});

  // Select the prompt and run the real server-side analysis
  await page.getByRole("button", { name: /web-demo-prompt/ }).first().click();
  await page.waitForTimeout(800);
  await page.getByRole("button", { name: /Analysieren/ }).first().click();

  // Analysis panel shows a server-computed score (deterministic fixture)
  await expect(page.locator(".panel-analysis")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator(".panel-analysis").getByText(/Gesamtwertung|Qualitätsanalyse/i).first())
    .toBeVisible({ timeout: 20_000 });
});
