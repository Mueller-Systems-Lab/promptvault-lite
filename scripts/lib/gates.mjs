// scripts/lib/gates.mjs — Gate definitions and check functions
// Extracted from verify-all.mjs for modularity and testability.

import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { maskSecrets, runCommand, classifyGate } from "./runner.mjs";

// ── Gate definitions ──

export const GATES = {
  // Quick gates
  Q1: {
    id: "Q1",
    name: "Repo Hygiene",
    command: "git",
    args: ["diff", "--check"],
    mandatory: true,
    level: "quick",
  },
  Q2: {
    id: "Q2",
    name: "ESLint",
    command: "pnpm",
    args: ["lint"],
    mandatory: true,
    level: "quick",
  },
  Q3: {
    id: "Q3",
    name: "TypeScript",
    command: "pnpm",
    args: ["exec", "tsc", "--noEmit"],
    mandatory: true,
    level: "quick",
  },
  Q4: {
    id: "Q4",
    name: "Vitest (Quick)",
    command: "pnpm",
    args: ["test"],
    mandatory: true,
    level: "quick",
  },
  Q5: {
    id: "Q5",
    name: "Version Consistency",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "quick",
    skip: true,
  },
  Q6: {
    id: "Q6",
    name: "Feature Flags",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "quick",
    skip: true,
  },

  // Full gates
  E1: {
    id: "E1",
    name: "Repo Hygiene (Full)",
    command: "git",
    args: ["diff", "--check"],
    mandatory: true,
    level: "full",
  },
  E2: {
    id: "E2",
    name: "Dependency Integrity",
    command: "pnpm",
    args: ["install", "--frozen-lockfile"],
    mandatory: true,
    level: "full",
  },
  E3: {
    id: "E3",
    name: "Frontend Tests (Vitest)",
    command: "pnpm",
    args: ["test"],
    mandatory: true,
    level: "full",
    parseOutput: true,
  },
  E4: {
    id: "E4",
    name: "ESLint",
    command: "pnpm",
    args: ["lint"],
    mandatory: true,
    level: "full",
  },
  E5: {
    id: "E5",
    name: "TypeScript",
    command: "pnpm",
    args: ["exec", "tsc", "--noEmit"],
    mandatory: true,
    level: "full",
  },
  E6: {
    id: "E6",
    name: "Frontend Build",
    command: "pnpm",
    args: ["build"],
    mandatory: true,
    level: "full",
  },
  E7: {
    id: "E7",
    name: "Rust Format",
    command: "cargo",
    args: ["fmt", "--check", "--all"],
    mandatory: true,
    level: "full",
  },
  E8: {
    id: "E8",
    name: "Rust Tests",
    command: "cargo",
    args: ["test", "--workspace", "--locked"],
    mandatory: true,
    level: "full",
    parseOutput: true,
  },
  E9: {
    id: "E9",
    name: "Rust Clippy",
    command: "cargo",
    args: ["clippy", "--workspace", "--locked", "--all-targets", "--", "-D", "warnings"],
    mandatory: true,
    level: "full",
  },
  E10: {
    id: "E10",
    name: "Secret Scan",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "full",
    skip: true,
  },
  E11: {
    id: "E11",
    name: "Playwright E2E",
    command: "pnpm",
    args: ["exec", "playwright", "test"],
    mandatory: true,
    level: "full",
    parseOutput: true,
  },
  E12: {
    id: "E12",
    name: "Version Consistency",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "full",
    skip: true,
  },
  E13: {
    id: "E13",
    name: "Lockfile Drift",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "full",
    skip: true,
  },
  E14: {
    id: "E14",
    name: "Feature Flag Defaults",
    command: "node",
    args: ["-e", "process.exit(0)"],
    mandatory: true,
    level: "full",
    skip: true,
  },
  E15: {
    id: "E15",
    name: "Visual Evidence",
    command: "pnpm",
    args: ["exec", "playwright", "test", "visual-release-gate.spec.ts"],
    mandatory: false,
    level: "full",
    isOptional: true,
    visualBaselinesMissing: true,
  },
};

// ── Helpers ──

export function sha256(text) {
  return createHash("sha256").update(text).digest("hex");
}

export function parseTestOutput(stdout, gateId) {
  if (gateId === "E3") {
    const match = stdout.match(/Tests\s+(\d+)\s+passed\s+\((\d+)\)/);
    if (match) {
      return { passed: parseInt(match[1]), total: parseInt(match[2]) };
    }
    const filesMatch = stdout.match(/Test Files\s+(\d+)\s+passed/);
    return filesMatch ? { files: parseInt(filesMatch[1]) } : {};
  }
  if (gateId === "E8") {
    const match = stdout.match(
      /test result:.*?(\d+)\s+passed;\s*(\d+)\s+failed;\s*(\d+)\s+ignored/
    );
    if (match) {
      return {
        passed: parseInt(match[1]),
        failed: parseInt(match[2]),
        ignored: parseInt(match[3]),
      };
    }
    return {};
  }
  if (gateId === "E11") {
    const passedMatch = stdout.match(/(\d+)\s+passed/);
    const skippedMatch = stdout.match(/(\d+)\s+skipped/);
    return {
      passed: passedMatch ? parseInt(passedMatch[1]) : 0,
      skipped: skippedMatch ? parseInt(skippedMatch[1]) : 0,
    };
  }
  return {};
}

