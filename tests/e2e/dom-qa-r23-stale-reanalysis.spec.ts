/**
 * DOM QA R2.3 — Stale Reanalysis (PastePromptAnalyzer)
 *
 * Verifies stale-analysis defect: after textarea is edited, old analysis
 * with status="done" must NOT remain visible as valid for the new text.
 *
 * RED before fix: editing textarea keeps .paste-results visible -> FAIL
 * GREEN after fix: editing textarea invalidates stale result (idle or stale badge)
 *
 * Gate: R2.3 Phase 4 — PastePromptAnalyzer stale-state
 */

import { test, expect, type Page } from "@playwright/test";

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

async function loadApp(page: Page, consoleErrors: string[], externalRequests: string[]) {
  // Register listeners BEFORE navigation
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Vite/HMR noise is allowed
      if (text.includes("[vite]")) return;
      if (text.includes("Download the React DevTools")) return;
      consoleErrors.push(text);
    }
  });
  page.on("pageerror", (err) => {
    consoleErrors.push(`pageerror: ${err.message}`);
  });
  page.on("request", (req) => {
    const url = req.url();
    // Allow only localhost dev server, data, about, mock-asset, vite internals
    if (
      url.startsWith("http://localhost:1420") ||
      url.startsWith("ws://localhost:1420") ||
      url.startsWith("http://127.0.0.1:1420") ||
      url.startsWith("ws://127.0.0.1:1420") ||
      url.startsWith("data:") ||
      url.startsWith("about:") ||
      url.startsWith("blob:") ||
      url.startsWith("mock-asset://") ||
      url === "http://localhost:1420/" ||
      url.includes("localhost:1420")
    ) {
      return;
    }
    // Ignore vite file system checks that may use file:// in some envs
    if (url.startsWith("file://")) return;
    externalRequests.push(url);
  });

  await page.addInitScript(buildTauriMockScript());
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".app-container")).toBeVisible({ timeout: 15000 });
}

// Two distinct prompts that produce visibly different analyses
const PROMPT_A =
  "You are a helpful assistant. Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}\n\nConstraints: be concise, no extra commentary.";
const PROMPT_B =
  "Act as a senior code reviewer. Review the following Python code for security vulnerabilities, style issues, and performance. Provide a structured report with severity levels.\n\n```python\ndef foo(x): return x\n```";

