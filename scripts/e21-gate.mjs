// scripts/e21-gate.mjs — E21 Native File Dialog Smoke (ADR-005).
//
// Läuft nur den native-dialog-smoke.spec.js (Deskop-Integrationsgrenze)
// unter xvfb. Verwendet dasselbe pre-built Artifact wie E18/E19/E20.
// Kein eigener Build. SHA-256-Manifest mandatory.
//
// Bekanntes Plattform-Limit: AtkAction ≠ GtkButton.clicked.
// E21 prüft Erkennung + semantische Vermessung des Dialogs,
// schließt ihn sauber via Escape (Standard-Cancel).
import { spawnSync } from "node:child_process";
import * as crypto from "node:crypto";
import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

function run(cmd, args, opts = {}) {
  const res = spawnSync(cmd, args, { cwd: ROOT, stdio: "inherit", ...opts });
  if (res.error) {
    console.error(`E21-Gate: ${cmd} konnte nicht gestartet werden:`, res.error.message);
    process.exit(2);
  }
  return res.status ?? 1;
}

function sha256File(filePath) {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

// (1) Verify the pre-built binary exists and is executable.
const binary = path.join(ROOT, "target", "debug", "promptvault-lite");
if (!fs.existsSync(binary)) {
  console.error(`E21-Gate: Binary not found at ${binary}`);
  process.exit(3);
}
try {
  fs.accessSync(binary, fs.constants.X_OK);
} catch {
  console.error(`E21-Gate: Binary is not executable: ${binary}`);
  process.exit(4);
}

// (2) SHA-256 manifest is MANDATORY.
const sha256Path = path.join(ROOT, "tauri-debug-artifacts.sha256");
if (!fs.existsSync(sha256Path)) {
  console.error("E21-Gate: SHA-256 manifest missing — tauri-debug-artifacts.sha256 not found");
  process.exit(5);
}
const check = spawnSync("sha256sum", ["--check", sha256Path], {
  cwd: ROOT,
  encoding: "utf-8",
});
if (check.status !== 0) {
  console.error("E21-Gate: Artifact SHA-256 mismatch — binary does not match manifest");
  console.error(check.stderr || check.stdout);
  process.exit(6);
}

// (3) Capture pre-test binary hash.
const preHash = sha256File(binary);
console.log(`E21-Gate: pre-test SHA-256: ${preHash}`);

// (4) Run ONLY the dialog smoke spec (nicht die volle E19-Journey).
const wdioStatus = run(
  "xvfb-run",
  [
    "--auto-servernum",
    "pnpm", "exec", "wdio", "run",
    "e2e-tests/wdio.conf.mjs",
    "--spec", "e2e-tests/specs/native-dialog-smoke.spec.js",
  ],
  { timeout: 300000 },
);

// (5) Capture post-test binary hash.
const postHash = sha256File(binary);
console.log(`E21-Gate: post-test SHA-256: ${postHash}`);
if (preHash !== postHash) {
  console.error(
    `E21-Gate: Binary hash mismatch after test — pre=${preHash} post=${postHash}`
  );
  process.exit(7);
}

process.exit(wdioStatus);
