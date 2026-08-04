/**
 * Playwright Renderer E2E — Real User Journeys R2-R5 (Run Card §16)
 *
 * R2 — Archiv laden
 * R3 — Prompt öffnen
 * R4 — Analyse
 * R5 — Optimierung
 *
 * Renderer-Suite: Tauri IPC ist für deterministische Browserprüfung gemockt
 * (erlaubt laut Run Card §16), klar als Renderer-E2E bezeichnet. Die echte
 * native Grenze testet E19 via WebdriverIO + tauri-driver.
 *
 * Jede Reise scheitert, wenn das Element oder Verhalten fehlt — keine
 * schwachen Assertions.
 */

import { test, expect, type Page } from "@playwright/test";

// ---------------------------------------------------------------------------
// Synthetisches Archiv (Spiegel der Native-Fixture aus Run Card §21)
// ---------------------------------------------------------------------------

interface MockPrompt {
  id: string;
  file_path: string;
  file_name: string;
  title: string;
  description: string;
  category: string;
  version: string;
  tags: string[];
  content: string;
  raw_frontmatter: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  is_favorite: boolean;
}

const VAULT_ROOT = "/mock-vault";

const PROMPTS: MockPrompt[] = [
  {
    id: "p-basic",
    file_path: `${VAULT_ROOT}/clean/basic-prompt.md`,
    file_name: "basic-prompt.md",
    title: "Basic Prompt",
    description: "Einfacher sauberer Prompt",
    category: "general",
    version: "1.0.0",
    tags: ["basic", "clean"],
    content: "# Basic Prompt\n\nSchreibe eine Zusammenfassung.",
    raw_frontmatter: { title: "Basic Prompt", category: "general" },
    created_at: "2026-01-01T10:00:00Z",
    updated_at: "2026-01-01T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-blueprint",
    file_path: `${VAULT_ROOT}/clean/blueprint-prompt.md`,
    file_name: "blueprint-prompt.md",
    title: "Blueprint Prompt",
    description: "Blueprint-artiger Prompt",
    category: "blueprint",
    version: "1.0.0",
    tags: ["blueprint"],
    content: "# Blueprint\n\nEine vollständige Anleitung mit Schritten.",
    raw_frontmatter: { title: "Blueprint Prompt", category: "blueprint" },
    created_at: "2026-01-02T10:00:00Z",
    updated_at: "2026-01-02T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-nested",
    file_path: `${VAULT_ROOT}/nested/deep/nested-prompt.md`,
    file_name: "nested-prompt.md",
    title: "Nested Prompt",
    description: "Verschachtelter Prompt",
    category: "general",
    version: "1.0.0",
    tags: ["nested"],
    content: "# Nested\n\nTief verschachtelt.",
    raw_frontmatter: { title: "Nested Prompt" },
    created_at: "2026-01-03T10:00:00Z",
    updated_at: "2026-01-03T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-unicode",
    file_path: `${VAULT_ROOT}/unicode/äöü-测试-prompt.md`,
    file_name: "äöü-测试-prompt.md",
    title: "Unicode Prompt",
    description: "Unicode-Dateiname",
    category: "general",
    version: "1.0.0",
    tags: ["unicode"],
    content: "# Unicode\n\nÄöü 测试 Inhalt.",
    raw_frontmatter: { title: "Unicode Prompt" },
    created_at: "2026-01-04T10:00:00Z",
    updated_at: "2026-01-04T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-blocked",
    file_path: `${VAULT_ROOT}/blocked/sensitive-prompt.md`,
    file_name: "sensitive-prompt.md",
    title: "Sensitive Prompt",
    description: "Blockierter sensibler Prompt",
    category: "general",
    version: "1.0.0",
    tags: ["blocked"],
    content: "# Sensitiv\n\nPVL_NATIVE_E2E_BLOCKED Inhalt.",
    raw_frontmatter: { title: "Sensitive Prompt" },
    created_at: "2026-01-05T10:00:00Z",
    updated_at: "2026-01-05T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-invalid",
    file_path: `${VAULT_ROOT}/invalid/malformed-frontmatter.md`,
    file_name: "malformed-frontmatter.md",
    title: "Malformed Frontmatter",
    description: "Kaputtes Frontmatter",
    category: "general",
    version: "1.0.0",
    tags: ["invalid"],
    content: "---\nbroken\n---\nInhalt",
    raw_frontmatter: {},
    created_at: "2026-01-06T10:00:00Z",
    updated_at: "2026-01-06T10:00:00Z",
    is_favorite: false,
  },
  {
    id: "p-empty",
    file_path: `${VAULT_ROOT}/empty/empty-prompt.md`,
    file_name: "empty-prompt.md",
    title: "Empty Prompt",
    description: "Leerer Prompt",
    category: "general",
    version: "1.0.0",
    tags: ["empty"],
    content: "",
    raw_frontmatter: {},
    created_at: "2026-01-07T10:00:00Z",
    updated_at: "2026-01-07T10:00:00Z",
    is_favorite: false,
  },
];

