// =============================================================================
// PromptVault Lite — Admin Observability Mode — Invariant Checkers
// =============================================================================
// Detects specific invariant violations in the processing pipeline.
// All checkers are pure functions. They observe, never modify.
// =============================================================================

import type { InvariantViolation, ReasonCode } from "./contracts";

export function checkLengthMismatch(
  promptCount: number,
  evaluationsCount: number,
  hygieneCount: number,
): InvariantViolation | null {
  if (
    promptCount !== evaluationsCount ||
    promptCount !== hygieneCount ||
    evaluationsCount !== hygieneCount
  ) {
    return {
      type: "LENGTH_MISMATCH",
      reasonCode: "ANALYZE_ALL_RESULT_LENGTH_MISMATCH",
      description: `Result length mismatch: prompts=${promptCount}, evaluations=${evaluationsCount}, hygiene=${hygieneCount}`,
      expectedValue: promptCount,
      actualValue: { evaluations: evaluationsCount, hygiene: hygieneCount },
    };
  }
  return null;
}

export function checkContentFingerprintStale(
  contentFingerprint: string | undefined,
  resultFingerprint: string | undefined,
  resultType: "analysis" | "hygiene" | "context" | "blueprint" | "gate" | "variant",
): InvariantViolation | null {
  if (!contentFingerprint || !resultFingerprint) return null;
  if (contentFingerprint === resultFingerprint) return null;

  const reasonCodeMap: Record<string, ReasonCode> = {
    analysis: "STALE_ANALYSIS_RESULT",
    hygiene: "STALE_HYGIENE_RESULT",
    context: "STALE_CONTEXT_RESULT",
    blueprint: "STALE_BLUEPRINT_RESULT",
    gate: "STALE_GATE_CONTEXT",
    variant: "STALE_VARIANT_RESULT",
  };

  return {
    type: "STALE_RESULT",
    reasonCode: reasonCodeMap[resultType] ?? "CONTENT_FINGERPRINT_MISMATCH",
    description: `Stale ${resultType} result: content fingerprint changed but old result is still in use`,
    expectedValue: contentFingerprint,
    actualValue: resultFingerprint,
  };
}

export function checkConstraintLoss(
  beforeCount: number,
  afterCount: number,
): InvariantViolation | null {
  if (beforeCount > afterCount) {
    return {
      type: "CONSTRAINT_LOST",
      reasonCode: "CONSTRAINT_LOST",
      description: `Constraint loss detected: ${beforeCount} before, ${afterCount} after`,
      expectedValue: beforeCount,
      actualValue: afterCount,
    };
  }
  return null;
}

export function checkStateTransition(
  stateLabel: string,
  condition: boolean,
  detail: string,
): InvariantViolation | null {
  if (condition) {
    return {
      type: "STATE_TRANSITION",
      reasonCode: "UNEXPECTED_STATE_TRANSITION",
      description: `Unexpected state in ${stateLabel}: ${detail}`,
    };
  }
  return null;
}

export function checkInvariantViolations(
  checks: (InvariantViolation | null | undefined)[],
): InvariantViolation[] {
  return checks.filter(
    (c): c is InvariantViolation => c !== null && c !== undefined,
  );
}