test.describe("DOM QA R2.3 — PastePromptAnalyzer stale-state", () => {
  test("stale result must be invalidated after edit — then re-analysis updates", async ({ page }) => {
    const consoleErrors: string[] = [];
    const externalRequests: string[] = [];

    await loadApp(page, consoleErrors, externalRequests);

    // --- APP START ---
    await expect(page.locator(".app-container")).toBeVisible();
    // Open Direktanalyse
    const direktBtn = page.getByRole("button", { name: /Direktanalyse/ });
    await expect(direktBtn).toBeVisible();
    await direktBtn.click();
    await page.waitForTimeout(400);
    const textarea = page.getByRole("textbox", { name: /Prompt-Text eingeben/ });
    await expect(textarea).toBeVisible();

    // --- ENTER PROMPT A ---
    await textarea.fill(PROMPT_A);
    await expect(textarea).toHaveValue(PROMPT_A);

    // --- ANALYZE A ---
    const analyzeBtn = page.getByRole("button", { name: /Analysieren/ });
    await expect(analyzeBtn).toBeEnabled();
    await analyzeBtn.click();

    // Wait for result
    await expect(page.locator(".paste-results")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Klassifikation")).toBeVisible();
    await expect(page.getByText("Prompt & Context Engineering")).toBeVisible();
    // Score visible (overall_score badge)
    const overallA = page.locator(".context-overall-value").first();
    await expect(overallA).toBeVisible();
    const scoreAText = (await overallA.innerText()).trim();
    expect(scoreAText.length).toBeGreaterThan(0);
    // Capture length footer for later stale check
    const footerA = page.locator(".paste-info-footer");
    await expect(footerA).toBeVisible();
    const footerAText = await footerA.innerText();
    // Criteria / scores bar visible
    await expect(page.locator(".context-mini-score").first()).toBeVisible();

    // --- EDIT PROMPT TO B — stale old result must be invalidated/marked stale ---
    // This is the core defect check: old analysis must NOT stay as valid authoritative result.
    await textarea.fill(PROMPT_B);
    await expect(textarea).toHaveValue(PROMPT_B);
    // Small delay for React state transition
    await page.waitForTimeout(300);

    // OPTION A: result hidden + idle hint visible
    // OPTION B: result marked explicitly stale + authoritative presentation disabled
    // Accept either, but current bug is that .paste-results stays visible as if valid.
    const resultsVisible = await page.locator(".paste-results").isVisible().catch(() => false);
    const idleVisible = await page.locator(".paste-idle").isVisible().catch(() => false);
    const staleBadge = page.locator('[data-testid="stale-indicator"], .stale-badge, .paste-stale');
    const staleBadgeVisible = await staleBadge.isVisible().catch(() => false);

    // If stale badge design is used, authoritative score must be disabled (hidden or aria-disabled)
    // For now we require: NOT (resultsVisible as valid). So either hidden or stale-marked.
    // Hard failure if bug present: resultsVisible true and no stale marking and idle not shown.
    if (resultsVisible && !staleBadgeVisible) {
      // Before fix this branch triggers -> test fails with stale-state message
      // After fix resultsVisible should be false (idle) OR staleBadgeVisible true
      // Check footer still shows old length -> stale
      const stillFooter = await footerA.isVisible().catch(() => false);
      // If footer still shows old length, it's stale
      if (stillFooter) {
        const curFooter = await footerA.innerText().catch(() => "");
        // If footer hasn't changed (still A length), it's definitely stale
        // Fail explicitly
        expect(
          resultsVisible && !staleBadgeVisible && stillFooter,
          `STALE-STATE BUG: old analysis for prompt A remains visible after editing to prompt B. ` +
            `Results visible=${resultsVisible}, idleVisible=${idleVisible}, staleBadge=${staleBadgeVisible}, footer="${curFooter}" vs prompt B length ${PROMPT_B.length}`
        ).toBeFalsy();
      }
      // Even without footer check, stale authoritative result is a failure
      expect(
        resultsVisible,
        `Stale analysis visible after edit without invalidation. Expected .paste-results hidden or marked stale. idleVisible=${idleVisible}`
      ).toBeFalsy();
    }

    // Preferred: idle state after edit
    // If OPTION B is chosen, this assertion should be adjusted to check stale badge instead.
    // We assert idle OR stale, but idle is the minimal fix.
    const invalidated = !resultsVisible || staleBadgeVisible;
    expect(invalidated, "After editing prompt, stale result must be invalidated (hidden or stale-marked)").toBeTruthy();

    // If idle path, verify hint reappears
    if (!staleBadgeVisible) {
      await expect(page.locator(".paste-results")).toBeHidden({ timeout: 2000 });
      // Idle hint should be visible (or at least results not visible)
      // Paste analyzer shows .paste-idle when status idle
      await expect(page.locator(".paste-idle")).toBeVisible({ timeout: 2000 });
    } else {
      // OPTION B: stale indicator must be visible and score not authoritative
      await expect(staleBadge).toBeVisible();
      // Score should be disabled / stale
      const scoreEl = page.locator(".context-overall-value").first();
      // If stale, score element should have stale class or be hidden
      if (await scoreEl.isVisible()) {
        const cls = (await scoreEl.getAttribute("class")) || "";
        expect(cls.includes("stale") || cls.includes("disabled")).toBeTruthy();
      }
    }

    // --- RE-ANALYZE B ---
    await analyzeBtn.click();
    await expect(page.locator(".paste-results")).toBeVisible({ timeout: 5000 });
    await expect(page.getByText("Klassifikation")).toBeVisible();
    await expect(page.getByText("Prompt & Context Engineering")).toBeVisible();
    await expect(page.locator(".context-overall-value").first()).toBeVisible();
    const overallB = page.locator(".context-overall-value").first();
    const scoreBText = (await overallB.innerText()).trim();
    expect(scoreBText.length).toBeGreaterThan(0);

    // Verify footer updated to B length, not stale A length
    const footerBText = await page.locator(".paste-info-footer").innerText();
    expect(footerBText).not.toBe(footerAText);
    // B length must appear
    expect(footerBText).toContain(String(PROMPT_B.trim().length));

    // No stale value remains: footer should not contain old A's exact length if different
    // Already checked not equal; also ensure overall score area is not showing stale A footer
    // If prompts have same length edge case, check criteria still visible and no duplicate idle
    await expect(page.locator(".paste-idle")).toBeHidden();
    await expect(page.locator(".context-mini-score").first()).toBeVisible();

    // --- CONSOLE / NETWORK GATES ---
    // Filter again for final report
    const unexpectedConsole = consoleErrors.filter((e) => !e.includes("[vite]"));
    expect(unexpectedConsole, `Unexpected console errors: ${unexpectedConsole.join("; ")}`).toHaveLength(0);
    expect(externalRequests, `Unexpected external network requests: ${externalRequests.join("; ")}`).toHaveLength(0);
  });

  test("app start shows Direktanalyse entry and idle hint", async ({ page }) => {
    const consoleErrors: string[] = [];
    const externalRequests: string[] = [];
    await loadApp(page, consoleErrors, externalRequests);
    await expect(page.locator(".app-container")).toBeVisible();
    const direktBtn = page.getByRole("button", { name: /Direktanalyse/ });
    await direktBtn.click();
    await expect(page.getByRole("textbox", { name: /Prompt-Text eingeben/ })).toBeVisible();
    await expect(page.locator(".paste-idle")).toBeVisible();
    expect(consoleErrors.filter((e) => !e.includes("[vite]"))).toHaveLength(0);
    expect(externalRequests).toHaveLength(0);
  });
});
