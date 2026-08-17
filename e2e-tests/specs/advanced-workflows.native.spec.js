// e2e-tests/specs/advanced-workflows.native.spec.js
//
// v1.11.0 ADVANCED WORKFLOWS GA — NATIVE WINDOWS GUI PROOF
// ---------------------------------------------------------------------------
// Proves the real runtime chain on Windows:
//   real UI -> real Tauri app -> real WebView2 -> real frontend
//   -> real Tauri IPC -> real Rust -> real filesystem
//
// Required outcomes (v1.11.0 ADVANCED_WORKFLOWS_GA verification contract):
//   MISSING_INFO_ENTRY, MISSING_INFO_FLOW, DIRECTION_FLOW,
//   DIRECTION_APPLY_TO_EDITOR, APPLY_CANCEL_PRESERVES_ORIGINAL,
//   APPLY_SAVE_PERSISTS, RESTART_PERSISTENCE, STALE_STATE (ADVANCED_STALE_STATE),
//   PRIVACY_SENTINEL_DEBUG (ADVANCED_WORKFLOW_PRIVACY, debug build)
//
// NO mocking, NO browser fallback, NO synthesized Rust span. The synthetic
// archive lives under os.tmpdir() only — real user data is never touched.
//
// GA availability: the "Fehlende Infos prüfen" and "Varianten erzeugen"
// action-bar buttons render UNCONDITIONALLY (no feature flag, no env var)
// since v1.11.0. The debug bridge window.__pvlLoadArchive is available in
// debug builds (cfg!(debug_assertions) === true) — this spec runs against the
// DEBUG binary via wdio.conf.windows.mjs (APP_PATH = target\debug\promptvault-lite.exe).

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RANDOM = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// Test-Identitäten (ASCII-sicher, damit der Rust-Filename-Sanitizer
// deterministisch vorhersagbare Dateinamen erzeugt)
// ---------------------------------------------------------------------------

const SEED_TITLE = "Seed Prompt";
const SEED_FILE_NAME = "seed-prompt.md";
const SEED_FILE_BASE = "seed-prompt"; // Dateiname ohne .md (Baum-Name)
const SEED_MARKER = `ADVANCED_SEED_MARKER_${RANDOM}`;
const STALE_MARKER = `STALE_EDIT_MARKER_${RANDOM}`;
const SENTINEL = `PVL_ADVANCED_PROMPT_SENTINEL_${RANDOM}`;
const SENTINEL_TITLE = "Advanced Sentinel";

// ASCII-fragment of the "sachlich" profile promptPrefix — present in variant
// content, NEVER in the original seed content.
const VARIANT_PREFIX_FRAGMENT = "sachliche, neutrale Darstellungen";

const SEED_CONTENT = [
  "# Seed Prompt",
  "",
  `${SEED_MARKER}: Original-Inhalt des Advanced-Workflows-GA-Tests.`,
  "",
  "## Context",
  "Synthetischer Test-Prompt fuer die GA-Pruefung.",
].join("\n");

const SENTINEL_CONTENT = [
  "# Advanced Sentinel",
  "",
  `${SENTINEL}: Vertraulicher Prompt-Inhalt.`,
].join("\n");

// ---------------------------------------------------------------------------
// Synthetisches Archiv (keine echten Nutzerdaten)
// ---------------------------------------------------------------------------

function writePrompt(dir, relPath, title, body, extraTags = []) {
  const full = path.join(dir, relPath);
  fs.mkdirSync(path.dirname(full), { recursive: true });
  const frontmatter = [
    "---",
    `title: ${title}`,
    "category: general",
    `tags: [${["e2e", ...extraTags].join(", ")}]`,
    "---",
    "",
    body,
    "",
  ].join("\n");
  fs.writeFileSync(full, frontmatter, "utf-8");
  return full;
}

function createArchive() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvl-advanced-e2e-"));
  writePrompt(
    root,
    "clean/seed-prompt.md",
    SEED_TITLE,
    SEED_CONTENT,
    ["clean"],
  );
  return root;
}

// ---------------------------------------------------------------------------
// WebDriver-Helfer
// ---------------------------------------------------------------------------

async function loadArchiveViaBridge(archive) {
  // Debug-Build-Bridge (cfg!(debug_assertions) -> is_e2e_bridge_available=true)
  // ist asynchron installiert; explizit auf die Funktion warten.
  await browser.waitUntil(
    () =>
      browser.execute(() => typeof window.__pvlLoadArchive === "function"),
    {
      timeout: 30000,
      timeoutMsg: "window.__pvlLoadArchive must be a function (debug build)",
    },
  );
  await browser.execute((p) => {
    window.__pvlLoadArchive(p);
  }, archive);
  await $(".tree-folder").waitForExist({ timeout: 20000 });
  // Härtung: auf den eigenen Archiv-Inhalt warten (stale-auto-restored Ordner
  // aus früheren Sessions könnten sonst ".tree-folder" vorzeitig erfüllen).
  await $('[aria-label*="Ordner clean"]').waitForExist({ timeout: 20000 });
  await expandAllFolders();
  await browser.pause(500);
}

