// e2e-tests/specs/privacy-export.native.spec.js
//
// v1.9.2 DIAGNOSTIC EXPORT PRIVACY — NATIVE WINDOWS RUNTIME PROOF
// ---------------------------------------------------------------------------
// REAL native app (real WebView2, real Tauri IPC, real Rust, real frontend).
// No mocks, no browser fallback. The export blob is captured from the REAL
// handleExport() -> exportDiagnostics() -> JSON.stringify -> Blob path by
// wrapping URL.createObjectURL (the download itself cannot be intercepted in
// a WebView2 WebDriver session, but the blob object is produced by the real
// app export code).
//
// Required outcomes (owner §9/§20):
//   REAL_NATIVE_DIAGNOSTIC_PRIVACY: PASS
//   - sentinel occurrences: 0
//   - raw prompt occurrences: 0
//   - secret occurrences: 0
//   - private absolute path occurrences: 0
//   - safe diagnostic metadata: PRESENT
//   - diagnostic_export_policy: PRESENT
//   - app_version: 1.9.2

import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const RANDOM = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const SENTINEL = `PVL_RUNTIME_PRIVACY_SENTINEL_${RANDOM}`;
const FULL_CONTENT_MARKER = `PVL_FULL_CONTENT_MARKER_${RANDOM}`;
const ARBITRARY_ATTR = `PVL_ARBITRARY_ATTR_${RANDOM}`;
const NESTED_ATTR = `PVL_NESTED_ATTR_${RANDOM}`;
const ANSWER_SHAPED = `PVL_ANSWER_SHAPED_${RANDOM}`;
const SECRET_SHAPED = `PVL_SECRET_SHAPED_${RANDOM}_sk_live_abc123`;
const PRIVATE_PATH = `C:\\Users\\pvl-private-vault\\${RANDOM}\\secret-answers.md`;

// ---------------------------------------------------------------------------
// Synthetic archive (no real user data)
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
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvl-privacy-e2e-"));
  writePrompt(
    root,
    "clean/basic-prompt.md",
    "Basic Prompt",
    `# Basic\n\nClean content with a clear goal.\n\n## Task\nImplement a test.`,
    ["clean"],
  );
  // Sentinel prompt carries every "unsafe" test value inside the prompt body.
  writePrompt(
    root,
    "clean/sentinel-prompt.md",
    "Sentinel Prompt",
    `# Sentinel

${SENTINEL} als Input-Marker.

${FULL_CONTENT_MARKER} full_content-shaped value.
${ARBITRARY_ATTR} arbitrary attribute value.
${NESTED_ATTR} nested object value { "nested": "secret" }.
${ANSWER_SHAPED} user-answer-shaped value.
${SECRET_SHAPED} secret-shaped value.
${PRIVATE_PATH} absolute local path.

## Task
Implement a test.`,
    ["sentinel"],
  );
  return root;
}

// ---------------------------------------------------------------------------
// WebDriver helpers
// ---------------------------------------------------------------------------

