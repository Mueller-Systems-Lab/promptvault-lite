/**
 * Visual Structural Evidence (Run Card §27, Phase J)
 *
 * E15 ist ein Pflicht-Gate: PASS oder RED — kein YELLOW, keine fehlende
 * Pixelbaseline. Geprüft wird deterministisch die strukturelle Korrektheit:
 *   - Toolbar sichtbar und im Viewport
 *   - Explorer sichtbar
 *   - Detailsbereich sichtbar
 *   - Statusbar vollständig sichtbar
 *   - kein horizontales Abschneiden
 *   - keine Überlappung kritischer Controls
 *   - Dialog vollständig im Viewport
 *   - Dark Mode strukturell korrekt
 *   - Light Mode strukturell korrekt
 *   - 1280×800, 1920×1080, kleiner unterstützter Viewport
 *
 * Optional erzeugte Screenshots sind Evidence, aber keine Pixelbaseline.
 * ## Privacy: 100% synthetisch.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Tauri IPC Mock (Renderer-only)
// ---------------------------------------------------------------------------

function buildTauriMockScript(): string {
  return `
    window.__TAURI_INTERNALS__ = (function() {
      function invoke(cmd) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('/mock-vault');
          case 'plugin:dialog|save': return Promise.resolve('/mock-vault/export.json');
          case 'scan_directory': return Promise.resolve([
            {id:'p1',file_path:'/mock-vault/a.md',file_name:'a.md',title:'Test Prompt 1',description:'',category:'general',version:'1.0.0',tags:['test'],content:'# Test\\nInhalt.',raw_frontmatter:{},created_at:'2026-01-01T00:00:00Z',updated_at:'2026-01-01T00:00:00Z',is_favorite:false}
          ]);
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': return Promise.resolve({evaluations:[],hygiene:[],total_prompts:1,average_score:0});
          case 'evaluate_prompt': return Promise.resolve({id:'eval-x',prompt_id:'',overall_score:0,criteria:[],missing_sections:[],recommendations:[],evaluated_at:new Date().toISOString()});
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

/** Assert that an element is fully within the viewport (no cut-off). */
async function expectFullyInViewport(locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  if (!box) throw new Error("no bounding box");
  const vp = await locator.page().viewportSize();
  if (!vp) throw new Error("no viewport");
  expect(box.x, "left edge cut off").toBeGreaterThanOrEqual(0);
  expect(box.y, "top edge cut off").toBeGreaterThanOrEqual(0);
  expect(box.x + box.width, "right edge cut off").toBeLessThanOrEqual(vp.width);
  expect(box.y + box.height, "bottom edge cut off").toBeLessThanOrEqual(vp.height);
}

/** Assert that two elements do not overlap. */
async function expectNoOverlap(a: ReturnType<Page["locator"]>, b: ReturnType<Page["locator"]>) {
  const ba = await a.boundingBox();
  const bb = await b.boundingBox();
  if (!ba || !bb) throw new Error("missing bounding box for overlap check");
  const overlapX = ba.x < bb.x + bb.width && bb.x < ba.x + ba.width;
  const overlapY = ba.y < bb.y + bb.height && bb.y < ba.y + ba.height;
  expect(overlapX && overlapY, `overlap between ${a} and ${b}`).toBe(false);
}

const VIEWPORTS: Array<{ name: string; width: number; height: number }> = [
  { name: "1280x800", width: 1280, height: 800 },
  { name: "1920x1080", width: 1920, height: 1080 },
  { name: "small", width: 1024, height: 600 },
];

// ---------------------------------------------------------------------------
// VS-01: App Shell strukturell korrekt (alle Viewports)
// ---------------------------------------------------------------------------

for (const vp of VIEWPORTS) {
  test.describe(`VS-01 — App Shell ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("Toolbar, Explorer, Details, Statusbar sichtbar und im Viewport", async ({ page }) => {
      await loadApp(page);
      await expectFullyInViewport(page.locator(".app-toolbar"));
      await expectFullyInViewport(page.locator(".panel-explorer"));
      await expectFullyInViewport(page.locator(".panel-details"));
      await expectFullyInViewport(page.locator(".app-statusbar"));
      await page.screenshot({ path: `test-results/visual-gate/shell-${vp.name}.png`, fullPage: true });
    });

    test("kein horizontales Abschneiden", async ({ page }) => {
      await loadApp(page);
      const overflow = await page.evaluate(
        () => document.documentElement.scrollWidth > document.documentElement.clientWidth
      );
      expect(overflow, "horizontal overflow detected").toBe(false);
    });

    test("keine Überlappung kritischer Controls (Toolbar-Buttons)", async ({ page }) => {
      await loadApp(page);
      const buttons = page.locator(".app-toolbar .btn");
      const count = await buttons.count();
      expect(count).toBeGreaterThanOrEqual(2);
      for (let i = 0; i < count - 1; i++) {
        await expectNoOverlap(buttons.nth(i), buttons.nth(i + 1));
      }
    });

    test("Explorer und Details überlappen nicht", async ({ page }) => {
      await loadApp(page);
      await expectNoOverlap(page.locator(".panel-explorer"), page.locator(".panel-details"));
    });
  });
}

// ---------------------------------------------------------------------------
// VS-02: Statusbar vollständig sichtbar
// ---------------------------------------------------------------------------

test.describe("VS-02 — Statusbar", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("Statusbar zeigt Version vollständig", async ({ page }) => {
    const bar = page.locator(".app-statusbar");
    await expectFullyInViewport(bar);
    await expect(bar).toContainText(/PromptVault Lite v\d+\.\d+\.\d+/);
  });
});

// ---------------------------------------------------------------------------
// VS-03: Dialog vollständig im Viewport (Dark + Light)
// ---------------------------------------------------------------------------

test.describe("VS-03 — Dialog & Themes", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("Einstellungen-Dialog vollständig im Viewport (Dunkel)", async ({ page }) => {
    // Default-Theme ist Dunkel
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    const dialog = page.getByRole("dialog", { name: "Einstellungen" });
    await expect(dialog).toBeVisible();
    await expectFullyInViewport(dialog);
    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("dark");
    await page.screenshot({ path: "test-results/visual-gate/dialog-dark.png" });
  });

  test("Light Mode strukturell korrekt", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await page.getByRole("radio", { name: "Hell" }).click();
    await page.keyboard.press("Escape");

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("light");

    await expectFullyInViewport(page.locator(".app-toolbar"));
    await expectFullyInViewport(page.locator(".app-statusbar"));
    await page.screenshot({ path: "test-results/visual-gate/light-mode.png" });
  });

  test("Dark Mode strukturell korrekt nach Theme-Wechsel", async ({ page }) => {
    await page.getByRole("button", { name: /Einstellungen öffnen/ }).click();
    await page.getByRole("radio", { name: "Hell" }).click();
    await page.getByRole("radio", { name: "Dunkel" }).click();
    await page.keyboard.press("Escape");

    const theme = await page.evaluate(() =>
      document.documentElement.getAttribute("data-theme")
    );
    expect(theme).toBe("dark");
    await expectFullyInViewport(page.locator(".panel-explorer"));
    await page.screenshot({ path: "test-results/visual-gate/dark-mode.png" });
  });
});