/** Klappt alle sichtbaren (und danach neu erscheinenden) Ordner auf. */
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

/** Schließt eventuell offene Modals (Editor/Settings/Gate/Optimizer/Panel). */
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

async function openSettings() {
  await $('button[aria-label*="Einstellungen öffnen"]').click();
  await $('[role="dialog"]').waitForExist({ timeout: 10000 });
  await browser.pause(300);
}

async function closeSettings() {
  await browser.keys("Escape");
  await browser.pause(300);
}

async function observabilityToggle() {
  return $('input[aria-label="Admin Observability umschalten"]');
}

async function observabilityToggleSlider() {
  return $(
    'input[aria-label="Admin Observability umschalten"] + .toggle-slider',
  );
}

/** Idempotent: aktiviert Admin Observability (falls nicht bereits aktiv). */
async function ensureObservabilityEnabled() {
  const diagBtn = await $('button[aria-label="Admin Diagnostics öffnen"]');
  if (await diagBtn.isExisting()) {
    // bereits aktiv (z.B. durch vorherige Specs persistiert)
    return true;
  }
  await openSettings();
  const toggle = await observabilityToggle();
  await toggle.waitForExist({ timeout: 10000 });
  if (!(await toggle.isSelected())) {
    const slider = await observabilityToggleSlider();
    await slider.click();
    await browser.pause(500);
  }
  expect(await toggle.isSelected()).toBe(true);
  await closeSettings();
  await $('button[aria-label="Admin Diagnostics öffnen"]').waitForExist({
    timeout: 10000,
  });
  return true;
}

/** Klickt "🔄 Analysieren" und wartet auf Score + Ende der Analyse. */
async function analyzeSelectedPrompt() {
  const btn = await $('button[title="Neu analysieren"]');
  await btn.waitForEnabled({ timeout: 10000 });
  await btn.click();
  await $(".circular-score-value").waitForExist({ timeout: 30000 });
  // isAnalyzing wieder false abwarten, damit Gate/Varianten-Buttons enabled sind
  await btn.waitForEnabled({ timeout: 30000 });
  await browser.pause(300);
}

/** Wählt einen Prompt im Explorer-Baum aus (Teiltext = Dateiname ohne .md). */
async function selectCreatedPrompt(selectorText) {
  const node = await $(`.tree-file*=${selectorText}`);
  if (!(await node.isExisting())) {
    // Ordner sind nach Scan standardmäßig zugeklappt -> erst aufklappen
    await expandAllFolders();
  }
  await node.waitForExist({ timeout: 20000 });
  await node.click();
  await $(".prompt-content").waitForExist({ timeout: 10000 });
  await browser.pause(500);
}

/** Öffnet den Editor im Create-Modus über die echte Toolbar-Schaltfläche. */
async function openCreateEditor() {
  const btn = await $('button[aria-label="Neuen Prompt erstellen"]');
  await btn.waitForExist({ timeout: 10000 });
  await btn.click();
  await $('[role="dialog"][aria-label="Neuen Prompt erstellen"]').waitForExist({
    timeout: 10000,
  });
  await browser.pause(300);
}

/** Klickt "Speichern" im Editor und wartet, bis der Dialog geschlossen ist. */
async function saveEditor(dialogLabel) {
  const dialog = await $(`[role="dialog"][aria-label="${dialogLabel}"]`);
  const saveBtn = await $(
    `[role="dialog"][aria-label="${dialogLabel}"] .modal-footer button.btn-primary`,
  );
  await saveBtn.waitForEnabled({ timeout: 10000 });
  await saveBtn.click();
  await dialog.waitForExist({ timeout: 15000, reverse: true });
  // Watcher-Debounce (500 ms) + Re-Scan abwarten
  await browser.pause(2500);
}

/**
 * Beantwortet ALLE sichtbaren (ggf. nach Overflow-Expander) REQUIRED-Fragen
 * des Missing-Info-Gates über die echten data-testid="gate-input-<id>" Inputs.
 * Liefert die Anzahl beantworteter Fragen zurück.
 */
