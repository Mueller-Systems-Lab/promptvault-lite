// e2e-tests/specs/demo-record.linux.spec.js
//
// PROMPTVAULT LITE — LINUX DEMO DRY-RUN + RECORDING SPEC (2026-08-19)
// ---------------------------------------------------------------------------
// Drives the REAL Linux release binary target/release/promptvault-lite
// (Debug: False, embeds dist/) via tauri-driver + WebKitWebDriver on the
// isolated Xvfb display. NO debug bridge, NO Vite mock, NO OCR.
//
// Archive-loader: REAL product startup-restore path
//   localStorage["promptvault.lastFolder"] = /tmp/promptvault-demo
//   browser.refresh() -> App.tsx restore effect -> real scanFolder()
//   -> real Tauri IPC invoke("scan_directory") -> real Rust -> real FS.
//
// Flow (mandate §27): OPEN -> CREATE -> SAVE -> ANALYZE -> MISSING INFO
// -> DIRECTION/VARIANTS -> SELECT -> APPLY -> DIRTY -> SAVE -> FINAL.
// Every transition is verified structurally via DOM/WebDriver assertions.
//
// Required outcomes (DEMO_DRY_RUN gate):
//   OPEN_RESTORE, CREATE_REAL, SAVE_REAL, ANALYZE_REAL, MISSING_INFO_REAL,
//   DIRECTION_REAL, VARIANT_REAL, SELECT_REAL, APPLY_REAL, DIRTY_REAL,
//   FINAL_SAVE_REAL

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Demo constants (synthetic data only, mandate §25)
// ---------------------------------------------------------------------------
const DEMO_VAULT = process.env.PVL_DEMO_VAULT || "/tmp/promptvault-demo";
const DEMO_TITLE = "Hamburg Städtetrip";
const DEMO_CONTENT = [
  "Plane einen dreitägigen Städtetrip nach Hamburg.",
  "Berücksichtige Budget, Interessen, Unterkunft und tägliche Route.",
].join("\n");

// ---------------------------------------------------------------------------
// WebDriver-Helfer (release-binary startup-restore loader, no debug bridge)
// ---------------------------------------------------------------------------

async function loadVaultViaPublicRestore(vault) {
  await browser.execute((p) => {
    localStorage.setItem("promptvault.lastFolder", p);
  }, vault);
  await browser.refresh();
  await $("h1").waitForExist({ timeout: 90000 });
  // Härtung: auf den eigenen Vault-Inhalt warten (realer Re-Scan abgeschlossen):
  // Die Statusbar zeigt nach erfolgreichem Re-Scan "x von y Prompt(s)".
  // (Der Tree relativiert Pfade zum Vault-Root — der Root-Ordner selbst
  //  erscheint NICHT als .tree-folder-Knoten.)
  const statusbar = await $(".app-statusbar");
  await statusbar.waitForExist({ timeout: 30000 });
  await browser.waitUntil(
    async () => (await statusbar.getText()).includes("Prompt"),
    { timeout: 30000, timeoutMsg: "Statusbar zeigt keinen Prompt-Zähler nach Restore" },
  );
  await browser.pause(500);
}

async function expandAllFolders() {
  for (let i = 0; i < 10; i += 1) {
    const collapsed = await $$('.tree-folder[aria-expanded="false"]');
    if (collapsed.length === 0) break;
    for (const f of collapsed) {
      await f.click();
      await browser.pause(100);
    }
  }
  await browser.pause(300);
}

async function debugBridgeAbsent() {
  return browser.execute(() => typeof window.__pvlLoadArchive === "undefined");
}

async function realScanDirectoryViaGlobalIpc(vault) {
  return browser.execute(
    (p) =>
      window.__TAURI_INTERNALS__.invoke("scan_directory", { path: p }).then(
        (r) => ({ ok: true, count: Array.isArray(r) ? r.length : -1 }),
        (e) => ({ ok: false, err: String(e) }),
      ),
    vault,
  );
}

async function dismissModals() {
  for (let i = 0; i < 3; i += 1) {
    await browser.keys("Escape");
    await browser.pause(150);
  }
  const closeSelectors = [
    '.modal-dialog button[aria-label="Schließen"]',
    'button[aria-label="Panel schließen"]',
    'button[aria-label="Editor schließen"]',
    '[data-testid="gate-btn-cancel"]',
    '[data-testid="variant-panel-close-btn"]',
    '[data-testid="variant-results-close-btn"]',
    'button[aria-label="Diagnostics schließen"]',
  ];
  for (const sel of closeSelectors) {
    const btn = await $(sel);
    if ((await btn.isExisting()) && (await btn.isDisplayed())) {
      await btn.click();
      await browser.pause(150);
    }
  }
  await browser.pause(200);
}

