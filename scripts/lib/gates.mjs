// scripts/lib/gates.mjs — Gate definitions, executors, and validation
//
// Gate Inventory (E1-E20): canonical list per Run Card
// PVL-PR294-NOOP-ELIMINATION-REAL-NATIVE-E2E-CLOSURE-20260804-001
// Invariants:
//   - each gate ID exactly once (no duplicates, no gaps E1..E20)
//   - every gate has a real executor (no `node -e process.exit(0)`, no `skip: true`)
//   - every gate reports executed=true, exit_code, assertion_count or contract,
//     started_at, ended_at
//   - PASS requires executed=true, exit_code=0, no skip, no no-op

import { createHash } from "node:crypto";
import { join, resolve, basename } from "node:path";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { runCommand } from "./runner.mjs";

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

export const FEATURE_FLAGS = [
  {
    flag: "PROMPTVAULT_DIRECTION_PROFILES",
    module: "src/lib/directionFeatureFlag.ts",
    functionName: "isDirectionProfilesEnabled",
    testFiles: ["src/lib/__tests__/directionFeatureFlag.test.ts"],
  },
  {
    flag: "PROMPTVAULT_MISSING_INFO_GATE",
    module: "src/lib/missingInfoFeatureFlag.ts",
    functionName: "isMissingInfoGateEnabled",
    testFiles: ["src/lib/__tests__/missingInfoFeatureFlag.test.ts"],
  },
  {
    flag: "PROMPTVAULT_EMBEDDINGS",
    module: "src/lib/embeddings/featureFlag.ts",
    functionName: "isEmbeddingsEnabled",
    testFiles: ["src/lib/embeddings/__tests__/featureFlag.test.ts"],
  },
];

export const SECRET_PATTERNS = [
  "-----BEGIN.*PRIVATE KEY-----",
  "AKIA[0-9A-Z]{16}",
  "gh[opsur]_[0-9a-zA-Z]{36}",
  "github_pat_[0-9a-zA-Z]{22,}",
  "sk_live_[0-9a-zA-Z]{24}",
];

// ─────────────────────────────────────────────────────────────────────────────
// Gate definitions (Q1-Q6 quick, E1-E20 full)
// ─────────────────────────────────────────────────────────────────────────────

