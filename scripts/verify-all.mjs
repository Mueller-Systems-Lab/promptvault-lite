#!/usr/bin/env node
// scripts/verify-all.mjs — Autonomous Test Harness CLI
//
// Usage:
//   node scripts/verify-all.mjs --quick      Quick gate
//   node scripts/verify-all.mjs --full       Full gate (default)
//   node scripts/verify-all.mjs --independent Independent verifier
//   node scripts/verify-all.mjs --gate E3    Single gate
//
// Package scripts:
//   pnpm verify:quick
//   pnpm verify:all
//   pnpm verify:independent

import { parseArgs } from "node:util";
import { join, resolve } from "node:path";
import { mkdir } from "node:fs/promises";

import {
  gitRoot,
  gitHeadSha,
  isWorkingTreeDirty,
  runCommand,
  writeEvidenceAtomic,
  generateRunId,
  sanitizePath,
} from "./lib/runner.mjs";

import { runIndependentVerifier } from "./lib/verifier.mjs";

import {
  GATES,
  sha256,
  parseTestOutput,
  hashBuildOutput,
  runSecretScan,
  checkVersionConsistency,
  checkFeatureFlags,
  checkLockfileDrift,
} from "./lib/gates.mjs";

// ── CLI argument parsing ──

const { values: opts } = parseArgs({
  options: {
    quick: { type: "boolean", default: false },
    full: { type: "boolean", default: false },
    independent: { type: "boolean", default: false },
    gate: { type: "string" },
    "evidence-dir": { type: "string" },
    "json-summary": { type: "string" },
    "logs-dir": { type: "string" },
    "target-sha": { type: "string" },
    "no-color": { type: "boolean", default: false },
    help: { type: "boolean", default: false },
  },
  allowPositionals: false,
});

if (opts.help) {
  console.log(`Autonomous Test Harness — PromptVault Lite

Usage:
  node scripts/verify-all.mjs [options]

Options:
  --quick                 Quick gate (lint, tsc, vitest, version, flags)
  --full                  Full gate (all core gates + optional)
  --independent           Independent verifier (fresh clone)
  --gate <name>           Run single gate (e.g., "E3")
  --evidence-dir <path>   Override evidence output path
  --json-summary <path>   Write JSON summary to path
  --target-sha <sha>      Pin to specific SHA (required for --independent)
  --no-color              Disable ANSI colors
  --help                  Show this help
`);
  process.exit(0);
}

// ── Determine mode ──

const mode = opts.independent
  ? "independent"
  : opts.quick
    ? "quick"
    : opts.gate
      ? "single"
      : "full";

// ── Setup ──

const ROOT = gitRoot();
const RUN_ID = generateRunId();

// Path safety: reject traversal attempts in user-supplied paths
const BASE = ROOT;
if (opts["evidence-dir"]) {
  const validated = sanitizePath(opts["evidence-dir"], BASE);
  if (!validated && opts["evidence-dir"].includes("..")) {
    console.error("Error: --evidence-dir path traversal rejected");
    process.exit(1);
  }
}
if (opts["json-summary"]) {
  const validated = sanitizePath(opts["json-summary"], BASE);
  if (!validated && opts["json-summary"].includes("..")) {
    console.error("Error: --json-summary path traversal rejected");
    process.exit(1);
  }
}

const EVIDENCE_DIR =
  opts["evidence-dir"] || join(ROOT, "evidence", "autonomous-test", RUN_ID);

const LOGS_DIR = opts["logs-dir"] || "04-primary-logs";

const C = opts["no-color"]
  ? { G: "", Y: "", R: "", B: "", N: "" }
  : { G: "\x1b[32m", Y: "\x1b[33m", R: "\x1b[31m", B: "\x1b[34m", N: "\x1b[0m" };

// ── Gate runner ──