/** Füllt alle sichtbaren REQUIRED gate-inputs deterministisch. */
async function fillGateRequiredInputs() {
  const inputs = await $$('[data-testid^="gate-input-"]');
  let filled = 0;
  for (const input of inputs) {
    if (!(await input.isDisplayed())) continue;
    const tag = await input.getTagName();
    const label = await input.getAttribute("aria-label");
    const value = label
      ? `Demoantwort zu ${label}`
      : "Synthetische Demoantwort für den Hamburg-Städtetrip.";
    try {
      if (tag === "select") {
        const opts = await input.$$("option");
        if (opts.length > 1) {
          const val = await opts[1].getAttribute("value");
          await input.selectByAttribute("value", val);
          filled += 1;
        }
      } else if (tag === "textarea" || tag === "input") {
        await input.setValue(value);
        filled += 1;
      } else if (tag === "button") {
        // Radio/checkbox wrapper: click to toggle a deterministic choice
        const checked = await input.getAttribute("aria-checked");
        if (checked === "false" || checked === null) {
          await input.click();
          filled += 1;
        }
      }
    } catch {
      // skip unserviceable control
    }
    await browser.pause(80);
  }
  return filled;
}

// ---------------------------------------------------------------------------
describe("PVL Linux Demo — real release binary flow (dry-run + record)", function () {
  it("0. Release binary: no debug bridge, real Rust scan_directory IPC", async () => {
    const bridge = await debugBridgeAbsent();
    expect(bridge).toBe(true);

    const scan = await realScanDirectoryViaGlobalIpc(DEMO_VAULT);
    console.log("REAL_SCAN_DIRECTORY_IPC:", JSON.stringify(scan));
    expect(scan.ok).toBe(true);
  });

  it("1. OPEN: real startup-restore of the neutral demo vault", async function () {
    await loadVaultViaPublicRestore(DEMO_VAULT);
    await expandAllFolders();

    // Statusbar: "Bereit" (leerer Vault) ODER "x von y Prompt(s)" (Willkommen.md)
    const statusbar = await $(".app-statusbar");
    await statusbar.waitForExist({ timeout: 10000 });
    const statusText = await statusbar.getText();
    console.log("STATUSBAR_OPEN:", statusText);
    expect(statusText).toMatch(/(Bereit|Prompt)/);
  });

  it("2. CREATE: Neuer Prompt -> Titel + Inhalt -> Speichern aktiv", async function () {
    await $('button[aria-label="Neuen Prompt erstellen"]').click();
    await $('[role="dialog"][aria-label="Neuen Prompt erstellen"]').waitForExist({
      timeout: 10000,
    });

    await $("#prompt-editor-title").setValue(DEMO_TITLE);
    await $("#prompt-editor-content").setValue(DEMO_CONTENT);
    await browser.pause(200);

    const saveBtn = $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"] .modal-footer button.btn-primary',
    );
    await saveBtn.waitForEnabled({ timeout: 5000 });
    console.log("CREATE_SAVE_ENABLED: true");
  });

  it("3. SAVE: Speichern -> Datei auf Platte + Tree-Eintrag", async function () {
    const saveBtn = $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"] .modal-footer button.btn-primary',
    );
    await saveBtn.click();
    // Watcher-Debounce ~2.5s
    await browser.pause(3000);

    const target = path.join(DEMO_VAULT, `${DEMO_TITLE}.md`);
    console.log("ON_DISK:", target, fs.existsSync(target));
    expect(fs.existsSync(target)).toBe(true);

    await dismissModals();
    await expandAllFolders();
    const fileNode = await $(`.tree-file*=Hamburg`);
    await fileNode.waitForExist({ timeout: 15000 });
  });

  it("4. ANALYZE: Datei öffnen -> Details -> Neu analysieren -> Score", async function () {
    const fileNode = await $(`.tree-file*=Hamburg`);
    await fileNode.click();
    const details = await $(".panel-details");
    await details.waitForExist({ timeout: 10000 });
    await browser.pause(500);

    const analyzeBtn = await $('button[title="Neu analysieren"]');
    await analyzeBtn.waitForEnabled({ timeout: 10000 });
    await analyzeBtn.click();
    await browser.pause(200);

    const score = await $(".circular-score-value");
    await score.waitForExist({ timeout: 30000 });
    const scoreText = await score.getText();
    console.log("ANALYZE_SCORE:", scoreText);
    expect(parseInt(scoreText, 10)).toBeGreaterThan(0);
  });

  it("5. MISSING INFO: Gate öffnen -> REQUIRED sichtbar -> beantworten -> übernehmen", async function () {
    await dismissModals();
    const gateBtn = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn.waitForExist({ timeout: 10000 });
    await gateBtn.click();

    const gateDialog = await $('[role="dialog"][aria-label="Fehlende Informationen"]');
    await gateDialog.waitForExist({ timeout: 10000 });
    const required = await $('[data-testid="gate-required-section"]');
    await required.waitForExist({ timeout: 10000 });
    const summary = await $('[data-testid="gate-summary"]');
    const summaryText = await summary.getText();
    console.log("GATE_SUMMARY:", summaryText.replace(/\s+/g, " ").slice(0, 200));

    const filled = await fillGateRequiredInputs();
    console.log("GATE_FILLED_INPUTS:", filled);

    const proceed = await $('[data-testid="gate-btn-proceed"]');
    await proceed.waitForEnabled({ timeout: 10000 });
    await proceed.click();
    await browser.pause(500);

    // Optimizer öffnet sich automatisch (real behavior) -> schließen
    await dismissModals();
  });

  it("6. DIRECTION: Varianten-Panel -> Profil -> generieren -> Karten", async function () {
    const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtn.waitForExist({ timeout: 10000 });
    await variantBtn.click();

    const panel = await $('[data-testid="variant-panel"]');
    await panel.waitForExist({ timeout: 10000 });

    // Profil wählen (falls Default nicht aktiv): sachlich
    const chip = await $('[data-testid="profile-chip-sachlich"]');
    if (await chip.isExisting()) {
      const pressed = await chip.getAttribute("aria-pressed");
      if (pressed !== "true") {
        await chip.click();
      }
    }

    const generateBtn = await $('[data-testid="variant-generate-btn"]');
    await generateBtn.waitForEnabled({ timeout: 10000 });
    await generateBtn.click();

    const count = await $('[data-testid="variant-result-count"]');
    await count.waitForExist({ timeout: 60000 });
    const countText = await count.getText();
    console.log("VARIANT_COUNT_TEXT:", countText);
    const countMatch = countText.match(/(\d+)/);
    expect(countMatch).not.toBeNull();
    expect(parseInt(countMatch[1], 10)).toBeGreaterThan(0);
  });

  it("7. SELECT: erste Varianten-Karte expandieren", async function () {
    const cards = await $$('[data-testid^="variant-card-"]');
    expect(cards.length).toBeGreaterThan(0);
    const firstId = await cards[0].getAttribute("data-testid");
    const variantId = firstId.replace("variant-card-", "");
    console.log("SELECTED_VARIANT_ID:", variantId);

    const toggle = await $(`[data-testid="variant-content-toggle-${variantId}"]`);
    await toggle.click();
    const content = await $(`[data-testid="variant-content-${variantId}"]`);
    await content.waitForExist({ timeout: 10000 });
    const contentText = await content.getText();
    console.log("VARIANT_CONTENT_LEN:", contentText.length);
    expect(contentText.length).toBeGreaterThan(50);
  });

  it("8. APPLY: Übernehmen -> Editor mit Varianteninhalt (dirty)", async function () {
    const cards = await $$('[data-testid^="variant-card-"]');
    const firstId = await cards[0].getAttribute("data-testid");
    const variantId = firstId.replace("variant-card-", "");

    const applyBtn = await $(`[data-testid="variant-apply-btn-${variantId}"]`);
    await applyBtn.click();

    const editDialog = await $('[role="dialog"][aria-label="Prompt bearbeiten"]');
    await editDialog.waitForExist({ timeout: 10000 });

    const dirty = await $(".editor-dirty-indicator");
    await dirty.waitForExist({ timeout: 5000 });
    const dirtyText = await dirty.getText();
    console.log("DIRTY_INDICATOR:", dirtyText);
    expect(dirtyText).toContain("Ungespeicherte");
  });

  it("9. SAVE (final): Speichern -> Datei aktualisiert + Dialog zu", async function () {
    const saveBtn = $(
      '[role="dialog"][aria-label="Prompt bearbeiten"] .modal-footer button.btn-primary',
    );
    await saveBtn.waitForEnabled({ timeout: 5000 });
    await saveBtn.click();
    await browser.pause(3000);

    const editDialog = await $('[role="dialog"][aria-label="Prompt bearbeiten"]');
    await editDialog.waitForExist({ timeout: 5000, reverse: true });

    const target = path.join(DEMO_VAULT, `${DEMO_TITLE}.md`);
    const diskContent = fs.readFileSync(target, "utf-8");
    console.log("FINAL_DISK_CONTENT_LEN:", diskContent.length);
    expect(diskContent.length).toBeGreaterThan(DEMO_CONTENT.length);

    // Statusbar: finaler Zustand ("x von y Prompt(s)")
    const statusbar = await $(".app-statusbar");
    const statusText = await statusbar.getText();
    console.log("STATUSBAR_FINAL:", statusText);
    expect(statusText).toMatch(/Prompt/);
  });

  it("10. FINAL: erneut analysieren -> Score sichtbar + Ergebnis in Details-Panel", async function () {
    await dismissModals();
    // Nach dem Übernehmen/Speichern ist die Analyse stale (STALE_STATE) —
    // erneut analysieren, damit der finale Score real sichtbar wird.
    const analyzeBtn = await $('button[title="Neu analysieren"]');
    await analyzeBtn.waitForEnabled({ timeout: 10000 });
    await analyzeBtn.click();
    await browser.pause(200);

    const score = await $(".circular-score-value");
    await score.waitForExist({ timeout: 30000 });
    const scoreText = await score.getText();
    console.log("FINAL_SCORE:", scoreText);
    expect(parseInt(scoreText, 10)).toBeGreaterThan(0);

    const content = await $(".prompt-content");
    if (await content.isExisting()) {
      const text = await content.getText();
      console.log("FINAL_CONTENT_LEN:", text.length);
      expect(text.length).toBeGreaterThan(50);
    }
  });
});
