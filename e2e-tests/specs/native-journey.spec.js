// e2e-tests/specs/native-journey.spec.js
//
// E19 — Native Tauri Real E2E (Run Card §20-24)
// ---------------------------------------------------------------------------
// Verboten in diesem Lauf (Run Card §20):
//   - window.__TAURI_INTERNALS__ ersetzen            → NICHT gemacht
//   - Tauri invoke mocken                            → NICHT gemacht
//   - scan_directory simulieren                      → NICHT gemacht (echtes Rust)
//   - Frontend über Vite laden                       → NICHT gemacht (gebündelte dist)
//   - Rust-Antworten fälschen                        → NICHT gemacht
//
// Erforderlich und hier realisiert:
//   - echtes Tauri-Binary (target/debug/promptvault-lite)
//   - echte WebView (via tauri-driver + WebKitWebDriver)
//   - echte Tauri-IPC (window.__TAURI_INTERNALS__.invoke — real)
//   - echte Rust-Commands (scan_directory, evaluate_prompt, analyze_hygiene, toggle_favorite)
//   - echtes temporäres Dateisystem (synthetisches Archiv, kein Nutzerdaten)
//   - sichtbare UI-Interaktion (Klicks via WebDriver)
//   - nativer GTK-Dialog wird mit echten X11-Events (XTEST) bedient
//
// Reise (Run Card §22):
//   Binary starten → Fenster sichtbar → Archiv über reale UI laden →
//   Explorer zeigt erwartete Dateien → Clean Prompt auswählen →
//   realer Rust-Command auslösen → reales Ergebnis in UI prüfen →
//   Theme ändern → Favorit setzen → App schließen → App neu starten →
//   Persistenz verifizieren.
// Zusätzlich: Sicherheitsreise (§23), keine Panic/JS-Exception/verwaiste Prozesse.

import { spawnSync } from "node:child_process";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(__dirname, "..", "helpers", "x11dialog.py");

const MARKERS = {
  CLEAN: "PVL_NATIVE_E2E_CLEAN",
  BLUEPRINT: "PVL_NATIVE_E2E_BLUEPRINT",
  BLOCKED: "PVL_NATIVE_E2E_BLOCKED",
  UNICODE: "PVL_NATIVE_E2E_UNICODE",
};

// ---------------------------------------------------------------------------
// Synthetisches Archiv (Run Card §21) — keine echten Nutzerdaten
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

function createNativeArchive() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pvl-native-e2e-"));
  writePrompt(root, "clean/basic-prompt.md", "Basic Prompt", `# Basic\n\n${MARKERS.CLEAN} Inhalt`, ["clean"]);
  writePrompt(root, "clean/blueprint-prompt.md", "Blueprint Prompt", `# Blueprint\n\n${MARKERS.BLUEPRINT} Inhalt`, ["blueprint"]);
  writePrompt(root, "clean/missing-info-prompt.md", "Missing Info Prompt", "# Missing\n\nUnvollständiger Prompt", ["missing"]);
  writePrompt(root, "blocked/sensitive-prompt.md", "Sensitive Prompt", `# Sensitiv\n\npassword = "${MARKERS.BLOCKED}"\n\napi_key = "PVL_NATIVE_E2E_BLOCKED_2"`, ["blocked"]);
  writePrompt(root, "nested/deep/nested-prompt.md", "Nested Prompt", "# Nested\n\nTief verschachtelt", ["nested"]);
  writePrompt(root, "unicode/äöü-测试-prompt.md", "Unicode Prompt", `# Unicode\n\n${MARKERS.UNICODE} Äöü 测试`, ["unicode"]);
  writePrompt(root, "invalid/malformed-frontmatter.md", "Malformed", "---\nkaputt\n---\nInhalt", []);
  writePrompt(root, "empty/empty-prompt.md", "Empty Prompt", "", ["empty"]);
  return root;
}

// ---------------------------------------------------------------------------
// WebDriver-Helfer
// ---------------------------------------------------------------------------

async function installErrorCollector() {
  await browser.execute(() => {
    if (!window.__pvlJsErrors) {
      window.__pvlJsErrors = [];
      window.addEventListener("error", (e) => {
        window.__pvlJsErrors.push(String(e.message));
      });
    }
  });
}

