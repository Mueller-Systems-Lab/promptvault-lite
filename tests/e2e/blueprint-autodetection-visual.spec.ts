/**
 * Visual E2E — Blueprint Autodetection UI (Issue #152)
 *
 * Covers the blueprint autodetection surface with strict DOM assertions plus
 * explicit screenshot captures for regression comparison (repo convention:
 * manual captures into test-results, no built-in snapshot baselines).
 *
 * Fixtures: 100 % synthetic (tests/e2e/fixtures/release-gate-prompts.ts).
 * Expected deterministic classifications (verified via classifyContent):
 *   implement_search              → PROMPT  / CLEAN
 *   notification-system           → UNKNOWN_NEEDS_REVIEW / CLEAN
 *   api-client-blueprint-with-notes → PROMPT / POSSIBLE_CONTAMINATION
 *   notification-system-architecture → BLUEPRINT / CLEAN (auto-evaluation runs)
 *   db-sync-quoted                → BLOCKING_SENSITIVE_CONTENT (quoted fake secrets)
 *
 * T3 asserts that fake secrets never reach the DOM.
 *
 * Runs against the Vite dev server; Tauri IPC mocked for deterministic
 * renderer testing (same pattern as core-flows.spec.ts).
 */

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import {
  STANDARD_PROMPT,
  HYBRID_CONTAMINATED,
  BLUEPRINT_STRONG,
  SENSITIVE_BLOCKING_QUOTED,
} from "./fixtures/release-gate-prompts";

const SHOT_DIR = path.join("test-results", "blueprint-visual");

function buildTauriMockScript(): string {
  const prompts = [
    STANDARD_PROMPT,
    HYBRID_CONTAMINATED,
    BLUEPRINT_STRONG,
    SENSITIVE_BLOCKING_QUOTED,
  ];
  return `
    window.__TAURI_INTERNALS__ = (function() {
      const PROMPTS = ${JSON.stringify(prompts)};
      function invoke(cmd, args) {
        const pid = (args && (args.promptId || args.prompt_id)) || '';
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve(PROMPTS);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:PROMPTS.length,average_score:0});
          case 'evaluate_prompt': return Promise.resolve({
            id:'eval-'+pid, prompt_id:pid, overall_score:70,
            criteria:[{name:'Zieldefinition',score:7,max_score:10,weight:0.15,details:'ok'}],
            missing_sections:[], recommendations:['Definiere ein klares Ziel.'],
            evaluated_at:'2026-09-30T00:00:00Z'});
          case 'analyze_hygiene': return Promise.resolve({
            id:'hyg-'+pid, prompt_id:pid, hygiene_score:70,
            status: pid.includes('sensitive') ? 'critical' : 'clean',
            artifacts:[], analyzed_at:'2026-09-30T00:00:00Z'});
          case 'toggle_favorite': return Promise.resolve(false);
          case 'get_favorites': return Promise.resolve([]);
          case 'export_json': case 'export_markdown': case 'export_zip': return Promise.resolve('/mock-vault/export');
          case 'detect_artifacts_action': return Promise.resolve({artifacts:[],hygiene_score:70,status:'clean',categories_found:[]});
          default: return Promise.resolve(null);
        }
      }
      function transformCallback(cb,once){return 1;}
      function convertFileSrc(fp){return 'mock-asset://'+(fp||'unknown');}
      return {invoke:invoke,transformCallback:transformCallback,convertFileSrc:convertFileSrc};
    })();
  `;
}

async function loadVault(page: Page): Promise<void> {
  await page.addInitScript(buildTauriMockScript());
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".app-container", { timeout: 20000 });
  // Auto-restore may already scan the last folder; otherwise open explicitly.
  const bodyText = await page.locator("body").innerText();
  if (!/mock-vault/i.test(bodyText)) {
    await page.getByRole("button", { name: /Ordner öffnen/ }).click();
  }
  await page.waitForTimeout(2000);
  // Expand every closed folder so prompt rows render
  const closed = page.getByRole("button", { name: /^Ordner .* \(geschlossen\)/ });
  for (let i = await closed.count() - 1; i >= 0; i--) {
    await closed.nth(i).click().catch(() => {});
    await page.waitForTimeout(250);
  }
  await page.waitForTimeout(500);
}

async function shot(page: Page, name: string): Promise<void> {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const file = path.join(SHOT_DIR, `${name}.png`);
  await page.screenshot({ path: file });
  // eslint-disable-next-line no-console -- evidence path log (repo convention)
  console.log(`[blueprint-visual] captured ${file}`);
}

async function selectPromptByName(page: Page, namePart: string): Promise<void> {
  await page
    .getByRole("button", { name: new RegExp(namePart) })
    .first()
    .click();
  await page.waitForTimeout(1000);
}

// ---------------------------------------------------------------------------
// T1 — Explorer renders ContentClassBadge after auto-detection
// ---------------------------------------------------------------------------
test("T1: explorer shows content-class badges after autodetection", async ({ page }) => {
  await loadVault(page);
  await expect(page.locator(".content-class-badge").first()).toBeVisible({ timeout: 15000 });
  // Deterministic fixture classifications:
  await expect(page.getByRole("status", { name: "Inhaltstyp: Prompt" }).first()).toBeVisible();
  await expect(page.getByRole("status", { name: "Inhaltstyp: Blueprint" }).first()).toBeVisible();
  await shot(page, "t1-explorer-badges");
});

