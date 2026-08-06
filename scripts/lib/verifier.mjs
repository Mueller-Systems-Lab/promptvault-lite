// scripts/lib/verifier.mjs — Independent Verifier
// Fresh-clone verifier with build hash comparison and primary/verifier delta.
//
// Implements the contract from docs/testing/autonomous-test-harness-contract.md
// Section 5: Independent Verifier Contract

import { spawn } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { tmpdir, homedir } from "node:os";
import { randomBytes } from "node:crypto";

/**
 * Run a command and return {stdout, stderr, exitCode, signal}.
 */
function runCommand(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const { cwd, timeout = 600_000 } = options;
    const child = spawn(command, args, {
      cwd,
      env: { ...process.env },
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

/**
 * Generate a unique directory name for the verifier clone.
 */
function verifierCloneDir() {
  const ts = Date.now();
  const rnd = randomBytes(8).toString("hex");
  const base = join(homedir(), "tmp", "pvl-verifier");
  return resolve(base, `verifier-${ts}-${rnd}`);
}

/**
 * Recursively compute SHA-256 of all files in a directory.
 * Returns { [relativePath]: sha256 }.
 */
async function hashDirectoryTree(dir) {
  const hashes = {};
  const { stdout } = await runCommand("find", [
    dir,
    "-type",
    "f",
    "-not",
    "-path",
    "*/node_modules/*",
    "-not",
    "-path",
    "*/.git/*",
  ]);
  const files = stdout.trim().split("\n").filter(Boolean);
  for (const file of files) {
    try {
      const content = await readFile(file);
      const hash = createHash("sha256").update(content).digest("hex");
      hashes[file.replace(dir + "/", "")] = hash;
    } catch {
      // Skip unreadable files
    }
  }
  return hashes;
}

/**
 * Check if a directory has any build artifacts from a prior run.
 */
async function hasInheritedBuildArtifacts(dir) {
  const checkDirs = ["dist", "target", "node_modules/.cache"];
  const found = [];
  for (const sub of checkDirs) {
    const full = join(dir, sub);
    try {
      await import("node:fs/promises").then((fs) => fs.access(full));
      found.push(sub);
    } catch {
      // Not found — good
    }
  }
  return found;
}

/**
 * Run the independent verifier.
 *
 * @param {object} options
 * @param {string} options.targetSha — SHA to verify
 * @param {string} options.originUrl — Git remote origin URL
 * @param {string} options.evidenceDir — Where to write evidence
 * @param {string} options.primarySummaryPath — Path to primary summary JSON
 * @param {Function} options.runFullGate — Function to run the full gate matrix
 * @returns {object} { delta, buildComparison, classification }
 */
export async function runIndependentVerifier({
  targetSha,
  originUrl,
  evidenceDir,
  primarySummaryPath,
  primaryBuildHashes,
}) {
  const cloneDir = verifierCloneDir();
  const failures = [];

  console.log(`\n=== Independent Verifier ===`);
  console.log(`Target SHA:   ${targetSha}`);
  console.log(`Clone dir:    ${cloneDir}`);
  console.log(`Evidence:     ${evidenceDir}`);

  // Step 1: Create clone directory
  await mkdir(cloneDir, { recursive: true });

  // Step 2: Clone
  console.log(`\nCloning from ${originUrl}...`);
  const cloneResult = await runCommand("git", [
    "clone",
    "--no-local",
    originUrl,
    cloneDir,
  ]);
  if (cloneResult.exitCode !== 0) {
    failures.push(`Clone failed: ${cloneResult.stderr}`);
    return {
      classification: "RED_INFRASTRUCTURE_FAILURE",
      cloneDir,
      failures,
      delta: null,
      buildComparison: null,
    };
  }

  // Step 3: Checkout exact SHA in detached HEAD
  const checkoutResult = await runCommand("git", [
    "checkout",
    "--detach",
    targetSha,
  ], { cwd: cloneDir });
  if (checkoutResult.exitCode !== 0) {
    failures.push(`Checkout failed: ${checkoutResult.stderr}`);
    return {
      classification: "RED_INFRASTRUCTURE_FAILURE",
      cloneDir,
      failures,
      delta: null,
      buildComparison: null,
    };
  }

  // Step 4: Verify HEAD matches target SHA
  const { stdout: headSha } = await runCommand("git", [
    "rev-parse",
    "HEAD",
  ], { cwd: cloneDir });
  if (headSha.trim() !== targetSha) {
    failures.push(
      `SHA MISMATCH after checkout: expected ${targetSha}, got ${headSha.trim()}`
    );
    return {
      classification: "RED_INFRASTRUCTURE_FAILURE",
      cloneDir,
      failures,
      delta: null,
      buildComparison: null,
    };
  }

  console.log(`HEAD verified: ${headSha.trim()}`);

  // Step 5: Check for inherited build artifacts
  const inherited = await hasInheritedBuildArtifacts(cloneDir);
  if (inherited.length > 0) {
    failures.push(`Inherited build artifacts found: ${inherited.join(", ")}`);
  }

  // Step 6: Install dependencies
  console.log(`\nInstalling dependencies (frozen lockfile)...`);
  const installResult = await runCommand("pnpm", [
    "install",
    "--frozen-lockfile",
  ], { cwd: cloneDir });

  // Step 7: Run the full gate matrix
  console.log(`\nRunning full gate matrix in verifier clone...`);
  const verifyResult = await runCommand("node", [
    join(cloneDir, "scripts", "verify-all.mjs"),
    "--full",
    `--evidence-dir=${evidenceDir}`,
    `--logs-dir=06-independent-logs`,
    `--json-summary=${join(evidenceDir, "06-independent-summary.json")}`,
    `--target-sha=${targetSha}`,
  ], { cwd: cloneDir, timeout: 900_000 });

  // Step 8: Check working tree is clean
  const { stdout: dirtyOut } = await runCommand("git", [
    "status",
    "--porcelain",
  ], { cwd: cloneDir });
  if (dirtyOut.trim()) {
    failures.push(`Working tree not clean after gates:\n${dirtyOut}`);
  }

  // Step 9: Compute build hashes
  console.log(`\nComputing build hashes...`);
  let verifierBuildHashes = {};
  try {
    verifierBuildHashes = await hashDirectoryTree(cloneDir);
  } catch (err) {
    failures.push(`Build hash computation failed: ${err.message}`);
  }

  // Step 10: Compare with primary build hashes
  const buildComparison = compareBuildHashes(
    primaryBuildHashes || {},
    verifierBuildHashes
  );

  // Step 11: Read primary summary and verifier summary for comparison
  let primarySummary = null;
  let verifierSummary = null;
  try {
    primarySummary = JSON.parse(
      await readFile(primarySummaryPath, "utf-8")
    );
    verifierSummary = JSON.parse(
      await readFile(
        join(evidenceDir, "06-independent-summary.json"),
        "utf-8"
      )
    );
  } catch {
    // Summary comparison will show as unavailable
  }

  // Step 12: Compute delta
  const delta = computeDelta(primarySummary, verifierSummary, buildComparison);

  // Step 13: Write delta evidence
  const deltaPath = join(evidenceDir, "07-primary-verifier-delta.json");
  const fs = await import("node:fs/promises");
  await fs.writeFile(deltaPath, JSON.stringify({
    runner: "independent",
    tested_git_sha: targetSha,
    primary_classification: primarySummary?.classification || "UNKNOWN",
    verifier_classification: verifierSummary?.classification || "UNKNOWN",
    delta,
    build_comparison: buildComparison,
    failures,
  }, null, 2));

  // Write build hashes
  await fs.writeFile(
    join(evidenceDir, "09-build-hashes-independent.json"),
    JSON.stringify(verifierBuildHashes, null, 2)
  );

  // Step 14: Determine classification
  let classification = "PASS";
  if (failures.length > 0) {
    classification = "RED_INFRASTRUCTURE_FAILURE";
  } else if (delta.hasDivergence) {
    classification = "AMBER_PRIMARY_VERIFIER_DIVERGENCE";
  }

  // Step 15: Cleanup on success, keep on failure
  if (classification === "PASS") {
    console.log(`\nCleaning up verifier clone: ${cloneDir}`);
    await rm(cloneDir, { recursive: true, force: true }).catch(() => {});
  } else {
    console.log(`\nKeeping verifier clone for diagnosis: ${cloneDir}`);
  }

  return {
    classification,
    cloneDir,
    failures,
    delta,
    buildComparison,
  };
}

/**
 * Compare primary and verifier build hashes.
 */
function compareBuildHashes(primary, verifier) {
  const onlyInPrimary = [];
  const onlyInVerifier = [];
  const diverged = [];
  const matched = [];

  const allKeys = new Set([...Object.keys(primary), ...Object.keys(verifier)]);

  for (const key of allKeys) {
    if (!(key in verifier)) {
      onlyInPrimary.push(key);
    } else if (!(key in primary)) {
      onlyInVerifier.push(key);
    } else if (primary[key] !== verifier[key]) {
      diverged.push({ file: key, primary: primary[key], verifier: verifier[key] });
    } else {
      matched.push(key);
    }
  }

  return {
    total_compared: allKeys.size,
    matched: matched.length,
    only_in_primary: onlyInPrimary.length,
    only_in_verifier: onlyInVerifier.length,
    diverged: diverged.length,
    diverged_files: diverged.slice(0, 50), // Cap at 50 entries
    hasDivergence: diverged.length > 0,
  };
}

/**
 * Compute the delta between primary and verifier runs.
 */
function computeDelta(primarySummary, verifierSummary, buildComparison) {
  if (!primarySummary || !verifierSummary) {
    return {
      hasDivergence: false,
      available: false,
      reason: "Primary or verifier summary unavailable",
    };
  }

  const primaryGates = primarySummary.gates || [];
  const verifierGates = verifierSummary.gates || [];

  const gateDeltas = [];
  let hasDivergence = false;

  const primaryMap = {};
  for (const g of primaryGates) {
    primaryMap[g.gate] = g;
  }

  for (const vg of verifierGates) {
    const pg = primaryMap[vg.gate];
    if (!pg) continue;

    if (pg.classification !== vg.classification) {
      hasDivergence = true;
      gateDeltas.push({
        gate: vg.gate,
        primary: pg.classification,
        verifier: vg.classification,
      });
    }
  }

  // Check for gates only in primary
  for (const pg of primaryGates) {
    if (!verifierGates.find((vg) => vg.gate === pg.gate)) {
      gateDeltas.push({
        gate: pg.gate,
        primary: pg.classification,
        verifier: "MISSING",
      });
    }
  }

  if (buildComparison.hasDivergence) {
    hasDivergence = true;
  }

  return {
    hasDivergence,
    available: true,
    gate_deltas: gateDeltas,
    build_divergence: buildComparison.hasDivergence,
  };
}
