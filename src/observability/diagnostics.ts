// =============================================================================
// PromptVault Lite — Admin Observability Mode — Diagnostics & Reason Codes
// =============================================================================
// Maps runtime errors to structured diagnostic categories and reason codes.
// =============================================================================

import type { DiagnosticCategory, ReasonCode, ErrorClass } from "./contracts";

interface ReasonCodeEntry {
  code: ReasonCode;
  description: string;
  defaultCategory: DiagnosticCategory;
}

export const REASON_CODES: Record<ReasonCode, ReasonCodeEntry> = {
  FEATURE_DISABLED: {
    code: "FEATURE_DISABLED",
    description: "Feature is disabled via feature flag or configuration",
    defaultCategory: "EXPECTED_SKIP",
  },
  PROMPT_NOT_FOUND: {
    code: "PROMPT_NOT_FOUND",
    description: "The requested prompt was not found in the store",
    defaultCategory: "USER_INPUT_ERROR",
  },
  ANALYSIS_DATA_MISSING: {
    code: "ANALYSIS_DATA_MISSING",
    description: "Required analysis data (evaluation/hygiene/context) is missing",
    defaultCategory: "EXPECTED_BLOCK",
  },
  BLOCKING_SENSITIVE_CONTENT: {
    code: "BLOCKING_SENSITIVE_CONTENT",
    description: "Content blocked due to detected sensitive data",
    defaultCategory: "SECURITY_BLOCK",
  },
  REQUIRED_ANSWERS_MISSING: {
    code: "REQUIRED_ANSWERS_MISSING",
    description: "Gate cannot complete — required items are unanswered",
    defaultCategory: "EXPECTED_BLOCK",
  },
  GATE_SESSION_MISSING: {
    code: "GATE_SESSION_MISSING",
    description: "No active gate session found for the given prompt",
    defaultCategory: "STATE_ERROR",
  },
  SCAN_FAILED: {
    code: "SCAN_FAILED",
    description: "Directory scan operation failed",
    defaultCategory: "IO_ERROR",
  },
  SCAN_DIRECTORY_NOT_FOUND: {
    code: "SCAN_DIRECTORY_NOT_FOUND",
    description: "Scan directory does not exist",
    defaultCategory: "USER_INPUT_ERROR",
  },
  PARSER_REJECTED_FILE: {
    code: "PARSER_REJECTED_FILE",
    description: "File was rejected by the parser",
    defaultCategory: "EXPECTED_SKIP",
  },
  WATCHER_RESCAN_FAILED: {
    code: "WATCHER_RESCAN_FAILED",
    description: "File watcher rescan operation failed",
    defaultCategory: "IO_ERROR",
  },
  TAURI_INVOKE_FAILED: {
    code: "TAURI_INVOKE_FAILED",
    description: "Tauri IPC invoke call failed",
    defaultCategory: "IPC_ERROR",
  },
  RUST_COMMAND_FAILED: {
    code: "RUST_COMMAND_FAILED",
    description: "Rust backend command execution failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  CLASSIFICATION_FAILED: {
    code: "CLASSIFICATION_FAILED",
    description: "Content classification operation failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  ANALYZE_ALL_RESULT_LENGTH_MISMATCH: {
    code: "ANALYZE_ALL_RESULT_LENGTH_MISMATCH",
    description: "analyzeAll returned mismatched result lengths",
    defaultCategory: "INVARIANT_VIOLATION",
  },
  STALE_ANALYSIS_RESULT: {
    code: "STALE_ANALYSIS_RESULT",
    description: "Analysis result does not match current content fingerprint",
    defaultCategory: "STATE_ERROR",
  },
  STALE_HYGIENE_RESULT: {
    code: "STALE_HYGIENE_RESULT",
    description: "Hygiene result does not match current content fingerprint",
    defaultCategory: "STATE_ERROR",
  },
  STALE_CONTEXT_RESULT: {
    code: "STALE_CONTEXT_RESULT",
    description: "Context evaluation does not match current content fingerprint",
    defaultCategory: "STATE_ERROR",
  },
  STALE_BLUEPRINT_RESULT: {
    code: "STALE_BLUEPRINT_RESULT",
    description: "Blueprint detection does not match current content fingerprint",
    defaultCategory: "STATE_ERROR",
  },
  STALE_GATE_CONTEXT: {
    code: "STALE_GATE_CONTEXT",
    description: "Gate context is stale relative to current content",
    defaultCategory: "STATE_ERROR",
  },
  STALE_VARIANT_RESULT: {
    code: "STALE_VARIANT_RESULT",
    description: "Variant result does not match current content fingerprint",
    defaultCategory: "STATE_ERROR",
  },
  CONSTRAINT_LOST: {
    code: "CONSTRAINT_LOST",
    description: "Hard constraint was lost during transformation",
    defaultCategory: "INVARIANT_VIOLATION",
  },
  VARIANT_GENERATION_FAILED: {
    code: "VARIANT_GENERATION_FAILED",
    description: "Variant generation operation failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  OPTIMIZER_FAILED: {
    code: "OPTIMIZER_FAILED",
    description: "Prompt optimization operation failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  PARTIAL_SAVE_FAILURE: {
    code: "PARTIAL_SAVE_FAILURE",
    description: "Save operation partially succeeded (e.g., file saved but rescan failed)",
    defaultCategory: "PARTIAL_FAILURE",
  },
  UNEXPECTED_STATE_TRANSITION: {
    code: "UNEXPECTED_STATE_TRANSITION",
    description: "Unexpected state transition detected",
    defaultCategory: "STATE_ERROR",
  },
  UNHANDLED_PROMISE_REJECTION: {
    code: "UNHANDLED_PROMISE_REJECTION",
    description: "Unhandled Promise rejection caught",
    defaultCategory: "INTERNAL_ERROR",
  },
  UI_RUNTIME_ERROR: {
    code: "UI_RUNTIME_ERROR",
    description: "Uncaught React render error",
    defaultCategory: "INTERNAL_ERROR",
  },
  INTERNAL_OBSERVABILITY_ERROR: {
    code: "INTERNAL_OBSERVABILITY_ERROR",
    description: "Observability system itself encountered an error",
    defaultCategory: "INTERNAL_ERROR",
  },
  FILE_TOO_LARGE: {
    code: "FILE_TOO_LARGE",
    description: "File exceeds the maximum prompt file size limit",
    defaultCategory: "EXPECTED_SKIP",
  },
  UNSUPPORTED_EXTENSION: {
    code: "UNSUPPORTED_EXTENSION",
    description: "File extension is not supported",
    defaultCategory: "EXPECTED_SKIP",
  },
  NULL_BYTE_REJECTED: {
    code: "NULL_BYTE_REJECTED",
    description: "Path contains null bytes — rejected",
    defaultCategory: "SECURITY_BLOCK",
  },
  FRONTMATTER_INVALID: {
    code: "FRONTMATTER_INVALID",
    description: "YAML frontmatter parsing failed",
    defaultCategory: "EXPECTED_SKIP",
  },
  BLUEPRINT_EVALUATION_FAILED: {
    code: "BLUEPRINT_EVALUATION_FAILED",
    description: "Blueprint evaluation failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  OPTIMIZER_UNCHANGED_BY_DESIGN: {
    code: "OPTIMIZER_UNCHANGED_BY_DESIGN",
    description: "Optimizer produced no changes — this is by design",
    defaultCategory: "EXPECTED_SKIP",
  },
  NO_SAFE_OPTIMIZATION_AVAILABLE: {
    code: "NO_SAFE_OPTIMIZATION_AVAILABLE",
    description: "No safe optimization path available for this content",
    defaultCategory: "EXPECTED_BLOCK",
  },
  NO_ACTIONABLE_RECOMMENDATIONS: {
    code: "NO_ACTIONABLE_RECOMMENDATIONS",
    description: "No actionable recommendations could be generated",
    defaultCategory: "EXPECTED_SKIP",
  },
  CONSTRAINT_CONFLICT: {
    code: "CONSTRAINT_CONFLICT",
    description: "Constraint conflict detected during processing",
    defaultCategory: "EXPECTED_BLOCK",
  },
  CONTENT_FINGERPRINT_MISMATCH: {
    code: "CONTENT_FINGERPRINT_MISMATCH",
    description: "Content fingerprint does not match expected value",
    defaultCategory: "STATE_ERROR",
  },
  TTS_ENGINE_NOT_FOUND: {
    code: "TTS_ENGINE_NOT_FOUND",
    description: "No local TTS engine is installed or available",
    defaultCategory: "EXPECTED_SKIP",
  },
  TTS_PLATFORM_UNSUPPORTED: {
    code: "TTS_PLATFORM_UNSUPPORTED",
    description: "Local TTS is not supported on this platform",
    defaultCategory: "EXPECTED_SKIP",
  },
  TTS_ENGINE_START_FAILED: {
    code: "TTS_ENGINE_START_FAILED",
    description: "Local TTS engine process failed to start",
    defaultCategory: "PROCESSING_ERROR",
  },
  TTS_SYNTHESIS_FAILED: {
    code: "TTS_SYNTHESIS_FAILED",
    description: "Local TTS synthesis or playback failed",
    defaultCategory: "PROCESSING_ERROR",
  },
  TTS_INPUT_REJECTED: {
    code: "TTS_INPUT_REJECTED",
    description: "TTS input was rejected (empty or oversized)",
    defaultCategory: "USER_INPUT_ERROR",
  },
  TTS_CANCELLED: {
    code: "TTS_CANCELLED",
    description: "Local TTS playback was cancelled",
    defaultCategory: "EXPECTED_SKIP",
  },
  AUTHORING_SAVE_FAILED: {
    code: "AUTHORING_SAVE_FAILED",
    description: "Prompt authoring save (create/update) failed",
    defaultCategory: "PROCESSING_ERROR",
  },
};

