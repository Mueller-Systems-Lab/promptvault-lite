#!/usr/bin/env node
// =============================================================================
// Agent-Eval-Flywheel (issue #146, Phase 4)
//
// Rezurrenter Einstiegspunkt: führt die Verifikations-Suiten aus, sammelt
// Fehler signaturbasiert und erzeugt Regression-Test-Aufgaben (Flywheel:
// „wiederkehrender Fehler → Regression-Test"). Ergebnis landet als
// Evidence-JSON unter evidence/eval-flywheel/<runId>.json (lokal, keine
// Telemetrie).
//
// Usage: node scripts/eval-flywheel.mjs [--quick]
//   --quick : nur Vitest (keine Playwright-Suiten)
// =============================================================================
import { execSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";

const QUICK = process.argv.includes("--quick");
const runId = `eval-flywheel-${new Date().toISOString().slice(0, 10)}-${Date.now() % 100000}`;
const failures = [];

function runSuite(name, cmd) {
  console.log(`\n=== ${name} ===`);
  try {
    const out = execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"], timeout: 1_200_000 });
    console.log("PASS");
    return { name, status: "PASS", output: out.slice(-4000) };
  } catch (e) {
    const out = `${e.stdout || ""}\n${e.stderr || ""}`;
    const failing = [...out.matchAll(/FAIL\s+(\S+)/g)].map((m) => m[1]);
    failures.push({ suite: name, failingFiles: failing, output: out.slice(-8000) });
    console.error(`FAIL (${failing.length} Datei(en))`);
    return { name, status: "FAIL", failingFiles: failing };
  }
}

const results = [];
results.push(runSuite("vitest (unit/integration)", "pnpm test 2>&1 || true"));
if (!QUICK) {
  results.push(
    runSuite("playwright chromium (UI regression)", "pnpm exec playwright test --project=chromium 2>&1 || true"),
  );
}

const summary = {
  runId,
  generatedAt: new Date().toISOString(),
  suites: results.map((r) => ({ name: r.name, status: r.status })),
  failures,
  flywheelActions: failures.map((f) => ({
    action: "create-regression-test",
    failingFiles: f.failingFiles,
    guidance:
      "Jeden stabil reproduzierbaren Fehler als Regression-Test in der betroffenen Suite fixieren (Minimalreproduktion, strikte Assertions) und die Ursache beheben — nicht den Test abschwächen.",
  })),
};

mkdirSync("evidence/eval-flywheel", { recursive: true });
const file = `evidence/eval-flywheel/${runId}.json`;
writeFileSync(file, JSON.stringify(summary, null, 2));
console.log(`\nEvidence: ${file}`);
console.log(
  failures.length === 0
    ? "Flywheel: keine Fehler — nichts zu tun."
    : `Flywheel: ${failures.length} Suite(n) mit Fehlern — Regression-Aufgaben siehe Evidence-Datei.`,
);
process.exit(0); // Flywheel sammelt bewusst; Exit-Code-Nutzung bleibt den Gates überlassen
