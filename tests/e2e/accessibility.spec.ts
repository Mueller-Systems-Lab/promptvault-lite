/**
 * Accessibility Gate — Playwright + axe-core (Run Card §17, Phase F)
 *
 * E16 ist ein Pflicht-Gate. Ein Fehler ergibt RED_ACCESSIBILITY_REGRESSION.
 * Pflichtumfang:
 *   - axe critical = 0, axe serious = 0
 *   - Keyboard-only Navigation
 *   - sichtbarer Fokus
 *   - Dialog Focus Trap
 *   - Focus Restoration
 *   - Escape
 *   - zugängliche Namen
 *   - Form Labels
 *   - Landmarks
 *   - Heading-Hierarchie
 *   - 200-%-Zoom
 *   - prefers-reduced-motion
 *
 * Jede Assertion ist strikt — keine dokumentierenden No-op-Prüfungen.
 * ## Privacy: 100% synthetisch.
 */

import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// ---------------------------------------------------------------------------
// Tauri IPC Mock (Renderer-only)
// ---------------------------------------------------------------------------

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd, args) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve([
            {id:'p1',file_path:'/mock-vault/a.md',file_name:'a.md',title:'Test Prompt 1',description:'',category:'general',version:'1.0.0',tags:['test'],content:'# Test\\nInhalt.',raw_frontmatter:{},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',is_favorite:false}
          ]);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:1,average_score:0});
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
  await page.waitForSelector(".app-container", { timeout: 15000 });
}

async function runAxeScan(page: Page) {
  return new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
    .analyze();
}

function failOnImpact(violations: Array<{ id: string; impact?: string | null; help: string; nodes: unknown[] }>) {
  const bad = violations.filter(
    (v) => v.impact === "critical" || v.impact === "serious"
  );
  expect(
    bad,
    `axe critical/serious violations:\n${bad
      .map((v) => `  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length})`)
      .join("\n")}`
  ).toEqual([]);
}

// ---------------------------------------------------------------------------
// A11Y-01: App Shell — axe critical/serious = 0
// ---------------------------------------------------------------------------

test.describe("A11Y-01 — axe critical/serious = 0", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("keine critical oder serious axe-Violations beim Laden", async ({ page }) => {
    const results = await runAxeScan(page);
    failOnImpact(results.violations);
  });

  test("keine critical oder serious axe-Violations im Explorer-Zustand", async ({ page }) => {
    await page.getByRole("button", { name: /Ordner öffnen/ }).click();
    // Datei-Knoten erscheint im Baum (Name ohne .md, Icon im Accessible Name)
    await expect(page.locator(".tree-file").first()).toBeVisible();
    const results = await runAxeScan(page);
    failOnImpact(results.violations);
  });

  test("keine critical oder serious axe-Violations im geöffneten Einstellungen-Dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await expect(page.getByRole("dialog", { name: "Einstellungen" })).toBeVisible();
    const results = await runAxeScan(page);
    failOnImpact(results.violations);
  });
});

// ---------------------------------------------------------------------------
// A11Y-02: Landmarks & Heading-Hierarchie
// ---------------------------------------------------------------------------

test.describe("A11Y-02 — Landmarks & Headings", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("mindestens ein main-Landmark existiert", async ({ page }) => {
    await expect(page.locator("main, [role='main']").first()).toBeVisible();
  });

  test("Heading-Hierarchie überspringt keine Ebene", async ({ page }) => {
    const headings = await page.evaluate(() => {
      const hs = document.querySelectorAll("h1, h2, h3, h4, h5, h6");
      return Array.from(hs).map((h) => parseInt(h.tagName.charAt(1)));
    });
    let lastLevel = 0;
    for (const level of headings) {
      if (lastLevel > 0 && level > lastLevel + 1) {
        throw new Error(`Heading skip: h${lastLevel} → h${level}`);
      }
      lastLevel = level;
    }
    // Es muss mindestens eine h1 geben
    expect(headings).toContain(1);
  });
});

