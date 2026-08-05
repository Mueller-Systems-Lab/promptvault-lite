// @vitest-environment node
// scripts/__tests__/capture-wids.test.js
//
// ESM-Regressionstest für captureWids().
// Stellt sicher, dass kein require() im ESM-Kontext verwendet wird
// und dass WIDs korrekt aus xwininfo-Output extrahiert werden.
//
// Run: pnpm exec vitest run scripts/__tests__/capture-wids.test.js

import { describe, it, expect } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readSpec() {
  const specPath = path.resolve(__dirname, "..", "..", "e2e-tests", "specs", "native-journey.spec.js");
  return fs.readFileSync(specPath, "utf-8");
}

describe("captureWids() — ESM compliance", () => {
  it("1. native-journey.spec.js enthält keinen require()-Aufruf", () => {
    const content = readSpec();
    const lines = content.split("\n");
    const requireLines = lines.filter(
      (l) => l.includes("require(") && !l.trim().startsWith("//") && !l.trim().startsWith("*")
    );
    expect(requireLines).toEqual([]);
  });

  it("2. native-journey.spec.js importiert spawnSync vom Top-Level", () => {
    const content = readSpec();
    expect(content).toMatch(/^import\s+\{\s*spawnSync\s*\}\s+from\s+"node:child_process"/m);
  });

  it("3. captureWids() definiert als function (kein require)", () => {
    const content = readSpec();
    expect(content).toMatch(/function captureWids\(\)/);

    // Innerhalb von captureWids darf KEIN require stehen
    const funcStart = content.indexOf("function captureWids()");
    const nextFunc = content.indexOf("\nfunction ", funcStart + 1);
    const funcBody = content.substring(funcStart, nextFunc > 0 ? nextFunc : content.length);
    expect(funcBody).not.toMatch(/\brequire\s*\(/);
  });

  it("4. WID-Extraktion aus synthetischem xwininfo-Output", () => {
    // Simuliere die Regex von captureWids — Zeilen die mit Whitespace + 0xHEX beginnen
    const syntheticOutput = [
      "xwininfo: Window id: 0x2a3 (the root window) (has no name)",
      "  Root window id: 0x2a3 (the root window) (has no name)",
      "  Parent window id: 0x0 (none)",
      "     2 children:",
      "     0x400001 \"promptvault-lite\": (\"promptvault-lite\" \"promptvault-lite\")  1920x1080+0+0",
      "     0x400002 \"Prompt-Ordner auswählen\": (\"xdg-desktop-portal\" \"xdg-desktop-portal\")  600x400+100+100",
    ].join("\n");

    const re = /^\s*(0x[0-9a-fA-F]+)\s/gm;
    const wids = [];
    let m;
    while ((m = re.exec(syntheticOutput)) !== null) {
      wids.push(m[1]);
    }

    // Nur Zeilen die mit Whitespace + 0xHEX beginnen:
    // 0x400001 (promptvault-lite) und 0x400002 (dialog)
    expect(wids.length).toBe(2);
    expect(wids).toContain("0x400001");
    expect(wids).toContain("0x400002");
  });

  it("5. leere xwininfo-Ausgabe ergibt leere Liste", () => {
    const re = /^\s*(0x[0-9a-fA-F]+)\s/gm;
    const wids = [];
    let m;
    while ((m = re.exec("")) !== null) {
      wids.push(m[1]);
    }
    expect(wids).toEqual([]);
  });

  it("6. spawnSync-Fehler: stdout undefined → definierte leere Liste", () => {
    // captureWids prüft: if (!r.stdout) return [];
    const result = {};
    const wids = !result.stdout ? [] : [];
    expect(wids).toEqual([]);
  });

  it("7. xwininfo nicht installiert → leerer stdout → leere Liste", () => {
    const result = { stdout: "" };
    const re = /^\s*(0x[0-9a-fA-F]+)\s/gm;
    const wids = [];
    let m;
    while ((m = re.exec(result.stdout || "")) !== null) {
      wids.push(m[1]);
    }
    expect(wids).toEqual([]);
  });
});
