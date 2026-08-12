/* eslint-disable @typescript-eslint/no-non-null-assertion */
// =============================================================================
// Admin Observability — Unit Tests: Invariants
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  checkLengthMismatch,
  checkContentFingerprintStale,
  checkConstraintLoss,
  checkStateTransition,
  checkInvariantViolations,
} from "../invariants";

describe("checkLengthMismatch", () => {
  it("returns null when all counts match", () => {
    expect(checkLengthMismatch(10, 10, 10)).toBeNull();
  });

  it("returns violation when prompts != evaluations", () => {
    const v = checkLengthMismatch(10, 9, 10);
    expect(v).not.toBeNull();
    expect(v!.reasonCode).toBe("ANALYZE_ALL_RESULT_LENGTH_MISMATCH");
  });

  it("returns violation when prompts != hygiene", () => {
    const v = checkLengthMismatch(10, 10, 9);
    expect(v).not.toBeNull();
  });
});

describe("checkContentFingerprintStale", () => {
  it("returns null for matching fingerprints", () => {
    expect(
      checkContentFingerprintStale("abc123", "abc123", "analysis"),
    ).toBeNull();
  });

  it("returns null for undefined fingerprints", () => {
    expect(
      checkContentFingerprintStale(undefined, "abc", "analysis"),
    ).toBeNull();
  });

  it("returns stale analysis violation", () => {
    const v = checkContentFingerprintStale("newfp", "oldfp", "analysis");
    expect(v).not.toBeNull();
    expect(v!.reasonCode).toBe("STALE_ANALYSIS_RESULT");
  });

  it("uses correct reason code for each result type", () => {
    expect(
      checkContentFingerprintStale("a", "b", "hygiene")!.reasonCode,
    ).toBe("STALE_HYGIENE_RESULT");
    expect(
      checkContentFingerprintStale("a", "b", "context")!.reasonCode,
    ).toBe("STALE_CONTEXT_RESULT");
    expect(
      checkContentFingerprintStale("a", "b", "blueprint")!.reasonCode,
    ).toBe("STALE_BLUEPRINT_RESULT");
    expect(
      checkContentFingerprintStale("a", "b", "gate")!.reasonCode,
    ).toBe("STALE_GATE_CONTEXT");
    expect(
      checkContentFingerprintStale("a", "b", "variant")!.reasonCode,
    ).toBe("STALE_VARIANT_RESULT");
  });
});

describe("checkConstraintLoss", () => {
  it("returns null when count is maintained or increased", () => {
    expect(checkConstraintLoss(5, 5)).toBeNull();
    expect(checkConstraintLoss(5, 6)).toBeNull();
  });

  it("returns violation when constraints are lost", () => {
    const v = checkConstraintLoss(8, 5);
    expect(v).not.toBeNull();
    expect(v!.reasonCode).toBe("CONSTRAINT_LOST");
    expect(v!.expectedValue).toBe(8);
    expect(v!.actualValue).toBe(5);
  });
});

describe("checkStateTransition", () => {
  it("returns violation when condition is true", () => {
    const v = checkStateTransition(
      "gate",
      true,
      "isGateOpen=true but activeGatePromptId=null",
    );
    expect(v).not.toBeNull();
    expect(v!.reasonCode).toBe("UNEXPECTED_STATE_TRANSITION");
  });

  it("returns null when condition is false", () => {
    expect(
      checkStateTransition("gate", false, "all good"),
    ).toBeNull();
  });
});

describe("checkInvariantViolations", () => {
  it("filters out null results", () => {
    const results = checkInvariantViolations([
      null,
      checkConstraintLoss(5, 3),
      null,
      checkLengthMismatch(1, 2, 1),
      undefined,
    ]);
    expect(results.length).toBe(2);
  });

  it("returns empty array for all-null input", () => {
    expect(checkInvariantViolations([null, null]).length).toBe(0);
  });
});
