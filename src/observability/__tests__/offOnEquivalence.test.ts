// =============================================================================
// Admin Observability — Off/On Equivalence Tests
// =============================================================================
// Critical invariant: processing(input, observability=OFF) === processing(input, observability=ON)
// Same inputs must yield identical scores, classifications, gate outcomes, etc.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { setObservabilityEnabled, clearAll } from "../events";
import { resetFactories } from "../trace";
import { evaluatePromptContext } from "../../lib/promptContextEvaluation";
import { classifyContent } from "../../lib/blueprintDetection";
import { contentFingerprint } from "../redaction";

const TEST_CONTENT = `# Task: Implement User Authentication

## Role
You are a senior backend developer with expertise in Node.js and security.

## Context
The project uses Express.js with JWT for authentication.
Current state: Basic login endpoint exists, no token refresh mechanism.

## Task
Implement a JWT token refresh endpoint with the following constraints:
- Do NOT use external auth libraries beyond jsonwebtoken
- Refresh tokens must be stored in HTTP-only cookies
- Token rotation must be implemented

## Output Format
Return the implementation as a TypeScript file with unit tests.

## Quality Criteria
- Test coverage > 90%
- ESLint must pass with zero warnings
- TypeScript strict mode must pass

## Verification
Run \`pnpm test\` and confirm all tests pass.
Run \`pnpm lint\` and confirm zero warnings.`;

describe("OFF/ON Equivalence", () => {
  beforeEach(() => {
    clearAll();
    resetFactories();
  });

  afterEach(() => {
    setObservabilityEnabled(false);
  });

  it("context evaluation: OFF == ON", () => {
    const resultOff = evaluatePromptContext(TEST_CONTENT);

    setObservabilityEnabled(true);
    const resultOn = evaluatePromptContext(TEST_CONTENT);

    expect(resultOn.overall_score).toBe(resultOff.overall_score);
    expect(resultOn.detected_prompt_type).toBe(resultOff.detected_prompt_type);
    expect(resultOn.detected_context_profile).toBe(
      resultOff.detected_context_profile,
    );
    expect(resultOn.criteria.length).toBe(resultOff.criteria.length);
    expect(resultOn.risk_flags.length).toBe(resultOff.risk_flags.length);
    expect(resultOn.suggested_improvements.length).toBe(
      resultOff.suggested_improvements.length,
    );
  });

  it("blueprint detection: OFF == ON", () => {
    const resultOff = classifyContent(TEST_CONTENT);

    setObservabilityEnabled(true);
    const resultOn = classifyContent(TEST_CONTENT);

    expect(resultOn.content_class).toBe(resultOff.content_class);
    expect(resultOn.confidence).toBe(resultOff.confidence);
    expect(resultOn.contamination_status).toBe(resultOff.contamination_status);
    expect(resultOn.blueprint_type).toBe(resultOff.blueprint_type);
  });

  it("content fingerprint: deterministic regardless of observability", () => {
    const fpOff = contentFingerprint(TEST_CONTENT);

    setObservabilityEnabled(true);
    const fpOn = contentFingerprint(TEST_CONTENT);

    expect(fpOn).toBe(fpOff);
  });
});