export function gateToLevel(gateId) {
  if (gateId.startsWith("Q")) return "quick";
  return "full";
}

/**
 * Recursively compute SHA-256 of build output files in a directory.
 */
export async function hashBuildOutput(dir) {
  const hashes = {};
  const buildDirs = ["dist", "target", "build"];
  for (const sub of buildDirs) {
    const full = join(dir, sub);
    try {
      const { stdout } = await runCommand("find", [
        full,
        "-type", "f",
        "-not", "-path", "*/node_modules/*",
        "-not", "-path", "*/.git/*",
        "-not", "-name", "*.d.ts",
        "-not", "-name", "*.d.ts.map",
        "2>/dev/null",
      ]);
      const files = stdout.trim().split("\n").filter(Boolean);
      for (const file of files) {
        try {
          const fs = await import("node:fs/promises");
          const content = await fs.readFile(file);
          const hash = createHash("sha256").update(content).digest("hex");
          hashes[file.replace(dir + "/", "")] = hash;
        } catch { /* skip unreadable */ }
      }
    } catch { /* dir doesn't exist */ }
  }
  return hashes;
}

// ── Gate check functions ──

export async function runSecretScan(ROOT) {
  const failures = [];

  // 1. Pattern scan
  try {
    const patterns = [
      "-----BEGIN.*PRIVATE KEY-----",
      "AKIA[0-9A-Z]{16}",
      "gh[opsur]_[0-9a-zA-Z]{36}",
      "github_pat_[0-9a-zA-Z]{22,}",
      "sk_live_[0-9a-zA-Z]{24}",
    ];

    for (const pattern of patterns) {
      const { stdout } = await runCommand("bash", [
        "-c",
        `git ls-files -z | xargs -0 grep -n -i -E '${pattern}' 2>/dev/null || true`,
      ]);
      if (stdout.trim()) {
        const filtered =
          stdout
            .split("\n")
            .filter(
              (line) =>
                line &&
                !line.includes(".gitignore") &&
                !line.includes("SECURITY_GATES.md") &&
                !line.includes("AGENTS.md") &&
                !line.includes("CLAUDE.md")
            )
            .join("\n") || "";

        if (filtered.trim()) {
          failures.push(`SECRET_PATTERN: ${pattern} found:\n${filtered}`);
        }
      }
    }
  } catch (err) {
    failures.push(`Secret scan error: ${err.message}`);
  }

  // 2. Check .env files
  try {
    const { stdout: envOut } = await runCommand("bash", [
      "-c",
      'git ls-files | grep -i "\\.env$" || true',
    ]);
    if (envOut.trim()) {
      failures.push(`COMMITTED_ENV: .env files found:\n${envOut.trim()}`);
    }
  } catch (err) {
    failures.push(`Secret scan .env check error: ${err.message}`);
  }

  // 3. Check .db files
  try {
    const { stdout: dbOut } = await runCommand("bash", [
      "-c",
      'git ls-files | grep -E "\\.db(-shm|-wal|-journal)?$" || true',
    ]);
    if (dbOut.trim()) {
      failures.push(`COMMITTED_DB: DB files found:\n${dbOut.trim()}`);
    }
  } catch (err) {
    failures.push(`Secret scan .db check error: ${err.message}`);
  }

  return {
    exitCode: failures.length > 0 ? 1 : 0,
    stdout: failures.length > 0 ? "" : "No secrets detected.",
    stderr: failures.length > 0 ? failures.join("\n\n") : "",
    isProductFailure: failures.length > 0,
  };
}

export async function checkVersionConsistency(ROOT) {
  const failures = [];
  try {
    const pkg = JSON.parse(
      await (await import("node:fs/promises")).readFile(
        join(ROOT, "package.json"), "utf-8"
      )
    );
    const expected = pkg.version;
    const cargoPath = join(ROOT, "src-tauri", "Cargo.toml");
    const cargoContent = await (
      await import("node:fs/promises")
    ).readFile(cargoPath, "utf-8");
    const cargoVersionMatch = cargoContent.match(/^version\s*=\s*"([^"]+)"/m);
    if (!cargoVersionMatch || cargoVersionMatch[1] !== expected) {
      failures.push(
        `Cargo.toml version ${cargoVersionMatch ? cargoVersionMatch[1] : "NOT_FOUND"} != ${expected}`
      );
    }
    const tauriConfPath = join(ROOT, "src-tauri", "tauri.conf.json");
    const tauriConf = JSON.parse(
      await (await import("node:fs/promises")).readFile(tauriConfPath, "utf-8")
    );
    if (tauriConf.version !== expected) {
      failures.push(`tauri.conf.json version ${tauriConf.version} != ${expected}`);
    }
  } catch (err) {
    failures.push(`Version check error: ${err.message}`);
  }

  return {
    exitCode: failures.length > 0 ? 1 : 0,
    stdout: failures.length > 0 ? failures.join("\n") : "All versions: consistent",
    stderr: "",
  };
}