async function runGate(gate, sha, evidenceDir) {
  const startTime = Date.now();

  // Handle built-in gates
  if (gate.id === "E10") {
    const result = await runSecretScan(ROOT);
    return await buildGateResult(gate, result, sha, startTime, evidenceDir);
  }
  if (gate.id === "E12" || gate.id === "Q5") {
    const result = await checkVersionConsistency(ROOT);
    return await buildGateResult(gate, result, sha, startTime, evidenceDir);
  }
  if (gate.id === "E13") {
    const result = await checkLockfileDrift(ROOT);
    return await buildGateResult(gate, result, sha, startTime, evidenceDir);
  }
  if (gate.id === "E14" || gate.id === "Q6") {
    const result = await checkFeatureFlags(ROOT);
    return await buildGateResult(gate, result, sha, startTime, evidenceDir);
  }

  try {
    const result = await runCommand(gate.command, gate.args, {
      cwd: ROOT,
      timeout: 600_000,
    });
    return await buildGateResult(gate, result, sha, startTime, evidenceDir);
  } catch (err) {
    return await buildGateResult(
      gate,
      { stdout: "", stderr: err.message, exitCode: -1, signal: null },
      sha,
      startTime,
      evidenceDir
    );
  }
}

async function buildGateResult(gate, raw, sha, startTime, evidenceDir) {
  const endTime = Date.now();
  const duration = endTime - startTime;

  const stdoutContent = raw.stdout ? raw.stdout.replace(
    /-----BEGIN.*PRIVATE KEY-----[\s\S]*?-----END.*PRIVATE KEY-----/g,
    "[MASKED]"
  ) : "";
  const stderrContent = raw.stderr ? raw.stderr.replace(
    /-----BEGIN.*PRIVATE KEY-----[\s\S]*?-----END.*PRIVATE KEY-----/g,
    "[MASKED]"
  ) : "";

  // Also apply pattern-based masking from runner
  const { maskSecrets } = await import("./lib/runner.mjs");
  const stdoutFinal = maskSecrets(stdoutContent);
  const stderrFinal = maskSecrets(stderrContent);

  const stdoutSha = sha256(stdoutFinal);
  const stderrSha = sha256(stderrFinal);

  const testMetrics = gate.parseOutput ? parseTestOutput(raw.stdout, gate.id) : {};

  const { classifyGate } = await import("./lib/runner.mjs");
  const classification = classifyGate(raw.exitCode, {
    gate: gate.id,
    isOptional: gate.isOptional || false,
    visualBaselinesMissing: gate.visualBaselinesMissing || false,
    isProductFailure: raw.isProductFailure || false,
  });

  return {
    gate: gate.id,
    name: gate.name,
    command: `${gate.command} ${gate.args.join(" ")}`,
    runner: "primary",
    tested_git_sha: sha,
    started_at: new Date(startTime).toISOString(),
    ended_at: new Date(endTime).toISOString(),
    duration_ms: duration,
    exit_code: raw.exitCode,
    signal: raw.signal || null,
    ...testMetrics,
    stdout_log: join(evidenceDir, LOGS_DIR, `${gate.id}-stdout.txt`),
    stderr_log: join(evidenceDir, LOGS_DIR, `${gate.id}-stderr.txt`),
    stdout_sha256: stdoutSha,
    stderr_sha256: stderrSha,
    classification,
    stdout_raw: stdoutFinal,
    stderr_raw: stderrFinal,
  };
}

// ── Summary ──

function updateSummaryClassification(summary, newClassification) {
  summary.classification = newClassification;
}

