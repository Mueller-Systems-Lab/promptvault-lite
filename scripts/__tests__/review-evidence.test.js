// Review-evidence contract tests: a record must name the exact reviewed SHA,
// carry a verdict and findings, and never present an agent review as a human
// approval.
//
// Run: pnpm vitest run scripts/__tests__/review-evidence.test.js
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { validateReviewRecord } from "../validate-review-evidence.mjs";

const SHA = "68fa663b08021cfc5ccfab631417fe7cbc5e615f";

function record(overrides = {}) {
  return {
    pr: 342,
    code_head_reviewed: SHA,
    review_type: "AGENT_INDEPENDENT_REVIEW",
    reviewer_role: "independent-reviewer-agent",
    timestamp: "2026-10-10T12:00:00Z",
    verdict: "APPROVE_WITH_NITS",
    findings_summary: "Reviewed the privacy boundary and governance changes.",
    findings: [{ id: "F1", severity: "low", description: "doc nit", fixed: true }],
    delta_review_sha: null,
    enforcement: { review_evidence: "DOCUMENT_ONLY", validator: "VALIDATOR_AVAILABLE" },
    ...overrides,
  };
}

describe("review-evidence validator", () => {
  it("accepts a well-formed agent review record", () => {
    const result = validateReviewRecord(record());
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it("rejects a record that does not name a full reviewed SHA", () => {
    expect(validateReviewRecord(record({ code_head_reviewed: "68fa663" })).ok).toBe(false);
    expect(validateReviewRecord(record({ code_head_reviewed: "ZZZ" })).ok).toBe(false);
  });

  it("rejects an unknown verdict and unknown review type", () => {
    expect(validateReviewRecord(record({ verdict: "LOOKS_GOOD" })).ok).toBe(false);
    expect(validateReviewRecord(record({ review_type: "VIBES" })).ok).toBe(false);
  });

  it("rejects a record that claims human approval while typed as an agent review", () => {
    const result = validateReviewRecord(record({ human_approval: true }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/human_approval/);
  });

  it("warns when an agent review claims server-side enforcement", () => {
    const result = validateReviewRecord(
      record({ enforcement: { review_evidence: "GITHUB_RULESET_ENFORCED", validator: "VALIDATOR_AVAILABLE" } })
    );
    expect(result.warnings.join(" ")).toMatch(/DOCUMENT_ONLY/);
  });

  it("rejects the self-referential evidence_commit shape", () => {
    const result = validateReviewRecord(record({ evidence_commit: SHA }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/self-referential/);
  });

  it("rejects a HUMAN_APPROVAL record that does not assert human approval", () => {
    const result = validateReviewRecord(record({ review_type: "HUMAN_APPROVAL", human_approval: false }));
    expect(result.ok).toBe(false);
    expect(result.errors.join(" ")).toMatch(/human_approval/);
    expect(validateReviewRecord(record({ review_type: "HUMAN_APPROVAL", human_approval: true })).ok).toBe(true);
  });

  it("requires findings entries to carry id, severity and fixed", () => {
    expect(validateReviewRecord(record({ findings: [{ id: "F1", severity: "high" }] })).ok).toBe(false);
    expect(validateReviewRecord(record({ findings: [{ id: "F1", severity: "bogus", description: "x", fixed: false }] })).ok).toBe(false);
  });
});