async function loadArchiveViaBridge(archive) {
  await browser.execute((p) => {
    window.__pvlLoadArchive(p);
  }, archive);
  await $(".tree-folder").waitForExist({ timeout: 20000 });
  await browser.pause(500);
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

async function deepDiagnosticsToggle() {
  return $('input[aria-label="Deep Diagnostics umschalten"]');
}

async function deepDiagnosticsToggleSlider() {
  return $('input[aria-label="Deep Diagnostics umschalten"] + .toggle-slider');
}

async function analyzeSelected() {
  const btn = await $('button[title="Neu analysieren"]');
  await btn.waitForEnabled({ timeout: 10000 });
  await btn.click();
  const score = await $(".circular-score-value");
  await score.waitForExist({ timeout: 30000 });
  return parseInt(await score.getText(), 10);
}

// Capture the REAL export blob produced by handleExport() -> exportDiagnostics().
async function captureExportJson() {
  // Install the blob capture hook in the real page context.
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

// Recursive string search over parsed JSON (all keys and values).
function collectLeafStrings(node, out) {
  if (node === null || node === undefined) return;
  if (typeof node === "string") {
    out.push(node);
    return;
  }
  if (typeof node === "number" || typeof node === "boolean") return;
  if (Array.isArray(node)) {
    for (const item of node) collectLeafStrings(item, out);
    return;
  }
  if (typeof node === "object") {
    for (const [k, v] of Object.entries(node)) {
      out.push(k);
      collectLeafStrings(v, out);
    }
  }
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

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("v1.9.2 Diagnostic Export Privacy — Native Windows Runtime Proof", function () {
  this.timeout(600000);
  let archive;
  let archiveLoaded = false;

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

  function requireArchive() {
    if (!archiveLoaded) {
      this.skip();
    }
  }

  it("1. REAL_NATIVE_BINARY: echtes Fenster 'PromptVault Lite' v1.9.2", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 90000 });
    const title = await heading.getText();
    expect(title).toMatch(/PromptVault Lite/);

    const statusbar = await $(".app-statusbar");
    await statusbar.waitForExist({ timeout: 10000 });
    const statusText = await statusbar.getText();
    expect(statusText).toMatch(/PromptVault Lite v\d+\.\d+\.\d+/);
    // The real binary must report 1.9.2
    expect(statusText).toContain("v1.9.2");
  });

  it("2. Observability + Deep Diagnostics aktivieren (real UI)", async () => {
    await openSettings();
    const toggle = await observabilityToggle();
    await toggle.waitForExist({ timeout: 10000 });
    const slider = await observabilityToggleSlider();
    await slider.click();
    await browser.pause(500);
    expect(await toggle.isSelected()).toBe(true);

    // Deep Diagnostics
    const deep = await deepDiagnosticsToggle();
    await deep.waitForExist({ timeout: 10000 });
    const deepSlider = await deepDiagnosticsToggleSlider();
    await deepSlider.click();
    await browser.pause(500);
    expect(await deep.isSelected()).toBe(true);

    const dialogText = await $('[role="dialog"]').getText();
    expect(dialogText).toMatch(/ADMIN DIAGNOSTICS/);
    expect(dialogText).toMatch(/DEEP DIAGNOSTICS/);
    await closeSettings();

    const diagBtn = await $('button[aria-label="Admin Diagnostics öffnen"]');
    await diagBtn.waitForExist({ timeout: 10000 });
  });

  it("3. Sentinel-Prompt laden und normalen Diagnosepfad auslösen", async function () {
    await loadArchiveViaBridge(archive);
    await $('[aria-label*="Ordner clean"]').click();
    await browser.pause(500);
    await $(".tree-file*=sentinel-prompt").click();
    await $(".prompt-content").waitForExist({ timeout: 10000 });
    archiveLoaded = true;

    const score = await analyzeSelected();
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThanOrEqual(100);
  });

  it("4. REAL_NATIVE_DIAGNOSTIC_PRIVACY: Export enthält Sentinel/Secrets/Paths NICHT", async function () {
    requireArchive.call(this);

    await $('button[aria-label="Admin Diagnostics öffnen"]').click();
    await $('[role="dialog"][aria-label="Admin Diagnostics"]').waitForExist({
      timeout: 10000,
    });

    const raw = await captureExportJson();
    expect(raw).not.toBeNull();
    const data = JSON.parse(raw);

    // --- Safe metadata must be PRESENT -------------------------------------
    expect(data.schema_version).toBe(1);
    expect(data.diagnostic_export_policy).toBeDefined();
    expect(data.export_policy_version).toBeDefined();
    expect(data.app_version).toBe("1.9.2");
    expect(data.generated_at).toBeDefined();
    expect(data.feature_flags).toBeDefined();
    expect(Array.isArray(data.traces)).toBe(true);
    expect(Array.isArray(data.events)).toBe(true);

    // Diagnostic usefulness: operation/status/reasonCode/layer/durations must
    // remain usable in the export (privacy must not break usefulness).
    const leafStrings = [];
    collectLeafStrings(data, leafStrings);
    const joined = leafStrings.join("\u0001");
    expect(data.traces.length + data.events.length).toBeGreaterThan(0);
    // Some operational string (operation names, layer labels, reason codes)
    expect(joined).toMatch(/scan|analyze|evaluate|resolve|store|ipc|typescript|succeeded/i);

    // --- Privacy: fail-closed boundary -------------------------------------
    const sentinelCount = countOccurrences(raw, SENTINEL);
    const fullContentCount = countOccurrences(raw, FULL_CONTENT_MARKER);
    const arbitraryCount = countOccurrences(raw, ARBITRARY_ATTR);
    const nestedCount = countOccurrences(raw, NESTED_ATTR);
    const answerCount = countOccurrences(raw, ANSWER_SHAPED);
    const secretCount = countOccurrences(raw, SECRET_SHAPED);
    const pathCount = countOccurrences(raw, PRIVATE_PATH);

    expect(sentinelCount).toBe(0);
    expect(fullContentCount).toBe(0);
    expect(arbitraryCount).toBe(0);
    expect(nestedCount).toBe(0);
    expect(answerCount).toBe(0);
    expect(secretCount).toBe(0);
    expect(pathCount).toBe(0);

    // Report numbers for the run record
    console.log(`SENTINEL_OCCURRENCES=${sentinelCount}`);
    console.log(`RAW_PROMPT_OCCURRENCES=${fullContentCount}`);
    console.log(`SECRET_OCCURRENCES=${secretCount}`);
    console.log(`PRIVATE_PATH_OCCURRENCES=${pathCount}`);
    console.log(`APP_VERSION=${data.app_version}`);
    console.log(`EXPORT_POLICY=${data.diagnostic_export_policy}`);
    console.log(`OMITTED_ATTR_COUNT=${data.omitted_attribute_count}`);
    console.log(`OMITTED_EVENT_ATTR_COUNT=${data.omitted_event_attribute_count}`);
    console.log(`TRACES=${data.traces.length}`);
    console.log(`EVENTS=${data.events.length}`);
  });

  it("5. OFF/ON Equivalence: Score identisch bei Observability OFF", async function () {
    requireArchive.call(this);
    // close diagnostics first
    await browser.keys("Escape");
    await browser.pause(300);

    // We are ON right now; capture current score
    await $(".tree-file*=basic-prompt").click();
    await browser.pause(300);
    const scoreOn = await analyzeSelected();

    // Turn OFF via settings
    await openSettings();
    const toggle = await observabilityToggle();
    const slider = await observabilityToggleSlider();
    await slider.click();
    await browser.pause(500);
    expect(await toggle.isSelected()).toBe(false);
    await closeSettings();

    const scoreOff = await analyzeSelected();
    expect(scoreOff).toBe(scoreOn);
    console.log(`OFF_SCORE=${scoreOff}`);
    console.log(`ON_SCORE=${scoreOn}`);
  });
});