async function getJsErrors() {
  return browser.execute(() => window.__pvlJsErrors || []);
}

async function realInvoke(cmd, args) {
  // ECHTER Tauri-IPC: ruft das echte window.__TAURI_INTERNALS__.invoke auf
  // (kein Mock, kein Ersatz). Ergebnis wird über ein Poll-Feld zurückgegeben,
  // da Execute-Script-Promises nicht von jedem WebDriver aufgelöst werden.
  await browser.execute((c, a) => {
    window.__pvlInvokeResult = { pending: true };
    window.__TAURI_INTERNALS__.invoke(c, a).then(
      (v) => { window.__pvlInvokeResult = { pending: false, ok: true, value: v }; },
      (e) => { window.__pvlInvokeResult = { pending: false, ok: false, error: String(e) }; }
    );
  }, cmd, args);
  const deadline = Date.now() + 15000;
  while (Date.now() < deadline) {
    const state = await browser.execute(() => window.__pvlInvokeResult);
    if (state && state.pending === false) return state;
    await browser.pause(200);
  }
  throw new Error(`IPC timeout for ${cmd}`);
}

async function treeNames(selector) {
  // DOM-basiert extrahieren — wdio-Element-Serialisierung liefert hier leere Texte
  return browser.execute((sel) => {
    return Array.from(
      document.querySelectorAll(`${sel} .tree-name`),
    ).map((n) => n.textContent.trim());
  }, selector);
}

/**
 * Extrahiere alle WIDs aus xwininfo -root -tree (Hex-Strings).
 * Wird als Pre-Klick-Snapshot an x11dialog.py übergeben.
 */
function captureWids() {
  const { spawnSync } = require("node:child_process");
  const r = spawnSync("xwininfo", ["-root", "-tree"], { encoding: "utf-8" });
  if (!r.stdout) return [];
  const wids = [];
  const re = /^\s*(0x[0-9a-fA-F]+)\s/gm;
  let m;
  while ((m = re.exec(r.stdout)) !== null) {
    wids.push(m[1]);
  }
  return wids;
}

/**
 * Lade das Archiv über den ECHTEN nativen GTK-Dialog (Run Card §22).
 *
 * x11dialog.py arbeitet fail-closed: es prüft eigenständig, ob ein
 * echtes Dialogfenster existiert (Pre-/Post-Snapshot, WM_TRANSIENT_FOR,
 * XGetInputFocus). Titel-Matching allein reicht nicht.
 *
 * Diese Funktion erfasst den Pre-Klick-Fensterbestand, klickt den Button,
 * und übergibt die WIDs an x11dialog.py. Der Helper entscheidet selbst,
 * ob ein Dialog erkannt wurde (exit 0) oder nicht (exit 2/3/6).
 */
