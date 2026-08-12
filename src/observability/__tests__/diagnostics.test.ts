// =============================================================================
// Admin Observability — Unit Tests: Diagnostics & Reason Codes
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  REASON_CODES,
  getReasonCodeDescription,
  classifyError,
} from "../diagnostics";
import { isReasonCode } from "../contracts";

describe("Reason Code Catalog", () => {
  it("all 38 reason codes have descriptions", () => {
    for (const code of Object.keys(REASON_CODES)) {
      const desc = getReasonCodeDescription(code as import("../contracts").ReasonCode);
      expect(desc).toBeTruthy();
      expect(desc).not.toContain("Unknown");
    }
  });

  it("every reason code maps to a category", () => {
    for (const code of Object.keys(REASON_CODES)) {
      const entry = REASON_CODES[code as import("../contracts").ReasonCode];
      expect(entry.defaultCategory).toBeDefined();
    }
  });

  it("isReasonCode validates correctly", () => {
    expect(isReasonCode("FEATURE_DISABLED")).toBe(true);
    expect(isReasonCode("TAURI_INVOKE_FAILED")).toBe(true);
    expect(isReasonCode("INVALID_CODE_XYZ")).toBe(false);
  });
});

describe("classifyError", () => {
  it("classifies not-found errors", () => {
    const result = classifyError(new Error("Directory does not exist"));
    expect(result.category).toBe("USER_INPUT_ERROR");
  });

  it("classifies tauri/invoke errors", () => {
    const result = classifyError(new Error("Tauri invoke failed"));
    expect(result.reasonCode).toBe("TAURI_INVOKE_FAILED");
    expect(result.category).toBe("IPC_ERROR");
  });

  it("classifies permission errors as security block", () => {
    const result = classifyError(new Error("Access denied"));
    expect(result.category).toBe("SECURITY_BLOCK");
  });

  it("classifies unknown errors as processing error", () => {
    const result = classifyError("some random string");
    expect(result.category).toBe("PROCESSING_ERROR");
  });
});