function buildSummary(gateResults, sha, branch) {
  const coreGates = gateResults.filter((g) => !g.classification.startsWith("YELLOW"));
  const optionalGaps = gateResults.filter((g) => g.classification.startsWith("YELLOW"));

  const allCoreGreen = coreGates.every((g) => g.classification === "PASS");
  const hasRed = gateResults.some((g) => g.classification.startsWith("RED_"));
  const hasAmber = gateResults.some((g) => g.classification.startsWith("AMBER_"));
  const hasDivergence = gateResults.some(
    (g) => g.classification === "AMBER_PRIMARY_VERIFIER_DIVERGENCE"
  );

  let runClassification;
  if (hasRed) {
    const hasProductFailure = gateResults.some(
      (g) => g.classification === "RED_PRODUCT_FAILURE"
    );
    runClassification = hasProductFailure
      ? "RED_REPRODUCIBLE_PRODUCT_FAILURE"
      : "RED_TEST_INFRASTRUCTURE_FAILURE";
  } else if (hasDivergence) {
    runClassification = "AMBER_PRIMARY_VERIFIER_DIVERGENCE";
  } else if (hasAmber) {
    runClassification = "AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM";
  } else if (allCoreGreen && optionalGaps.length > 0) {
    runClassification =
      "GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE";
  } else if (allCoreGreen) {
    runClassification =
      "GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED";
  } else {
    runClassification = "AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM";
  }

  return {
    run_id: RUN_ID,
    sha,
    branch,
    tested_at: new Date().toISOString(),
    classification: runClassification,
    total_gates: gateResults.length,
    passed: gateResults.filter((g) => g.classification === "PASS").length,
    failed: gateResults.filter((g) => g.classification.startsWith("RED_")).length,
    yellow: gateResults.filter((g) => g.classification.startsWith("YELLOW")).length,
    amber: gateResults.filter((g) => g.classification.startsWith("AMBER")).length,
  };
}

// ── Final Report ──