const EVALUATIONS: Record<string, unknown> = {
  "p-basic": {
    id: "eval-basic",
    prompt_id: "p-basic",
    overall_score: 85,
    criteria: [
      { name: "Klarheit", score: 9, max_score: 10, weight: 1, details: "klar" },
      { name: "Vollständigkeit", score: 8, max_score: 10, weight: 1, details: "vollständig" },
    ],
    missing_sections: [],
    recommendations: ["Füge ein konkretes Beispiel hinzu."],
    evaluated_at: "2026-01-05T10:00:00Z",
  },
};

const HYGIENE: Record<string, unknown> = {
  "p-basic": {
    id: "hyg-basic",
    prompt_id: "p-basic",
    hygiene_score: 100,
    status: "clean",
    artifacts: [],
    analyzed_at: "2026-01-05T10:00:00Z",
  },
};

// ---------------------------------------------------------------------------
// Tauri IPC Mock (Renderer-only; echte native Grenze siehe E19)
// ---------------------------------------------------------------------------

function buildTauriMockScript(): string {
  const promptsJson = JSON.stringify(PROMPTS);
  const evalsJson = JSON.stringify(EVALUATIONS);
  const hygJson = JSON.stringify(HYGIENE);
  return `
    window.__TAURI_INTERNALS__ = (function() {
      const prompts = ${promptsJson};
      const evaluations = ${evalsJson};
      const hygiene = ${hygJson};
      function invoke(cmd, args) {
        switch (cmd) {
          case 'plugin:dialog|open': return Promise.resolve('${VAULT_ROOT}');
          case 'plugin:dialog|save': return Promise.resolve('${VAULT_ROOT}/export.json');
          case 'scan_directory': {
            const path = (args && args.path) || '';
            if (path === '${VAULT_ROOT}') return Promise.resolve(prompts);
            return Promise.resolve([]);
          }
          case 'start_file_watcher': case 'stop_file_watcher': return Promise.resolve(null);
          case 'load_cache': case 'save_cache': return Promise.resolve(null);
          case 'analyze_all': {
            const ids = prompts.map((p) => p.id);
            return Promise.resolve({
              evaluations: ids.map((id) => evaluations[id] || {
                id: 'eval-' + id, prompt_id: id, overall_score: 75,
                criteria: [], missing_sections: [], recommendations: [],
                evaluated_at: new Date().toISOString(),
              }),
              hygiene: ids.map((id) => hygiene[id] || {
                id: 'hyg-' + id, prompt_id: id, hygiene_score: 100,
                status: 'clean', artifacts: [], analyzed_at: new Date().toISOString(),
              }),
              total_prompts: prompts.length,
              average_score: 80,
            });
          }
          case 'evaluate_prompt': return Promise.resolve(evaluations['p-basic'] || {
            id: 'eval-x', prompt_id: '', overall_score: 85, criteria: [],
            missing_sections: [], recommendations: [], evaluated_at: new Date().toISOString(),
          });
          case 'analyze_hygiene': return Promise.resolve(hygiene['p-basic'] || {
            id: 'hyg-x', prompt_id: '', hygiene_score: 100, status: 'clean',
            artifacts: [], analyzed_at: new Date().toISOString(),
          });
          case 'toggle_favorite': return Promise.resolve(false);
          case 'get_favorites': return Promise.resolve([]);
          case 'export_json': case 'export_markdown': case 'export_zip':
            return Promise.resolve('${VAULT_ROOT}/export');
          case 'detect_artifacts_action':
            return Promise.resolve({artifacts:[],hygiene_score:100,status:'clean',categories_found:[]});
          case 'plugin:clipboard-manager|write_text': {
            // Aufzeichnung der tatsächlich kopierten Nutzlast (R5-Vertrag)
            const payload = (args && args.text) || '';
            window.__pvlClipboard = payload;
            return Promise.resolve(null);
          }
          default: return Promise.resolve(null);
        }
      }
      function transformCallback(cb,once){return 1;}
      function convertFileSrc(fp){return 'mock-asset://'+(fp||'unknown');}
      // Clipboard-Spy (Renderer-only): zeichnet die echte Kopier-Nutzlast auf
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          const origWrite = navigator.clipboard.writeText.bind(navigator.clipboard);
          navigator.clipboard.writeText = (text) => {
            window.__pvlClipboard = text;
            return origWrite(text).catch(() => {});
          };
        }
      } catch (e) { /* Clipboard nicht verfügbar — Plugin-Pfad deckt ab */ }
      return {invoke:invoke,transformCallback:transformCallback,convertFileSrc:convertFileSrc};
    })();
  `;
}