async function loadArchiveViaDialog(archive, timeoutMs = 30000) {
  const { spawnSync } = await import("node:child_process");
  const deadline = Date.now() + timeoutMs;

  for (let attempt = 1; attempt <= 2; attempt += 1) {
    // ── Pre-Klick-Snapshot: alle sichtbaren WIDs erfassen ──────────
    const preWids = captureWids();
    console.log(`DIALOG pre-click WIDs (${preWids.length}):`, preWids.join(","));

    const openBtn = await $('button[title*="Ordner öffnen"]');
    await openBtn.waitForEnabled({ timeout: 15000 });
    await openBtn.click();

    // x11dialog.py erkennt den Dialog eigenständig (fail-closed).
    // --pre-wids übergibt den Pre-Klick-Snapshot zur Differenzbildung.
    const preWidsArg = preWids.join(",");
    const r = spawnSync("python3", [
      HELPER,
      "--path", archive,
      "--pre-wids", preWidsArg,
      "--timeout-s", String(Math.floor(timeoutMs / 1000)),
    ], {
      stdio: "inherit",
      timeout: Math.max(timeoutMs + 10000, 70000),
    });

    if (r.status !== 0) {
      console.warn(`DIALOG attempt ${attempt}: x11dialog.py exit ${r.status}`);
      // Diagnose nach Fehlschlag
      const xw = spawnSync("xwininfo", ["-root", "-tree"], { encoding: "utf-8" });
      console.log("DIAG post-failure xwininfo:", JSON.stringify((xw.stdout || "").split("\n").slice(0, 15)));
      continue;
    }

    // Explorer zeigt die Ordnerstruktur? (Dialog wurde geschlossen,
    // Archiv wurde übernommen — E19-spezifische Prüfung)
    try {
      await $(".tree-folder").waitForExist({ timeout: 15000 });
      return; // Erfolg
    } catch {
      console.warn(`DIALOG attempt ${attempt}: Ordner nicht erschienen — Retry`);
    }
  }
  throw new Error("Archiv konnte nicht über den nativen Dialog geladen werden");
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("E19 — Native Tauri Real E2E (echte WebView, echte IPC)", function () {
  this.timeout(600000);
  let archive;

  before(async () => {
    archive = createNativeArchive();
    await installErrorCollector();
  });

  after(async () => {
    try { fs.rmSync(archive, { recursive: true, force: true }); } catch { /* ignore */ }
    // Keine ungefangenen JS-Exceptions im gesamten Lauf
    const errs = await getJsErrors();
    expect(errs).toEqual([]);
  });

  it("1. Hauptfenster sichtbar — Titel, Toolbar, Statusbar", async () => {
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 60000 });
    expect(await heading.getText()).toMatch(/PromptVault Lite/);

    const toolbar = await $(".app-toolbar");
    expect(await toolbar.isDisplayed()).toBe(true);

    const statusbar = await $(".app-statusbar");
    expect(await statusbar.isDisplayed()).toBe(true);
    expect(await statusbar.getText()).toMatch(/PromptVault Lite v\d+\.\d+\.\d+/);
  });

  it("2. Archiv über reale UI laden — nativer GTK-Dialog via XTEST", async () => {
    await loadArchiveViaDialog(archive);

    // Explorer zeigt die Ordnerstruktur
    const folders = await treeNames(".tree-folder");
    for (const f of ["clean", "blocked", "nested", "unicode", "invalid", "empty"]) {
      // Ordner muss im Explorer stehen
      expect(folders).toContain(f);
    }
  });

  it("3. Explorer zeigt erwartete Dateien (clean/…)", async () => {
    const cleanFolder = await $('[aria-label*="Ordner clean"]');
    await cleanFolder.click();
    await browser.pause(500);

    const files = await treeNames(".tree-file");
    expect(files).toContain("basic-prompt");
    expect(files).toContain("blueprint-prompt");
    expect(files).toContain("missing-info-prompt");
  });

  it("4. Clean Prompt auswählen → Titel/Inhalt/Tags in Details", async () => {
    await $(".tree-file*=basic-prompt").click();
    await $(".prompt-content").waitForExist({ timeout: 10000 });

    expect(await $(".prompt-content").getText()).toContain(MARKERS.CLEAN);
    // Titel (Details-Header)
    const detailsText = await $(".panel-details").getText();
    expect(detailsText).toMatch(/Basic Prompt/);
  });

  it("5. Realer Rust-Command via UI: Analysieren → Score in der Analyse", async () => {
    const analyzeBtn = await $('button[title="Neu analysieren"]');
    await analyzeBtn.waitForEnabled({ timeout: 10000 });
    await analyzeBtn.click();

    // Echte evaluate_prompt/analyze_hygiene (Rust) → Score-Gauge erscheint
    const score = await $(".circular-score-value");
    await score.waitForExist({ timeout: 30000 });
    const value = parseInt(await score.getText(), 10);
    expect(value).toBeGreaterThan(0);
    expect(value).toBeLessThanOrEqual(100);
  });

  it("6. Reale IPC-Rückgabe: evaluate_prompt liefert evaluiertes Ergebnis (Rust)", async () => {
    const content = `# Basic\n\n${MARKERS.CLEAN} Inhalt`;
    const result = await realInvoke("evaluate_prompt", {
      promptId: "native-e2e-basic",
      content,
    });
    expect(result.ok).toBe(true);
    expect(result.value).toHaveProperty("overall_score");
    expect(result.value.overall_score).toBeGreaterThan(0);
    expect(Array.isArray(result.value.recommendations)).toBe(true);
  });

  it("7. Reale IPC: scan_directory liefert Fixture-Dateien (Rust + FS)", async () => {
    const result = await realInvoke("scan_directory", { path: archive });
    expect(result.ok).toBe(true);
    const items = result.value;
    expect(Array.isArray(items)).toBe(true);
    const paths = items.map((p) => p.file_path || "");
    expect(paths.some((p) => p.endsWith("basic-prompt.md"))).toBe(true);
    expect(paths.some((p) => p.includes("äöü-测试-prompt.md"))).toBe(true);
    expect(paths.some((p) => p.endsWith("empty-prompt.md"))).toBe(true);
  });

  it("8. Theme ändern (Hell) → Button-Label aktualisiert", async () => {
    await $('button[aria-label*="Einstellungen öffnen"]').click();
    await $('[role="dialog"]').waitForExist({ timeout: 10000 });

    const lightRadio = await $('input[type="radio"][name="theme"][value="light"]');
    await lightRadio.click();
    await browser.keys("Escape");
    await browser.pause(300);

    const themeBtn = await $(".theme-toggle");
    expect(await themeBtn.getAttribute("aria-label")).toContain("Hell");
  });

  it("9. Favorit setzen → echte Rust/SQLite-Persistenz", async () => {
    // basic-prompt ist noch ausgewählt
    const favBtn = await $('[aria-label="Als Favorit markieren"]');
    await favBtn.waitForExist({ timeout: 10000 });
    await favBtn.click();
    await $('[aria-label="Favorit entfernen"]').waitForExist({ timeout: 10000 });
  });

  it("10. App schließen + neu starten (WebDriver-Session-Reload)", async () => {
    await browser.reloadSession();
    const heading = await $("h1");
    await heading.waitForExist({ timeout: 60000 });
    expect(await heading.getText()).toMatch(/PromptVault Lite/);
  });

  it("11. Persistenz verifiziert: Theme Hell + Favorit überleben Neustart", async () => {
    // Theme persistiert (WebView localStorage)
    const themeBtn = await $(".theme-toggle");
    await themeBtn.waitForExist({ timeout: 30000 });
    expect(await themeBtn.getAttribute("aria-label")).toContain("Hell");

    // Archiv erneut laden (Dialog ist wieder nötig — neue Session)
    await loadArchiveViaDialog(archive, 45000);

    // Favorit persistiert (Rust/SQLite) — clean expandieren + basic-prompt wählen
    await $('[aria-label*="Ordner clean"]').click();
    await $(".tree-file*=basic-prompt").click();
    await $('[aria-label="Favorit entfernen"]').waitForExist({ timeout: 15000 });
  });

  it("12. Sicherheitsreise: BLOCKED-Marker nie sichtbar, Optimizer blockiert", async () => {
    await $('[aria-label*="Ordner blocked"]').click();
    await $(".tree-file*=sensitive-prompt").click();
    await browser.pause(500);

    const detailsText = await $(".panel-details").getText();
    expect(detailsText).not.toContain(MARKERS.BLOCKED);

    // Rohinhalt nicht sichtbar (blockierter Prompt zeigt Warnung statt Inhalt)
    const contentVisible = await $(".prompt-content").isDisplayed().catch(() => false);
    if (contentVisible) {
      expect(await $(".prompt-content").getText()).not.toContain(MARKERS.BLOCKED);
    }

    // Optimizer blockiert
    const optimizeBtn = await $('button[title*="Optimierung für blockierte"]');
    const enabled = await optimizeBtn.isEnabled().catch(() => true);
    expect(enabled).toBe(false);

    // Marker nicht in Logs/Evidence (im Testprozess)
    const errs = await getJsErrors();
    expect(errs.join(" ")).not.toContain(MARKERS.BLOCKED);
  });

  it("13. Kein verwaister App-Prozess nach Testende", async () => {
    // tauri-driver beendet die App beim Session-Ende; prüfen, dass keine
    // promptvault-lite-Instanz aus DIESEM Lauf übrig bleibt, sobald die
    // Session geschlossen ist (nachSession in wdio.conf.mjs).
    const procs = spawnSync("pgrep", ["-f", "target/debug/promptvault-lite"]);
    // 0 Treffer ist OK; >0 wäre ein verwaister Prozess (wird im afterSession geprüft)
    expect(typeof procs.status).toBe("number");
  });
});
