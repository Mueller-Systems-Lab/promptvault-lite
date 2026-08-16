// e2e-tests/specs/authoring-lifecycle.public.spec.js
//
// v1.10.0 AUTHORING LIFECYCLE — PUBLIC RELEASE BINARY PROOF (Windows)
// ---------------------------------------------------------------------------
// PUBLIC BINARY PROOF: this spec drives the PUBLICLY INSTALLED release
// executable
//   C:\Users\xxammaxx\AppData\Local\PromptVault Lite\promptvault-lite.exe
// (FileVersion/ProductVersion 1.10.0, Debug: False) via tauri-driver +
// WebView2 — NOT the target/debug build and NOT a Vite/browser fallback.
//
// Debug-bridge absence (ADR-005): the debug-only E2E bridge
// window.__pvlLoadArchive is gated by is_e2e_bridge_available(), which
// returns cfg!(debug_assertions) — false in the public release build. The
// frontend therefore never exposes it (fail-closed). Verified empirically
// below: typeof window.__pvlLoadArchive === "undefined".
//
// Archive-loader mechanism (empirically verified 2026-08-16 against the
// public binary): the public proof loads the synthetic archive through the
// REAL product startup-restore path:
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
// release binary (withGlobalTauri: true), returning the real scanned
// prompt list — used below as an extra real-Rust IPC sanity assertion.
//
// Required outcomes (v1.10.0 authoring lifecycle DoD):
//   REAL_PUBLIC_NATIVE_BINARY, CREATE, EDIT_SAVE, RESTART_PERSISTENCE,
//   OPTIMIZER_APPLY, PRIVACY_SENTINEL
//
// NOTE (mid-spec restart): wdio.conf.windows.public.mjs uses a MANUAL
// tauri-driver lifecycle and spawns the app binary exactly ONCE per
// WebDriver session; no harness-proven respawn mechanism exists. True
// cross-process restart persistence is therefore covered by the unit suite
// (src/stores/__tests__/appStore.authoring.test.ts — "Authoring — restart
// persistence") and by this spec's REAL proof (test 4): (a) localStorage
// "promptvault.lastFolder" is written by the real scanFolder action, (b) the
// prompt file persists on disk, (c) a fresh page reload — which re-runs the
// exact startup-restore effect from App.tsx (scanFolder(lastFolder) over the
// real filesystem) — rediscovers the saved prompt from disk.

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RANDOM = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ---------------------------------------------------------------------------
// Test-Identitäten (ASCII-sicher, damit der Rust-Filename-Sanitizer
// create_prompt -> "<sanitized title>.md" deterministisch vorhersagbar ist)
// ---------------------------------------------------------------------------

const CREATE_TITLE = "E2E Authoring Prompt";
const CREATE_FILE_NAME = `${CREATE_TITLE}.md`; // sanitized: keine Spezialzeichen
const CREATE_MARKER_V1 = "CREATE_PUBLIC_MARKER_V1";
const EDIT_MARKER_V2 = "EDIT_PUBLIC_MARKER_V2";
const SENTINEL = `AUTHORING_SENTINEL_${RANDOM}`;
const SENTINEL_BODY_MARKER = `PVL_AUTHORING_BODY_MARKER_${RANDOM}`;

const CREATE_CONTENT_V1 = [
  "# E2E Authoring Prompt",
  "",
  `${CREATE_MARKER_V1}: Ursprünglicher Inhalt des Public-Binary-Authoring-Tests.`,
  "",
  "## Task",
  "E2E-Beweis für den Authoring-Lifecycle gegen die Release-Binary erstellen.",
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvl-authoring-public-e2e-"));
  writePrompt(
    root,
    "clean/basic-prompt.md",
    "Basic Prompt",
    `# Basic\n\nClean content with a clear goal.\n\n## Task\nImplement a test.`,
    ["clean"],
  );
  writePrompt(
    root,
    "clean/sentinel-prompt.md",
    "Sentinel Prompt",
    `# Sentinel\n\nSeed-Datei ohne Sentinel-Werte.`,
    ["sentinel"],
  );
  return root;
}

// ---------------------------------------------------------------------------
// WebDriver-Helfer
// ---------------------------------------------------------------------------

// PUBLIC BINARY PROOF loader: NO window.__pvlLoadArchive (unavailable in the
// release build). Uses the REAL product startup-restore path instead —
// localStorage["promptvault.lastFolder"] + full page reload re-runs the
// App.tsx restore effect, which calls the REAL scanFolder() store action
// (real Tauri IPC invoke("scan_directory") -> real Rust scan_directory ->
// real filesystem). browser.refresh() was empirically verified to work with
// the tauri-driver WebDriver-classic harness on the public binary.
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
  await browser.pause(500);
}

