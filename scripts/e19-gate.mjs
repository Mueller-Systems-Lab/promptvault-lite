// scripts/e19-gate.mjs — E19 Native Tauri Real E2E, hermetic.
//
// Warum ein eigener Build: E8 (cargo test --workspace) überschreibt das
// Debug-Binary per Plain-Cargo. Ein Plain-Cargo-Debug-Binary lädt die
// Frontend-Assets über devUrl (localhost:1420) statt aus der eingebetteten
// dist → die App rendert unter WebDriver einen weißen Schirm. Nur der
// tauri-CLI-Build erzeugt ein selbstständig lauffähiges Binary.
//
// Ablauf: (1) Binary via tauri CLI bauen (inkrementell), (2) wdio-Journey
// unter xvfb ausführen, (3) Exit-Code von wdio durchreichen.
import { spawnSync } from "node:child_process";
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

// (1) Selbstständiges Debug-Binary bauen (embedded dist + Bundle-Infos).
const buildStatus = run(
  "pnpm",
  ["tauri", "build", "--debug", "--bundles", "deb"],
  { timeout: 900000 },
);
if (buildStatus !== 0) {
  console.error(`E19-Gate: tauri build --debug fehlgeschlagen (exit ${buildStatus})`);
  process.exit(buildStatus);
}

// (2) Native wdio-Journey unter xvfb (echter GTK-Dialog via XTEST).
const wdioStatus = run(
  "xvfb-run",
  ["--auto-servernum", "pnpm", "exec", "wdio", "run", "e2e-tests/wdio.conf.mjs"],
  { timeout: 900000 },
);

process.exit(wdioStatus);
