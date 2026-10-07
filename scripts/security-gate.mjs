#!/usr/bin/env node
// =============================================================================
// Security Gate (issue #136 / J5, epic #97)
// Prüft die Web/LAN-Komponenten auf harte Sicherheitsinvarianten:
//   G1 — Server-Default-Bind ist NICHT 0.0.0.0 (LAN-Exposure nur per Opt-in)
//   G2 — Read-only-Default im Server (PROMPTVAULT_SERVER_READ_ONLY)
//   G3 — Keine Secrets/Anmeldedaten in Deploy-Artefakten
//   G4 — Path-Traversal-Validierung vorhanden und getestet
//   G5 — Frontend-Isolation: HTTP-Adapter ohne Tauri-API-Nutzung
//   G7 — Docker-Workspace-Quelle und benannte Build-Context-Ausschlüsse
// Exit 1 bei Verletzung. Ausgeführt in CI (Job security-gate) und lokal.
// =============================================================================
import { readFileSync, existsSync } from "node:fs";
import { execSync } from "node:child_process";

const failures = [];
const check = (name, fn) => {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
};
const read = (p) => readFileSync(p, "utf8");
const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

console.log("=== PromptVault Security Gate (Web/LAN) ===");

check("G1 — Server-Default-Bind ist Loopback", () => {
  const cfg = read("crates/promptvault-server/src/config.rs");
  assert(cfg.includes('"127.0.0.1"'), "Default-Host 127.0.0.1 fehlt");
  // 0.0.0.0 darf NICHT als Default auftauchen (nur als expliziter Testfall)
  const defaultLine = cfg
    .split("\n")
    .filter((l) => l.includes("0.0.0.0") && !l.trim().startsWith("//"));
  assert(
    defaultLine.length === 0 ||
      !defaultLine.some((l) => l.includes("=> 0.0.0.0") || l.includes('=> "0.0.0.0"')),
    "0.0.0.0 darf kein Default-Bind sein",
  );
});

check("G2 — Read-only-Default im Server", () => {
  const cfg = read("crates/promptvault-server/src/config.rs");
  assert(/read_only/i.test(cfg), "read_only-Flag fehlt");
  // Der Default-Zweig muss read_only=true erzeugen (fehlende Env → true)
  assert(
    /Err\(_\) => true|_ => true/.test(cfg.replace(/\/\/[^\n]*/g, "")) ||
      /unwrap_or\(true\)/.test(cfg),
    "Read-only-Default nicht als Fallback gefunden",
  );
  const guard = read("crates/promptvault-server/src/routes/mod.rs");
  assert(guard.includes("require_writable"), "Write-Guard fehlt in Routes");
});

check("G3 — Keine Secrets in Deploy-Artefakten", () => {
  for (const f of ["deploy/docker-compose.yml", "deploy/.env.example", "deploy/Dockerfile"]) {
    assert(existsSync(f), `${f} fehlt`);
    const c = read(f);
    for (const pattern of [
      /-----BEGIN [A-Z ]*PRIVATE KEY-----/,
      /AKIA[0-9A-Z]{16}/,
      /gh[opsur]_[0-9a-zA-Z]{36}/,
      /github_pat_[0-9a-zA-Z]{22,}/,
      /sk_live_[0-9a-zA-Z]{24}/,
      /password\s*[:=]\s*["'][^"']{4,}["']/i,
    ]) {
      assert(!pattern.test(c), `Secret-Muster ${pattern} in ${f}`);
    }
  }
  assert(!existsSync("deploy/.env"), "deploy/.env ist committet — verboten");
});

check("G4 — Path-Traversal-Validierung + Tests vorhanden", () => {
  const scan = read("crates/promptvault-server/src/routes/scan.rs");
  assert(scan.includes('".."'), "Traversal-Prüfung ('..') fehlt in scan.rs");
  assert(scan.includes("is_absolute"), "Absolut-Pfad-Prüfung fehlt in scan.rs");
  assert(scan.includes("canonicalize"), "Canonicalize fehlt in scan.rs");
  const tests = read("crates/promptvault-server/tests/server_api.rs");
  assert(tests.includes("path_traversal"), "Traversal-Red-Test fehlt");
  assert(tests.includes("rejects_relative_paths"), "Relative-Pfad-Red-Test fehlt");
});

check("G5 — Frontend-Isolation: HTTP-Adapter ohne Tauri-API", () => {
  const adapter = read("src/lib/backend/httpAdapter.ts");
  assert(!adapter.includes("@tauri-apps"), "HTTP-Adapter importiert Tauri-APIs");
  assert(!adapter.includes("__TAURI_INTERNALS__"), "HTTP-Adapter nutzt Tauri-Internals");
  const detect = read("src/lib/backend/detect.ts");
  assert(detect.includes("hasTauriInternals"), "Detection fehlt");
});

check("G7 — Docker-Workspace-Copy und benannte Context-Ausschlüsse", () => {
  const dockerfile = read("deploy/Dockerfile");
  assert(
    dockerfile.includes("FROM rust:1.85-slim AS rust-build"),
    "Rust-Builder-Image muss rust:1.85-slim sein",
  );
  assert(
    dockerfile.includes("COPY src-tauri/src/lib.rs ./src-tauri/src/lib.rs"),
    "Dockerfile kopiert den src-tauri Library-Target-Root nicht",
  );
  assert(
    dockerfile.includes("--create-home --home-dir /home/promptvault promptvault"),
    "Runtime-User braucht ein beschreibbares Home für die Server-Datenbank",
  );

  const compose = read("deploy/docker-compose.yml");
  assert(
    /build:\s*\r?\n\s+context:\s*\.\.\s*\r?\n\s+dockerfile:\s*deploy\/Dockerfile/.test(compose),
    "Compose muss den Repo-Root als Context und deploy/Dockerfile verwenden",
  );

  const dockerignore = read(".dockerignore");
  for (const path of [
    "/Promps/",
    "/.aws/",
    "/.git/",
    "/deploy/.env",
    "**/node_modules/",
    "**/target/",
  ]) {
    assert(dockerignore.split("\n").some((line) => line.trim() === path), `${path} fehlt in .dockerignore`);
  }
});

// Traversal-/Isolation-Tests laufen lassen (schnell, deterministisch)
check("G6 — Server-Traversal- und Isolation-Tests grün", () => {
  // execSync wirft bei Nicht-Null-Exit — KEINE Tail-Pipe (would mask failures)
  execSync("cargo test -p promptvault-server scan_", {
    stdio: "pipe",
    cwd: process.cwd(),
    env: { ...process.env, CARGO_TARGET_DIR: process.env.CARGO_TARGET_DIR || "target" },
  });
});

console.log(
  failures.length === 0
    ? "=== Security Gate: PASS ==="
    : `=== Security Gate: FAIL (${failures.length}) ===`,
);
process.exit(failures.length === 0 ? 0 : 1);