function generateFinalReport(summary, results, sha, branch, manifest) {
  const lines = [];
  lines.push(`# FINAL REPORT — ${summary.run_id}`);
  lines.push("");
  lines.push(`## Status: ${summary.classification}`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 1. Repository Snapshot");
  lines.push("");
  lines.push("| Field | Value |");
  lines.push("|-------|-------|");
  lines.push(`| SHA | ${sha} |`);
  lines.push(`| Branch | ${branch} |`);
  lines.push(`| Node | ${manifest.tools.node || "N/A"} |`);
  lines.push(`| pnpm | ${manifest.tools.pnpm || "N/A"} |`);
  lines.push(`| Rust | ${manifest.tools.rustc || "N/A"} |`);
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 2. Gate Matrix");
  lines.push("");
  lines.push("| Gate | Status | Duration | Details |");
  lines.push("|------|--------|----------|---------|");
  for (const r of results) {
    const details = [
      r.passed !== undefined ? `${r.passed} passed` : "",
      r.failed ? `${r.failed} failed` : "",
      r.skipped ? `${r.skipped} skipped` : "",
      r.ignored ? `${r.ignored} ignored` : "",
    ]
      .filter(Boolean)
      .join(", ") || "-";
    lines.push(
      `| ${r.gate} — ${r.name} | ${r.classification} | ${r.duration_ms}ms | ${details} |`
    );
  }
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("## 3. Evidence");
  lines.push("");
  lines.push(`- Evidence directory: \`evidence/autonomous-test/${summary.run_id}/\``);
  lines.push(`- JSON summary: \`03-primary-summary.json\``);
  lines.push(`- Logs: \`${LOGS_DIR}/\``);

  return lines.join("\n");
}

// ── Main ──

async function main() {
  console.log(`${C.B}=== PromptVault Lite — Autonomous Test Harness ===${C.N}`);
  console.log(`Run ID:    ${RUN_ID}`);
  console.log(`Mode:      ${mode}`);
  console.log(`Evidence:  ${EVIDENCE_DIR}`);
  console.log();

  // Check target SHA for independent mode
  if (mode === "independent" && !opts["target-sha"]) {
    console.error(
      `${C.R}Error: --target-sha is required for independent mode${C.N}`
    );
    process.exit(1);
  }

  const sha = opts["target-sha"] || (await gitHeadSha(ROOT));
  console.log(`Target SHA: ${sha}`);

  // Verify SHA matches for independent mode
  if (mode === "independent") {
    const currentSha = await gitHeadSha(ROOT);
    if (currentSha !== opts["target-sha"]) {
      console.error(
        `${C.R}SHA MISMATCH: expected ${opts["target-sha"]}, got ${currentSha}${C.N}`
      );
      process.exit(1);
    }
  }

  // Check working tree
  const dirty = await isWorkingTreeDirty();
  if (dirty) {
    console.log(`${C.Y}⚠ Working tree has uncommitted changes${C.N}`);
  }

  // Setup evidence directory
  await mkdir(join(EVIDENCE_DIR, LOGS_DIR), { recursive: true });
  await mkdir(join(EVIDENCE_DIR, "05-playwright-report"), { recursive: true });

  // Select gates
  let gatesToRun;
  if (opts.gate) {
    const gate = GATES[opts.gate];
    if (!gate) {
      console.error(`${C.R}Unknown gate: ${opts.gate}${C.N}`);
      process.exit(1);
    }
    gatesToRun = [gate];
  } else if (mode === "quick") {
    gatesToRun = Object.values(GATES).filter((g) => g.level === "quick");
  } else {
    gatesToRun = Object.values(GATES).filter((g) => g.level === "full");
  }

  // Sort gates by ID numerically
  const numSort = (a, b) => {
    const numA = parseInt(a.id.replace(/^[QE]/, ""), 10);
    const numB = parseInt(b.id.replace(/^[QE]/, ""), 10);
    return numA - numB;
  };
  gatesToRun.sort(numSort);

  console.log(`Gates to run: ${gatesToRun.length}`);
  console.log();

  // Run gates sequentially
  const results = [];
  let criticalFailure = false;

  for (const gate of gatesToRun) {
    process.stdout.write(`  ${gate.id} ${gate.name}... `);
    const result = await runGate(gate, sha, EVIDENCE_DIR);
    results.push(result);

    const statusColor =
      result.classification === "PASS"
        ? C.G
        : result.classification.startsWith("RED_")
          ? C.R
          : C.Y;

    console.log(
      `${statusColor}${result.classification}${C.N} (${result.duration_ms}ms)`
    );

    // Write log files
    await writeEvidenceAtomic(
      join(EVIDENCE_DIR, LOGS_DIR, `${gate.id}-stdout.txt`),
      result.stdout_raw || ""
    );
    await writeEvidenceAtomic(
      join(EVIDENCE_DIR, LOGS_DIR, `${gate.id}-stderr.txt`),
      result.stderr_raw || ""
    );

    // Critical failure abort
    if (
      result.classification.startsWith("RED_") &&
      gate.mandatory
    ) {
      console.error(
        `${C.R}Critical gate ${gate.id} failed — aborting${C.N}`
      );
      criticalFailure = true;
      break;
    }
  }

  // Get branch
  let branch = "unknown";
  try {
    const { stdout: branchOut } = await runCommand("git", [
      "branch", "--show-current",
    ]);
    branch = branchOut.trim() || "detached HEAD";
  } catch { /* leave as unknown */ }

  const summary = buildSummary(results, sha, branch);

  // Write summary
  const summaryPath =
    opts["json-summary"] || join(EVIDENCE_DIR, "03-primary-summary.json");
  const cleanResults = results.map(({ stdout_raw, stderr_raw, ...r }) => r);
  await writeEvidenceAtomic(
    summaryPath,
    JSON.stringify({ ...summary, gates: cleanResults }, null, 2)
  );

  // Write build hashes for primary
  const primaryBuildHashes = await hashBuildOutput(ROOT);
  await writeEvidenceAtomic(
    join(EVIDENCE_DIR, "08-build-hashes-primary.json"),
    JSON.stringify(primaryBuildHashes, null, 2)
  );

  // ── Independent Verifier (if --independent mode) ──
  if (mode === "independent") {
    console.log(`\n${C.B}=== Independent Verifier ===${C.N}`);

    let originUrl = "";
    try {
      const { stdout: originOut } = await runCommand("git", [
        "config", "--get", "remote.origin.url",
      ]);
      originUrl = originOut.trim();
    } catch {
      console.error(`${C.R}Cannot determine origin URL${C.N}`);
      process.exit(2);
    }

    console.log(`Origin: ${originUrl}`);

    const verifierResult = await runIndependentVerifier({
      targetSha: sha,
      originUrl,
      evidenceDir: EVIDENCE_DIR,
      primarySummaryPath:
        opts["json-summary"] || join(EVIDENCE_DIR, "03-primary-summary.json"),
      primaryBuildHashes,
    });

    const deltaPath = join(EVIDENCE_DIR, "07-primary-verifier-delta.json");
    let delta = null;
    try {
      const fs = await import("node:fs/promises");
      delta = JSON.parse(await fs.readFile(deltaPath, "utf-8"));
    } catch { /* delta unavailable */ }

    console.log();
    console.log(`${C.B}=== Independent Verifier Result ===${C.N}`);
    console.log(`Clone dir:    ${verifierResult.cloneDir}`);
    console.log(`Classification: ${verifierResult.classification}`);

    if (verifierResult.failures.length > 0) {
      console.log(`${C.R}Failures:${C.N}`);
      for (const f of verifierResult.failures) {
        console.log(`  - ${f}`);
      }
    }

    if (delta?.hasDivergence) {
      console.log(`${C.Y}AMBER_PRIMARY_VERIFIER_DIVERGENCE detected${C.N}`);
      updateSummaryClassification(summary, "AMBER_PRIMARY_VERIFIER_DIVERGENCE");
    }

    if (verifierResult.classification === "RED_INFRASTRUCTURE_FAILURE") {
      updateSummaryClassification(summary, "RED_TEST_INFRASTRUCTURE_FAILURE");
    }

    await writeEvidenceAtomic(
      opts["json-summary"] || join(EVIDENCE_DIR, "03-primary-summary.json"),
      JSON.stringify({ ...summary, gates: cleanResults }, null, 2)
    );
  }

  // Write context manifest
  const manifest = {
    run_id: RUN_ID,
    tested_git_sha: sha,
    branch,
    os: `${process.platform} ${process.arch}`,
    node: process.version,
    cwd: ROOT,
    mode,
    started_at: results[0]?.started_at || new Date().toISOString(),
    tools: {},
  };
  try {
    manifest.tools.node = process.version;
    const { stdout: pnpmV } = await runCommand("pnpm", ["--version"]);
    manifest.tools.pnpm = pnpmV.trim();
    const { stdout: rustcV } = await runCommand("rustc", ["--version"]);
    manifest.tools.rustc = rustcV.trim().split(" ")[1] || rustcV.trim();
    const { stdout: gitV } = await runCommand("git", ["--version"]);
    manifest.tools.git = gitV.trim();
  } catch { /* non-critical */ }

  await writeEvidenceAtomic(
    join(EVIDENCE_DIR, "00-context-manifest.json"),
    JSON.stringify(manifest, null, 2)
  );

  // Write Final Report
  const report = generateFinalReport(summary, results, sha, branch, manifest);
  await writeEvidenceAtomic(
    join(EVIDENCE_DIR, "FINAL-REPORT.md"),
    report
  );

  // Print summary
  console.log();
  console.log(`${C.B}=== Summary ===${C.N}`);
  console.log(`Classification: ${summary.classification}`);
  console.log(
    `Gates: ${summary.passed} PASS / ${summary.failed} RED / ${summary.yellow} YELLOW / ${summary.amber} AMBER`
  );
  console.log(`Evidence: ${EVIDENCE_DIR}`);
  console.log();

  // Exit with appropriate code
  if (summary.classification.startsWith("RED_")) process.exit(1);
  if (summary.classification === "AMBER_PRIMARY_VERIFIER_DIVERGENCE") process.exit(1);
  process.exit(0);
}

// ── Run ──

main().catch((err) => {
  console.error(`${C.R}Fatal: ${err.message}${C.N}`);
  console.error(err.stack);
  process.exit(2);
});
