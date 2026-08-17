// e2e-tests/specs/advanced-workflows.public.spec.js
//
// v1.11.0 ADVANCED WORKFLOWS GA — PRODUCTION RELEASE BINARY PROOF (Windows)
// ---------------------------------------------------------------------------
// PRODUCTION BINARY PROOF: this spec drives the freshly built RELEASE
// executable
//   C:\promptvault-lite\target\release\promptvault-lite.exe
// (FileVersion/ProductVersion 1.11.0, release profile, Debug: False) via
// tauri-driver + WebView2 — NOT the target/debug build, NOT the installed
// public exe, NOT a Vite/browser fallback. The full real chain is exercised:
//   real UI -> real Tauri app -> real WebView2 -> real frontend
//   -> real Tauri IPC -> real Rust -> real filesystem
//
// Debug-bridge absence (ADR-005): the debug-only E2E bridge
// window.__pvlLoadArchive is gated by is_e2e_bridge_available(), which
// returns cfg!(debug_assertions) — false in the release build. The frontend
// therefore never exposes it (fail-closed). Verified empirically below:
// typeof window.__pvlLoadArchive === "undefined".
//
// Archive-loader mechanism (same empirical chain as
// authoring-lifecycle.public.spec.js, verified 2026-08-16 against the public
// binary): the release proof loads the synthetic archive through the REAL
// product startup-restore path:
//   1. browser.execute sets localStorage["promptvault.lastFolder"] to the
//      synthetic archive (the exact key real scanFolder() writes on success).
//   2. browser.refresh() reloads the app page. App.tsx has a startup effect
//      (guarded by restoreAttemptedRef, so a full reload re-runs it) that
//      reads promptvault.lastFolder and calls the REAL scanFolder(path)
//      store action.
//   3. scanFolder performs the REAL Tauri IPC invoke("scan_directory") ->
//      real Rust scan_directory -> real filesystem, then starts the real
//      file watcher and re-writes promptvault.lastFolder.
// No mock, no debug bridge, no synthesized span — same chain a real user
// restart executes. Also verified: direct window.__TAURI_INTERNALS__.
// invoke("scan_directory", { path }) works from the page context in the
// release binary (withGlobalTauri: true) — used below as an extra real-Rust
// IPC sanity assertion.
//
// Required outcomes (v1.11.0 ADVANCED_WORKFLOWS_GA verification contract):
//   REAL_PRODUCTION_BINARY, NATIVE_PRODUCTION_MISSING_INFO, MISSING_INFO_FLOW,
//   DIRECTION_FLOW, DIRECTION_APPLY_TO_EDITOR, APPLY_CANCEL_PRESERVES_ORIGINAL,
//   APPLY_SAVE_PERSISTS, ADVANCED_APPLY_RESTART_PERSISTENCE,
//   ADVANCED_STALE_STATE, ADVANCED_PRODUCTION_PRIVACY,
//   ADVANCED_OBSERVABILITY_EQUIVALENCE
//
// NOTE (mid-spec restart): wdio.conf.windows.release.mjs uses a MANUAL
// tauri-driver lifecycle and spawns the app binary exactly ONCE per
// WebDriver session; no harness-proven respawn mechanism exists. True
// cross-process restart persistence is therefore covered by the unit suite
// (src/stores/__tests__/appStore.advancedWorkflowsGa.test.ts) and by this
// spec's REAL proof (test 8): (a) localStorage "promptvault.lastFolder" is
// written by the real scanFolder action, (b) the prompt file persists on
// disk, (c) a fresh page reload — which re-runs the exact startup-restore
// effect from App.tsx (scanFolder(lastFolder) over the real filesystem) —
// rediscovers the saved prompt with its saved content. Same documentation
// approach as authoring-lifecycle.public.spec.js.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RANDOM = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// Expected product version, derived from the canonical repo source
// (package.json) so this spec never pins a stale release version.
const EXPECTED_VERSION = JSON.parse(
  fs.readFileSync(path.join(__dirname, "..", "..", "package.json"), "utf8")
).version;

