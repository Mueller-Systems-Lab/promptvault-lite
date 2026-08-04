// scripts/lib/runner.mjs — Autonomous Test Harness Runner
// Core module: git ops, command execution, classification, evidence.

import { spawn, execSync } from "node:child_process";
import { writeFile, mkdir, rename } from "node:fs/promises";
import { randomBytes } from "node:crypto";
import { resolve, normalize, sep, isAbsolute, dirname } from "node:path";
import { tmpdir } from "node:os";

// ── Secret patterns (aligned with .github/workflows/ci.yml) ──

const SECRET_PATTERNS = [
  /-----BEGIN.*PRIVATE KEY-----/g,
  /AKIA[0-9A-Z]{16}/g,
  /gh[opsur]_[0-9a-zA-Z]{36}/g,
  /github_pat_[0-9a-zA-Z]{22,}/g,
  /sk_live_[0-9a-zA-Z]{24}/g,
];

// ── Git helpers ──

/**
 * Find the git repository root.
 */
export function gitRoot() {
  try {
    const root = execSync("git rev-parse --show-toplevel", {
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"],
    }).trim();
    return root;
  } catch {
    return process.cwd();
  }
}

/**
 * Get the current HEAD SHA.
 */
export async function gitHeadSha(cwd) {
  const dir = cwd || gitRoot();
  const result = await runCommand("git", ["rev-parse", "HEAD"], {
    cwd: dir,
    timeout: 10_000,
  });
  return result.stdout.trim();
}

/**
 * Check if the working tree has uncommitted changes.
 */
export async function isWorkingTreeDirty() {
  const result = await runCommand("git", ["status", "--porcelain"], {
    timeout: 10_000,
  });
  return result.stdout.trim().length > 0;
}

// ── Command execution ──

/**
 * Run a command safely. No shell:true. Captures stdout/stderr/exit.
 */
export function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd, timeout = 300_000, env } = options;
    const child = spawn(command, args, {
      cwd: cwd || gitRoot(),
      env: { ...process.env, NODE_ENV: "test", ...env },
      stdio: ["ignore", "pipe", "pipe"],
      timeout,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });

    child.on("close", (exitCode, signal) => {
      resolve({ stdout, stderr, exitCode: exitCode ?? -1, signal });
    });

    child.on("error", (err) => {
      reject(err);
    });
  });
}

// ── Classification ──

/**
 * Classify a gate result.
 *
 * @param {number} exitCode
 * @param {object} context
 * @param {string} context.gate — Gate identifier
 * @param {boolean} [context.isOptional] — true for hardware/baseline gates
 * @param {number} [context.previousExitCode] — if a prior run failed differently
 * @param {string} [context.previousResult] — classification of prior run
 * @param {boolean} [context.visualBaselinesMissing] — no baselines configured
 * @param {string} [context.skippedReason] — why the gate was skipped
 * @param {boolean} [context.isProductFailure] — true when gate detected a product-level bug (not test infra)
 * @returns {string} Classification label.
 */
export function classifyGate(exitCode, context = {}) {
  const {
    isOptional,
    previousExitCode,
    previousResult,
    visualBaselinesMissing,
    skippedReason,
    isProductFailure,
  } = context;

  // Prior failure → preserve original classification, mark transient if retry passes
  if (
    previousExitCode !== undefined &&
    previousExitCode !== 0 &&
    exitCode === 0 &&
    previousResult
  ) {
    // RED_ failures that later pass are transient anomalies
    if (previousResult.startsWith("RED_")) {
      return "YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY";
    }
    // AMBER_ that later passes is still noteworthy
    if (previousResult.startsWith("AMBER_")) {
      return "YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY";
    }
    return "YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY";
  }

  // Prior RED that remains RED — preserve the original classification
  if (
    previousExitCode !== undefined &&
    previousExitCode !== 0 &&
    exitCode !== 0 &&
    previousResult &&
    previousResult.startsWith("RED_")
  ) {
    return previousResult;
  }

  // Optional gates
  if (isOptional) {
    if (visualBaselinesMissing) return "YELLOW_VISUAL_BASELINE_MISSING";
    if (skippedReason) return "PASS"; // e.g. USB corpus not configured
    if (exitCode === 0) return "PASS";
    return "YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED";
  }

  // Core gates
  if (exitCode === 0) return "PASS";

  // Exit 126/127 = "command invoked cannot execute" / "command not found" → infrastructure
  if (exitCode === 126 || exitCode === 127) {
    return "RED_INFRASTRUCTURE_FAILURE";
  }

  // Product failure (explicitly detected by gate logic) vs test failure
  if (isProductFailure) {
    return "RED_PRODUCT_FAILURE";
  }

  // Non-zero exit → test failure (default for unknown failures)
  return "RED_TEST_FAILURE";
}

// ── Path safety ──

/**
 * Sanitize a user-supplied path. Returns null on traversal attempt.
 */
export function sanitizePath(userPath, baseDir) {
  const resolved = resolve(baseDir, userPath);
  const normalizedBase = resolve(baseDir) + sep;
  if (!resolved.startsWith(normalizedBase)) return null;
  return resolved;
}

// ── Secret masking ──

/**
 * Mask known secret patterns in text.
 */
export function maskSecrets(text) {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[MASKED]");
  }
  return result;
}

// ── Evidence I/O ──

/**
 * Write a file atomically (temp file in destination dir → rename).
 * Avoids cross-filesystem rename issues by writing the temp file
 * in the same directory as the target.
 */
export async function writeEvidenceAtomic(filePath, content) {
  // Ensure directory exists
  const dir = dirname(resolve(filePath));
  await mkdir(dir, { recursive: true });

  // Write to temp file in the SAME directory as the target (same filesystem)
  const tmpPath = resolve(
    dir,
    `.pvl-evidence-${randomBytes(8).toString("hex")}.tmp`
  );
  await writeFile(tmpPath, content, "utf-8");
  await rename(tmpPath, filePath);
}

// ── Run ID generation ──

let _runIdCounter = 0;

/**
 * Generate a unique run ID safe across separate processes.
 * Format: PVL-AUTONOMOUS-TEST-HARNESS-YYYYMMDD-NNN-PID-RND
 * Includes PID and random suffix to prevent collisions between
 * parallel processes or cron invocations.
 */
export function generateRunId() {
  const now = new Date();
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const ts = String(now.getUTCMilliseconds()).padStart(3, "0");
  _runIdCounter += 1;
  const seq = String(_runIdCounter).padStart(3, "0");
  const pid = process.pid;
  const rnd = randomBytes(3).toString("hex");
  return `PVL-AUTONOMOUS-TEST-HARNESS-${date}-${seq}-${pid}-${rnd}`;
}
