// e2e-tests/specs/native-dialog-smoke.spec.js
//
// E21 — Native File Dialog Smoke (ADR-005, Variante B — Owner-Freigabe 2026-08-05)
// ---------------------------------------------------------------------------
// Der native GTK-Ordnerdialog ist eine Betriebssystem-Integrationsgrenze.
// E19 testet die Produktreise über den echten scan_directory-Invoke; E21
// verifiziert hier die DESKTOP-INTEGRATION: Der echte Dialog erscheint,
// wird über X11 fail-closed erkannt, über AT-SPI semantisch gemappt, und
// der affirmative Default-Button wird gefunden.
//
// Bekanntes Plattform-Limit (10 reproduzierbare Läufe + Run 179):
// AtkAction 'click' löst GtkButton.clicked NICHT aus → Bestätigung schließt
// den Dialog nicht. E21 prüft daher Erkennung + Semantik (nicht die
// Bestätigung) und schließt den Dialog über den Cancel-Pfad (Escape).
// Das ist kein Bestätigungs-Fallback — Escape ist der Standard-Cancel.
//
// Erwartung: 1 passing (Erkennung + semantische Vermessung + sauberer
// Cancel) — bei fehlender Erkennung fail-closed RED.

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const HELPER = path.resolve(__dirname, "..", "helpers", "x11dialog.py");
const ATSPI_HELPER = path.resolve(__dirname, "..", "helpers", "atspi_confirm.py");

/** Extrahiere alle WIDs aus xwininfo -root -tree (Pre-Klick-Snapshot). */
function captureWids() {
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

/** Suche das Dialog-Fenster via xdotool und gib das WID zurück (leer wenn nicht gefunden). */
function findDialogWid(title) {
  const r = spawnSync("xdotool", ["search", "--name", title], {
    encoding: "utf-8",
  });
  return (r.stdout || "").trim();
}

/**
 * Fokussiere ein Fenster per WID und prüfe, ob der Fokus erfolgreich gesetzt wurde.
 * Returns true wenn das Fenster den Fokus hat.
 */
function focusWindow(wid) {
  spawnSync("xdotool", ["windowfocus", wid]);
  // Kurz warten, dann prüfen
  const r = spawnSync("xdotool", ["getwindowfocus"], { encoding: "utf-8" });
  const focused = (r.stdout || "").trim().toLowerCase();
  const widLower = wid.toLowerCase();
  return focused === widLower;
}

/**
 * Schließe ein Fenster deterministisch via WM_DELETE_WINDOW (xdotool windowclose).
 * Das ist der Standard-WM-Close-Mechanismus, kein Kill.
 */
function closeWindow(wid) {
  const r = spawnSync("xdotool", ["windowclose", wid], { encoding: "utf-8" });
  return r.status === 0;
}

describe("E21 — Native File Dialog Smoke (Desktop-Integrationsgrenze)", function () {
  this.timeout(180000);

  it("1. Nativer Dialog erscheint, wird erkannt und semantisch vermessen", async () => {
    const preWids = captureWids();
    expect(preWids.length).toBeGreaterThan(0);

    // Öffnen-Button klicken → echter OS-Dialog (XDG-Portal/GTK)
    const openBtn = await $('button[title*="Ordner öffnen"]');
    await openBtn.waitForEnabled({ timeout: 15000 });
    await openBtn.click();

    // X11-Erkennung fail-closed: x11dialog.py --verify-only Modus ist nicht
    // nötig — wir nutzen den atspi_confirm-Helper direkt mit dem erwarteten
    // Dialogtitel. Der Helper mappt per AT-SPI (PID-frei, Titel-basiert).
    // Zuerst warten, bis der Dialog im X11-Baum erscheint.
    let dialogSeen = false;
    const deadline = Date.now() + 20000;
    while (Date.now() < deadline) {
      const now = captureWids();
      // Neues WID, das nicht im Pre-Snapshot war → Dialog erschienen
      const fresh = now.filter((w) => !preWids.includes(w));
      if (fresh.length > 0) {
        dialogSeen = true;
        console.log(`E21: Dialog-WID(s) neu erschienen: ${fresh.join(",")}`);
        break;
      }
      await browser.pause(500);
    }
    expect(dialogSeen).toBe(true); // fail-closed: kein Dialog → RED

    // AT-SPI-Semantik: Dialog mappen + affirmativen Default-Button finden
    // (verify-only — die bekannte Bestätigungs-Limitierung wird hier nicht
    // umgangen; Erkennung + Semantik sind der Smoke-Gegenstand).
    const r = spawnSync("python3", [
      ATSPI_HELPER,
      "--title", "Prompt-Ordner auswählen",
      "--verify-only",
    ], { encoding: "utf-8", timeout: 30000 });
    const out = (r.stdout || "") + (r.stderr || "");
    console.log("E21 AT-SPI output:", out.split("\n").filter(Boolean).slice(0, 8).join("\n"));

    expect(r.status).toBe(0); // fail-closed: Mapping/Button-Findung muss gelingen
    expect(out).toContain("ATSPI_DIALOG_MAPPED");
    expect(out).toContain("ATSPI_CONFIRM_BUTTON_FOUND");

    // ── Dialog-Abbruch: Fokus → Escape → Close (WM_DELETE_WINDOW Fallback) ──
    // Das verifizierte Dialog-WID erneut ermitteln (es wurde beim Öffnen
    // erkannt). Dieses WID ist der exakte Target für Fokus + Escape.
    const dialogWid = findDialogWid("Prompt-Ordner auswählen");
    expect(dialogWid).not.toBe(""); // fail-closed: Dialog muss noch da sein

    // 1) Fokus explizit auf das Dialog-WID setzen
    const focusOk = focusWindow(dialogWid);
    console.log(`E21: DIALOG_CANCEL_FOCUS_VERIFIED=${focusOk} wid=${dialogWid}`);

    // 2) Escape senden (WebDriver → WebView → X11)
    await browser.keys("Escape");
    await browser.pause(1000);

    // 3) Prüfen, ob der Dialog geschlossen wurde
    const afterEscape = findDialogWid("Prompt-Ordner auswählen");
    console.log(
      `E21: DIALOG_CANCEL_ESCAPE_SENT after="${afterEscape}" (was="${dialogWid}")`
    );

    if (afterEscape !== "") {
      // Escape hat nicht geschlossen → deterministischer WM_DELETE_WINDOW-Fallback.
      // xdotool windowclose sendet WM_DELETE_WINDOW an genau das verifizierte WID,
      // der Window-Manager schließt das Fenster sauber (kein Kill, kein globaler
      // Tastendruck, kein Koordinaten-Klick).
      console.log(`E21: Escape did not close dialog, trying WM_DELETE_WINDOW on ${dialogWid}`);
      const closed = closeWindow(dialogWid);
      console.log(`E21: WM_DELETE_WINDOW sent to ${dialogWid}, result=${closed}`);
      await browser.pause(1000);

      // Erneut prüfen
      const afterClose = findDialogWid("Prompt-Ordner auswählen");
      console.log(`E21: DIALOG_CANCEL_AFTER_WM_DELETE_WINDOW: "${afterClose}"`);
      expect(afterClose).toBe(""); // fail-closed: Dialog muss geschlossen sein
      console.log("E21: DIALOG_CLOSED_AFTER_CANCEL (via WM_DELETE_WINDOW)");
    } else {
      console.log("E21: DIALOG_CLOSED_AFTER_CANCEL (via Escape)");
    }
  });
});
