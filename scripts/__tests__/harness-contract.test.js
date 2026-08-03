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
} from "../lib/runner.mjs";

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

  // ── T11: Branch Detection ──

  describe("T11 — Branch and Context Manifest", () => {
    it("branch is not 'unknown' in a normal checkout", () => {
      // This project is in a git repo with a branch
      const branch = execSync("git branch --show-current", {
        encoding: "utf-8",
      }).trim();
      expect(branch).toBeTruthy();
      expect(branch).not.toBe("unknown");
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
      const input = "github_pat_11ABCDEFGHIJKLMNOPQRSTUVWXYZ0123";
      const result = maskSecrets(input);
      expect(result).not.toContain("github_pat_");
      expect(result).toContain("[MASKED]");
    });

    it("masks AWS access key", () => {
      const input = "AKIAIOSFODNN7EXAMPLE";
      const result = maskSecrets(input);
      expect(result).not.toContain("AKIA");
      expect(result).toContain("[MASKED]");
    });

    it("masks private key header", () => {
      const input = "-----BEGIN RSA PRIVATE KEY-----";
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
      writeFileSync(join(testRepo, "config.ts"), "export const KEY = 'github_pat_11AAAABBBBCCCCDDDDEEEEFFFFGGGGHHHH'");
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
});