// ---------------------------------------------------------------------------
// T2 — DetailsPanel shows contamination warning for contaminated content
// ---------------------------------------------------------------------------
test("T2: details panel shows contamination warning for contaminated prompt", async ({ page }) => {
  await loadVault(page);
  await selectPromptByName(page, "api-client-blueprint-with-notes");
  const warning = page.locator("[class*='contamination']").first();
  await expect(warning).toBeVisible({ timeout: 10000 });
  await shot(page, "t2-contamination-warning");
});

// ---------------------------------------------------------------------------
// T3 — Blocking message for BLOCKING_SENSITIVE_CONTENT, no secrets in DOM
// ---------------------------------------------------------------------------
test("T3: sensitive content is blocked and secrets never reach the DOM", async ({ page }) => {
  await loadVault(page);
  await selectPromptByName(page, "db-sync-quoted");
  await expect(page.locator(".blocking-message")).toBeVisible({ timeout: 10000 });
  // Security boundary: synthetic fake credentials must NOT be rendered
  const bodyText = await page.locator("body").innerText();
  expect(bodyText).not.toContain("FAKEKEY_1234567890abcdef");
  expect(bodyText).not.toContain("FakePasswordNotReal42");
  await shot(page, "t3-sensitive-blocked");
});

// ---------------------------------------------------------------------------
// T4 — AnalysisPanel renders BlueprintEvaluationPanel with 10 dimensions
// ---------------------------------------------------------------------------
test("T4: blueprint evaluation panel renders all 10 dimensions", async ({ page }) => {
  await loadVault(page);
  await selectPromptByName(page, "notification-system-architecture");
  // Auto-evaluation runs for BLUEPRINT class on selection (App.tsx)
  const panel = page.locator(".analysis-section-blueprint");
  await expect(panel).toBeVisible({ timeout: 10000 });
  // evaluateBlueprint produces exactly 10 dimensions; the panel renders
  // dimension rows plus 9 numeric sub-score bars.
  const dimensionRows = await panel.locator(".blueprint-dimension-row").count();
  expect(dimensionRows).toBe(10);
  const scoreElements = await panel.evaluate(
    (el) => el.querySelectorAll(".context-mini-score").length,
  );
  expect(scoreElements).toBeGreaterThanOrEqual(9);
  await shot(page, "t4-blueprint-evaluation");
});

// ---------------------------------------------------------------------------
// T5 — BP optimieren modal opens, produces output, closes
// ---------------------------------------------------------------------------
test("T5: blueprint optimizer modal opens, produces output and closes", async ({ page }) => {
  await loadVault(page);
  await selectPromptByName(page, "notification-system-architecture");
  const bpButton = page.getByRole("button", { name: /Blueprint optimieren|BP optimieren/ });
  await expect(bpButton).toBeVisible({ timeout: 10000 });
  await bpButton.click();
  const dialog = page.locator(".optimizer-dialog");
  await expect(dialog).toBeVisible({ timeout: 10000 });
  await shot(page, "t5-optimizer-modal-open");
  // Run the optimization (mode: Conservative is preselected)
  await dialog.getByRole("button", { name: /Blueprint optimieren/ }).click();
  await expect(dialog.locator(".optimizer-results")).toBeVisible({ timeout: 15000 });
  await expect(dialog.locator(".optimizer-diff-content").first()).toBeVisible();
  await shot(page, "t5-optimizer-modal-output");
  // Close via the modal close button (or Escape fallback)
  const closeBtn = dialog.getByRole("button", { name: /Schließen|✕|×/ }).first();
  if (await closeBtn.count()) {
    await closeBtn.click();
  } else {
    await page.keyboard.press("Escape");
  }
  await expect(dialog).toBeHidden({ timeout: 5000 });
});

// ---------------------------------------------------------------------------
// T6 — Dark/Light mode compatibility for blueprint components
// ---------------------------------------------------------------------------
// The app defaults to the DARK theme (fresh profile, getThemeFromStorage
// fallback), and the header toggle cycles dark -> auto -> light. We capture
// dark first (default) and then light (after one toggle, resolved via
// colorScheme 'light' for auto), asserting documentElement data-theme
// explicitly so the baselines cannot be swapped silently.
test("T6: blueprint components render in dark and light mode", async ({ page }) => {
  await loadVault(page);
  await selectPromptByName(page, "notification-system-architecture");
  await expect(page.locator(".analysis-section-blueprint")).toBeVisible({ timeout: 10000 });

  // Default: dark theme
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator(".content-class-badge").first()).toBeVisible();
  await shot(page, "t6-dark-mode");

  // One toggle: dark -> auto (resolves to light under colorScheme 'light')
  await page.locator("button", { hasText: "🌙" }).first().click();
  await page.waitForTimeout(800);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await expect(page.locator(".analysis-section-blueprint")).toBeVisible();
  await expect(page.locator(".content-class-badge").first()).toBeVisible();
  await shot(page, "t6-light-mode");
});
