// scripts/e19-gate.mjs — E19 Native Tauri Real E2E, verwendet pre-built Artifact.
//
// Das Binary wird vom build-tauri-debug-Job gebaut, als tar.gz hochgeladen,
// im CI-Workflow heruntergeladen und via SHA-256+Exec-Bit geprüft.
// Dieses Skript führt NUR den WebDriver-Testlauf unter xvfb aus.
//
// SHA-256-Manifest ist MANDATORY im CI-Pfad. Hash wird vor und nach
// dem Test erfasst, um nachzuweisen dass exakt dasselbe unveränderte
// Binary geprüft wurde.
//
// E18, E19 und E20 testen damit exakt dasselbe unveränderte Binary.
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
    console.error(`E19-Gate: ${cmd} konnte nicht gestartet werden:`, res.error.message);
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
  console.error(`E19-Gate: Binary not found at ${binary}`);
  console.error("  Run the build-tauri-debug job first or build locally with:");
  console.error("  pnpm tauri build --debug --bundles deb,rpm");
  process.exit(3);
}
try {
  fs.accessSync(binary, fs.constants.X_OK);
} catch {
  console.error(`E19-Gate: Binary is not executable: ${binary}`);
  process.exit(4);
}

// (2) SHA-256 manifest is MANDATORY. Verify the binary matches.
const sha256Path = path.join(ROOT, "tauri-debug-artifacts.sha256");
if (!fs.existsSync(sha256Path)) {
  console.error("E19-Gate: SHA-256 manifest missing — tauri-debug-artifacts.sha256 not found");
  process.exit(5);
}
const check = spawnSync("sha256sum", ["--check", sha256Path], {
  cwd: ROOT,
  encoding: "utf-8",
});
if (check.status !== 0) {
  console.error("E19-Gate: Artifact SHA-256 mismatch — binary does not match manifest");
  console.error(check.stderr || check.stdout);
  process.exit(6);
}

// (3) Capture pre-test binary hash.
const preHash = sha256File(binary);
console.log(`E19-Gate: pre-test SHA-256: ${preHash}`);

// (4) Native wdio-Journey unter xvfb — NUR native-journey.spec.js (E19).
// E21 (native-dialog-smoke) läuft als separater Job mit eigenem Gate-Script.
const wdioStatus = run(
  "xvfb-run",
  [
    "--auto-servernum", "pnpm", "exec", "wdio", "run",
    "e2e-tests/wdio.conf.mjs",
    "--spec", "e2e-tests/specs/native-journey.spec.js",
  ],
  { timeout: 900000 },
);

// (5) Capture post-test binary hash and verify it is unchanged.
const postHash = sha256File(binary);
console.log(`E19-Gate: post-test SHA-256: ${postHash}`);
if (preHash !== postHash) {
  console.error(
    `E19-Gate: Binary hash mismatch after test — pre=${preHash} post=${postHash}`
  );
  process.exit(7);
}

process.exit(wdioStatus);
