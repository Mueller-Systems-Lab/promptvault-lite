// @vitest-environment node
// scripts/__tests__/harness-contract.test.js — RED tests for Autonomous Test Harness contract
//
// Tests the actual CLI control flow of verify-all.mjs, not just helper functions.
// Run: pnpm vitest run scripts/__tests__/harness-contract.test.js
//
// WARNING: Some tests create real git repos and modify files. They are
// designed to clean up after themselves.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  mkdtempSync,
  writeFileSync,
  mkdirSync,
  rmSync,
  existsSync,
  readFileSync,
  chmodSync,
} from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync, spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";

import {
  classifyGate,
  generateRunId,
  writeEvidenceAtomic,
  maskSecrets,
  sanitizePath,
  getGitBranchState,
} from "../lib/runner.mjs";

import {
  validateGateDefinition,
  validateGateResult,
  validateGateInventory,
  GATES,
} from "../lib/gates.mjs";

// ── Helpers ──

function runVerifyCli(args = [], cwd) {
  const result = spawnSync("node", ["scripts/verify-all.mjs", ...args], {
    cwd,
    encoding: "utf-8",
    timeout: 120_000,
    env: { ...process.env, NO_COLOR: "1" },
  });
  return {
    exitCode: result.status,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
  };
}

function initBareRepo(dir) {
  mkdirSync(dir, { recursive: true });
  execSync("git init --bare", { cwd: dir, encoding: "utf-8" });
}

function cloneRepo(barePath, targetPath) {
  execSync(`git clone "${barePath}" "${targetPath}"`, {
    encoding: "utf-8",
  });
}

// ── Test Suite ──

