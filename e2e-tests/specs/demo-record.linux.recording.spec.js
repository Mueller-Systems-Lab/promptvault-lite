// e2e-tests/specs/demo-record.linux.recording.spec.js
//
// PROMPTVAULT LITE — LINUX DEMO RECORDING SPEC (2026-08-19)
// ---------------------------------------------------------------------------
// Same real release-binary flow as demo-record.linux.spec.js (dry-run proof,
// 11/11 PASS) but with human-paced holds for the clean video take:
//   OPEN -> CREATE -> SAVE -> ANALYZE -> MISSING INFO -> DIRECTION/VARIANTS
//   -> SELECT -> APPLY -> DIRTY -> SAVE(final) -> FINAL RESULT
// Privacy-at-source: the details panel is scrolled ~260px once (real DOM
// scroll, user-visible) so the Pfad row and TTS block leave the frame.
// All waits are live waits on the real binary — nothing fabricated.

import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DEMO_VAULT = process.env.PVL_DEMO_VAULT || "/tmp/promptvault-demo";
const DEMO_TITLE = "Hamburg Städtetrip";
const DEMO_CONTENT = [
  "Plane einen dreitägigen Städtetrip nach Hamburg.",
  "Berücksichtige Budget, Interessen, Unterkunft und tägliche Route.",
].join("\n");

// ---------------------------------------------------------------------------
// Helpers (identical semantics to the dry-run spec; pacing added inline)
// ---------------------------------------------------------------------------

async function loadVaultViaPublicRestore(vault) {
  await browser.execute((p) => {
    localStorage.setItem("promptvault.lastFolder", p);
  }, vault);
  await browser.refresh();
  await $("h1").waitForExist({ timeout: 90000 });
  const statusbar = await $(".app-statusbar");
  await statusbar.waitForExist({ timeout: 30000 });
  await browser.waitUntil(
    async () => (await statusbar.getText()).includes("Prompt"),
    { timeout: 30000, timeoutMsg: "Statusbar zeigt keinen Prompt-Zähler nach Restore" },
  );
  // PRIVACY FIX AT SOURCE (mandate §30): hide the "Pfad" metadata row for the
  // public take. The synthetic vault path (/tmp/promptvault-demo/...) must not
  // be visible on camera. Injected once after reload — React state changes do
  // not reset <head> styles. (Demo-setup fix, not post-production redaction.)
  await browser.execute(() => {
    const style = document.createElement("style");
    style.id = "pvl-demo-privacy-hide-path";
    style.textContent =
      ".panel-details .meta-row:has(.meta-path) { display: none !important; }";
    document.head.appendChild(style);
  });
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
        const checked = await input.getAttribute("aria-checked");
        if (checked === "false" || checked === null) {
          await input.click();
          filled += 1;
        }
      }
    } catch {
      // skip unserviceable control
    }
    await browser.pause(120);
  }
  return filled;
}

/** Scrolls the details panel content down once (privacy: hides Pfad + TTS). */
async function scrollDetailsPanelDown() {
  await browser.execute((el) => {
    if (el) el.scrollTop = 260;
  }, await $(".panel-details .panel-content"));
  await browser.pause(800);
}