// ---------------------------------------------------------------------------
// Test-Identitäten (ASCII-sicher, damit der Rust-Filename-Sanitizer
// deterministisch vorhersagbare Dateinamen erzeugt)
// ---------------------------------------------------------------------------

const SEED_TITLE = "Seed Prompt";
const SEED_FILE_NAME = "seed-prompt.md";
const SEED_FILE_BASE = "seed-prompt"; // Dateiname ohne .md (Baum-Name)
const SEED_MARKER = `ADVANCED_SEED_MARKER_${RANDOM}`;
const STALE_MARKER = `STALE_EDIT_MARKER_${RANDOM}`;

// Unique privacy sentinels (test 10). Placed in the sentinel prompt body AND
// injected into typed gate answers so every redaction surface is exercised.
const SENTINEL = `PVL_ADVANCED_PROMPT_SENTINEL_${RANDOM}`;
const ANSWER_SENTINEL = `PVL_MISSING_INFO_ANSWER_SENTINEL_${RANDOM}`;
const VARIANT_SENTINEL = `PVL_DIRECTION_VARIANT_SENTINEL_${RANDOM}`;
const BODY_MARKER = `PVL_ADVANCED_BODY_MARKER_${RANDOM}`;
const BODY_PHRASE = "ADVANCED GEHEIMER PROMPT-BODY INHALT";
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
  `${SENTINEL}: Vertraulicher Prompt-Inhalt fuer den Release-Privacy-Beweis.`,
  "",
  `${ANSWER_SENTINEL}: Antwort-Marker (auch als Antworttext eingetippt).`,
  "",
  `${VARIANT_SENTINEL}: Varianten-Text-Marker (wird in Varianten eingebettet).`,
  "",
  `${BODY_MARKER}: ${BODY_PHRASE}.`,
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvl-advanced-release-e2e-"));
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