async function answerAllRequiredGateQuestions() {
  const dialog = await $(
    '[role="dialog"][aria-label="Fehlende Informationen"]',
  );
  await dialog.waitForExist({ timeout: 10000 });

  // Overflow-REQUIRED (über 5) ggf. aufklappen
  const overflowToggle = await dialog.$('[data-testid="gate-toggle-overflow"]');
  if (await overflowToggle.isExisting()) {
    await overflowToggle.click();
    await browser.pause(200);
  }

  const questions = await dialog.$$('[data-testid^="gate-question-"]');
  let answered = 0;
  for (const q of questions) {
    const widget = await q.$('[data-testid^="gate-input-"]');
    if (!(await widget.isExisting())) continue; // übersprungen / ohne Input
    const tag = await widget.getTagName();
    if (tag === "select") {
      await widget.selectByIndex(1);
      answered += 1;
    } else if (tag === "textarea") {
      await widget.setValue(`E2E Antwort ${answered + 1} fuer das Gate.`);
      answered += 1;
    } else if (tag === "input") {
      const type = await widget.getAttribute("type");
      if (type === "text") {
        await widget.setValue(`E2E Antwort ${answered + 1} fuer das Gate.`);
        answered += 1;
      } else if (type === "radio" || type === "checkbox") {
        await widget.click();
        answered += 1;
      } else {
        await widget.setValue(`E2E Antwort ${answered + 1} fuer das Gate.`);
        answered += 1;
      }
    } else {
      // Container (boolean / multi_select): erste innere Input auswählen
      const inner = await widget.$("input");
      if (await inner.isExisting()) {
        await inner.click();
        answered += 1;
      }
    }
  }
  return answered;
}

/** Öffnet das Varianten-Panel und erzeugt Varianten mit der echten UI. */
async function openVariantPanelAndGenerate() {
  const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
  await variantBtn.waitForEnabled({ timeout: 10000 });
  await variantBtn.click();
  const panel = await $('[data-testid="variant-panel"]');
  await panel.waitForExist({ timeout: 10000 });

  const genBtn = await panel.$('[data-testid="variant-generate-btn"]');
  await genBtn.waitForEnabled({ timeout: 10000 });
  await genBtn.click();

  await panel.$('[data-testid="variant-result-list"]').waitForExist({
    timeout: 15000,
  });
  return panel;
}

/** Schließt das Varianten-Panel im Ergebnisse-Modus. Bei 5 Karten schiebt
 *  der ungestylte Modal-Container den Footer aus dem Viewport; der JS-Klick
 *  dispatcht den echten React-onClick-Handler (gleicher Effekt wie UI-Klick). */
async function closeVariantPanelResults(panel) {
  const closeBtn = await panel.$('[data-testid="variant-results-close-btn"]');
  await closeBtn.waitForExist({ timeout: 10000 });
  await browser.execute(() => {
    document
      .querySelector('[data-testid="variant-results-close-btn"]')
      .click();
  });
  await panel.waitForExist({ timeout: 10000, reverse: true });
}

/** Liest die erste Varianten-Karte: { id, content }. */
async function readFirstVariantCard(panel) {
  const firstCard = await panel.$('[data-testid^="variant-card-"]');
  await firstCard.waitForExist({ timeout: 10000 });
  const cardTestId = await firstCard.getAttribute("data-testid");
  const variantId = cardTestId.replace("variant-card-", "");
  // Inhalt liegt in einem <details>-Element (standardmäßig zugeklappt):
  // erst aufklappen, damit getText() den sichtbaren Text liefert.
  const contentToggle = await firstCard.$(
    `[data-testid="variant-content-toggle-${variantId}"]`,
  );
  await contentToggle.waitForExist({ timeout: 10000 });
  await contentToggle.click();
  await browser.pause(200);
  const variantContent = normalizeText(
    await firstCard
      .$(`[data-testid="variant-content-${variantId}"]`)
      .getText(),
  );
  expect(variantContent.length).toBeGreaterThan(0);
  return { firstCard, variantId, variantContent };
}

// --- Export-Capture (gleicher Ansatz wie authoring-lifecycle.native.spec.js) --

async function captureExportJson() {
  await browser.execute(() => {
    if (!window.__pvlExportHookInstalled) {
      const orig = URL.createObjectURL.bind(URL);
      window.__pvlCapturedBlob = null;
      URL.createObjectURL = (blob) => {
        window.__pvlCapturedBlob = blob;
        return orig(blob);
      };
      window.__pvlExportHookInstalled = true;
    }
    window.__pvlCapturedBlob = null;
  });

  await $('button[aria-label="Diagnose exportieren"]').click();
  await browser.pause(500);

  return browser.execute(() => {
    return new Promise((resolve) => {
      const blob = window.__pvlCapturedBlob;
      if (!blob) return resolve(null);
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsText(blob);
    });
  });
}

function countOccurrences(haystack, needle) {
  let count = 0;
  let idx = 0;
  while (idx !== -1) {
    idx = haystack.indexOf(needle, idx);
    if (idx !== -1) {
      count += 1;
      idx += needle.length;
    }
  }
  return count;
}