export function getReasonCodeDescription(code: ReasonCode): string {
  return REASON_CODES[code].description;
}

export function classifyError(
  error: unknown,
  defaultCode?: ReasonCode,
): { category: ErrorClass; reasonCode: ReasonCode } {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    if (
      message.includes("not found") ||
      message.includes("existiert nicht") ||
      message.includes("does not exist")
    ) {
      return {
        category: "USER_INPUT_ERROR",
        reasonCode: defaultCode ?? "SCAN_DIRECTORY_NOT_FOUND",
      };
    }

    if (
      message.includes("permission") ||
      message.includes("zugriff") ||
      message.includes("access denied")
    ) {
      return {
        category: "SECURITY_BLOCK",
        reasonCode: "BLOCKING_SENSITIVE_CONTENT",
      };
    }

    if (
      message.includes("invoke") ||
      message.includes("tauri") ||
      message.includes("ipc")
    ) {
      return {
        category: "IPC_ERROR",
        reasonCode: "TAURI_INVOKE_FAILED",
      };
    }

    if (
      message.includes("state") ||
      message.includes("zustand") ||
      message.includes("unexpected")
    ) {
      return {
        category: "STATE_ERROR",
        reasonCode: "UNEXPECTED_STATE_TRANSITION",
      };
    }
  }

  return {
    category: "PROCESSING_ERROR",
    reasonCode: defaultCode ?? "INTERNAL_OBSERVABILITY_ERROR",
  };
}

export function reasonCodeToCategory(code: ReasonCode): DiagnosticCategory {
  return REASON_CODES[code].defaultCategory;
}