describe("PVL Linux Demo — real release binary flow (RECORDING take)", function () {
  it("OPEN: startup-restore des neutralen Demo-Vaults", async function () {
    await loadVaultViaPublicRestore(DEMO_VAULT);
    await expandAllFolders();
    const statusbar = await $(".app-statusbar");
    const statusText = await statusbar.getText();
    console.log("STATUSBAR_OPEN:", statusText);
    await browser.pause(5000); // human-paced hold on the restored vault
  });

  it("CREATE: Neuen Prompt anlegen (Titel + Inhalt)", async function () {
    await $('button[aria-label="Neuen Prompt erstellen"]').click();
    await $('[role="dialog"][aria-label="Neuen Prompt erstellen"]').waitForExist({
      timeout: 10000,
    });
    await browser.pause(500);
    await $("#prompt-editor-title").setValue(DEMO_TITLE);
    await browser.pause(500);
    await $("#prompt-editor-content").setValue(DEMO_CONTENT);
    await browser.pause(800);
    const saveBtn = $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"] .modal-footer button.btn-primary',
    );
    await saveBtn.waitForEnabled({ timeout: 5000 });
    await browser.pause(1200); // show the enabled save button
  });

  it("SAVE: Prompt speichern -> Tree-Eintrag", async function () {
    const saveBtn = $(
      '[role="dialog"][aria-label="Neuen Prompt erstellen"] .modal-footer button.btn-primary',
    );
    await saveBtn.click();
    await browser.pause(3000); // watcher debounce (real)
    const target = path.join(DEMO_VAULT, `${DEMO_TITLE}.md`);
    expect(fs.existsSync(target)).toBe(true);
    await dismissModals();
    await expandAllFolders();
    const fileNode = await $(`.tree-file*=Hamburg`);
    await fileNode.waitForExist({ timeout: 15000 });
    await browser.pause(1500);
  });

  it("ANALYZE: Datei öffnen, Details scrollen, analysieren, Score", async function () {
    const fileNode = await $(`.tree-file*=Hamburg`);
    await fileNode.click();
    const details = await $(".panel-details");
    await details.waitForExist({ timeout: 10000 });
    await browser.pause(1200);
    await scrollDetailsPanelDown(); // privacy: Pfad-Zeile + TTS-Block raus
    const analyzeBtn = await $('button[title="Neu analysieren"]');
    await analyzeBtn.waitForEnabled({ timeout: 10000 });
    await browser.pause(400);
    await analyzeBtn.click();
    const score = await $(".circular-score-value");
    await score.waitForExist({ timeout: 30000 });
    const scoreText = await score.getText();
    console.log("ANALYZE_SCORE:", scoreText);
    expect(parseInt(scoreText, 10)).toBeGreaterThan(0);
    await browser.pause(4000); // hold on rendered score
  });

  it("MISSING INFO: Gate öffnen, REQUIRED beantworten, übernehmen", async function () {
    await dismissModals();
    const gateBtn = await $('[data-testid="gate-actionbar-btn"]');
    await gateBtn.waitForExist({ timeout: 10000 });
    await gateBtn.click();
    const gateDialog = await $('[role="dialog"][aria-label="Fehlende Informationen"]');
    await gateDialog.waitForExist({ timeout: 10000 });
    await browser.pause(800);
    const summary = await $('[data-testid="gate-summary"]');
    const summaryText = await summary.getText();
    console.log("GATE_SUMMARY:", summaryText.replace(/\s+/g, " ").slice(0, 200));
    await browser.pause(1000);
    const filled = await fillGateRequiredInputs();
    console.log("GATE_FILLED_INPUTS:", filled);
    await browser.pause(1000);
    const proceed = await $('[data-testid="gate-btn-proceed"]');
    await proceed.waitForEnabled({ timeout: 10000 });
    await proceed.click();
    await browser.pause(1200);
    await dismissModals(); // closes auto-opened optimizer
  });

  it("DIRECTION: Varianten-Panel, Profil, generieren, Karten", async function () {
    const variantBtn = await $('[data-testid="variant-actionbar-btn"]');
    await variantBtn.waitForExist({ timeout: 10000 });
    await variantBtn.click();
    const panel = await $('[data-testid="variant-panel"]');
    await panel.waitForExist({ timeout: 10000 });
    await browser.pause(800);
    const chip = await $('[data-testid="profile-chip-sachlich"]');
    if (await chip.isExisting()) {
      const pressed = await chip.getAttribute("aria-pressed");
      if (pressed !== "true") {
        await chip.click();
        await browser.pause(400);
      }
    }
    const generateBtn = await $('[data-testid="variant-generate-btn"]');
    await generateBtn.waitForEnabled({ timeout: 10000 });
    await browser.pause(400);
    await generateBtn.click();
    const count = await $('[data-testid="variant-result-count"]');
    await count.waitForExist({ timeout: 60000 });
    const countText = await count.getText();
    console.log("VARIANT_COUNT_TEXT:", countText);
    const countMatch = countText.match(/(\d+)/);
    expect(countMatch).not.toBeNull();
    expect(parseInt(countMatch[1], 10)).toBeGreaterThan(0);
    await browser.pause(4000); // hold on generated cards
  });

  it("SELECT: erste Varianten-Karte expandieren", async function () {
    const cards = await $$('[data-testid^="variant-card-"]');
    expect(cards.length).toBeGreaterThan(0);
    const firstId = await cards[0].getAttribute("data-testid");
    const variantId = firstId.replace("variant-card-", "");
    console.log("SELECTED_VARIANT_ID:", variantId);
    await browser.pause(500);
    const toggle = await $(`[data-testid="variant-content-toggle-${variantId}"]`);
    await toggle.scrollIntoView();
    await browser.pause(300);
    // <summary> inside <details>: WebDriver "interactable" check is flaky here;
    // direct DOM click is still WebDriver-driven (no XTEST) and toggles the
    // native <details> element.
    await browser.execute((el) => {
      el.click();
    }, toggle);
    await browser.pause(500);
    const content = await $(`[data-testid="variant-content-${variantId}"]`);
    await content.waitForExist({ timeout: 10000 });
    const expanded = await browser.execute(
      (id) => {
        const card = document.querySelector(`[data-testid="variant-card-${id}"]`);
        const details = card?.querySelector("details");
        return details ? details.open : false;
      },
      variantId,
    );
    console.log("VARIANT_EXPANDED:", expanded);
    expect(expanded).toBe(true);
    const contentText = await content.getText();
    expect(contentText.length).toBeGreaterThan(50);
    await browser.pause(1800);
  });

  it("APPLY: Übernehmen -> Editor mit Varianteninhalt", async function () {
    const cards = await $$('[data-testid^="variant-card-"]');
    const firstId = await cards[0].getAttribute("data-testid");
    const variantId = firstId.replace("variant-card-", "");
    const applyBtn = await $(`[data-testid="variant-apply-btn-${variantId}"]`);
    await applyBtn.click();
    const editDialog = await $('[role="dialog"][aria-label="Prompt bearbeiten"]');
    await editDialog.waitForExist({ timeout: 10000 });
    await browser.pause(1500);
  });

  it("DIRTY STATE: Ungespeicherte Änderungen sichtbar", async function () {
    const dirty = await $(".editor-dirty-indicator");
    await dirty.waitForExist({ timeout: 5000 });
    const dirtyText = await dirty.getText();
    console.log("DIRTY_INDICATOR:", dirtyText);
    expect(dirtyText).toContain("Ungespeicherte");
    await browser.pause(1800); // hold on dirty state
  });

  it("SAVE final: Speichern -> Datei aktualisiert", async function () {
    const saveBtn = $(
      '[role="dialog"][aria-label="Prompt bearbeiten"] .modal-footer button.btn-primary',
    );
    await saveBtn.waitForEnabled({ timeout: 5000 });
    await saveBtn.click();
    await browser.pause(3000); // watcher debounce (real)
    const editDialog = await $('[role="dialog"][aria-label="Prompt bearbeiten"]');
    await editDialog.waitForExist({ timeout: 5000, reverse: true });
    const target = path.join(DEMO_VAULT, `${DEMO_TITLE}.md`);
    const diskContent = fs.readFileSync(target, "utf-8");
    expect(diskContent.length).toBeGreaterThan(DEMO_CONTENT.length);
    await browser.pause(1500);
  });

  it("FINAL RESULT: erneut analysieren, finaler Score, Inhalt", async function () {
    await dismissModals();
    const analyzeBtn = await $('button[title="Neu analysieren"]');
    await analyzeBtn.waitForEnabled({ timeout: 10000 });
    await analyzeBtn.click();
    const score = await $(".circular-score-value");
    await score.waitForExist({ timeout: 30000 });
    const scoreText = await score.getText();
    console.log("FINAL_SCORE:", scoreText);
    expect(parseInt(scoreText, 10)).toBeGreaterThan(0);
    const statusbar = await $(".app-statusbar");
    const statusText = await statusbar.getText();
    console.log("STATUSBAR_FINAL:", statusText);
    await browser.pause(5500); // closing hold on the final result
  });
});