/** Liest die Seed-Datei aus dem synthetischen Archiv (Windows-sicher). */
function readSeedFile(archivePath) {
  const candidates = [
    path.join(archivePath, "clean", SEED_FILE_NAME),
    path.join(archivePath, SEED_FILE_NAME),
  ];
  for (const c of candidates) {
    if (fs.existsSync(c)) {
      return fs.readFileSync(c, "utf-8");
    }
  }
  const canonicalRoot = fs.realpathSync(archivePath);
  const canonicalCandidates = [
    path.join(canonicalRoot, "clean", SEED_FILE_NAME),
    path.join(canonicalRoot, SEED_FILE_NAME),
  ];
  for (const c of canonicalCandidates) {
    if (fs.existsSync(c)) {
      return fs.readFileSync(c, "utf-8");
    }
  }
  throw new Error(`Seed file not found under archive: ${archivePath}`);
}

function normalizeText(s) {
  return s.replace(/\r\n/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("v1.11.0 Advanced Workflows GA — Native Windows GUI Proof", function () {
  this.timeout(600000);
  let archive;
  let seedReady = false;

  before(async () => {
    archive = createArchive();
  });

  after(async () => {
    try {
      fs.rmSync(archive, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  });

  // HINWEIS: Kein afterEach-Modal-Cleanup — die Tests 3→4→5→6 bilden eine
  // kontinuierliche UI-Kette (Panel bleibt offen → Editor offen → ...). Jeder
  // Test räumt seine eigenen Modals auf; bei einem Fehler bricht die Kette
  // bewusst ab, damit die Root-Cause sichtbar bleibt.

  function requireSeed() {
    if (!seedReady) {
      this.skip();
    }
  }

  it("1. MISSING_INFO_ENTRY: Gate + Varianten-Buttons ohne Env, disabled waehrend isAnalyzing", async () => {
    // REAL_NATIVE_BINARY: echtes Fenster 'PromptVault Lite' (Debug-Build)
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 90000 });
    expect(await heading.getText()).toMatch(/PromptVault Lite/);
    const statusbar = await $(".app-statusbar");
    await statusbar.waitForExist({ timeout: 10000 });
    expect(await statusbar.getText()).toMatch(/PromptVault Lite v\d+\.\d+\.\d+/);

    // Debug-Bridge-Beweis: window.__pvlLoadArchive ist im Debug-Build
    // verfügbar (is_e2e_bridge_available -> cfg!(debug_assertions) === true)
    const bridgeReady = await browser.execute(
      () => typeof window.__pvlLoadArchive === "function",
    );
    expect(bridgeReady).toBe(true);

    await loadArchiveViaBridge(archive);
    await selectCreatedPrompt(SEED_FILE_BASE);
    seedReady = true;

    // GA: "❓ Fehlende Infos prüfen" ist OHNE jegliches Env-Flag verfügbar
    const gateBtn = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn.waitForExist({ timeout: 10000 });
    expect(await gateBtn.getText()).toContain("Fehlende Infos");
    expect(await gateBtn.isEnabled()).toBe(true);

    // GA: "🧭 Varianten erzeugen" ist OHNE jegliches Env-Flag verfügbar
    const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtn.waitForExist({ timeout: 10000 });
    expect(await variantBtn.getText()).toContain("Varianten erzeugen");
    expect(await variantBtn.isEnabled()).toBe(true);

    // Loading-State: "🔄 Alle analysieren" setzt isAnalyzing=true synchron;
    // Gate- UND Varianten-Button müssen währenddessen disabled sein.
    const analyzeAllBtn = await $('button[title*="Alle analysieren"]');
    await analyzeAllBtn.waitForExist({ timeout: 10000 });
    await analyzeAllBtn.click();

    await browser.waitUntil(
      async () => (await gateBtn.isEnabled()) === false,
      {
        timeout: 10000,
        interval: 100,
        timeoutMsg: "gate button must be disabled while isAnalyzing",
      },
    );
    expect(await gateBtn.isEnabled()).toBe(false);
    expect(await variantBtn.isEnabled()).toBe(false);

    // Analyse abwarten -> Buttons wieder enabled
    await browser.waitUntil(
      async () => (await gateBtn.isEnabled()) === true,
      {
        timeout: 90000,
        interval: 500,
        timeoutMsg: "analysis must finish and re-enable the gate button",
      },
    );
    expect(await gateBtn.isEnabled()).toBe(true);
    expect(await variantBtn.isEnabled()).toBe(true);
  });

  it("2. MISSING_INFO_FLOW: Analysieren -> Gate -> REQUIRED -> Uebernehmen -> Optimizer; Cancel erhaelt Original", async function () {
    requireSeed.call(this);
    await selectCreatedPrompt(SEED_FILE_BASE);
    await analyzeSelectedPrompt();

    // Gate öffnen (echter Dialog, echtes detectGaps über die echte Analyse)
    const gateBtn = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn.waitForEnabled({ timeout: 10000 });
    await gateBtn.click();
    const gateDialog = await $(
      '[role="dialog"][aria-label="Fehlende Informationen"]',
    );
    await gateDialog.waitForExist({ timeout: 10000 });

    // REQUIRED-Fragen sind erkannt (Seed-Prompt hat bewusst keine Task/Goal)
    const summary = await gateDialog.$('[data-testid="gate-summary"]');
    await summary.waitForExist({ timeout: 10000 });
    expect(await summary.getText()).toMatch(/beantwortet werden/);
    await gateDialog
      .$('[data-testid="gate-required-section"]')
      .waitForExist({ timeout: 10000 });

    // ALLE REQUIRED-Fragen deterministisch beantworten
    const answered = await answerAllRequiredGateQuestions();
    expect(answered).toBeGreaterThanOrEqual(1);
    console.log(`MISSING_INFO_ANSWERED=${answered}`);

    // "▶ Angaben übernehmen" -> Gate schließt -> Optimizer-Dialog öffnet
    const proceedBtn = await gateDialog.$('[data-testid="gate-btn-proceed"]');
    await proceedBtn.waitForEnabled({ timeout: 10000 });
    await proceedBtn.click();
    await gateDialog.waitForExist({ timeout: 10000, reverse: true });

    const optimizerDialog = await $(
      '[role="dialog"][aria-label="Prompt-Optimierung"]',
    );
    await optimizerDialog.waitForExist({ timeout: 10000 });
    await optimizerDialog.$('button[aria-label="Schließen"]').click();
    await optimizerDialog.waitForExist({ timeout: 10000, reverse: true });

    // Cancel-Pfad: Gate erneut öffnen -> "Abbrechen" -> schließt, Original unverändert
    const gateBtn2 = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn2.waitForEnabled({ timeout: 10000 });
    await gateBtn2.click();
    const gateDialog2 = await $(
      '[role="dialog"][aria-label="Fehlende Informationen"]',
    );
    await gateDialog2.waitForExist({ timeout: 10000 });
    await gateDialog2.$('[data-testid="gate-btn-cancel"]').click();
    await gateDialog2.waitForExist({ timeout: 10000, reverse: true });

    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(SEED_MARKER);
    expect(diskContent).not.toContain(VARIANT_PREFIX_FRAGMENT);
  });

  it("3. DIRECTION_FLOW: Panel -> Profil waehlen -> generieren -> Ergebnis-Karten", async function () {
    requireSeed.call(this);
    await selectCreatedPrompt(SEED_FILE_BASE);
    await analyzeSelectedPrompt();

    // Panel öffnen
    const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtn.waitForEnabled({ timeout: 10000 });
    await variantBtn.click();
    const panel = await $('[data-testid="variant-panel"]');
    await panel.waitForExist({ timeout: 10000 });

    // Echte Profil-Auswahl (DirectionProfileSelector): Default-Selection ist
    // vorausgewählt (aria-pressed=true, max. 5 Profile). Um "kreativ"
    // hinzuzufügen, wird zuerst ein Default (agentisch) deselektiert —
    // andernfalls blockiert die MAX_5-Regel die Auswahl.
    const selector = await panel.$('[data-testid="direction-profile-selector"]');
    await selector.waitForExist({ timeout: 10000 });

    const sachlichChip = await panel.$('[data-testid="profile-chip-sachlich"]');
    await sachlichChip.waitForExist({ timeout: 10000 });
    expect(await sachlichChip.getAttribute("aria-pressed")).toBe("true");

    const agentischChip = await panel.$(
      '[data-testid="profile-chip-agentisch"]',
    );
    await agentischChip.waitForExist({ timeout: 10000 });
    expect(await agentischChip.getAttribute("aria-pressed")).toBe("true");
    await agentischChip.click();
    await browser.waitUntil(
      async () =>
        (await agentischChip.getAttribute("aria-pressed")) === "false",
      { timeout: 5000, timeoutMsg: "agentisch chip must be deselected" },
    );

    const kreativChip = await panel.$('[data-testid="profile-chip-kreativ"]');
    await kreativChip.waitForExist({ timeout: 10000 });
    expect(await kreativChip.getAttribute("aria-pressed")).toBe("false");
    await kreativChip.click();
    await browser.waitUntil(
      async () => (await kreativChip.getAttribute("aria-pressed")) === "true",
      { timeout: 5000, timeoutMsg: "kreativ chip must become selected" },
    );

    // "Varianten generieren" -> echte generateVariants (template-basiert)
    const genBtn = await panel.$('[data-testid="variant-generate-btn"]');
    await genBtn.waitForEnabled({ timeout: 10000 });
    await genBtn.click();

    const resultsList = await panel.$('[data-testid="variant-result-list"]');
    await resultsList.waitForExist({ timeout: 15000 });
    await browser.pause(300);

    // Ergebnisse wirklich gerendert: Zähler-Element vorhanden + Text im DOM
    // (textContent-basiert — innerText kann in WebView2 verdeckte Textknoten
    // weglassen, daher layout-unabhängig lesen)
    const countEl = await panel.$('[data-testid="variant-result-count"]');
    await countEl.waitForExist({ timeout: 10000 });
    const listText = await browser.execute(
      () =>
        document.querySelector('[data-testid="variant-result-list"]')
          ?.textContent ?? "",
    );
    expect(listText).toContain("erzeugt");

    const cards = await panel.$$('[data-testid^="variant-card-"]');
    expect(cards.length).toBeGreaterThanOrEqual(1);
    console.log(`DIRECTION_VARIANT_COUNT=${cards.length}`);
  });

  it("4. DIRECTION_APPLY_TO_EDITOR: Uebernehmen -> Editor dirty, KEINE Disk-Aenderung", async function () {
    requireSeed.call(this);
    const panel = await $('[data-testid="variant-panel"]');
    await panel.waitForExist({ timeout: 10000 });

    // Erste Karte (sachlich) auswählen und Inhalt aus der echten Karte lesen
    const { firstCard, variantId, variantContent } =
      await readFirstVariantCard(panel);

    await firstCard
      .$(`[data-testid="variant-apply-btn-${variantId}"]`)
      .click();

    // PromptEditor öffnet in Edit-Modus mit dem Varianteninhalt
    const editorDialog = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialog.waitForExist({ timeout: 10000 });

    const editorContent = normalizeText(
      await $("#prompt-editor-content").getValue(),
    );
    expect(editorContent).toBe(variantContent);

    // Dirty-Indikator sichtbar (ungespeicherte Änderung)
    await $(".editor-dirty-indicator").waitForExist({ timeout: 10000 });
    expect(await $(".editor-dirty-indicator").getText()).toContain(
      "Ungespeicherte",
    );

    // NOCH KEINE Disk-Änderung: Datei enthält weiterhin das ORIGINAL
    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(SEED_MARKER);
    expect(diskContent).not.toContain(VARIANT_PREFIX_FRAGMENT);
  });

  it("5. APPLY_CANCEL_PRESERVES_ORIGINAL: Abbrechen schließt Editor, Original bleibt", async function () {
    requireSeed.call(this);
    const editorDialog = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialog.waitForExist({ timeout: 10000 });
    await editorDialog.$("button*=Abbrechen").click();
    await editorDialog.waitForExist({ timeout: 10000, reverse: true });

    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(SEED_MARKER);
    expect(diskContent).not.toContain(VARIANT_PREFIX_FRAGMENT);
  });

  it("6. APPLY_SAVE_PERSISTS: Erneut generieren -> Uebernehmen -> Speichern persistiert Variante", async function () {
    requireSeed.call(this);
    const panel = await openVariantPanelAndGenerate();
    const { firstCard, variantId } = await readFirstVariantCard(panel);
    await firstCard
      .$(`[data-testid="variant-apply-btn-${variantId}"]`)
      .click();

    const editorDialog = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialog.waitForExist({ timeout: 10000 });
    await $(".editor-dirty-indicator").waitForExist({ timeout: 10000 });

    // Speichern -> echter update_prompt (Rust) -> Varianteninhalt auf Platte
    await saveEditor("Prompt bearbeiten");
    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(VARIANT_PREFIX_FRAGMENT);
    expect(diskContent).toContain(SEED_MARKER); // Variante bettet Original ein
  });

  it("7. RESTART_PERSISTENCE: lastFolder + Datei auf Platte + Re-Scan (Neustart-Beweis)", async function () {
    requireSeed.call(this);
    // (a) scanFolder hat promptvault.lastFolder geschrieben
    const lastFolder = await browser.execute(() =>
      localStorage.getItem("promptvault.lastFolder"),
    );
    expect(lastFolder).toBe(archive);

    // (b) Datei existiert auf Platte und enthält den gespeicherten Varianteninhalt
    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(VARIANT_PREFIX_FRAGMENT);

    // (c) Frischer Re-Scan über die Bridge (Startup-Restore-Äquivalent:
    // scanFolder(promptvault.lastFolder) über echte Rust-Commands)
    await loadArchiveViaBridge(archive);
    const node = await $(".tree-file*=seed-prompt");
    await node.waitForExist({ timeout: 20000 });
    expect(await node.getText()).toContain(SEED_FILE_BASE);
  });

  it("8. STALE_STATE: Inhalt + Speichern invalidiert Varianten; STALE_SOURCE verweigert Apply", async function () {
    requireSeed.call(this);
    // Observability an (STALE_SOURCE-Event-Beweis), Buffer leeren
    await ensureObservabilityEnabled();
    await $('button[aria-label="Admin Diagnostics öffnen"]').waitForExist({
      timeout: 10000,
    });
    await $('button[aria-label="Admin Diagnostics öffnen"]').click();
    const diagDialog = await $(
      '[role="dialog"][aria-label="Admin Diagnostics"]',
    );
    await diagDialog.waitForExist({ timeout: 10000 });
    await diagDialog.$('button[aria-label="Diagnosedaten löschen"]').click();
    await browser.pause(300);
    await diagDialog.$('button[aria-label="Schließen"]').click();
    await diagDialog.waitForExist({ timeout: 10000, reverse: true });

    // --- (A) Editor-Save-Pfad (PRIMÄR): Inhalt ändern + Speichern invalidiert
    // ---     alte Varianten (invalidateAnalysisForPrompt löscht variantResults)
    await selectCreatedPrompt(SEED_FILE_BASE);
    const panelA = await openVariantPanelAndGenerate();
    const cardCountA = (
      await panelA.$$('[data-testid^="variant-card-"]')
    ).length;
    expect(cardCountA).toBeGreaterThanOrEqual(1);
    await closeVariantPanelResults(panelA);

    // Editor öffnen, Inhalt ändern, SPEICHERN (echter update_prompt)
    await $('button[aria-label="Prompt bearbeiten"]').waitForExist({
      timeout: 10000,
    });
    await $('button[aria-label="Prompt bearbeiten"]').click();
    const editorDialogA = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialogA.waitForExist({ timeout: 10000 });
    const editorValue = await $("#prompt-editor-content").getValue();
    await $("#prompt-editor-content").setValue(
      `${editorValue}\n\n${STALE_MARKER}: Via Editor geaendert und gespeichert.`,
    );
    await saveEditor("Prompt bearbeiten");

    // Alte Varianten sind gelöscht -> Panel zeigt Regenerate/Select-State
    const variantBtnA = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtnA.waitForEnabled({ timeout: 10000 });
    await variantBtnA.click();
    const panelA2 = await $('[data-testid="variant-panel"]');
    await panelA2.waitForExist({ timeout: 10000 });
    await panelA2
      .$('[data-testid="direction-profile-selector"]')
      .waitForExist({ timeout: 10000 });
    expect(
      await panelA2.$('[data-testid="variant-result-list"]').isExisting(),
    ).toBe(false);
    const genBtnA2 = await panelA2.$('[data-testid="variant-generate-btn"]');
    await genBtnA2.waitForEnabled({ timeout: 10000 });
    expect(await genBtnA2.isEnabled()).toBe(true); // Regenerate-State bereit
    await panelA2.$('[data-testid="variant-panel-close-btn"]').click();
    await panelA2.waitForExist({ timeout: 10000, reverse: true });

    // --- (B) Watcher-Pfad (sekundär): Ergebnis vorhanden, Inhalt ändert sich
    // ---     DARUNTER -> Apply wird verweigert (STALE_SOURCE)
    await selectCreatedPrompt(SEED_FILE_BASE);
    const panelB = await openVariantPanelAndGenerate();
    const cardCountB = (
      await panelB.$$('[data-testid^="variant-card-"]')
    ).length;
    expect(cardCountB).toBeGreaterThanOrEqual(1);

    // Externe Inhalt-Änderung auf Platte -> Watcher-Re-Scan (falls aktiv)
    const seedFile = path.join(archive, "clean", SEED_FILE_NAME);
    fs.appendFileSync(
      seedFile,
      `\n\n${STALE_MARKER}_DISK: Datei extern geaendert.\n`,
      "utf-8",
    );

    let watcherFired = false;
    let contentReflected = false;
    for (let i = 0; i < 90; i += 1) {
      await browser.pause(500);
      const statusText = await $(".app-statusbar").getText();
      if (statusText.includes("Dateisystem-Änderung")) watcherFired = true;
      const content = await browser.execute(
        () => document.querySelector(".prompt-content")?.textContent ?? "",
      );
      if (content.includes(`${STALE_MARKER}_DISK`)) {
        contentReflected = true;
        break;
      }
    }
    console.log(`WATCHER_NOTIFICATION_SEEN=${watcherFired}`);
    console.log(`WATCHER_RESCAN_REFLECTED=${contentReflected}`);

    if (!contentReflected) {
      // Fallback: Bridge-Re-Scan (Startup-Restore-Äquivalent über echte
      // scanFolder-Rust-Commands) — der Prompt-Inhalt aktualisiert sich,
      // die offenen Varianten-Ergebnisse bleiben stale. Das Panel mit den
      // Ergebnissen bleibt dabei geöffnet (DetailsPanel-Zustand).
      await loadArchiveViaBridge(archive);
      await browser.waitUntil(
        async () =>
          (await browser.execute(
            () =>
              document.querySelector(".prompt-content")?.textContent ?? "",
          )).includes(`${STALE_MARKER}_DISK`),
        { timeout: 20000, interval: 500 },
      );
      console.log(`STALE_RESCAN_FALLBACK=BRIDGE`);
    } else {
      console.log(`STALE_RESCAN_FALLBACK=WATCHER`);
    }

    // Apply auf die (nun stale) Variante -> REFUSED (STALE_SOURCE):
    // Panel schließt, Editor öffnet NICHT.
    const panelCurrent = await $('[data-testid="variant-panel"]');
    await panelCurrent.waitForExist({ timeout: 10000 });
    const applyBtn = await panelCurrent.$(
      '[data-testid^="variant-apply-btn-"]',
    );
    await applyBtn.waitForExist({ timeout: 10000 });
    await applyBtn.click();
    await browser.pause(500);

    const editorDialogB = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialogB.waitForExist({ timeout: 3000, reverse: true });
    expect(await editorDialogB.isExisting()).toBe(false);
    await panelCurrent.waitForExist({ timeout: 10000, reverse: true });

    // STALE_SOURCE-Event ist im echten Export nachweisbar
    await $('button[aria-label="Admin Diagnostics öffnen"]').click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
    });
    const raw = await captureExportJson();
    expect(raw).not.toBeNull();
    const data = JSON.parse(raw);
    const staleEvents = (data.events ?? []).filter(
      (e) =>
        e.operation === "direction.apply" &&
        e.status === "failed" &&
        e.reasonCode === "STALE_SOURCE",
    );
    expect(staleEvents.length).toBeGreaterThanOrEqual(1);
    console.log(`STALE_SOURCE_EVENTS=${staleEvents.length}`);
    await $(
      '[role="dialog"][aria-label="Admin Diagnostics"] button[aria-label="Schließen"]',
    ).click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
      reverse: true,
    });
  });

  it("9. PRIVACY_SENTINEL_DEBUG: Export ohne Sentinel/Body/Variantentext (Debug-Build)", async function () {
    requireSeed.call(this);
    await ensureObservabilityEnabled();

    // Sentinel-Prompt über den ECHTEN Authoring-Pfad erstellen
    await openCreateEditor();
    await $("#prompt-editor-title").setValue(SENTINEL_TITLE);
    await $("#prompt-editor-content").setValue(SENTINEL_CONTENT);
    await saveEditor("Neuen Prompt erstellen");

    // Auswählen + analysieren (echte Events mit rotem Input im Scope)
    await selectCreatedPrompt(SENTINEL_TITLE);
    await analyzeSelectedPrompt();

    // Missing-Info-Flow (echte missing_info.* Events, REQUIRED beantwortet)
    const gateBtn = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn.waitForEnabled({ timeout: 10000 });
    await gateBtn.click();
    const gateDialog = await $(
      '[role="dialog"][aria-label="Fehlende Informationen"]',
    );
    await gateDialog.waitForExist({ timeout: 10000 });
    const answered = await answerAllRequiredGateQuestions();
    expect(answered).toBeGreaterThanOrEqual(1);
    const proceedBtn = await gateDialog.$('[data-testid="gate-btn-proceed"]');
    await proceedBtn.waitForEnabled({ timeout: 10000 });
    await proceedBtn.click();
    await gateDialog.waitForExist({ timeout: 10000, reverse: true });
    const optimizerDialog = await $(
      '[role="dialog"][aria-label="Prompt-Optimierung"]',
    );
    await optimizerDialog.waitForExist({ timeout: 10000 });
    await optimizerDialog.$('button[aria-label="Schließen"]').click();
    await optimizerDialog.waitForExist({ timeout: 10000, reverse: true });

    // Direction-Flow (echte direction.* Events; Variantentext enthält Sentinel)
    const panel = await openVariantPanelAndGenerate();
    await closeVariantPanelResults(panel);

    // Export über den ECHTEN handleExport() -> exportDiagnostics() -> Blob
    await $('button[aria-label="Admin Diagnostics öffnen"]').click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
    });
    const raw = await captureExportJson();
    expect(raw).not.toBeNull();
    const data = JSON.parse(raw);

    // Struktur: sicherer Diagnose-Export bleibt nutzbar
    expect(data.schema_version).toBe(1);
    expect(data.app_version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(data.diagnostic_export_policy).toBe("safe-metadata-v1");
    expect(Array.isArray(data.traces)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.traces.length + data.events.length).toBeGreaterThan(0);

    // Privacy: Sentinel darf den Export in KEINER Form erreichen
    const sentinelCount = countOccurrences(raw, SENTINEL);
    expect(sentinelCount).toBe(0);

    console.log(`ADVANCED_SENTINEL_OCCURRENCES=${sentinelCount}`);
    console.log(`APP_VERSION=${data.app_version}`);
    console.log(`EXPORT_POLICY=${data.diagnostic_export_policy}`);
    console.log(`TRACES=${data.traces.length}`);
    console.log(`EVENTS=${data.events.length}`);
  });
});