async function loadApp(page: Page) {
  await page.addInitScript(buildTauriMockScript());
  await page.goto("/");
  await page.waitForLoadState("networkidle");
  await expect(page.locator(".app-container")).toBeVisible();
}

async function loadArchive(page: Page) {
  await page.getByRole("button", { name: /Ordner öffnen/ }).click();
  // Der FileTree gruppiert nach Ordnern (kollabiert) — Ordner muss erst sichtbar sein
  await expect(page.getByRole("button", { name: /Ordner clean \(geschlossen\)/ })).toBeVisible();
}

async function expandFolder(page: Page, name: string) {
  const folder = page.getByRole("button", { name: new RegExp(`Ordner ${name} \\(geschlossen\\)`) });
  await expect(folder).toBeVisible();
  await folder.click();
}

// ---------------------------------------------------------------------------
// R2 — Archiv laden
// ---------------------------------------------------------------------------

test.describe("R2 — Archiv laden", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
  });

  test("Archivaktion ist sichtbar und aktiv", async ({ page }) => {
    const btn = page.getByRole("button", { name: /Ordner öffnen/ });
    await expect(btn).toBeVisible();
    await expect(btn).toBeEnabled();
  });

  test("Archiv wird geladen — exakte erwartete Dateien sichtbar", async ({ page }) => {
    await loadArchive(page);
    // Erwartete Ordnerstruktur
    for (const folder of ["clean", "blocked", "nested", "unicode", "invalid", "empty"]) {
      await expect(
        page.getByRole("button", { name: new RegExp(`Ordner ${folder} \\(geschlossen\\)`) })
      ).toBeVisible();
    }
    // Erwartete Dateien im Ordner clean
    await expandFolder(page, "clean");
    await expect(page.getByRole("button", { name: /basic-prompt/ })).toBeVisible();
    await expect(page.getByRole("button", { name: /blueprint-prompt/ })).toBeVisible();
  });

  test("verschachtelte Datei sichtbar nach Ordner-Expansion", async ({ page }) => {
    await loadArchive(page);
    await expandFolder(page, "nested");
    await expandFolder(page, "deep");
    await expect(page.getByRole("button", { name: /nested-prompt/ })).toBeVisible();
  });

  test("Unicode-Dateiname sichtbar", async ({ page }) => {
    await loadArchive(page);
    await expandFolder(page, "unicode");
    await expect(page.getByRole("button", { name: /äöü-测试-prompt/ })).toBeVisible();
  });

  test("Explorer zeigt die Dateien NICHT ohne Archiv", async ({ page }) => {
    // Ohne Klick auf "Ordner öffnen" bleibt der Explorer leer
    await expect(page.getByText("Keine Prompts geladen.")).toBeVisible();
  });
});

// ---------------------------------------------------------------------------
// R3 — Prompt öffnen
// ---------------------------------------------------------------------------

test.describe("R3 — Prompt öffnen", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await loadArchive(page);
    await expandFolder(page, "clean");
  });

  test("korrekter Titel, Inhalt, Tags, Kategorie und Auswahlzustand", async ({ page }) => {
    await page.getByRole("button", { name: /basic-prompt/ }).click();

    // Auswahlzustand
    await expect(page.locator(".tree-file.tree-selected")).toContainText("basic-prompt");

    // Titel
    await expect(page.getByRole("heading", { name: /Basic Prompt/ })).toBeVisible();

    // Inhalt
    await expect(page.locator(".prompt-content")).toContainText("Schreibe eine Zusammenfassung.");

    // Tags
    await expect(page.locator(".prompt-meta")).toContainText("basic");
    await expect(page.locator(".prompt-meta")).toContainText("clean");

    // Kategorie
    await expect(page.locator(".prompt-meta")).toContainText("general");
  });
});

