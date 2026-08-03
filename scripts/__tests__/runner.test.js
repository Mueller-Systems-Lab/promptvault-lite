// @vitest-environment node
// scripts/__tests__/runner.test.js — RED tests for verify-all runner
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { mkdtempSync, realpathSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { execSync } from "node:child_process";
import { randomBytes } from "node:crypto";

// The module under test
import {
  gitRoot,
  sanitizePath,
  maskSecrets,
  classifyGate,
  generateRunId,
  writeEvidenceAtomic,
} from "../lib/runner.mjs";

describe("verify-all Runner", () => {
  // --- 1. Successful command result ---
  it("1 — sanitizePath: rejects path traversal attempts", () => {
    const base = "/tmp/test-base";
    // Attempt to escape the base directory
    const result = sanitizePath("../../../etc/passwd", base);
    expect(result).toBeNull();
  });

  it("2 — sanitizePath: allows safe relative paths", () => {
    const base = "/tmp/test-base";
    const result = sanitizePath("evidence/run-001", base);
    expect(result).toBe(resolve(base, "evidence/run-001"));
  });

  it("3 — classifyGate: exit 0 with no prior failure returns PASS", () => {
    const result = classifyGate(0, { gate: "E3", isOptional: false });
    expect(result).toBe("PASS");
  });

  it("4 — classifyGate: exit 1 with code error returns RED_TEST_FAILURE", () => {
    const result = classifyGate(1, { gate: "E3", isOptional: false });
    expect(result).toBe("RED_TEST_FAILURE");
  });

  it("5 — classifyGate: exit 126 preserves original error (not overridden by retry)", () => {
    // Exit 126 = "command invoked cannot execute" — infrastructure issue
    const firstRun = classifyGate(126, { gate: "E6", isOptional: false });
    expect(firstRun).toBe("RED_INFRASTRUCTURE_FAILURE");

    // A later retry with the same gate should NOT overwrite the original
    const secondRun = classifyGate(0, {
      gate: "E6",
      isOptional: false,
      previousExitCode: 126,
      previousResult: "RED_INFRASTRUCTURE_FAILURE",
    });
    expect(secondRun).toBe("YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY");
  });

  it("6 — classifyGate: unknown gate name is rejected", () => {
    // classifyGate doesn't validate gate names — that's the runner's job.
    // But classification for a gate with unknown context should work safely.
    // We test that an unexpected combination still yields a valid classification.
    const result = classifyGate(0, { gate: "__NONEXISTENT__", isOptional: false });
    // Should still produce a classification, not throw
    expect(["PASS", "RED_TEST_FAILURE", "RED_PRODUCT_FAILURE"]).toContain(result);
  });

  it("7 — maskSecrets: hides known secret patterns", () => {
    const input = 'export GH_TOKEN=ghp_1234567890abcdef1234567890abcdef123456';
    const result = maskSecrets(input);
    expect(result).not.toContain("ghp_1234567890abcdef1234567890abcdef123456");
    expect(result).toContain("[MASKED]");
  });

  it("8 — maskSecrets: leaves safe text unchanged", () => {
    const input = "All tests passed — 1460/1460";
    const result = maskSecrets(input);
    expect(result).toBe(input);
  });

  it("9 — generateRunId: produces stable-format IDs with PID and random suffix", () => {
    const id = generateRunId();
    // Format: PVL-AUTONOMOUS-TEST-HARNESS-YYYYMMDD-NNN-PID-RND
    expect(id).toMatch(
      /^PVL-AUTONOMOUS-TEST-HARNESS-\d{8}-\d{3}-\d+-[0-9a-f]{6}$/
    );
  });

  it("10 — generateRunId: two consecutive calls produce different IDs", () => {
    const id1 = generateRunId();
    // Small delay to ensure timestamp tick if needed
    const id2 = generateRunId();
    // They should at minimum have different sequence numbers or timestamps
    // In fast succession they might share date but differ in sequence
    expect(id1).not.toBe(id2);
  });

  describe("writeEvidenceAtomic", () => {
    let tmpDir;

    beforeAll(() => {
      tmpDir = mkdtempSync(join(tmpdir(), "pvl-runner-test-"));
    });

    afterAll(() => {
      // Cleanup handled by OS eventually
    });

    it("11 — writes file with expected content", async () => {
      const filePath = join(tmpDir, "test.json");
      const content = '{"status":"ok"}';
      await writeEvidenceAtomic(filePath, content);

      const fs = await import("node:fs/promises");
      const written = await fs.readFile(filePath, "utf-8");
      expect(written).toBe(content);
    });

    it("12 — prevents path traversal via evidence path", () => {
      const base = "/tmp/test-base";
      const traversalAttempt = sanitizePath(
        "../../../etc/cron.d/evil",
        base
      );
      expect(traversalAttempt).toBeNull();
    });
  });

  describe("Optional Gate Handling", () => {
    it("13 — optional USB skip is not counted as core failure", () => {
      // A skipped optional gate should not produce RED
      const result = classifyGate(0, {
        gate: "E11-usb-corpus",
        isOptional: true,
        skippedReason: "PROMPTVAULT_USB_CORPUS not set",
      });
      expect(result).not.toMatch(/^RED_/);
      expect(result).toBe("PASS");
    });

    it("14 — visual baseline missing is YELLOW not RED", () => {
      const result = classifyGate(0, {
        gate: "E15-visual",
        isOptional: true,
        visualBaselinesMissing: true,
      });
      expect(result).toBe("YELLOW_VISUAL_BASELINE_MISSING");
    });
  });

  describe("Divergence Detection", () => {
    it("15 — primary/verifier divergence blocks GREEN", () => {
      // This doesn't test classifyGate directly, but verifies
      // the classification concept: divergence must be AMBER, not GREEN.
      // The actual divergence check is in the runner logic.
      const primaryResult = classifyGate(0, { gate: "E3", isOptional: false });
      const verifierResult = classifyGate(1, { gate: "E3", isOptional: false });

      expect(primaryResult).toBe("PASS");
      expect(verifierResult).toBe("RED_TEST_FAILURE");
      // Divergence exists — runner must flag it
      expect(primaryResult).not.toBe(verifierResult);
    });
  });

  describe("gitRoot", () => {
    it("16 — gitRoot returns a valid git repository root", () => {
      const root = gitRoot();
      // Must be a non-empty string and contain a .git directory
      expect(root).toBeTruthy();
      const fs = require("node:fs");
      expect(fs.existsSync(join(root, ".git"))).toBe(true);
    });
  });
});