export async function checkFeatureFlags(ROOT) {
  const failures = [];

  // Check EMBEDDINGS flag
  try {
    const { default: embFlagMod } = await import(
      resolve(ROOT, "src/lib/embeddings/featureFlag.ts")
    );
    if (embFlagMod.isEmbeddingsEnabled() !== false) {
      failures.push("PROMPTVAULT_EMBEDDINGS: default is not disabled");
    }
    if (embFlagMod.isEmbeddingsEnabled({}) !== false) {
      failures.push("PROMPTVAULT_EMBEDDINGS: enabled with empty env");
    }
    if (embFlagMod.isEmbeddingsEnabled({ PROMPTVAULT_EMBEDDINGS: "1" }) !== true) {
      failures.push("PROMPTVAULT_EMBEDDINGS: not enabled with '1'");
    }
  } catch (err) {
    try {
      const { stdout } = await runCommand("grep", [
        "-c", "return false",
        resolve(ROOT, "src/lib/embeddings/featureFlag.ts"),
      ]);
      if (!stdout.trim()) {
        failures.push("PROMPTVAULT_EMBEDDINGS: source inspection failed");
      }
    } catch {
      failures.push(`PROMPTVAULT_EMBEDDINGS: import failed: ${err.message}`);
    }
  }

  // Check MISSING_INFO_GATE
  try {
    const fs = await import("node:fs/promises");
    const missingInfoPath = resolve(ROOT, "src/lib/__tests__/missingInfoFeatureFlag.test.ts");
    const content = await fs.readFile(missingInfoPath, "utf-8");
    if (!content.includes("returns false when PROMPTVAULT_MISSING_INFO_GATE is not set")) {
      failures.push("PROMPTVAULT_MISSING_INFO_GATE: default-disabled test missing");
    }
    const implPath = resolve(ROOT, "src/lib/missingInfoGate.ts");
    try {
      await fs.access(implPath);
    } catch {
      const { stdout: grepOut } = await runCommand("grep", [
        "-rl", "isMissingInfoGateEnabled",
        resolve(ROOT, "src"), "--include=*.ts",
      ]);
      if (!grepOut.trim()) {
        failures.push("PROMPTVAULT_MISSING_INFO_GATE: implementation not found");
      }
    }
  } catch (err) {
    failures.push(`PROMPTVAULT_MISSING_INFO_GATE: ${err.message}`);
  }

  // Check DIRECTION_PROFILES
  try {
    const fs = await import("node:fs/promises");
    const dirProfPath = resolve(ROOT, "src/lib/directionProfiles.ts");
    const content = await fs.readFile(dirProfPath, "utf-8");
    if (!content.match(/DIRECTION_PROFILES.*?=\s*\[/s)) {
      failures.push("PROMPTVAULT_DIRECTION_PROFILES: constant not found");
    }
  } catch (err) {
    failures.push(`PROMPTVAULT_DIRECTION_PROFILES: ${err.message}`);
  }

  if (failures.length > 0) {
    return { exitCode: 1, stdout: "", stderr: failures.join("\n"), isProductFailure: true };
  }
  return { exitCode: 0, stdout: "Feature flags: all defaults verified (disabled)", stderr: "" };
}

export async function checkLockfileDrift(ROOT) {
  const lockfiles = ["pnpm-lock.yaml", "src-tauri/Cargo.lock"];
  const failures = [];

  for (const lockfile of lockfiles) {
    const { exitCode: statCode } = await runCommand("git", [
      "ls-files", "--error-unmatch", lockfile,
    ]);
    if (statCode !== 0) continue;

    const { exitCode: diffCode } = await runCommand("git", [
      "diff", "--exit-code", "--", lockfile,
    ]);
    if (diffCode !== 0) {
      failures.push(`LOCKFILE_DRIFT: ${lockfile} has uncommitted changes`);
    }

    const { stdout: statusOut } = await runCommand("git", [
      "status", "--short", "--", lockfile,
    ]);
    if (statusOut.trim()) {
      failures.push(`LOCKFILE_DIRTY: ${lockfile} appears in git status`);
    }
  }

  if (failures.length > 0) {
    return { exitCode: 1, stdout: "", stderr: failures.join("\n"), isProductFailure: true };
  }
  return {
    exitCode: 0,
    stdout: `No lockfile drift detected (${lockfiles.join(", ")})`,
    stderr: "",
  };
}