/** Public proof: the release binary must NOT expose the debug bridge. */
async function debugBridgeAbsent() {
  return browser.execute(() => typeof window.__pvlLoadArchive === "undefined");
}

/** Public proof: real Tauri IPC works from the page context (release). */
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
  return $('input[aria-label="Admin Observability umschalten"] + .toggle-slider');
}

async function analyzeSelected() {
  const btn = await $('button[title="Neu analysieren"]');
  await btn.waitForEnabled({ timeout: 10000 });
  await btn.click();
  const score = await $(".circular-score-value");
  await score.waitForExist({ timeout: 30000 });
  return parseInt(await score.getText(), 10);
}

// --- Editor-Helfer (PromptEditor, v1.10.0) -------------------------------

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
  // Watcher-Debounce (500 ms) + Re-Scan abwarten, damit der Baum
  // den deterministischen Re-Scan-Stand (uuid-v5-IDs) zeigt.
  await browser.pause(2500);
}

/** Wählt den erzeugten Prompt im Explorer aus (Re-Scan kann IDs ersetzen). */
async function selectCreatedPrompt(selectorText) {
  const node = await $(`.tree-file*=${selectorText}`);
  await node.waitForExist({ timeout: 20000 });
  await node.click();
  await $(".prompt-content").waitForExist({ timeout: 10000 });
  await browser.pause(500);
}

// --- Export-Capture (gleicher Ansatz wie privacy-export.native.spec.js) ---

// Capture the REAL export blob produced by handleExport() -> exportDiagnostics().
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

/** Liest die erzeugte Datei aus dem synthetischen Archiv (Windows-sicher). */
function readCreatedFile(archivePath) {
  const direct = path.join(archivePath, CREATE_FILE_NAME);
  if (fs.existsSync(direct)) {
    return fs.readFileSync(direct, "utf-8");
  }
  // Fallback: kanonisierten Root nutzen (Windows long-path / case noise)
  const canonicalRoot = fs.realpathSync(archivePath);
  return fs.readFileSync(path.join(canonicalRoot, CREATE_FILE_NAME), "utf-8");
}

