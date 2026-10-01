// =============================================================================
// ReasonCode Contract Sync Test (guards the #45 review finding)
// =============================================================================
// The ReasonCode union (contracts.ts), REASON_CODES (diagnostics.ts) and
// ALL_REASON_CODES (contracts.ts) must stay in sync — otherwise exported
// events silently lose their reason code at the safe-metadata-v1 boundary.
// =============================================================================

import { describe, it, expect } from "vitest";
import { ALL_REASON_CODES, type ReasonCode } from "@/observability/contracts";
import { REASON_CODES } from "@/observability/diagnostics";

describe("reason-code contract sync", () => {
  it("every ReasonCode union member is in ALL_REASON_CODES", () => {
    const unionMembers: ReasonCode[] = [
      "NO_RECOMMENDATIONS_SELECTED",
      "APPLY_FAILED",
      "NO_VARIANT_SELECTED",
      "STALE_SOURCE",
      "NO_PROMPT_SELECTED",
      "NO_MISSING_INFO",
      "CLASSIFICATION_FAILED",
      "AUTHORING_SAVE_FAILED",
    ];
    for (const code of unionMembers) {
      expect(ALL_REASON_CODES.has(code)).toBe(true);
  }
  });

  it("REASON_CODES registry covers every member of ALL_REASON_CODES", () => {
    for (const code of ALL_REASON_CODES) {
      expect(REASON_CODES[code]).toBeDefined();
    }
  });
});
