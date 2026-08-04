/**
 * Playwright Renderer E2E — Strict Assertions
 *
 * Uses real UI locators discovered via Playwright Reconnaissance.
 * No weak assertions: every test fails when expected behavior is absent.
 *
 * Runs against Vite dev server at http://localhost:1420.
 * Tauri IPC is mocked for deterministic renderer testing.
 *
 * Gate: E11 — Playwright Renderer E2E
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Tauri IPC Mock — minimal mock for renderer testing
// ---------------------------------------------------------------------------

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd, args) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve([]);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:0,average_score:0});
          case 'evaluate_prompt': return Promise.resolve({id:'eval-x',prompt_id:'',overall_score:85,criteria:[],missing_sections:[],recommendations:[],evaluated_at:new Date().toISOString()});
          case 'analyze_hygiene': return Promise.resolve({id:'hyg-x',prompt_id:'',hygiene_score:100,status:'clean',artifacts:[],analyzed_at:new Date().toISOString()});
          case 'toggle_favorite': return Promise.resolve(false);
          case 'get_favorites': return Promise.resolve([]);
          case 'export_json': case 'export_markdown': case 'export_zip': return Promise.resolve('/mock-vault/export');
          case 'detect_artifacts_action': return Promise.resolve({artifacts:[],hygiene_score:100,status:'clean',categories_found:[]});
          default: return Promise.resolve(null);
        }
      }
      function transformCallback(cb,once){return 1;}
      function convertFileSrc(fp){return 'mock-asset://'+(fp||'unknown');}
      return {invoke:invoke,transformCallback:transformCallback,convertFileSrc:convertFileSrc};
    })();
  `;
}

async function loadApp(page: Page) {
  await page.addInitScript(buildTauriMockScript());
  await page.goto("/");
  await page.waitForLoadState("networkidle");
}

// ---------------------------------------------------------------------------
// R1: App Start — strict visibility, no errors
// ---------------------------------------------------------------------------

test.describe("R1 — App Start", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("app container is visible", async ({ page }) => {
    await expect(page.locator(".app-container")).toBeVisible();
  });

  test("banner heading shows app name", async ({ page }) => {
    await expect(
      page.getByRole("heading", { name: /PromptVault Lite/ })
    ).toBeVisible();
  });

  test("toolbar buttons are present", async ({ page }) => {
    await expect(
      page.getByRole("button", { name: /Theme wechseln/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Einstellungen öffnen/ })
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: /Direktanalyse/ })
    ).toBeVisible();
  });

  test("status bar shows version 1.8.0", async ({ page }) => {
    const statusbar = page.getByRole("contentinfo");
    await expect(statusbar).toBeVisible();
    await expect(statusbar).toContainText("1.8.0");
  });

  test("no JavaScript errors on load", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (err) => errors.push(err.message));
    // Reload to capture all errors
    await page.reload({ waitUntil: "networkidle" });
    expect(errors).toHaveLength(0);
  });

  test("no unexpected console errors on load", async ({ page }) => {
    const consoleErrors: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") consoleErrors.push(msg.text());
    });
    await page.reload({ waitUntil: "networkidle" });
    // Vite dev server emits non-critical messages; filter them
    const unexpectedErrors = consoleErrors.filter(
      (e) => !e.includes("[vite]")
    );
    expect(unexpectedErrors).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// R2: Settings Modal
// ---------------------------------------------------------------------------

test.describe("R2 — Settings Modal", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("settings button opens modal", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await expect(
      page.getByRole("dialog", { name: "Einstellungen" })
    ).toBeVisible();
  });

  test("theme radios are present with correct defaults", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await expect(page.getByRole("radio", { name: "Hell" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "Dunkel" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Auto (System)" })).toBeVisible();
  });

  test("export format radios are present", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await expect(page.getByRole("radio", { name: "JSON" })).toBeChecked();
    await expect(page.getByRole("radio", { name: "Markdown" })).toBeVisible();
    await expect(page.getByRole("radio", { name: "CSV" })).toBeVisible();
  });

  test("developer mode checkbox is present", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    const checkbox = page.getByRole("checkbox", { name: /Developer Mode umschalten/ });
    // Checkbox may be scrolled out of view in modal; verify it exists in DOM
    await expect(checkbox).toBeAttached();
  });

  test("escape closes settings modal", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("dialog", { name: "Einstellungen" })
    ).not.toBeVisible();
  });

  test("close button closes settings modal", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await page.getByRole("button", { name: /Einstellungen schließen/ }).last().click();
    await expect(
      page.getByRole("dialog", { name: "Einstellungen" })
    ).not.toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// R3: Theme Switching
// ---------------------------------------------------------------------------

test.describe("R3 — Theme Switching", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
  });

  test("switch to Light theme updates UI", async ({ page }) => {
    await page.getByRole("radio", { name: "Hell" }).click();
    await page.keyboard.press("Escape");
    // Theme button text should update
    await expect(
      page.getByRole("button", { name: /Theme wechseln.*Hell/ })
    ).toBeVisible();
  });

  test("switch to Dark theme updates UI", async ({ page }) => {
    // First go to Light, then back to Dark
    await page.getByRole("radio", { name: "Hell" }).click();
    await page.getByRole("radio", { name: "Dunkel" }).click();
    await page.keyboard.press("Escape");
    await expect(
      page.getByRole("button", { name: /Theme wechseln.*Dunkel/ })
    ).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// R4: Empty State (no vault loaded)
// ---------------------------------------------------------------------------

test.describe("R4 — Empty State", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("explorer shows empty state message", async ({ page }) => {
    await expect(page.getByText("Keine Prompts geladen.")).toBeVisible();
  });

  test("details panel shows no-selection message", async ({ page }) => {
    await expect(page.getByText("Kein Prompt ausgewählt.")).toBeVisible();
  });

  test("analysis panel shows no-analysis message", async ({ page }) => {
    await expect(page.getByText("Keine Analyse verfügbar.")).toBeVisible();
  });

  test("open folder button is present and enabled", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Ordner öffnen/ });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });
});