function normalizeText(s) {
  return s.replace(/\r\n/g, "\n").trim();
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("v1.10.0 Authoring Lifecycle — Public Release Binary Proof (Windows)", function () {
  this.timeout(600000);
  let archive;
  let archiveLoaded = false;
  let createdPromptReady = false;

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

  function requireCreatedPrompt() {
    if (!createdPromptReady) {
      this.skip();
    }
  }

  it("1. REAL_PUBLIC_NATIVE_BINARY: Release-EXE v1.10.0, kein Debug-Bridge", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 90000 });
    expect(await heading.getText()).toMatch(/PromptVault Lite/);

    // Statusbar beweist die gebündelte Release-App (nicht Vite/Browser) —
    // und explizit die Version 1.10.0 des PUBLIC release binary.
    const statusbar = await $(".app-statusbar");
    await statusbar.waitForExist({ timeout: 10000 });
    expect(await statusbar.getText()).toMatch(/PromptVault Lite v1\.10\.0/);

    // PUBLIC BINARY PROOF: ADR-005-Debug-Bridge ist im Release NICHT
    // exponiert (is_e2e_bridge_available() -> cfg!(debug_assertions) -> false).
    expect(await debugBridgeAbsent()).toBe(true);

    // PUBLIC BINARY PROOF: echter Tauri-IPC (withGlobalTauri) existiert und
    // scan_directory läuft gegen das echte Dateisystem (2 Seed-Prompts).
    const ipcScan = await realScanDirectoryViaGlobalIpc(archive);
    expect(ipcScan.ok).toBe(true);
    expect(ipcScan.count).toBe(2);

    console.log(`PUBLIC_BINARY_BRIDGE_ABSENT=true`);
    console.log(`PUBLIC_BINARY_REAL_SCAN_COUNT=${ipcScan.count}`);
  });

  it("2. CREATE: '✏️ Neuer Prompt' → Editor → Speichern schreibt Datei", async function () {
    await loadArchiveViaPublicRestore(archive);
    archiveLoaded = true;

    // Toolbar-Button öffnet den Create-Editor
    await openCreateEditor();

    // Save ist initial disabled (leere Felder)
    const saveBtn = await $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"] .modal-footer button.btn-primary',
    );
    await saveBtn.waitForExist({ timeout: 10000 });
    expect(await saveBtn.isEnabled()).toBe(false);

    // Titel + Inhalt über die echte UI eingeben
    await $("#prompt-editor-title").setValue(CREATE_TITLE);
    await $("#prompt-editor-content").setValue(CREATE_CONTENT_V1);

    // Nach Eingabe wird Speichern enabled
    await saveBtn.waitForEnabled({ timeout: 10000 });
    expect(await saveBtn.isEnabled()).toBe(true);

    // Speichern → echter create_prompt (Rust) → Datei auf Platte
    await saveBtn.click();
    await $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"]',
    ).waitForExist({ timeout: 15000, reverse: true });
    await browser.pause(2500);

    // Neuer Prompt erscheint im Explorer-Baum (Dateiname ohne .md)
    const treeNode = await $(".tree-file*=E2E Authoring Prompt");
    await treeNode.waitForExist({ timeout: 20000 });
    expect(await treeNode.getText()).toContain("E2E Authoring Prompt");

    // Datei mit sanitized title + ".md" existiert im Archiv (fs.existsSync)
    const createdFile = path.join(archive, CREATE_FILE_NAME);
    expect(fs.existsSync(createdFile)).toBe(true);
    const onDisk = fs.readFileSync(createdFile, "utf-8");
    expect(onDisk).toContain(CREATE_MARKER_V1);
    createdPromptReady = true;
  });

  it("3. EDIT+SAVE: '✏️ Bearbeiten' vorbelegt, Dirty-Indikator, Speichern persistiert", async function () {
    requireCreatedPrompt.call(this);

    // Prompt im Baum erneut auswählen (Re-Scan kann IDs ersetzt haben)
    await selectCreatedPrompt("E2E Authoring Prompt");

    const editBtn = await $('button[aria-label="Prompt bearbeiten"]');
    await editBtn.waitForExist({ timeout: 10000 });
    await editBtn.click();

    const dialog = await $('[role="dialog"][aria-label="Prompt bearbeiten"]');
    await dialog.waitForExist({ timeout: 10000 });

    // Editor ist vorbelegt (title + content aus dem Prompt)
    expect(await $("#prompt-editor-title").getValue()).toBe(CREATE_TITLE);
    const prefilled = await $("#prompt-editor-content").getValue();
    expect(prefilled).toContain(CREATE_MARKER_V1);

    // Direkt nach dem Öffnen ist der Editor clean (kein Dirty-Indikator)
    expect(await $(".editor-dirty-indicator").isExisting()).toBe(false);

    // Inhalt ändern → Dirty-Indikator erscheint
    const edited = `${prefilled}\n\n${EDIT_MARKER_V2}: Über den Editor geänderter Inhalt.`;
    await $("#prompt-editor-content").setValue(edited);
    await $(".editor-dirty-indicator").waitForExist({ timeout: 10000 });
    expect(await $(".editor-dirty-indicator").getText()).toContain(
      "Ungespeicherte",
    );

    // Speichern → echter update_prompt (Rust) → Datei enthält neuen Inhalt
    await saveEditor("Prompt bearbeiten");
    const diskContent = readCreatedFile(archive);
    expect(diskContent).toContain(EDIT_MARKER_V2);
    expect(diskContent).toContain(CREATE_MARKER_V1);
  });

  it("4. RESTART-PERSISTENZ: lastFolder + Datei auf Platte + Fresh-Restore-Re-Scan", async function () {
    requireCreatedPrompt.call(this);
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

    // (b) Datei existiert auf Platte und enthält den editierten Inhalt
    const diskContent = readCreatedFile(archive);
    expect(diskContent).toContain(EDIT_MARKER_V2);

    // (c) Fresh-Restore-Re-Scan: vollständiger Reload (derselbe Mechanismus
    // wie der echte App-Start) → Startup-Restore scanFolder(lastFolder) über
    // echte Rust-Command + echtes Dateisystem findet den Prompt wieder.
    await loadArchiveViaPublicRestore(archive);
    const node = await $(".tree-file*=E2E Authoring Prompt");
    await node.waitForExist({ timeout: 20000 });
    expect(await node.getText()).toContain("E2E Authoring Prompt");
  });

  it("5. OPTIMIZER-APPLY: ✨ Optimieren → '✏️ Übernehmen' → Speichern persistiert", async function () {
    requireCreatedPrompt.call(this);

    await selectCreatedPrompt("E2E Authoring Prompt");

    // Optimizer öffnen (echter Modus "balanced")
    await $('button[title="Prompt optimieren"]').click();
    await $('[role="dialog"][aria-label="Prompt-Optimierung"]').waitForExist({
      timeout: 10000,
    });
    await $('input[name="optimizationMode"][value="balanced"]').click();
    await $(".optimizer-results").waitForExist({ timeout: 10000 });
    await browser.pause(300);

    // Optimierter Output aus dem echten Diff lesen (Vorher = [0], Optimiert = [1])
    const diffEls = await $$(".optimizer-diff-content");
    expect(diffEls.length).toBeGreaterThanOrEqual(2);
    const diffTexts = [];
    for (const el of diffEls) {
      diffTexts.push(await el.getText());
    }
    const originalText = normalizeText(diffTexts[0]);
    const optimizedText = normalizeText(diffTexts[1]);
    expect(optimizedText).not.toBe(originalText);

    // "✏️ Übernehmen" → PromptEditor öffnet in Edit-Modus mit dem Ergebnis
    await $('button[aria-label="Optimiertes Ergebnis übernehmen"]').click();
    const editorDialog = await $(
      '[role="dialog"][aria-label="Prompt bearbeiten"]',
    );
    await editorDialog.waitForExist({ timeout: 10000 });

    const editorContent = normalizeText(
      await $("#prompt-editor-content").getValue(),
    );
    expect(editorContent).toBe(optimizedText);
    expect(editorContent).not.toBe(originalText);

    // Speichern → update_prompt (Rust) → Datei enthält den übernommenen Inhalt
    await saveEditor("Prompt bearbeiten");
    const diskContent = readCreatedFile(archive);
    // Überschrift wurde von "# ..." auf "## ..." normalisiert (balanced-Modus)
    expect(diskContent).toContain("## E2E Authoring Prompt");
    expect(diskContent).not.toContain("\n# E2E Authoring Prompt");
  });

  it("6. PRIVACY_SENTINEL: Export enthält Sentinel/Prompt-Body NICHT", async function () {
    requireCreatedPrompt.call(this);

    // Observability aktivieren (gleicher Toggle wie admin-observability)
    await openSettings();
    const toggle = await observabilityToggle();
    await toggle.waitForExist({ timeout: 10000 });
    const slider = await observabilityToggleSlider();
    await slider.click();
    await browser.pause(500);
    expect(await toggle.isSelected()).toBe(true);
    await closeSettings();
    await $('button[aria-label="Admin Diagnostics öffnen"]').waitForExist({
      timeout: 10000,
    });

    // Sentinel-Prompt über den ECHTEN Authoring-Pfad erstellen
    await openCreateEditor();
    await $("#prompt-editor-title").setValue("Authoring Sentinel");
    await $("#prompt-editor-content").setValue(
      [
        "# Authoring Sentinel",
        "",
        `${SENTINEL} als Input-Marker.`,
        "",
        `${SENTINEL_BODY_MARKER} geheimer Prompt-Body-Inhalt.`,
      ].join("\n"),
    );
    await saveEditor("Neuen Prompt erstellen");

    // Sentinel-Prompt auswählen und analysieren (erzeugt echte Events mit rotem Input)
    await selectCreatedPrompt("Authoring Sentinel");
    await analyzeSelected();
    await browser.pause(300);

    // Export über den ECHTEN handleExport() -> exportDiagnostics() -> Blob einfangen
    await $('button[aria-label="Admin Diagnostics öffnen"]').click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
    });

    const raw = await captureExportJson();
    expect(raw).not.toBeNull();
    const data = JSON.parse(raw);

    // Struktur: sicherer Diagnose-Export bleibt nutzbar
    expect(data.schema_version).toBe(1);
    expect(data.app_version).toBe("1.10.0"); // PUBLIC release version
    expect(Array.isArray(data.traces)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);
    expect(data.traces.length + data.events.length).toBeGreaterThan(0);

    // Privacy: weder Sentinel noch Prompt-Body dürfen den Export erreichen
    const sentinelCount = countOccurrences(raw, SENTINEL);
    const bodyCount = countOccurrences(raw, SENTINEL_BODY_MARKER);
    const bodyPhraseCount = countOccurrences(raw, "geheimer Prompt-Body-Inhalt");
    expect(sentinelCount).toBe(0);
    expect(bodyCount).toBe(0);
    expect(bodyPhraseCount).toBe(0);

    // Report-Zahlen für das Run-Record
    console.log(`AUTHORING_SENTINEL_OCCURRENCES=${sentinelCount}`);
    console.log(`AUTHORING_BODY_MARKER_OCCURRENCES=${bodyCount}`);
    console.log(`AUTHORING_BODY_PHRASE_OCCURRENCES=${bodyPhraseCount}`);
    console.log(`APP_VERSION=${data.app_version}`);
    console.log(`TRACES=${data.traces.length}`);
    console.log(`EVENTS=${data.events.length}`);
  });
});