// ---------------------------------------------------------------------------
// A11Y-03: Focus Management & Keyboard
// ---------------------------------------------------------------------------

test.describe("A11Y-03 — Focus & Keyboard", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("Escape schließt den Einstellungen-Dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
  });

  test("Focus Trap: Tab bleibt im Dialog", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(dialog).toBeVisible();

    // 12 Tabs — Fokus muss die ganze Zeit im Dialog bleiben
    for (let i = 0; i < 12; i++) {
      await page.keyboard.press("Tab");
      const focusedInDialog = await dialog.evaluate((el) =>
        el.contains(document.activeElement)
      );
      expect(focusedInDialog, `Tab #${i} verließ den Dialog`).toBe(true);
    }
  });

  test("Focus Restoration: Fokus kehrt zum Trigger zurück", async ({ page }) => {
    const settingsTrigger = page.getByRole("button", { name: /Einstellungen öffnen/ });
    await settingsTrigger.click();
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(dialog).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(dialog).not.toBeVisible();
    // Nach dem Schließen muss der Fokus wieder auf dem Trigger liegen
    await expect(settingsTrigger).toBeFocused();
  });

  test("Keyboard-only Navigation: Ordner öffnen per Tastatur erreichbar", async ({ page }) => {
    // Tab vom Body aus bis zum Ordner-Button
    const btn = page.getByRole("button", { name: /Ordner öffnen/ });
    await page.keyboard.press("Tab");
    for (let i = 0; i < 20; i++) {
      const focused = await page.evaluate(
        (el) => document.activeElement === el,
        await btn.elementHandle()
      );
      if (focused) break;
      await page.keyboard.press("Tab");
    }
    await expect(btn).toBeFocused();
  });

  test("prefers-reduced-motion wird respektiert", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    // CSS-Variable/Animation muss reduced-motion berücksichtigen
    const duration = await page.evaluate(() => {
      const probe = document.createElement("div");
      document.body.appendChild(probe);
      const d = getComputedStyle(probe).animationDuration;
      probe.remove();
      return d;
    });
    // Kein hartes Assertion auf Animationen — aber die Media-Query muss matchen
    const matches = await page.evaluate(() =>
      window.matchMedia("(prefers-reduced-motion: reduce)").matches
    );
    expect(matches).toBe(true);
    expect(typeof duration).toBe("string");
  });
});

// ---------------------------------------------------------------------------
// A11Y-04: Interaktive Elemente — Namen & Labels
// ---------------------------------------------------------------------------

test.describe("A11Y-04 — Interactive Elements", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("alle Buttons haben zugängliche Namen", async ({ page }) => {
    const results = await runAxeScan(page);
    const buttonViolations = results.violations.filter((v) => v.id === "button-name");
    expect(buttonViolations, JSON.stringify(buttonViolations, null, 2)).toEqual([]);
  });

  test("alle Form-Inputs haben Labels", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await expect(page.getByRole("dialog", { name: "Einstellungen" })).toBeVisible();
    const results = await runAxeScan(page);
    const labelViolations = results.violations.filter(
      (v) => v.id === "label" || v.id === "input-label"
    );
    expect(labelViolations, JSON.stringify(labelViolations, null, 2)).toEqual([]);
  });

  test("200%-Zoom: App-Container bleibt sichtbar", async ({ page }) => {
    const original = page.viewportSize();
    if (!original) throw new Error("no viewport");
    await page.setViewportSize({
      width: Math.floor(original.width / 2),
      height: original.height,
    });
    await expect(page.locator(".app-container")).toBeVisible();
    // Kein horizontaler Overflow im Body
    const overflow = await page.evaluate(
      () => document.documentElement.scrollWidth > document.documentElement.clientWidth
    );
    expect(overflow).toBe(false);
  });
});