// ---------------------------------------------------------------------------
// R4 — Analyse
// ---------------------------------------------------------------------------

test.describe("R4 — Analyse", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await loadArchive(page);
    await expandFolder(page, "clean");
    await page.getByRole("button", { name: /basic-prompt/ }).click();
  });

  test("Analyse-Button sichtbar und löst Analyse aus", async ({ page }) => {
    const analyzeBtn = page.getByRole("button", { name: /Alle analysieren/ });
    await expect(analyzeBtn).toBeVisible();

    await analyzeBtn.click();

    // Score für den ausgewählten Prompt
    await expect(page.locator(".analysis-panel, .panel-analysis")).toContainText("85");
    // Kriterien
    await expect(page.getByText("Klarheit")).toBeVisible();
    // Empfehlungen
    await expect(page.getByText("Füge ein konkretes Beispiel hinzu.")).toBeVisible();
  });

  test("Analyse ist dem richtigen Prompt zugeordnet", async ({ page }) => {
    await page.getByRole("button", { name: /Alle analysieren/ }).click();
    // Der Score erscheint im Baum des ausgewählten Prompts (p-basic → 85)
    const selectedRow = page.locator(".tree-file.tree-selected");
    await expect(selectedRow).toContainText("85");
  });
});

// ---------------------------------------------------------------------------
// R5 — Optimierung
// ---------------------------------------------------------------------------

test.describe("R5 — Optimierung", () => {
  test.beforeEach(async ({ page }) => {
    await loadApp(page);
    await loadArchive(page);
    await expandFolder(page, "clean");
    await page.getByRole("button", { name: /basic-prompt/ }).click();
  });

  test("Optimizer öffnet, Original unverändert, Ergebnis sichtbar", async ({ page }) => {
    // Original-Inhalt vorher erfassen
    const original = await page.locator(".prompt-content").innerText();

    const optimizeBtn = page.getByRole("button", { name: /Optimieren/ });
    await expect(optimizeBtn).toBeVisible();
    await optimizeBtn.click();

    // Optimizer-Dialog erscheint
    const dialog = page.locator(".optimizer-dialog");
    await expect(dialog).toBeVisible();

    // Original bleibt unverändert
    await expect(page.locator(".prompt-content")).toHaveText(original);

    // Ergebnis wird nach Moduswahl sichtbar
    await dialog.getByRole("radio", { name: /Conservative/ }).check();
    await expect(dialog.locator(".optimizer-diff")).toBeVisible();
  });

  test("Copy enthält ausschließlich optimierten Text und Dialog schließt", async ({ page }) => {
    await page.getByRole("button", { name: /Optimieren/ }).click();
    const dialog = page.locator(".optimizer-dialog");
    await expect(dialog).toBeVisible();

    // Optimierungsmodus wählen (Ergebnis wird erst danach berechnet)
    await dialog.getByRole("radio", { name: /Conservative/ }).check();

    // Optimiertes Ergebnis muss erscheinen
    const diff = dialog.locator(".optimizer-diff");
    await expect(diff).toBeVisible();
    const optimizedText = (await diff.locator(".optimizer-diff-pane").nth(1).locator(".optimizer-diff-content").innerText()).trim();
    expect(optimizedText.length).toBeGreaterThan(0);

    // Copy: exakt der optimierte Text landet in der Zwischenablage
    const copyBtn = dialog.getByRole("button", { name: /kopieren/i }).first();
    await copyBtn.scrollIntoViewIfNeeded();
    await copyBtn.click({ force: true });

    const clipboardPayload = await page.evaluate(
      () => (window as unknown as { __pvlClipboard?: string }).__pvlClipboard || ""
    );
    // Zwischenablage enthält ausschließlich den optimierten Text
    expect(clipboardPayload.trim()).toBe(optimizedText);

    // Dialog schließt über den Schließen-Button
    await dialog.getByRole("button", { name: "Schließen" }).first().click();
    await expect(dialog).not.toBeVisible();
  });
});