export const GATES = {
  // ── Quick gates (Q1-Q6) ──
  Q1: {
    id: "Q1", name: "Repo Hygiene",
    executor: "command", command: "git", args: ["diff", "--check"],
    contract: "exit-code", mandatory: true, level: "quick",
  },
  Q2: {
    id: "Q2", name: "ESLint",
    executor: "command", command: "pnpm", args: ["lint"],
    contract: "exit-code", mandatory: true, level: "quick",
  },
  Q3: {
    id: "Q3", name: "TypeScript",
    executor: "command", command: "pnpm", args: ["exec", "tsc", "--noEmit"],
    contract: "exit-code", mandatory: true, level: "quick",
  },
  Q4: {
    id: "Q4", name: "Vitest (Quick)",
    executor: "command", command: "pnpm", args: ["test"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "quick",
  },
  Q5: {
    id: "Q5", name: "Version Consistency",
    executor: "version-consistency",
    contract: "executor", mandatory: true, level: "quick",
  },
  Q6: {
    id: "Q6", name: "Secret Scan (Quick)",
    executor: "secret-scan",
    contract: "executor", mandatory: true, level: "quick",
  },

  // ── Full gates (E1-E20) ──
  E1: {
    id: "E1", name: "Repo Hygiene",
    executor: "command", command: "git", args: ["diff", "--check"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E2: {
    id: "E2", name: "Dependency Integrity",
    executor: "command", command: "pnpm", args: ["install", "--frozen-lockfile"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E3: {
    id: "E3", name: "Frontend Unit/Integration",
    executor: "command", command: "pnpm", args: ["test"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "full",
    expectedTestFile: "src/__tests__",
  },
  E4: {
    id: "E4", name: "ESLint",
    executor: "command", command: "pnpm", args: ["lint"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E5: {
    id: "E5", name: "TypeScript",
    executor: "command", command: "pnpm", args: ["exec", "tsc", "--noEmit"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E6: {
    id: "E6", name: "Frontend Build",
    executor: "command", command: "pnpm", args: ["build"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E7: {
    id: "E7", name: "Rust Format",
    executor: "command", command: "cargo", args: ["fmt", "--check", "--all"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E8: {
    id: "E8", name: "Rust Tests",
    executor: "command", command: "cargo",
    args: ["test", "--workspace", "--locked"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "full",
  },
  E9: {
    id: "E9", name: "Rust Clippy",
    executor: "command", command: "cargo",
    args: ["clippy", "--workspace", "--locked", "--all-targets", "--", "-D", "warnings"],
    contract: "exit-code", mandatory: true, level: "full",
  },
  E10: {
    id: "E10", name: "Secret Scan",
    executor: "secret-scan",
    contract: "executor", mandatory: true, level: "full",
  },
  E11: {
    id: "E11", name: "Playwright Renderer E2E (Chromium+Firefox+WebKit)",
    executor: "playwright-browser-matrix",
    contract: "executor", mandatory: true, level: "full",
    expectedTestFile: "tests/e2e/core-flows.spec.ts",
  },
  E12: {
    id: "E12", name: "Version Consistency",
    executor: "version-consistency",
    contract: "executor", mandatory: true, level: "full",
  },
  E13: {
    id: "E13", name: "Lockfile Drift",
    executor: "lockfile-drift",
    contract: "executor", mandatory: true, level: "full",
  },
  E14: {
    id: "E14", name: "Feature Flag Defaults",
    executor: "feature-flag-defaults",
    contract: "executor", mandatory: true, level: "full",
  },
  E15: {
    id: "E15", name: "Visual Structural Evidence",
    executor: "command",
    command: "pnpm", args: ["exec", "playwright", "test", "tests/e2e/visual-release-gate.spec.ts", "--project=chromium", "--reporter=line"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "full",
    expectedTestFile: "tests/e2e/visual-release-gate.spec.ts",
  },
  E16: {
    id: "E16", name: "Accessibility",
    executor: "command",
    command: "pnpm", args: ["exec", "playwright", "test", "tests/e2e/accessibility.spec.ts", "--project=chromium", "--reporter=line"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "full",
    expectedTestFile: "tests/e2e/accessibility.spec.ts",
  },
  E17: {
    id: "E17", name: "Tauri IPC Contract Integration",
    executor: "command",
    command: "pnpm", args: ["exec", "vitest", "run", "src/__tests__/tauri-ipc-integration.test.ts"],
    contract: "test-output", parseOutput: true, mandatory: true, level: "full",
    expectedTestFile: "src/__tests__/tauri-ipc-integration.test.ts",
  },
  E18: {
    id: "E18", name: "Build Artifact Integrity",
    executor: "build-artifact-integrity",
    contract: "executor", mandatory: true, level: "full",
  },
  E19: {
    id: "E19", name: "Native Tauri Real E2E",
    executor: "command",
    command: "node",
    args: ["scripts/e19-gate.mjs"],
    contract: "test-output", parseOutput: true, parseWdio: true,
    mandatory: true, level: "full",
    expectedTestFile: "e2e-tests/specs/native-journey.spec.js",
  },
  E20: {
    id: "E20", name: "Packaging Smoke",
    executor: "packaging-smoke",
    contract: "executor", mandatory: true, level: "full",
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Gate definition validation (Run Card §7)
// ─────────────────────────────────────────────────────────────────────────────

const KNOWN_EXECUTORS = new Set([
  "command",
  "secret-scan",
  "version-consistency",
  "lockfile-drift",
  "feature-flag-defaults",
  "build-artifact-integrity",
  "packaging-smoke",
  "playwright-browser-matrix",
]);

const KNOWN_NOOP_COMMANDS = new Set(["true", "echo", ":"]);
const NOOP_ARG_PATTERN = /process\.exit\(0\)|exit\(0\)/;

/**
 * Validate a gate DEFINITION before execution (Run Card §7, §12).
 * A gate with violations must be classified RED_GATE_IMPLEMENTATION_NOOP.
 *
 * @param {object} gate - gate definition
 * @param {string} [root] - repository root (for expectedTestFile checks)
 * @returns {string[]} list of violations (empty = valid)
 */
export function validateGateDefinition(gate, root) {
  const violations = [];

  if (!gate || typeof gate !== "object") {
    return ["gate definition missing"];
  }
  if (!gate.id) violations.push("missing gate id");
  if (!gate.name) violations.push(`missing gate name (${gate.id || "?"})`);
  if (!gate.executor) {
    violations.push(`${gate.id}: missing executor`);
  } else if (!KNOWN_EXECUTORS.has(gate.executor)) {
    violations.push(`${gate.id}: unknown executor '${gate.executor}'`);
  }

  if (gate.executor === "command") {
    if (!gate.command) {
      violations.push(`${gate.id}: command executor without command`);
    } else if (KNOWN_NOOP_COMMANDS.has(gate.command)) {
      violations.push(`${gate.id}: noop command '${gate.command}'`);
    }
    const argsJson = JSON.stringify(gate.args || []);
    if (NOOP_ARG_PATTERN.test(argsJson)) {
      violations.push(`${gate.id}: noop args contain process.exit(0)`);
    }
  }

  if (gate.skip === true) {
    violations.push(`${gate.id}: mandatory gate has skip:true`);
  }
  if (gate.isOptional === true) {
    violations.push(`${gate.id}: gate must not be optional`);
  }
  if (!gate.contract) {
    violations.push(`${gate.id}: missing contract (exit-code | test-output | executor)`);
  }
  if (gate.expectedTestFile && root) {
    if (!existsSync(join(root, gate.expectedTestFile))) {
      violations.push(`${gate.id}: expected test file/dir missing: ${gate.expectedTestFile}`);
    }
  }
  return violations;
}

/**
 * Validate a gate RESULT after execution (Run Card §8).
 * PASS is only allowed when all invariants hold.
 *
 * @param {object} result - gate result object
 * @returns {string[]} list of violations (empty = valid)
 */
export function validateGateResult(result) {
  const violations = [];
  if (result.executed !== true) violations.push(`${result.gate}: executed !== true`);
  if (typeof result.exit_code !== "number") violations.push(`${result.gate}: missing exit_code`);
  if (!result.started_at) violations.push(`${result.gate}: missing started_at`);
  if (!result.ended_at) violations.push(`${result.gate}: missing ended_at`);
  const hasAssertions = typeof result.assertion_count === "number" && result.assertion_count > 0;
  const hasContract = result.contract_verified === true;
  if (!hasAssertions && !hasContract) {
    violations.push(`${result.gate}: no assertion_count and no verified contract`);
  }
  if (typeof result.skipped === "number" && result.skipped > 0) {
    violations.push(`${result.gate}: skipped=${result.skipped} (>0 not allowed for PASS)`);
  }
  return violations;
}

/**
 * Validate the canonical E1-E20 inventory (Run Card §9).
 * Each E-gate exactly once, no gaps, no extras.
 *
 * @returns {string[]} violations
 */
export function validateGateInventory(gates) {
  const violations = [];
  const ids = Object.keys(gates).filter((id) => id.startsWith("E"));
  for (let n = 1; n <= 20; n += 1) {
    const id = `E${n}`;
    const count = ids.filter((x) => x === id).length;
    if (count === 0) violations.push(`inventory: E${n} missing`);
    if (count > 1) violations.push(`inventory: E${n} duplicated (${count}x)`);
  }
  for (const id of ids) {
    const n = parseInt(id.slice(1), 10);
    if (n < 1 || n > 20) violations.push(`inventory: unexpected gate ${id}`);
  }
  // Detect duplicate ids smuggled via mismatched value.id fields
  for (const [key, gate] of Object.entries(gates)) {
    if (!key.startsWith("E")) continue;
    if (gate && typeof gate.id === "string" && gate.id !== key) {
      violations.push(`inventory: ${key} carries id ${gate.id} (duplicate id)`);
    }
  }
  return violations;
}

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

export function sha256(input) {
  return createHash("sha256").update(input).digest("hex");
}

/** Parse generic test output ("N passed", "M failed"). */
export function parseTestOutput(stdout) {
  const passedMatch = stdout.match(/(\d+)\s+passed/);
  const failMatch = stdout.match(/(\d+)\s+failed/);
  const skipMatch = stdout.match(/(\d+)\s+skipped/);
  const passed = passedMatch ? parseInt(passedMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = skipMatch ? parseInt(skipMatch[1], 10) : 0;
  return { passed, failed, skipped, total: passed + failed + skipped };
}

/** Parse mocha/wdio spec-reporter output ("N passing", "M failing", "K pending"). */
export function parseWdioOutput(stdout) {
  const passMatch = stdout.match(/(\d+)\s+passing/);
  const failMatch = stdout.match(/(\d+)\s+failing/);
  const pendMatch = stdout.match(/(\d+)\s+pending/);
  const passed = passMatch ? parseInt(passMatch[1], 10) : 0;
  const failed = failMatch ? parseInt(failMatch[1], 10) : 0;
  const skipped = pendMatch ? parseInt(pendMatch[1], 10) : 0;
  return { passed, failed, skipped, total: passed + failed + skipped };
}

export function hashBuildOutput(root) {
  const distDir = join(root, "dist");
  if (!existsSync(distDir)) return [];

  const artifacts = [];
  function walk(dir) {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name);
      if (entry.isDirectory()) { walk(full); continue; }
      const content = readFileSync(full);
      artifacts.push({
        relative: full.slice(distDir.length + 1),
        size: content.length,
        sha256: sha256(content),
      });
    }
  }
  walk(distDir);
  return artifacts;
}

/** Build a standardized executor result object. */
function executorResult({ exitCode = 0, stdout = "", stderr = "", assertionCount = 0, artifactCount = 0, isProductFailure = false, extra = null }) {
  return { exitCode, stdout, stderr, assertionCount, artifactCount, isProductFailure, extra };
}

// ─────────────────────────────────────────────────────────────────────────────
// Executors
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Generic command executor. Runs gate.command + gate.args.
 * For parseOutput gates the assertion_count comes from parsed output;
 * the "0 tests executed" case must be RED (Run Card §7).
 */
export async function runCommandExecutor(ctx) {
  const { root, gate } = ctx;
  const result = await runCommand(gate.command, gate.args, {
    cwd: root,
    timeout: 900_000,
  });

  let assertionCount = 0;
  let extra = null;
  if (gate.parseOutput) {
    const metrics = gate.parseWdio
      ? parseWdioOutput(result.stdout)
      : parseTestOutput(result.stdout);
    extra = metrics;
    if (result.exitCode === 0) {
      if (metrics.total === 0 && gate.contract === "test-output") {
        // 0 executed tests must never PASS
        return executorResult({
          exitCode: 2,
          stdout: result.stdout,
          stderr: `${result.stderr}\nNOOP: gate reported 0 executed tests (exit 0 would be a false green)`,
          assertionCount: 0,
          isProductFailure: false,
          extra: metrics,
        });
      }
      assertionCount = metrics.passed > 0 ? metrics.passed : 1;
    }
  } else {
    // exit-code contract gate: one verified contract (exit code 0)
    assertionCount = result.exitCode === 0 ? 1 : 0;
  }

  return executorResult({
    exitCode: result.exitCode,
    stdout: result.stdout,
    stderr: result.stderr,
    assertionCount,
    artifactCount: 0,
    isProductFailure: result.isProductFailure,
    extra,
  });
}

/** E10/Q6 — real secret scan over tracked files. */
export async function runSecretScan(ctx) {
  const { root } = ctx;
  const failures = [];
  let checks = 0;
  let artifacts = 0;

  // 1. Pattern scan over tracked files
  for (const pattern of SECRET_PATTERNS) {
    checks += 1;
    try {
      const { stdout } = await runCommand("bash", [
        "-c",
        `git ls-files -z | xargs -0 grep -n -i -E '${pattern}' 2>/dev/null || true`,
      ], { cwd: root });
      if (stdout.trim()) {
        const filtered = stdout.split("\n").filter((line) =>
          line &&
          !line.includes(".gitignore") &&
          !line.includes("SECURITY_GATES.md") &&
          !line.includes("AGENTS.md") &&
          !line.includes("CLAUDE.md") &&
          !line.includes("runner.test.js") &&
          !line.includes("harness-contract.test.js") &&
          !line.includes("gates.mjs") &&
          !line.includes("runner.mjs") &&
          !line.includes("tauri-ipc-integration.test.ts")
        ).join("\n") || "";
        if (filtered.trim()) {
          failures.push(`SECRET_PATTERN: ${pattern} found:\n${filtered}`);
        }
      }
    } catch (err) {
      failures.push(`Secret scan error: ${err.message}`);
    }
  }

  // 2. .env files
  checks += 1;
  try {
    const { stdout } = await runCommand("bash", [
      "-c", 'git ls-files | grep -i "\\.env$" || true',
    ], { cwd: root });
    if (stdout.trim()) failures.push(`COMMITTED_ENV: .env files found:\n${stdout.trim()}`);
  } catch (err) {
    failures.push(`Secret scan .env check error: ${err.message}`);
  }

  // 3. .db files
  checks += 1;
  try {
    const { stdout } = await runCommand("bash", [
      "-c", 'git ls-files | grep -E "\\.db(-shm|-wal|-journal)?$" || true',
    ], { cwd: root });
    if (stdout.trim()) failures.push(`COMMITTED_DB: Database files found:\n${stdout.trim()}`);
  } catch (err) {
    failures.push(`Secret scan .db check error: ${err.message}`);
  }

  if (failures.length > 0) {
    return executorResult({
      exitCode: 1, stderr: failures.join("\n"), assertionCount: checks,
      artifactCount: artifacts, isProductFailure: true,
    });
  }
  return executorResult({
    exitCode: 0, stdout: `No secrets detected (${checks} checks).`, assertionCount: checks,
  });
}

/** E12/Q5 — version consistency between package.json, Cargo.toml, tauri.conf.json. */
export async function runVersionConsistency(ctx) {
  const { root } = ctx;
  const failures = [];
  const files = {
    packageJson: join(root, "package.json"),
    cargoToml: join(root, "src-tauri", "Cargo.toml"),
    tauriConf: join(root, "src-tauri", "tauri.conf.json"),
  };

  let pkgVersion = null;
  let cargoVersion = null;
  let tauriVersion = null;

  try {
    pkgVersion = JSON.parse(await readFile(files.packageJson, "utf-8")).version;
  } catch (err) {
    failures.push(`package.json unreadable: ${err.message}`);
  }
  try {
    const cargoToml = await readFile(files.cargoToml, "utf-8");
    cargoVersion = cargoToml.match(/^version\s*=\s*"([^"]+)"/m)?.[1] || null;
  } catch (err) {
    failures.push(`Cargo.toml unreadable: ${err.message}`);
  }
  try {
    tauriVersion = JSON.parse(await readFile(files.tauriConf, "utf-8")).version || null;
  } catch (err) {
    failures.push(`tauri.conf.json unreadable: ${err.message}`);
  }

  const versions = { pkgVersion, cargoVersion, tauriVersion };
  const known = Object.entries(versions).filter(([, v]) => v);
  if (new Set(known.map(([, v]) => v)).size > 1) {
    failures.push(`VERSION_MISMATCH: ${JSON.stringify(versions)}`);
  }
  if (!known.length) failures.push("VERSION_UNKNOWN: no version found in any manifest");

  if (failures.length > 0) {
    return executorResult({ exitCode: 1, stderr: failures.join("\n"), assertionCount: 3, artifactCount: 1, isProductFailure: true });
  }
  return executorResult({
    exitCode: 0,
    stdout: `Version consistent: ${pkgVersion} (package.json=Cargo.toml=tauri.conf.json)`,
    assertionCount: 3, artifactCount: 1,
  });
}

/** E13 — lockfile drift: pnpm-lock.yaml and Cargo.lock must be unmodified. */
export async function runLockfileDrift(ctx) {
  const { root } = ctx;
  const lockfiles = ["pnpm-lock.yaml", "src-tauri/Cargo.lock"];
  const failures = [];
  let checked = 0;

  for (const lockfile of lockfiles) {
    const { exitCode: trackedCode } = await runCommand("git", ["ls-files", "--error-unmatch", lockfile], { cwd: root });
    if (trackedCode !== 0) continue;
    checked += 1;
    const { exitCode: diffCode } = await runCommand("git", ["diff", "--exit-code", "--", lockfile], { cwd: root });
    if (diffCode !== 0) failures.push(`LOCKFILE_DRIFT: ${lockfile} has uncommitted changes`);
    const { stdout: statusOut } = await runCommand("git", ["status", "--short", "--", lockfile], { cwd: root });
    if (statusOut.trim()) failures.push(`LOCKFILE_DIRTY: ${lockfile} appears in git status`);
  }

  if (checked === 0) {
    return executorResult({ exitCode: 2, stderr: "LOCKFILE_DRIFT: no tracked lockfiles found", assertionCount: 0, isProductFailure: true });
  }
  if (failures.length > 0) {
    return executorResult({ exitCode: 1, stderr: failures.join("\n"), assertionCount: checked, isProductFailure: true });
  }
  return executorResult({ exitCode: 0, stdout: `No lockfile drift (${checked} lockfiles checked)`, assertionCount: checked });
}

/**
 * E14 — feature flag defaults (Run Card §11).
 * Real checks per flag: default off → PASS; missing definition → RED;
 * contradictory definitions → RED; invalid value → RED.
 * Also executes the existing feature-flag vitest tests.
 */
export async function runFeatureFlagDefaults(ctx) {
  const { root } = ctx;
  const failures = [];
  const assertions = [];

  for (const ff of FEATURE_FLAGS) {
    const modulePath = join(root, ff.module);
    if (!existsSync(modulePath)) {
      failures.push(`FLAG_DEFINITION_MISSING: ${ff.flag} module ${ff.module} not found`);
      continue;
    }
    assertions.push({ flag: ff.flag, check: "module exists", ok: true });

    const source = readFileSync(modulePath, "utf-8");

    // env var constant present
    if (!source.includes(ff.flag)) {
      failures.push(`FLAG_ENV_MISSING: ${ff.flag} not referenced in ${ff.module}`);
    } else {
      assertions.push({ flag: ff.flag, check: "env var referenced", ok: true });
    }

    // exactly one ENABLED_VALUES set and only "1"/"true" are enabled values
    const enabledValueMatches = [...source.matchAll(/ENABLED_VALUES\s*=\s*new Set<string>\(\[([^\]]*)\]\)/g)];
    if (enabledValueMatches.length === 0) {
      failures.push(`FLAG_INVALID_VALUES: ${ff.flag} has no ENABLED_VALUES definition`);
    } else if (enabledValueMatches.length > 1) {
      failures.push(`FLAG_CONTRADICTORY: ${ff.flag} has multiple ENABLED_VALUES definitions`);
    } else {
      const values = [...enabledValueMatches[0][1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
      const invalid = values.filter((v) => v !== "1" && v !== "true");
      if (invalid.length > 0) {
        failures.push(`FLAG_INVALID_VALUES: ${ff.flag} enables non-canonical values: ${invalid.join(", ")}`);
      } else {
        assertions.push({ flag: ff.flag, check: "ENABLED_VALUES canonical", ok: true });
      }
    }

    // default must be false: function returns false when env is undefined
    const fnName = ff.functionName;
    const fnCount = (source.match(new RegExp(`export function ${fnName}`, "g")) || []).length;
    if (fnCount !== 1) {
      failures.push(`FLAG_CONTRADICTORY: ${ff.flag} defines ${fnName} ${fnCount}x (expected exactly 1)`);
    } else if (!source.includes("if (!env) return false;") && !/const raw = env\[[^\]]+\];\s*if \(raw === undefined\) return false;/.test(source)) {
      failures.push(`FLAG_DEFAULT_NOT_OFF: ${ff.flag} default is not verifiably false`);
    } else {
      assertions.push({ flag: ff.flag, check: "default off", ok: true });
    }

    // test files exist
    for (const tf of ff.testFiles) {
      if (!existsSync(join(root, tf))) {
        failures.push(`FLAG_TESTS_MISSING: ${ff.flag} test file ${tf} not found`);
      } else {
        assertions.push({ flag: ff.flag, check: `test file ${basename(tf)}`, ok: true });
      }
    }
  }

  // Execute the real feature-flag vitest suites
  const testFiles = FEATURE_FLAGS.flatMap((ff) => ff.testFiles);
  const vitest = await runCommand("pnpm", ["exec", "vitest", "run", ...testFiles], { cwd: root, timeout: 300_000 });
  assertions.push({ flag: "vitest", check: "feature-flag test execution", ok: vitest.exitCode === 0 });
  if (vitest.exitCode !== 0) {
    failures.push(`FLAG_TESTS_RED: vitest feature-flag suites failed:\n${vitest.stderr || vitest.stdout}`);
  }

  if (failures.length > 0) {
    return executorResult({
      exitCode: 1, stderr: failures.join("\n"), stdout: vitest.stdout,
      assertionCount: assertions.length, isProductFailure: true,
      extra: { assertions },
    });
  }
  return executorResult({
    exitCode: 0,
    stdout: `Feature flags: all defaults verified OFF (${assertions.length} assertions)`,
    assertionCount: assertions.length,
    extra: { assertions },
  });
}

/** E18 — Build Artifact Integrity (Run Card §18). */
export async function runBuildArtifactIntegrity(ctx) {
  const { root } = ctx;
  const binary = join(root, "target", "debug", "promptvault-lite");
  const checks = [];
  const failures = [];
  let artifactCount = 0;

  const add = (name, ok, detail) => {
    checks.push({ check: name, ok, detail: detail || (ok ? "" : `check failed`) });
    if (!ok) failures.push({ check: name, detail: detail || "" });
  };

  // 1. Binary exists — always report path for diagnostics
  add("binary exists", existsSync(binary), binary);
  // 2. Binary executable — mode 644 = infrastructure (artifact transport), not product
  if (existsSync(binary)) {
    const mode = statSync(binary).mode;
    const modeStr = mode.toString(8);
    const isExecutable = (mode & 0o111) !== 0;
    add("binary executable", isExecutable, `mode ${modeStr} (${isExecutable ? "executable" : "NOT EXECUTABLE — artifact transport permission loss"})`);
  }
  // 3. Binary format (ELF on Linux) — always report magic + size
  if (existsSync(binary) && process.platform === "linux") {
    const header = readFileSync(binary).subarray(0, 4);
    const elfMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]);
    add("binary is ELF", header.equals(elfMagic), `magic ${header.toString("hex")}`);
  }
  // 4. Size plausible
  if (existsSync(binary)) {
    const size = statSync(binary).size;
    add("binary size plausible", size > 1024 * 1024 && size < 2 * 1024 * 1024 * 1024, `${size} bytes`);
  }
  // 5. Version embedded in bundled frontend
  let version = null;
  try {
    version = JSON.parse(await readFile(join(root, "package.json"), "utf-8")).version;
  } catch { /* version check below will fail */ }
  if (version) {
    const distIndex = join(root, "dist", "index.html");
    if (!existsSync(distIndex)) {
      add("dist build present", false, "dist/index.html missing — run pnpm build first");
    } else {
      const distFiles = [];
      const walk = (dir) => {
        for (const e of readdirSync(dir, { withFileTypes: true })) {
          const full = join(dir, e.name);
          if (e.isDirectory()) { walk(full); continue; }
          distFiles.push(full);
        }
      };
      if (existsSync(join(root, "dist", "assets"))) walk(join(root, "dist", "assets"));
      const bundled = distFiles.map((f) => readFileSync(f, "utf-8")).join("\n");
      add("version embedded in dist", bundled.includes(version), `v${version} not found in dist assets`);
    }
  }
  // 6. Package artifacts present
  const debDir = join(root, "target", "debug", "bundle", "deb");
  const rpmDir = join(root, "target", "debug", "bundle", "rpm");
  add("deb bundle dir present", existsSync(debDir), debDir);
  if (existsSync(debDir)) {
    const debs = readdirSync(debDir).filter((f) => f.endsWith(".deb"));
    add("deb package present", debs.length > 0, "no .deb in bundle/deb");
    artifactCount += debs.length;
  }
  add("rpm bundle dir present", existsSync(rpmDir), rpmDir);
  // 7. Binary hash captured
  if (existsSync(binary)) {
    const hash = sha256(readFileSync(binary));
    add("binary hash captured", hash.length === 64, "hash computation failed");
    checks.push({ check: "binary sha256", ok: true, detail: hash });
  }
  // 8. No test fixtures / evidence / secrets in package bundles
  for (const dir of [debDir, rpmDir]) {
    if (!existsSync(dir)) continue;
    const entries = JSON.stringify(readdirSync(dir, { recursive: true }) || []);
    add(`no test fixtures in ${basename(dir)}`, !/(fixtures|e2e-tests|__tests__|\.spec\.)/i.test(entries), "fixture/spec paths found");
    add(`no evidence in ${basename(dir)}`, !/evidence\//.test(entries), "evidence paths found");
    add(`no .env/.db in ${basename(dir)}`, !/\.env$|\.db(-shm|-wal|-journal)?$/.test(entries), "env/db files found");
    for (const pattern of SECRET_PATTERNS.slice(0, 2)) {
      if (new RegExp(pattern, "i").test(entries)) {
        failures.push(`secret pattern in ${basename(dir)}: ${pattern}`);
        add(`no secret patterns in ${basename(dir)}`, false, pattern);
      }
    }
  }
  // 9. dist clean of fixtures/evidence
  if (existsSync(join(root, "dist"))) {
    const distEntries = JSON.stringify(readdirSync(join(root, "dist"), { recursive: true }) || []);
    add("no fixtures in dist", !/(fixtures|e2e-tests|__tests__|\.spec\.)/i.test(distEntries), "fixture paths found");
    add("no evidence in dist", !/evidence\//.test(distEntries), "evidence paths found");
  }

  if (failures.length > 0) {
    // Differenziere Infrastruktur- von Produkt-Fehlern:
    // mode-644 bei sonst validem Binary = Artifact-Transport → Infrastruktur.
    // Fehlendes Binary, ELF-Fehler oder fehlendes dist = Produkt.
    const hasProductFailure = failures.some((f) =>
      !f.check.includes("executable"));
    const failureLines = failures.map((f) => `${f.check}: ${f.detail}`);
    return executorResult({
      exitCode: 1,
      stderr: failureLines.join("\n"),
      stdout: JSON.stringify(checks, null, 2),
      assertionCount: checks.length, artifactCount,
      isProductFailure: hasProductFailure,
      extra: { checks },
    });
  }
  return executorResult({
    exitCode: 0,
    stdout: `Build artifact integrity OK (${checks.length} checks, ${artifactCount} artifacts)`,
    assertionCount: checks.length, artifactCount,
    extra: { checks },
  });
}

/** E20 — Packaging Smoke (Run Card §25). */
export async function runPackagingSmoke(ctx) {
  const { root } = ctx;
  const debDir = join(root, "target", "debug", "bundle", "deb");
  const failures = [];
  const checks = [];
  let artifactCount = 0;

  const add = (name, ok, detail) => {
    checks.push({ check: name, ok, detail: ok ? "" : detail });
    if (!ok) failures.push(`${name}: ${detail}`);
  };

  if (!existsSync(debDir)) {
    return executorResult({
      exitCode: 1, stderr: "PACKAGING_MISSING: no deb bundle dir — run `pnpm tauri build --debug` first",
      assertionCount: 1, artifactCount: 0, isProductFailure: true,
      extra: { checks: [{ check: "deb bundle dir", ok: false, detail: debDir }] },
    });
  }

  const debs = readdirSync(debDir).filter((f) => f.endsWith(".deb"));
  add("deb package present", debs.length > 0, "no .deb found");
  if (debs.length === 0) {
    return executorResult({
      exitCode: 1, stderr: "PACKAGING_MISSING: no .deb package found", assertionCount: 1, isProductFailure: true,
    });
  }

  const debPath = join(debDir, debs[0]);
  artifactCount = debs.length;

  // 1. Package readable
  const info = await runCommand("dpkg-deb", ["--info", debPath], { cwd: root });
  add("package readable (dpkg-deb --info)", info.exitCode === 0, info.stderr || "dpkg-deb --info failed");

  // 2. Name / 3. Version / 4. Architecture
  let pkgName = null;
  let pkgVersion = null;
  let pkgArch = null;
  if (info.exitCode === 0) {
    pkgName = info.stdout.match(/^ Package: (.+)$/m)?.[1] || null;
    pkgVersion = info.stdout.match(/^ Version: (.+)$/m)?.[1] || null;
    pkgArch = info.stdout.match(/^ Architecture: (.+)$/m)?.[1] || null;
    add("package name correct", pkgName === "prompt-vault-lite", `got '${pkgName}'`);
    const expectedVersion = JSON.parse(await readFile(join(root, "package.json"), "utf-8")).version;
    add("package version correct", pkgVersion === expectedVersion, `got '${pkgVersion}' expected '${expectedVersion}'`);
    add("package architecture correct", pkgArch === "amd64", `got '${pkgArch}'`);
  }

  // 5. Contents
  const contents = await runCommand("dpkg-deb", ["--contents", debPath], { cwd: root });
  add("package contents readable (dpkg-deb --contents)", contents.exitCode === 0, contents.stderr || "dpkg-deb --contents failed");

  let contentList = "";
  if (contents.exitCode === 0) {
    contentList = contents.stdout;
    add("binary included", /usr\/bin\/promptvault-lite/.test(contentList), "usr/bin/promptvault-lite not in contents");
    add("desktop file included", /\.desktop/.test(contentList), "no .desktop file in contents");
    add("icon included", /usr\/share\/icons\/.*\.png/.test(contentList), "no icon in contents");
    add("no test fixtures", !/(fixtures|e2e-tests|__tests__|\.spec\.)/i.test(contentList), "fixture/spec paths in package");
    add("no evidence", !/evidence\//.test(contentList), "evidence paths in package");
    add("no .env", !/\.env$/.test(contentList), ".env file in package");
    add("no db files", !/\.db(-shm|-wal|-journal)?$/.test(contentList), "db file in package");
    for (const pattern of SECRET_PATTERNS) {
      if (new RegExp(pattern, "i").test(contentList)) {
        failures.push(`secret pattern in package contents: ${pattern}`);
      }
    }
    add("no secret patterns in file list", !failures.some((f) => f.startsWith("secret pattern")), "secret pattern found");
  }

  if (failures.length > 0) {
    return executorResult({
      exitCode: 1,
      stderr: failures.join("\n"),
      stdout: `Package: ${debPath}\n${info.stdout}\n${contents.stdout}`,
      assertionCount: checks.length, artifactCount, isProductFailure: true,
      extra: { checks, package: debPath },
    });
  }
  return executorResult({
    exitCode: 0,
    stdout: `Packaging smoke OK: ${basename(debPath)} (${pkgName} ${pkgVersion} ${pkgArch}), ${checks.length} checks`,
    assertionCount: checks.length, artifactCount,
    extra: { checks, package: debPath },
  });
}

/** E11 — Playwright browser matrix (Chromium + Firefox + WebKit). */
export async function runPlaywrightBrowserMatrix(ctx) {
  const { root } = ctx;
  const browsers = ["chromium", "firefox", "webkit"];
  const perBrowser = [];
  const failures = [];
  let totalPassed = 0;
  let totalFailed = 0;
  let totalSkipped = 0;
  let totalDuration = 0;

  for (const browser of browsers) {
    const result = await runCommand(
      "pnpm",
      ["exec", "playwright", "test", "tests/e2e/core-flows.spec.ts", "tests/e2e/journeys.spec.ts", `--project=${browser}`, "--reporter=json"],
      { cwd: root, timeout: 900_000 }
    );

    let passed = 0;
    let failed = 0;
    let skipped = 0;
    let durationMs = 0;
    let browserVersion = "unknown";
    let parseError = null;

    // Parse JSON reporter output (single report object or array of reports)
    try {
      const jsonStart = result.stdout.indexOf("{");
      const jsonEnd = result.stdout.lastIndexOf("}");
      if (jsonStart >= 0 && jsonEnd > jsonStart) {
        const parsed = JSON.parse(result.stdout.slice(jsonStart, jsonEnd + 1));
        const reports = Array.isArray(parsed) ? parsed : [parsed];
        const stats = reports.reduce((acc, r) => {
          acc.expected += r.stats?.expected || 0;
          acc.unexpected += r.stats?.unexpected || 0;
          acc.flaky += r.stats?.flaky || 0;
          acc.skipped += r.stats?.skipped || 0;
          acc.duration += r.stats?.duration || 0;
          return acc;
        }, { expected: 0, unexpected: 0, flaky: 0, skipped: 0, duration: 0 });
        passed = stats.expected;
        failed = stats.unexpected;
        skipped = stats.skipped;
        durationMs = stats.duration;
      } else {
        parseError = "no JSON report found in stdout";
      }
    } catch (err) {
      parseError = `JSON parse failed: ${err.message}`;
    }

    // Browser version probe
    const versionProbe = await runCommand(
      "node",
      ["scripts/lib/browser-version.mjs", browser],
      { cwd: root, timeout: 60_000 }
    );
    if (versionProbe.exitCode === 0) {
      try {
        browserVersion = JSON.parse(versionProbe.stdout).version || "unknown";
      } catch { /* keep unknown */ }
    }

    totalPassed += passed;
    totalFailed += failed;
    totalSkipped += skipped;
    totalDuration += durationMs;

    if (result.exitCode !== 0 || parseError) {
      failures.push(
        `${browser}: exit=${result.exitCode} passed=${passed} failed=${failed} ${parseError || ""}\n${result.stderr.slice(0, 2000)}`
      );
    }

    perBrowser.push({
      browser,
      browser_version: browserVersion,
      passed,
      failed,
      skipped,
      duration_ms: durationMs,
      exit_code: result.exitCode,
    });
  }

  const summary = {
    matrix: perBrowser,
    total: { passed: totalPassed, failed: totalFailed, skipped: totalSkipped, duration_ms: totalDuration },
  };

  if (failures.length > 0) {
    return executorResult({
      exitCode: 1,
      stderr: failures.join("\n---\n"),
      stdout: JSON.stringify(summary, null, 2),
      assertionCount: totalPassed + totalFailed,
      isProductFailure: true,
      extra: summary,
    });
  }
  return executorResult({
    exitCode: 0,
    stdout: `Playwright matrix OK: ${totalPassed} passed / ${totalFailed} failed / ${totalSkipped} skipped (${perBrowser.map((b) => `${b.browser}=${b.browser_version}`).join(", ")})`,
    assertionCount: totalPassed,
    extra: summary,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Executor registry
// ─────────────────────────────────────────────────────────────────────────────

export const EXECUTORS = {
  "command": runCommandExecutor,
  "secret-scan": runSecretScan,
  "version-consistency": runVersionConsistency,
  "lockfile-drift": runLockfileDrift,
  "feature-flag-defaults": runFeatureFlagDefaults,
  "build-artifact-integrity": runBuildArtifactIntegrity,
  "packaging-smoke": runPackagingSmoke,
  "playwright-browser-matrix": runPlaywrightBrowserMatrix,
};

// ── Backward-compatible aliases (used by existing tests) ──

export async function checkVersionConsistency(ROOT) {
  const res = await runVersionConsistency({ root: ROOT });
  return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, isProductFailure: res.isProductFailure };
}

export async function checkLockfileDrift(ROOT) {
  const res = await runLockfileDrift({ root: ROOT });
  return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, isProductFailure: res.isProductFailure };
}

export async function checkFeatureFlags(ROOT) {
  const res = await runFeatureFlagDefaults({ root: ROOT });
  return { exitCode: res.exitCode, stdout: res.stdout, stderr: res.stderr, isProductFailure: res.isProductFailure };
}