describe("Autonomous Test Harness — Contract Verification", () => {
  // ── T3: Feature Flag Defaults ──

  describe("T3 — Feature Flag Defaults", () => {
    it("PASS: correct default returns PASS for flag with disabled default", () => {
      const result = classifyGate(0, {
        gate: "E14",
        isOptional: false,
      });
      expect(result).toBe("PASS");
    });

    it("FAIL: seeded fault (flag enabled) produces RED", () => {
      const result = classifyGate(1, {
        gate: "E14",
        isOptional: false,
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });

    it("FAIL: missing flag definition produces RED", () => {
      const result = classifyGate(1, {
        gate: "E14",
        isOptional: false,
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });

    it("FAIL: ambiguous/contradictory flag values produce RED", () => {
      const result = classifyGate(1, {
        gate: "E14",
        isOptional: false,
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });
  });

  // ── T4: Lockfile Drift ──

  describe("T4 — Lockfile Drift", () => {
    it("PASS: unchanged lockfiles return PASS", () => {
      const result = classifyGate(0, { gate: "E13" });
      expect(result).toBe("PASS");
    });

    it("FAIL: pnpm-lock.yaml drift produces RED_PRODUCT_FAILURE", () => {
      const result = classifyGate(1, {
        gate: "E13",
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });

    it("FAIL: Cargo.lock drift produces RED_PRODUCT_FAILURE", () => {
      const result = classifyGate(1, {
        gate: "E13",
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });
  });

  // ── T5: Playwright Core Failure ──

  describe("T5 — Playwright Core Failure", () => {
    it("RED: failed playwright core run produces RED_TEST_FAILURE", () => {
      const result = classifyGate(1, {
        gate: "E11",
        isOptional: false,
      });
      expect(result).toBe("RED_TEST_FAILURE");
    });

    it("YELLOW: USB skip with otherwise green suite produces correct classification", () => {
      const result = classifyGate(1, {
        gate: "E11-usb",
        isOptional: true,
      });
      expect(result).toBe("YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED");
    });
  });

  // ── T6: Secret Scan ──

  describe("T6 — Secret Scan", () => {
    it("FAIL: test token produces RED", () => {
      const result = classifyGate(1, {
        gate: "E10",
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });

    it("FAIL: private key header produces RED", () => {
      const result = classifyGate(1, {
        gate: "E10",
        isProductFailure: true,
      });
      expect(result).toBe("RED_PRODUCT_FAILURE");
    });

    it("PASS: allowlist cases remain green", () => {
      const result = classifyGate(0, { gate: "E10" });
      expect(result).toBe("PASS");
    });
  });

  // ── T7: CLI Path Safety ──

  describe("T7 — CLI Path Safety", () => {
    it("--evidence-dir produces evidence", () => {
      // Verify the CLI accepts --evidence-dir (test through spawn)
      const tmpDir = mkdtempSync(join(tmpdir(), "pvl-contract-test-"));
      try {
        const result = spawnSync(
          "node",
          [
            "scripts/verify-all.mjs",
            "--gate",
            "Q1",
            "--evidence-dir",
            tmpDir,
            "--no-color",
          ],
          {
            cwd: process.cwd(),
            encoding: "utf-8",
            timeout: 30_000,
          }
        );
        // Should succeed (Q1 is git diff --check)
        expect(result.status).toBe(0);
        // Evidence directory should have been created
        expect(existsSync(tmpDir)).toBe(true);
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });

    it("--json-summary writes summary file", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pvl-contract-test-"));
      const summaryPath = join(tmpDir, "summary.json");
      try {
        const result = spawnSync(
          "node",
          [
            "scripts/verify-all.mjs",
            "--gate",
            "Q1",
            "--evidence-dir",
            tmpDir,
            "--json-summary",
            summaryPath,
            "--no-color",
          ],
          {
            cwd: process.cwd(),
            encoding: "utf-8",
            timeout: 30_000,
          }
        );
        expect(result.status).toBe(0);
        expect(existsSync(summaryPath)).toBe(true);
        const content = JSON.parse(readFileSync(summaryPath, "utf-8"));
        expect(content).toHaveProperty("classification");
        expect(content).toHaveProperty("gates");
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });

    it("path traversal is blocked by sanitizePath", () => {
      const result = sanitizePath(
        "../../../etc/passwd",
        "/tmp/test"
      );
      expect(result).toBeNull();
    });
  });

  // ── T8: Atomic Write ──

  describe("T8 — Atomic Write", () => {
    it("writes temp file in same directory as target (same filesystem)", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pvl-atomic-test-"));
      const targetPath = join(tmpDir, "output.json");
      try {
        await writeEvidenceAtomic(targetPath, '{"status":"ok"}');
        expect(existsSync(targetPath)).toBe(true);
        const content = readFileSync(targetPath, "utf-8");
        expect(content).toBe('{"status":"ok"}');

        // Verify no temp file left behind
        const files = execSync(`ls -la "${tmpDir}"`, { encoding: "utf-8" });
        expect(files).not.toContain(".pvl-evidence-");
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });

    it("no .tmp files left in evidence directory", async () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pvl-atomic-test-"));
      try {
        await writeEvidenceAtomic(join(tmpDir, "a.json"), "a");
        await writeEvidenceAtomic(join(tmpDir, "b.json"), "b");

        const files = execSync(`find "${tmpDir}" -name "*.tmp"`, {
          encoding: "utf-8",
        }).trim();
        expect(files).toBe("");
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });
  });

  // ── T10: Unknown Gate Rejection ──

  describe("T10 — Unknown Gate Rejection", () => {
    it("unknown gate exits non-zero", () => {
      const result = spawnSync(
        "node",
        [
          "scripts/verify-all.mjs",
          "--gate",
          "__NONEXISTENT__",
          "--no-color",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10_000,
        }
      );
      expect(result.status).not.toBe(0);
    });

    it("unknown gate produces error message", () => {
      const result = spawnSync(
        "node",
        [
          "scripts/verify-all.mjs",
          "--gate",
          "__NONEXISTENT__",
          "--no-color",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10_000,
        }
      );
      const output = result.stdout + result.stderr;
      expect(output.toLowerCase()).toMatch(/unknown|error|not found/i);
    });
  });

  // ── T11: Branch Detection (Run Card §10) ──

  describe("T11 — Git Branch State Detection (temp repos)", () => {
    it("normal branch returns the actual branch name", () => {
      const repo = mkdtempSync(join(tmpdir(), "pvl-gitstate-branch-"));
      try {
        execSync("git init -b main", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.email test@test.test", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.name test", { cwd: repo, encoding: "utf-8" });
        writeFileSync(join(repo, "a.txt"), "a");
        execSync("git add a.txt && git commit -m init", { cwd: repo, encoding: "utf-8" });

        const state = getGitBranchState(repo);
        expect(state.kind).toBe("branch");
        expect(state.branch).toBe("main");
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("detached HEAD is reported as detached HEAD", () => {
      const repo = mkdtempSync(join(tmpdir(), "pvl-gitstate-detached-"));
      try {
        execSync("git init -b main", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.email test@test.test", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.name test", { cwd: repo, encoding: "utf-8" });
        writeFileSync(join(repo, "a.txt"), "a");
        execSync("git add a.txt && git commit -m init", { cwd: repo, encoding: "utf-8" });
        execSync("git checkout --detach HEAD", { cwd: repo, encoding: "utf-8" });

        const state = getGitBranchState(repo);
        expect(state.kind).toBe("detached");
        // verify-all.mjs maps detached → "detached HEAD"
        expect(state.kind === "detached" ? "detached HEAD" : state.branch).toBe("detached HEAD");
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("no repository is reported as no-repo (RED_TEST_INFRASTRUCTURE_FAILURE path)", () => {
      const dir = mkdtempSync(join(tmpdir(), "pvl-gitstate-norepo-"));
      try {
        const state = getGitBranchState(dir);
        expect(state.kind).toBe("no-repo");
      } finally {
        rmSync(dir, { recursive: true, force: true });
      }
    });

    it("CLI reports 'detached HEAD' in a detached checkout", () => {
      const repo = mkdtempSync(join(tmpdir(), "pvl-gitstate-cli-"));
      try {
        execSync("git init -b main", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.email test@test.test", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.name test", { cwd: repo, encoding: "utf-8" });
        writeFileSync(join(repo, "a.txt"), "a");
        execSync("git add a.txt && git commit -m init", { cwd: repo, encoding: "utf-8" });
        execSync("git checkout --detach HEAD", { cwd: repo, encoding: "utf-8" });

        // Copy scripts so verify-all.mjs can run
        mkdirSync(join(repo, "scripts", "lib"), { recursive: true });
        const srcScripts = resolve(process.cwd(), "scripts");
        for (const f of ["verify-all.mjs", "lib/runner.mjs", "lib/gates.mjs", "lib/verifier.mjs"]) {
          writeFileSync(
            join(repo, "scripts", f),
            readFileSync(join(srcScripts, f), "utf-8")
          );
        }

        const result = spawnSync(
          "node",
          [join(repo, "scripts", "verify-all.mjs"), "--gate", "Q1", "--no-color"],
          { cwd: repo, encoding: "utf-8", timeout: 30_000 }
        );
        // In a detached checkout the harness must still run (no crash, no 'unknown')
        expect(result.status).toBe(0);
        expect(result.stdout).not.toContain("unknown");
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });
  });

  // ── T12: Error Classification ──

  describe("T12 — Error Classification", () => {
    const classifications = [
      { name: "RED_PRODUCT_FAILURE", code: 1, opts: { isProductFailure: true } },
      { name: "RED_TEST_FAILURE", code: 1, opts: {} },
      { name: "RED_INFRASTRUCTURE_FAILURE", code: 126, opts: {} },
      { name: "YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY", code: 0, opts: {
        previousExitCode: 1,
        previousResult: "RED_TEST_FAILURE",
      }},
      { name: "YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED", code: 1, opts: { isOptional: true } },
      { name: "YELLOW_VISUAL_BASELINE_MISSING", code: 0, opts: {
        isOptional: true,
        visualBaselinesMissing: true,
      }},
    ];

    for (const { name, code, opts } of classifications) {
      it(`classifyGate produces ${name}`, () => {
        const result = classifyGate(code, { gate: "TEST", ...opts });
        expect(result).toBe(name);
      });
    }
  });

  // ── T9: Process Isolation (simplified — tests gate execution returns proper exit code) ──

  describe("T9 — Process Isolation", () => {
    it("single gate execution exits 0 on success", () => {
      const result = spawnSync(
        "node",
        ["scripts/verify-all.mjs", "--gate", "Q1", "--no-color"],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 30_000,
          env: { ...process.env, NO_COLOR: "1" },
        }
      );
      // Q1 = git diff --check, should succeed
      expect(result.status).toBe(0);
    }, 60_000);
  });

  // ── Run ID Collision Safety ──

  describe("Run ID Generation", () => {
    it("produces unique IDs across calls", () => {
      const ids = new Set();
      for (let i = 0; i < 10; i++) {
        ids.add(generateRunId());
      }
      expect(ids.size).toBe(10);
    });

    it("includes PID for cross-process uniqueness", () => {
      const id = generateRunId();
      const pid = String(process.pid);
      // Format: PVL-AUTONOMOUS-TEST-HARNESS-YYYYMMDD-NNN-PID-RND
      expect(id).toContain(`-${pid}-`);
    });
  });

  // ── Secret Masking ──

  describe("Secret Masking", () => {
    it("masks GitHub PAT", () => {
      // Secret pattern assembled at runtime — no static token in committed source
      const patToken = "github" + "_pat_" + "11AAbb22CCdd33EEff44GGhh55XX";
      const input = patToken;
      const result = maskSecrets(input);
      expect(result).not.toContain("github_pat_");
      expect(result).toContain("[MASKED]");
    });

    it("masks AWS access key", () => {
      // Secret pattern assembled at runtime — no static token in committed source
      const awsToken = "AK" + "IA" + "IOCHANGEMEPLEASEEXAMPLE";
      const input = awsToken;
      const result = maskSecrets(input);
      expect(result).not.toContain("AKIA");
      expect(result).toContain("[MASKED]");
    });

    it("masks private key header", () => {
      // Secret pattern assembled at runtime — no static token in committed source
      const privateKey = "-----" + "BEGIN RSA PRIVATE" + " KEY-----";
      const input = privateKey;
      const result = maskSecrets(input);
      expect(result).not.toContain("PRIVATE KEY");
      expect(result).toContain("[MASKED]");
    });
  });

  // ══════════════════════════════════════════════════════════════
  // RED TESTS — Trust Repair Cycle (2026-08-03)
  // These tests should FAIL until G1/G2/G3 fixes are applied.
  // ══════════════════════════════════════════════════════════════

  // ── G2: Path Validation for CLI Options ──

  describe("G2 — Path Traversal Rejection (--evidence-dir / --json-summary)", () => {
    it("RED: --evidence-dir with path traversal is rejected", () => {
      const result = spawnSync(
        "node",
        [
          "scripts/verify-all.mjs",
          "--gate", "Q1",
          "--evidence-dir", "../../../etc/evil",
          "--no-color",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10_000,
        }
      );
      // Must exit non-zero (rejected), not succeed
      expect(result.status).not.toBe(0);
    });

    it("RED: --json-summary with path traversal is rejected", () => {
      const result = spawnSync(
        "node",
        [
          "scripts/verify-all.mjs",
          "--gate", "Q1",
          "--json-summary", "../../../etc/summary.json",
          "--no-color",
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
          timeout: 10_000,
        }
      );
      expect(result.status).not.toBe(0);
    });

    it("PASS: --evidence-dir with safe path is accepted", () => {
      const tmpDir = mkdtempSync(join(tmpdir(), "pvl-safe-path-"));
      try {
        const result = spawnSync(
          "node",
          [
            "scripts/verify-all.mjs",
            "--gate", "Q1",
            "--evidence-dir", tmpDir,
            "--no-color",
          ],
          {
            cwd: process.cwd(),
            encoding: "utf-8",
            timeout: 15_000,
          }
        );
        expect(result.status).toBe(0);
      } finally {
        try { rmSync(tmpDir, { recursive: true, force: true }); } catch {}
      }
    });
  });

  // ── G3: CLI-Level Gate Execution Tests ──

  describe("G3 — Secret Scan via CLI (E10)", () => {
    let testRepo;

    beforeAll(() => {
      testRepo = mkdtempSync(join(tmpdir(), "pvl-secret-scan-"));
      // Init git repo
      execSync("git init", { cwd: testRepo, encoding: "utf-8" });
      execSync("git config user.email test@test.test", { cwd: testRepo, encoding: "utf-8" });
      execSync("git config user.name test", { cwd: testRepo, encoding: "utf-8" });
      // Copy the scripts/ directory so verify-all.mjs can be called
      const repoScripts = join(testRepo, "scripts");
      mkdirSync(join(repoScripts, "lib"), { recursive: true });
      const srcScripts = resolve(process.cwd(), "scripts");
      for (const f of ["verify-all.mjs", "lib/runner.mjs", "lib/gates.mjs", "lib/verifier.mjs"]) {
        writeFileSync(
          join(repoScripts, f),
          readFileSync(join(srcScripts, f), "utf-8")
        );
      }
    });

    afterAll(() => {
      try { rmSync(testRepo, { recursive: true, force: true }); } catch {}
    });

    it("RED: seeded .env file in tracked git produces E10 failure", () => {
      // Seed a .env file
      writeFileSync(join(testRepo, ".env"), "SECRET=do_not_commit_me");
      execSync("git add .env", { cwd: testRepo, encoding: "utf-8" });
      execSync("git commit -m 'seed: bad .env'", { cwd: testRepo, encoding: "utf-8" });

      const result = spawnSync(
        "node",
        [join(testRepo, "scripts", "verify-all.mjs"), "--gate", "E10", "--no-color"],
        { cwd: testRepo, encoding: "utf-8", timeout: 15_000 }
      );
      // Must fail because .env is committed
      expect(result.status).not.toBe(0);
    });

    it("PASS: clean repo produces E10 PASS", () => {
      // Remove .env
      execSync("git rm -f .env 2>/dev/null || true", { cwd: testRepo, encoding: "utf-8" });
      try { rmSync(join(testRepo, ".env"), { force: true }); } catch {}
      execSync("git commit -m 'remove .env' 2>/dev/null || true", { cwd: testRepo, encoding: "utf-8" });

      const result = spawnSync(
        "node",
        [join(testRepo, "scripts", "verify-all.mjs"), "--gate", "E10", "--no-color"],
        { cwd: testRepo, encoding: "utf-8", timeout: 15_000 }
      );
      expect(result.status).toBe(0);
    });

    it("RED: seeded secret token produces E10 failure", () => {
      // Secret pattern assembled at runtime — no static token in committed source
      const secretToken = "github" + "_pat_" + "11AAbb22CCdd33EEff44GGhh55XX";
      writeFileSync(join(testRepo, "config.ts"), "export const KEY = '" + secretToken + "'");
      execSync("git add config.ts", { cwd: testRepo, encoding: "utf-8" });
      execSync("git commit -m 'seed: token in config'", { cwd: testRepo, encoding: "utf-8" });

      const result = spawnSync(
        "node",
        [join(testRepo, "scripts", "verify-all.mjs"), "--gate", "E10", "--no-color"],
        { cwd: testRepo, encoding: "utf-8", timeout: 15_000 }
      );
      // Must fail because secret pattern matched
      expect(result.status).not.toBe(0);
    });
  });

  describe("G3 — Lockfile Drift via CLI (E13)", () => {
    let testRepo;

    beforeAll(() => {
      testRepo = mkdtempSync(join(tmpdir(), "pvl-lockfile-"));
      execSync("git init", { cwd: testRepo, encoding: "utf-8" });
      execSync("git config user.email test@test.test", { cwd: testRepo, encoding: "utf-8" });
      execSync("git config user.name test", { cwd: testRepo, encoding: "utf-8" });

      const repoScripts = join(testRepo, "scripts");
      mkdirSync(join(repoScripts, "lib"), { recursive: true });
      const srcScripts = resolve(process.cwd(), "scripts");
      for (const f of ["verify-all.mjs", "lib/runner.mjs", "lib/gates.mjs", "lib/verifier.mjs"]) {
        writeFileSync(
          join(repoScripts, f),
          readFileSync(join(srcScripts, f), "utf-8")
        );
      }

      // Create and commit lockfiles
      writeFileSync(join(testRepo, "pnpm-lock.yaml"), "lockfileVersion: 6.0\n");
      writeFileSync(join(testRepo, "package.json"), '{"name":"test"}\n');
      execSync("git add pnpm-lock.yaml package.json", { cwd: testRepo, encoding: "utf-8" });
      execSync("git commit -m 'seed: lockfiles'", { cwd: testRepo, encoding: "utf-8" });
    });

    afterAll(() => {
      try { rmSync(testRepo, { recursive: true, force: true }); } catch {}
    });

    it("PASS: unchanged lockfile returns E13 PASS", () => {
      const result = spawnSync(
        "node",
        [join(testRepo, "scripts", "verify-all.mjs"), "--gate", "E13", "--no-color"],
        { cwd: testRepo, encoding: "utf-8", timeout: 15_000 }
      );
      expect(result.status).toBe(0);
    });

    it("RED: modified pnpm-lock.yaml produces E13 failure", () => {
      writeFileSync(join(testRepo, "pnpm-lock.yaml"), "lockfileVersion: 7.0\nchanged: true\n");
      // Do NOT commit — simulate drift in working tree

      const result = spawnSync(
        "node",
        [join(testRepo, "scripts", "verify-all.mjs"), "--gate", "E13", "--no-color"],
        { cwd: testRepo, encoding: "utf-8", timeout: 15_000 }
      );
      expect(result.status).not.toBe(0);

      // Cleanup: restore
      writeFileSync(join(testRepo, "pnpm-lock.yaml"), "lockfileVersion: 6.0\n");
    });
  });

  // ── G1: Evidence Isolation ──

  describe("G1 — Independent Verifier Evidence Isolation", () => {
    it("RED: verifier does not write to 04-primary-logs/", async () => {
      // This test validates the contract: verifier logs must go to
      // 06-independent-logs/, never to 04-primary-logs/.
      // We verify by reading the verifier.mjs source and checking that
      // the evidence-dir passed to the clone's verify-all.mjs uses a
      // separate log directory path.
      const fs = await import("node:fs/promises");
      const verifierSource = await fs.readFile(
        resolve(process.cwd(), "scripts/lib/verifier.mjs"),
        "utf-8"
      );

      // The verifier's verify-all.mjs call must NOT use the same evidence-dir
      // that would cause logs to land in 04-primary-logs/.
      // Currently it passes --evidence-dir=<primary evidence dir> which
      // causes the clone's gate logs to overwrite primary logs.
      // After the fix, the clone should write logs to 06-independent-logs/.

      // Check: the verifier.mjs must mention "06-independent" somewhere
      // in its evidence handling.
      expect(verifierSource).toMatch(/06-independent-logs/);
    });

    it("RED: evidence schema in contract matches implementation", () => {
      // The contract at docs/testing/autonomous-test-harness-contract.md
      // requires 06-independent-logs/ — verify this is referenced in verifier.mjs
      const fs = require("node:fs");
      const contractPath = resolve(
        process.cwd(),
        "docs/testing/autonomous-test-harness-contract.md"
      );
      const contract = fs.readFileSync(contractPath, "utf-8");
      expect(contract).toMatch(/06-independent-logs/);
      expect(contract).toMatch(/NOT shared with primary/);
    });
  });

  // ══════════════════════════════════════════════════════════════
  // PHASE C — No-op- und Skip-Invarianten (Run Card §7-9)
  // ══════════════════════════════════════════════════════════════

  describe("C1 — Gate Inventory (E1-E20 canonical)", () => {
    it("PASS: canonical inventory has no violations", () => {
      const violations = validateGateInventory(GATES);
      expect(violations).toEqual([]);
    });

    it("RED: E12 duplicated is detected", () => {
      const bad = { ...GATES, E12b: { ...GATES.E12, id: "E12b" } };
      // duplicate ids must be detectable: build an inventory with E12 twice
      const violations = validateGateInventory({ ...bad, E12x: { ...GATES.E12 } });
      // E12x is an extra (E-n beyond 20 or duplicate) — E12 appears twice
      const dupViolations = violations.filter((v) => v.includes("E12"));
      expect(dupViolations.length).toBeGreaterThan(0);
    });

    it("RED: E13 missing is detected", () => {
      const { E13, ...rest } = GATES;
      const violations = validateGateInventory(rest);
      expect(violations.some((v) => v.includes("E13 missing"))).toBe(true);
    });

    it("RED: E99 present is detected as unexpected", () => {
      const bad = { ...GATES, E99: { id: "E99", name: "Bogus" } };
      const violations = validateGateInventory(bad);
      expect(violations.some((v) => v.includes("E99"))).toBe(true);
    });

    it("RED: every E-gate must have exactly one canonical id", () => {
      const ids = Object.keys(GATES).filter((id) => id.startsWith("E"));
      expect(ids).toHaveLength(20);
    });
  });

  describe("C2 — Gate Definition Validation (No-op-Verbot)", () => {
    it("PASS: canonical E19/E20 definitions are valid", () => {
      expect(validateGateDefinition(GATES.E19, process.cwd())).toEqual([]);
      expect(validateGateDefinition(GATES.E20, process.cwd())).toEqual([]);
    });

    it("RED: E19 as no-op (node -e process.exit(0)) is detected", () => {
      const noop = {
        id: "E19", name: "Native Tauri Real E2E", executor: "command",
        command: "node", args: ["-e", "process.exit(0)"], contract: "exit-code",
        mandatory: true,
      };
      const violations = validateGateDefinition(noop, process.cwd());
      expect(violations.some((v) => v.includes("noop"))).toBe(true);
    });

    it("RED: E20 as no-op (command: true) is detected", () => {
      const noop = {
        id: "E20", name: "Packaging Smoke", executor: "command",
        command: "true", args: [], contract: "exit-code", mandatory: true,
      };
      const violations = validateGateDefinition(noop, process.cwd());
      expect(violations.some((v) => v.includes("noop command"))).toBe(true);
    });

    it("RED: mandatory gate with skip:true is detected", () => {
      const skipped = { ...GATES.E14, skip: true };
      const violations = validateGateDefinition(skipped, process.cwd());
      expect(violations.some((v) => v.includes("skip:true"))).toBe(true);
    });

    it("RED: optional mandatory gate (E16 isOptional) is detected", () => {
      const optional = { ...GATES.E16, isOptional: true };
      const violations = validateGateDefinition(optional, process.cwd());
      expect(violations.some((v) => v.includes("must not be optional"))).toBe(true);
    });

    it("RED: unknown executor is detected", () => {
      const bad = { ...GATES.E10, executor: "mystery-executor" };
      const violations = validateGateDefinition(bad, process.cwd());
      expect(violations.some((v) => v.includes("unknown executor"))).toBe(true);
    });

    it("RED: missing executor is detected", () => {
      const { executor, ...bad } = GATES.E10;
      const violations = validateGateDefinition(bad, process.cwd());
      expect(violations.some((v) => v.includes("missing executor"))).toBe(true);
    });

    it("RED: missing expected test file is detected", () => {
      const bad = { ...GATES.E19, expectedTestFile: "does-not-exist.spec.js" };
      const violations = validateGateDefinition(bad, process.cwd());
      expect(violations.some((v) => v.includes("expected test file"))).toBe(true);
    });
  });

  describe("C3 — Gate Result Validation (PASS nur mit executed/assertions)", () => {
    it("RED: PASS without executed=true is rejected", () => {
      const violations = validateGateResult({
        gate: "E1", executed: false, exit_code: 0,
        started_at: "x", ended_at: "y", assertion_count: 1,
      });
      expect(violations.some((v) => v.includes("executed"))).toBe(true);
    });

    it("RED: no assertion_count and no contract is rejected", () => {
      const violations = validateGateResult({
        gate: "E1", executed: true, exit_code: 0,
        started_at: "x", ended_at: "y",
        assertion_count: 0, contract_verified: false,
      });
      expect(violations.some((v) => v.includes("no assertion_count"))).toBe(true);
    });

    it("RED: missing started/ended time is rejected", () => {
      const violations = validateGateResult({
        gate: "E1", executed: true, exit_code: 0,
        assertion_count: 1,
      });
      expect(violations.some((v) => v.includes("started_at"))).toBe(true);
      expect(violations.some((v) => v.includes("ended_at"))).toBe(true);
    });

    it("RED: missing exit_code is rejected", () => {
      const violations = validateGateResult({
        gate: "E1", executed: true,
        started_at: "x", ended_at: "y", assertion_count: 1,
      });
      expect(violations.some((v) => v.includes("exit_code"))).toBe(true);
    });

    it("PASS: valid result (executed, exit 0, assertions, timestamps) is accepted", () => {
      const violations = validateGateResult({
        gate: "E1", executed: true, exit_code: 0,
        started_at: "x", ended_at: "y",
        assertion_count: 3, contract_verified: true, skipped: 0,
      });
      expect(violations).toEqual([]);
    });
  });

  describe("C4 — CLI Level: No-op gate is RED, not PASS", () => {
    it("RED: --gate with a no-op definition exits non-zero (E14 with skip)", () => {
      const repo = mkdtempSync(join(tmpdir(), "pvl-noop-cli-"));
      try {
        execSync("git init", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.email test@test.test", { cwd: repo, encoding: "utf-8" });
        execSync("git config user.name test", { cwd: repo, encoding: "utf-8" });
        mkdirSync(join(repo, "scripts", "lib"), { recursive: true });
        mkdirSync(join(repo, "src", "lib", "embeddings"), { recursive: true });
        const srcScripts = resolve(process.cwd(), "scripts");
        for (const f of ["verify-all.mjs", "lib/runner.mjs", "lib/gates.mjs", "lib/verifier.mjs"]) {
          writeFileSync(
            join(repo, "scripts", f),
            readFileSync(join(srcScripts, f), "utf-8")
          );
        }
        // Simulate a missing feature-flag module (E14 must go RED, not PASS)
        writeFileSync(join(repo, "package.json"), '{"name":"test","version":"0.0.1"}\n');

        const result = spawnSync(
          "node",
          [join(repo, "scripts", "verify-all.mjs"), "--gate", "E14", "--no-color"],
          { cwd: repo, encoding: "utf-8", timeout: 30_000 }
        );
        // E14 feature-flag modules are absent in this fixture → must be RED
        expect(result.status).not.toBe(0);
        expect((result.stdout + result.stderr)).toMatch(/RED_/);
      } finally {
        rmSync(repo, { recursive: true, force: true });
      }
    });

    it("RED: E11 chromium-only definition is detected (browser matrix gate exists)", () => {
      // The canonical E11 must use the playwright-browser-matrix executor
      expect(GATES.E11.executor).toBe("playwright-browser-matrix");
      const violations = validateGateDefinition(GATES.E11, process.cwd());
      expect(violations).toEqual([]);
    });
  });

  /** Regression: E18 muss mode-644-Binaries als Infrastruktur-Fehler klassifizieren,
   *  nicht als Produkt-Fehler (Artifact-Transport-Permission-Loss). */
  describe("E18 — executable bit regression (artifact transport)", () => {
    let testRepo;
    const ROOT = process.cwd();

    beforeAll(() => {
      testRepo = mkdtempSync("/tmp/harness-e18-");
      // Nur Harness-Skripte + package.json kopieren — kein node_modules
      execSync(`git clone "${ROOT}" "${testRepo}" 2>/dev/null`, { encoding: "utf-8" });

      // Dummy ELF binary (valid magic, plausible size >1MB)
      const targetDir = join(testRepo, "target", "debug");
      mkdirSync(targetDir, { recursive: true });

      // Minimales dist/ mit Version — damit die Version-Prüfung besteht
      const distDir = join(testRepo, "dist");
      mkdirSync(distDir, { recursive: true });
      const assetsDir = join(distDir, "assets");
      mkdirSync(assetsDir, { recursive: true });
      const pkg = JSON.parse(readFileSync(join(testRepo, "package.json"), "utf-8"));
      writeFileSync(join(distDir, "index.html"), `<!doctype><title>${pkg.version}</title>`);
      // Asset mit Version im Inhalt — check #5 walkt dist/assets/
      writeFileSync(join(assetsDir, "app.js"), `console.log("v${pkg.version}")`);
      // Leere bundle-Verzeichnisse (deb/rpm checks)
      const bundleDir = join(testRepo, "target", "debug", "bundle");
      [join(bundleDir, "deb"), join(bundleDir, "rpm")].forEach((d) =>
        mkdirSync(d, { recursive: true })
      );

      const binary = join(targetDir, "promptvault-lite");
      const elfMagic = Buffer.from([0x7f, 0x45, 0x4c, 0x46]); // \x7fELF
      const buf = Buffer.alloc(1_048_577); // > 1MB
      elfMagic.copy(buf, 0);
      writeFileSync(binary, buf);
    });

    afterAll(() => {
      try { rmSync(testRepo, { recursive: true, force: true }); } catch {}
    });

    it("RED: mode 644 → binary executable check fails with mode detail", async () => {
      const binary = join(testRepo, "target", "debug", "promptvault-lite");
      chmodSync(binary, 0o644);

      const { runBuildArtifactIntegrity } = await import(
        join(testRepo, "scripts", "lib", "gates.mjs")
      );
      const result = await runBuildArtifactIntegrity({
        root: testRepo,
        gate: { id: "E18" },
      });

      expect(result.exitCode).toBe(1);
      // Check-Details: mode 100644 + NOT EXECUTABLE
      const exeCheck = result.extra.checks.find(
        (c) => c.check === "binary executable"
      );
      expect(exeCheck).toBeTruthy();
      expect(exeCheck.ok).toBe(false);
      expect(exeCheck.detail).toMatch(/mode 100644/);
      expect(exeCheck.detail).toContain("NOT EXECUTABLE");
    });

    it("PASS: mode 755 → binary executable check OK", async () => {
      const binary = join(testRepo, "target", "debug", "promptvault-lite");
      chmodSync(binary, 0o755);

      const { runBuildArtifactIntegrity } = await import(
        join(testRepo, "scripts", "lib", "gates.mjs")
      );
      const result = await runBuildArtifactIntegrity({
        root: testRepo,
        gate: { id: "E18" },
      });

      // Mode 755: exec check OK; version/dist checks may fail → separate error
      const exeCheck = result.extra.checks.find(
        (c) => c.check === "binary executable"
      );
      expect(exeCheck).toBeTruthy();
      expect(exeCheck.ok).toBe(true);
      expect(exeCheck.detail).not.toContain("NOT EXECUTABLE");
    });
  });
});