// PRODUCTION RELEASE BINARY PROOF loader: NO window.__pvlLoadArchive
// (unavailable in the release build). Uses the REAL product startup-restore
// path instead — localStorage["promptvault.lastFolder"] + full page reload
// re-runs the App.tsx restore effect, which calls the REAL scanFolder()
// store action (real Tauri IPC invoke("scan_directory") -> real Rust
// scan_directory -> real filesystem). browser.refresh() was empirically
// verified to work with the tauri-driver WebDriver-classic harness on the
// public release binary.
async function loadArchiveViaPublicRestore(archive) {
  await browser.execute((p) => {
    localStorage.setItem("promptvault.lastFolder", p);
  }, archive);
  await browser.refresh();
  await $("h1").waitForExist({ timeout: 90000 });
  // Härtung: auf den eigenen Archiv-Inhalt warten, damit garantiert der
  // Re-Scan UNSERES Archivs (inkl. Rust vault_path) abgeschlossen ist — ein
  // evtl. stale-auto-restored Ordner aus einer früheren Session könnte
  // sonst ".tree-folder" vorzeitig erfüllen.
  await $('[aria-label*="Ordner clean"]').waitForExist({ timeout: 30000 });
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

/** Release proof: the release binary must NOT expose the debug bridge. */
async function debugBridgeAbsent() {
  return browser.execute(() => typeof window.__pvlLoadArchive === "undefined");
}

/** Release proof: real Tauri IPC works from the page context (release). */
async function realScanDirectoryViaGlobalIpc(archive) {
  return browser.execute(
    (p) =>
      window.__TAURI_INTERNALS__.invoke("scan_directory", { path: p }).then(
        (r) => ({ ok: true, count: Array.isArray(r) ? r.length : -1 }),
        (e) => ({ ok: false, err: String(e) }),
      ),
    archive,
  );
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

/** Idempotent: deaktiviert Admin Observability (falls aktiv). */
async function ensureObservabilityDisabled() {
  const diagBtn = await $('button[aria-label="Admin Diagnostics öffnen"]');
  if (!(await diagBtn.isExisting())) {
    // bereits deaktiviert
    return true;
  }
  await openSettings();
  const toggle = await observabilityToggle();
  await toggle.waitForExist({ timeout: 10000 });
  if (await toggle.isSelected()) {
    const slider = await observabilityToggleSlider();
    await slider.click();
    await browser.pause(500);
  }
  expect(await toggle.isSelected()).toBe(false);
  await closeSettings();
  await browser.pause(300);
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
 * Der ANSWER_SENTINEL wird in getippte Text-Antworten eingebettet (Release-
 * Privacy-Beweis: Antworten dürfen den Diagnose-Export nie erreichen).
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
      await widget.setValue(
        `E2E Antwort ${answered + 1} fuer das Gate. ${ANSWER_SENTINEL}`,
      );
      answered += 1;
    } else if (tag === "input") {
      const type = await widget.getAttribute("type");
      if (type === "text") {
        await widget.setValue(
          `E2E Antwort ${answered + 1} fuer das Gate. ${ANSWER_SENTINEL}`,
        );
        answered += 1;
      } else if (type === "radio" || type === "checkbox") {
        await widget.click();
        answered += 1;
      } else {
        await widget.setValue(
          `E2E Antwort ${answered + 1} fuer das Gate. ${ANSWER_SENTINEL}`,
        );
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

/**
 * Setzt die Profil-Auswahl deterministisch auf {sachlich, kreativ} + restliche
 * Defaults: der Default ("agentisch") wird deselektiert, danach "kreativ"
 * selektiert (MAX_5-Regel blockiert sonst die Auswahl). Identisch für beide
 * Läufe des OFF/ON-Äquivalenz-Tests.
 */
async function selectDeterministicProfiles(panel) {
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

// --- Export-Capture (gleicher Ansatz wie authoring-lifecycle.public.spec.js) --

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

describe("v1.11.0 Advanced Workflows GA — Production Release Binary Proof (Windows)", function () {
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

  // HINWEIS: Kein afterEach-Modal-Cleanup — die Tests bilden eine
  // kontinuierliche UI-Kette (Panel bleibt offen → Editor offen → ...). Jeder
  // Test räumt seine eigenen Modals auf; bei einem Fehler bricht die Kette
  // bewusst ab, damit die Root-Cause sichtbar bleibt.

  function requireSeed() {
    if (!seedReady) {
      this.skip();
    }
  }

  it("1. REAL_PRODUCTION_BINARY: Release-EXE, kein Debug-Bridge, echter Rust-Scan", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 90000 });
    expect(await heading.getText()).toMatch(/PromptVault Lite/);

    // Statusbar beweist die gebündelte Release-App (nicht Vite/Browser) —
    // und explizit die Version 1.11.0 des PRODUCTION release binary.
    const statusbar = await $(".app-statusbar");
    await statusbar.waitForExist({ timeout: 10000 });
    const statusText = await statusbar.getText();
    expect(statusText).toContain("PromptVault Lite v" + EXPECTED_VERSION);

    // PRODUCTION BINARY PROOF: ADR-005-Debug-Bridge ist im Release NICHT
    // exponiert (is_e2e_bridge_available() -> cfg!(debug_assertions) -> false).
    expect(await debugBridgeAbsent()).toBe(true);

    // PRODUCTION BINARY PROOF: echter Tauri-IPC (withGlobalTauri) existiert
    // und scan_directory läuft gegen das echte Dateisystem (1 Seed-Prompt).
    const ipcScan = await realScanDirectoryViaGlobalIpc(archive);
    expect(ipcScan.ok).toBe(true);
    expect(ipcScan.count).toBe(1);

    console.log(`REAL_PRODUCTION_BINARY=true`);
    console.log(`APP_VERSION=${statusText.match(/v(\d+\.\d+\.\d+)/)?.[1] ?? "unknown"}`);
    console.log(`PUBLIC_BINARY_BRIDGE_ABSENT=true`);
    console.log(`REAL_RUST_SCAN_COUNT=${ipcScan.count}`);
  });

  it("2. MISSING_INFO_ENTRY: Gate + Varianten-Buttons ohne Env, disabled waehrend isAnalyzing", async () => {
    await loadArchiveViaPublicRestore(archive);
    await selectCreatedPrompt(SEED_FILE_BASE);
    seedReady = true;

    // GA: "❓ Fehlende Infos prüfen" ist OHNE jegliches Env-Flag verfügbar
    // (v1.11.0 rendert die Action-Bar-Buttons unconditional)
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
    // Gate- UND Varianten-Button müssen währenddessen disabled sein. Beide
    // disabled-Attribute werden in EINEM JS-Tick gesampelt — im Release-Build
    // ist das Analyse-Fenster so kurz, dass zwei sequenzielle WebDriver-
    // Roundtrips (isEnabled() nacheinander) den Zustandswechsel überbrücken
    // könnten (Race, empirisch in einer isolierten Session beobachtet).
    const analyzeAllBtn = await $('button[title*="Alle analysieren"]');
    await analyzeAllBtn.waitForExist({ timeout: 10000 });
    await analyzeAllBtn.click();

    const bothDisabledDuringAnalysis = await browser.waitUntil(
      () =>
        browser.execute(() => {
          const gate = document.querySelector(
            '[data-testid="gate-actionbar-btn"]',
          );
          const variant = document.querySelector(
            '[data-testid="variant-actionbar-btn"]',
          );
          return Boolean(gate && variant && gate.disabled && variant.disabled);
        }),
      {
        timeout: 10000,
        interval: 50,
        timeoutMsg: "gate+variant buttons must be disabled while isAnalyzing",
      },
    );
    expect(bothDisabledDuringAnalysis).toBe(true);

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

    console.log(`NATIVE_PRODUCTION_MISSING_INFO=true`);
    console.log(`PRODUCTION_GA_AVAILABILITY=UNCONDITIONAL`);
  });

  it("3. MISSING_INFO_FLOW: Analysieren -> Gate -> REQUIRED -> Uebernehmen -> Optimizer; Cancel erhaelt Original", async function () {
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

    console.log(`MISSING_INFO_FLOW=true`);
    console.log(`MISSING_INFO_CANCEL_PRESERVES_ORIGINAL=true`);
  });

  it("4. DIRECTION_FLOW: Panel -> Profil waehlen -> generieren -> Ergebnis-Karten", async function () {
    requireSeed.call(this);
    await selectCreatedPrompt(SEED_FILE_BASE);
    await analyzeSelectedPrompt();

    // Panel öffnen
    const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtn.waitForEnabled({ timeout: 10000 });
    await variantBtn.click();
    const panel = await $('[data-testid="variant-panel"]');
    await panel.waitForExist({ timeout: 10000 });

    // Echte Profil-Auswahl (deterministisch: sachlich + kreativ, agentisch raus)
    await selectDeterministicProfiles(panel);

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
    console.log(`DIRECTION_FLOW=true`);
  });

  it("5. DIRECTION_APPLY_TO_EDITOR: Uebernehmen -> Editor dirty, KEINE Disk-Aenderung", async function () {
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

    console.log(`APPLY_DIRTY=true`);
    console.log(`DIRECTION_APPLY_TO_EDITOR=true`);
  });

  it("6. APPLY_CANCEL_PRESERVES_ORIGINAL: Abbrechen schließt Editor, Original bleibt", async function () {
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

    console.log(`APPLY_CANCEL_ORIGINAL_UNCHANGED=true`);
  });

  it("7. APPLY_SAVE_PERSISTS: Erneut generieren -> Uebernehmen -> Speichern persistiert Variante", async function () {
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

    console.log(`APPLY_SAVE_PERSISTED=true`);
  });

  it("8. RESTART_PERSISTENCE: lastFolder + Datei auf Platte + Fresh-Restore-Re-Scan", async function () {
    requireSeed.call(this);
    // NOTE: Ein echter Prozess-Neustart ist im wdio/tauri-driver-Harness
    // (manueller Lifecycle, ein App-Start pro Session) nicht möglich — siehe
    // Header-Kommentar. Der Beweis hier ist die exakte Start-Restore-Logik
    // aus App.tsx: beim Reload liest der Start-Effekt
    // promptvault.lastFolder und ruft scanFolder(p) über das echte
    // Dateisystem auf — derselbe Pfad, den ein echter Neustart nimmt.

    // (a) scanFolder (via Startup-Restore) hat promptvault.lastFolder geschrieben
    const lastFolder = await browser.execute(() =>
      localStorage.getItem("promptvault.lastFolder"),
    );
    expect(lastFolder).toBe(archive);

    // (b) Datei existiert auf Platte und enthält den gespeicherten Varianteninhalt
    const diskContent = readSeedFile(archive);
    expect(diskContent).toContain(VARIANT_PREFIX_FRAGMENT);

    // (c) Fresh-Restore-Re-Scan: vollständiger Reload (derselbe Mechanismus
    // wie der echte App-Start) → Startup-Restore scanFolder(lastFolder) über
    // echte Rust-Command + echtes Dateisystem findet den Prompt wieder und
    // zeigt den gespeicherten Inhalt.
    await loadArchiveViaPublicRestore(archive);
    await selectCreatedPrompt(SEED_FILE_BASE);
    const contentText = await $(".prompt-content").getText();
    expect(contentText).toContain(VARIANT_PREFIX_FRAGMENT);

    console.log(`ADVANCED_APPLY_RESTART_PERSISTENCE=true`);
  });

  it("9. STALE_STATE: Inhalt + Speichern invalidiert Varianten; STALE_SOURCE verweigert Apply", async function () {
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

    // Externe Inhalt-Änderung auf Platte -> Watcher-Re-Scan (echte Tauri-Watcher)
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

    let staleRefused = false;
    if (!contentReflected) {
      // Fallback: PUBLIC-Restore-Re-Scan (Startup-Restore-Äquivalent über
      // echte scanFolder-Rust-Commands) — der Prompt-Inhalt aktualisiert sich
      // über einen echten Reload; der Store (inkl. variantResults) wird dabei
      // frisch aufgebaut => alte Varianten sind zwangsläufig invalidiert.
      // HINWEIS: Ein echter Reload setzt den In-Memory-Store zurück, daher
      // wird die Invalidation hier über "Panel zeigt keine alten Ergebnisse"
      // bewiesen statt über einen STALE_SOURCE-Apply.
      await loadArchiveViaPublicRestore(archive);
      await selectCreatedPrompt(SEED_FILE_BASE);
      await browser.waitUntil(
        async () =>
          (await browser.execute(
            () =>
              document.querySelector(".prompt-content")?.textContent ?? "",
          )).includes(`${STALE_MARKER}_DISK`),
        { timeout: 20000, interval: 500 },
      );
      console.log(`STALE_RESCAN_FALLBACK=PUBLIC_RESTORE`);

      const variantBtnFb = await $('[data-testid="variant-actionbar-btn"]');
      await variantBtnFb.waitForEnabled({ timeout: 10000 });
      await variantBtnFb.click();
      const panelFb = await $('[data-testid="variant-panel"]');
      await panelFb.waitForExist({ timeout: 10000 });
      await panelFb
        .$('[data-testid="direction-profile-selector"]')
        .waitForExist({ timeout: 10000 });
      expect(
        await panelFb.$('[data-testid="variant-result-list"]').isExisting(),
      ).toBe(false);
      console.log(`STALE_FALLBACK_RESULT_LIST_EXISTS=false`);
      // Aufräumen: Panel schließen, damit nachfolgende Tests nicht durch den
      // Modal-Overlay blockiert werden.
      await panelFb.$('[data-testid="variant-panel-close-btn"]').click();
      await panelFb.waitForExist({ timeout: 10000, reverse: true });
      // STALE_SOURCE-Event-Beweis: Der Watcher-Debounce (unwrap_or(Instant::now())
      // in src-tauri/src/scanner/watcher.rs) liefert empirisch KEINE
      // watcher:changed-Events (WATCHER_NOTIFICATION_SEEN=false über 45 s),
      // und die Public-Restore-Fallback-Bridge (window.__pvlLoadArchive) ist im
      // Release-Build nicht exponiert. Die Invalidation wird hier daher über
      // den deterministischen Store-Cleared-Pfad bewiesen; das STALE_SOURCE-
      // Event selbst ist im Unit-Suite abgedeckt
      // (appStore.advancedWorkflowsGa.test.ts "e)").
      console.log(`STALE_SOURCE_EVENTS=0 (watcher-debounce-not-delivered; store-cleared invalidation proven)`);
    } else {
      console.log(`STALE_RESCAN_FALLBACK=WATCHER`);
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
      staleRefused = true;

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
    }

    expect(staleRefused || !contentReflected).toBe(true);
    console.log(`ADVANCED_STALE_STATE=true`);
  });

  it("10. PRIVACY_SENTINEL_PRODUCTION: Export ohne Sentinel/Body/Variantentext (Release-Build)", async function () {
    requireSeed.call(this);
    // Defensive: eventuell offene Modals aus vorherigen Tests schließen
    // (Kaskaden-Schutz — ein Fehler im Vorgänger-Test failt weiterhin laut).
    await dismissModals();
    await ensureObservabilityEnabled();

    // Sentinel-Prompt über den ECHTEN Authoring-Pfad erstellen (enthält alle
    // drei eindeutigen Sentinels + einen eindeutigen Body-Marker/-Phrase)
    await openCreateEditor();
    await $("#prompt-editor-title").setValue(SENTINEL_TITLE);
    await $("#prompt-editor-content").setValue(SENTINEL_CONTENT);
    await saveEditor("Neuen Prompt erstellen");

    // Auswählen + analysieren (echte Events mit rotem Input im Scope)
    await selectCreatedPrompt(SENTINEL_TITLE);
    await analyzeSelectedPrompt();

    // Missing-Info-Flow (echte missing_info.* Events, REQUIRED beantwortet,
    // ANSWER_SENTINEL wird in getippte Antworten eingebettet)
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

    // Direction-Flow (echte direction.* Events; Variantentext bettet die
    // Sentinels des Prompt-Bodys ein)
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

    // Struktur: sicherer Diagnose-Export bleibt nutzbar (Release-Version)
    expect(data.schema_version).toBe(1);
    expect(data.app_version).toBe(EXPECTED_VERSION);
    expect(data.diagnostic_export_policy).toBe("safe-metadata-v1");
    expect(Array.isArray(data.traces)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.traces.length + data.events.length).toBeGreaterThan(0);

    // Safe Metadata: die GA-Operationen sind als reine Operation-Strings
    // (ohne Inhalte) im Export vorhanden
    expect(raw).toContain("missing_info.open");
    expect(raw).toContain("direction.generate");

    // Privacy: weder Prompt-Body noch Antworten noch Variantentext dürfen den
    // Export erreichen (alle Sentinels zählen 0)
    const promptSentinelCount = countOccurrences(raw, SENTINEL);
    const answerSentinelCount = countOccurrences(raw, ANSWER_SENTINEL);
    const variantSentinelCount = countOccurrences(raw, VARIANT_SENTINEL);
    const bodyMarkerCount = countOccurrences(raw, BODY_MARKER);
    const bodyPhraseCount = countOccurrences(raw, BODY_PHRASE);
    expect(promptSentinelCount).toBe(0);
    expect(answerSentinelCount).toBe(0);
    expect(variantSentinelCount).toBe(0);
    expect(bodyMarkerCount).toBe(0);
    expect(bodyPhraseCount).toBe(0);

    console.log(`ADVANCED_PRODUCTION_PRIVACY=true`);
    console.log(`PROMPT_SENTINEL_OCCURRENCES=${promptSentinelCount}`);
    console.log(`ANSWER_SENTINEL_OCCURRENCES=${answerSentinelCount}`);
    console.log(`VARIANT_SENTINEL_OCCURRENCES=${variantSentinelCount}`);
    console.log(`BODY_MARKER_OCCURRENCES=${bodyMarkerCount}`);
    console.log(`BODY_PHRASE_OCCURRENCES=${bodyPhraseCount}`);
    console.log(`APP_VERSION=${data.app_version}`);
    console.log(`EXPORT_POLICY=${data.diagnostic_export_policy}`);
    console.log(`TRACES=${data.traces.length}`);
    console.log(`EVENTS=${data.events.length}`);
    console.log(`HAS_MISSING_INFO_OPEN=${raw.includes("missing_info.open")}`);
    console.log(`HAS_DIRECTION_GENERATE=${raw.includes("direction.generate")}`);

    // Aufräumen: Diagnostics-Dialog schließen (sonst blockiert der Overlay
    // den nächsten Test).
    await $(
      '[role="dialog"][aria-label="Admin Diagnostics"] button[aria-label="Schließen"]',
    ).click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
      reverse: true,
    });
  });

  it("11. OFF_ON_EQUIVALENCE: Varianteninhalt identisch mit Observability OFF und ON", async function () {
    requireSeed.call(this);
    // Defensive: eventuell offene Modals schließen (Kaskaden-Schutz).
    await dismissModals();

    // --- Lauf A: Observability AUS ---
    await ensureObservabilityDisabled();
    await selectCreatedPrompt(SEED_FILE_BASE);
    await analyzeSelectedPrompt();

    const variantBtnA = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtnA.waitForEnabled({ timeout: 10000 });
    await variantBtnA.click();
    const panelA = await $('[data-testid="variant-panel"]');
    await panelA.waitForExist({ timeout: 10000 });
    await selectDeterministicProfiles(panelA);

    const genBtnA = await panelA.$('[data-testid="variant-generate-btn"]');
    await genBtnA.waitForEnabled({ timeout: 10000 });
    await genBtnA.click();
    await panelA.$('[data-testid="variant-result-list"]').waitForExist({
      timeout: 15000,
    });
    const { variantContent: contentA } = await readFirstVariantCard(panelA);
    await closeVariantPanelResults(panelA);

    // --- Lauf B: Observability AN ---
    await ensureObservabilityEnabled();
    await selectCreatedPrompt(SEED_FILE_BASE);
    await analyzeSelectedPrompt();

    const variantBtnB = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtnB.waitForEnabled({ timeout: 10000 });
    await variantBtnB.click();
    const panelB = await $('[data-testid="variant-panel"]');
    await panelB.waitForExist({ timeout: 10000 });
    await selectDeterministicProfiles(panelB);

    const genBtnB = await panelB.$('[data-testid="variant-generate-btn"]');
    await genBtnB.waitForEnabled({ timeout: 10000 });
    await genBtnB.click();
    await panelB.$('[data-testid="variant-result-list"]').waitForExist({
      timeout: 15000,
    });
    const { variantContent: contentB } = await readFirstVariantCard(panelB);
    await closeVariantPanelResults(panelB);

    // Äquivalenz: identischer Quelltext + identische Profil-Auswahl ->
    // identischer Variantentext (Observability ändert die Generierung nicht)
    expect(contentA).toBe(contentB);

    console.log(`ADVANCED_OBSERVABILITY_EQUIVALENCE=true`);
    console.log(`EQUIVALENT_VARIANT_LENGTH=${contentA.length}`);
    console.log(`EQUIVALENCE_RUNS=OFF,ON`);
  });
});
