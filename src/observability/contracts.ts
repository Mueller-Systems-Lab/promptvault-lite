// =============================================================================
// PromptVault Lite — Admin Observability Mode — Type Contracts
// =============================================================================
// Versioned, typed contracts for the diagnostic event system.
// Schema version is incremented on breaking changes to DiagnosticEvent shape.
// =============================================================================

export const OBSERVABILITY_SCHEMA_VERSION = 1;

export type DiagnosticLayer =
  | "ui"
  | "store"
  | "typescript"
  | "tauri-ipc"
  | "rust-command"
  | "rust-scanner"
  | "rust-parser"
  | "rust-analysis"
  | "persistence";

export type DiagnosticStatus =
  | "started"
  | "succeeded"
  | "failed"
  | "blocked"
  | "skipped"
  | "fallback"
  | "partial_failure";

export type DiagnosticCategory =
  | "EXPECTED_BLOCK"
  | "EXPECTED_SKIP"
  | "USER_INPUT_ERROR"
  | "PROCESSING_ERROR"
  | "INVARIANT_VIOLATION"
  | "IO_ERROR"
  | "IPC_ERROR"
  | "STATE_ERROR"
  | "SECURITY_BLOCK"
  | "PARTIAL_FAILURE"
  | "INTERNAL_ERROR";

export type ErrorClass =
  | "EXPECTED_BLOCK"
  | "EXPECTED_SKIP"
  | "USER_INPUT_ERROR"
  | "PROCESSING_ERROR"
  | "INVARIANT_VIOLATION"
  | "IO_ERROR"
  | "IPC_ERROR"
  | "STATE_ERROR"
  | "SECURITY_BLOCK"
  | "PARTIAL_FAILURE"
  | "INTERNAL_ERROR";

export type ReasonCode =
  | "FEATURE_DISABLED"
  | "PROMPT_NOT_FOUND"
  | "ANALYSIS_DATA_MISSING"
  | "BLOCKING_SENSITIVE_CONTENT"
  | "REQUIRED_ANSWERS_MISSING"
  | "GATE_SESSION_MISSING"
  | "SCAN_FAILED"
  | "SCAN_DIRECTORY_NOT_FOUND"
  | "PARSER_REJECTED_FILE"
  | "WATCHER_RESCAN_FAILED"
  | "TAURI_INVOKE_FAILED"
  | "RUST_COMMAND_FAILED"
  | "CLASSIFICATION_FAILED"
  | "ANALYZE_ALL_RESULT_LENGTH_MISMATCH"
  | "STALE_ANALYSIS_RESULT"
  | "STALE_HYGIENE_RESULT"
  | "STALE_CONTEXT_RESULT"
  | "STALE_BLUEPRINT_RESULT"
  | "STALE_GATE_CONTEXT"
  | "STALE_VARIANT_RESULT"
  | "CONSTRAINT_LOST"
  | "VARIANT_GENERATION_FAILED"
  | "OPTIMIZER_FAILED"
  | "PARTIAL_SAVE_FAILURE"
  | "UNEXPECTED_STATE_TRANSITION"
  | "UNHANDLED_PROMISE_REJECTION"
  | "UI_RUNTIME_ERROR"
  | "INTERNAL_OBSERVABILITY_ERROR"
  | "FILE_TOO_LARGE"
  | "UNSUPPORTED_EXTENSION"
  | "NULL_BYTE_REJECTED"
  | "FRONTMATTER_INVALID"
  | "BLUEPRINT_EVALUATION_FAILED"
  | "OPTIMIZER_UNCHANGED_BY_DESIGN"
  | "NO_SAFE_OPTIMIZATION_AVAILABLE"
  | "NO_ACTIONABLE_RECOMMENDATIONS"
  | "CONSTRAINT_CONFLICT"
  | "CONTENT_FINGERPRINT_MISMATCH";

export interface DiagnosticError {
  message: string;
  category: ErrorClass;
  reasonCode: ReasonCode;
  stack?: string;
}

export interface InvariantViolation {
  type: string;
  reasonCode: ReasonCode;
  description: string;
  expectedValue?: unknown;
  actualValue?: unknown;
}

export interface DiagnosticEvent {
  schemaVersion: number;

  traceId: string;
  spanId: string;
  parentSpanId?: string;

  timestamp: string;
  durationMs?: number;

  layer: DiagnosticLayer;
  operation: string;
  stage: string;

  status: DiagnosticStatus;

  category?: DiagnosticCategory;
  reasonCode?: ReasonCode;

  inputFingerprint?: string;
  outputFingerprint?: string;

  attributes?: Record<string, unknown>;

  error?: DiagnosticError;

  invariantViolations?: InvariantViolation[];
}

export interface Trace {
  traceId: string;
  operation: string;
  startedAt: string;
  status: DiagnosticStatus;
  spans: Span[];
  attributes?: Record<string, unknown>;
}

export interface Span {
  spanId: string;
  parentSpanId?: string;
  operation: string;
  layer: DiagnosticLayer;
  stage: string;
  status: DiagnosticStatus;
  startedAt: string;
  endedAt?: string;
  durationMs?: number;
  category?: DiagnosticCategory;
  reasonCode?: ReasonCode;
  inputFingerprint?: string;
  outputFingerprint?: string;
  attributes?: Record<string, unknown>;
  error?: DiagnosticError;
  invariantViolations?: InvariantViolation[];
}

export interface DiagnosticExport {
  schema_version: number;
  app_version: string;
  generated_at: string;
  platform: string;
  feature_flags: Record<string, boolean>;
  traces: Trace[];
  events: DiagnosticEvent[];
  invariant_violations: InvariantViolation[];
}

export function isReasonCode(value: string): value is ReasonCode {
  return ALL_REASON_CODES.has(value as ReasonCode);
}

export const ALL_REASON_CODES: ReadonlySet<ReasonCode> = new Set<ReasonCode>([
  "FEATURE_DISABLED",
  "PROMPT_NOT_FOUND",
  "ANALYSIS_DATA_MISSING",
  "BLOCKING_SENSITIVE_CONTENT",
  "REQUIRED_ANSWERS_MISSING",
  "GATE_SESSION_MISSING",
  "SCAN_FAILED",
  "SCAN_DIRECTORY_NOT_FOUND",
  "PARSER_REJECTED_FILE",
  "WATCHER_RESCAN_FAILED",
  "TAURI_INVOKE_FAILED",
  "RUST_COMMAND_FAILED",
  "CLASSIFICATION_FAILED",
  "ANALYZE_ALL_RESULT_LENGTH_MISMATCH",
  "STALE_ANALYSIS_RESULT",
  "STALE_HYGIENE_RESULT",
  "STALE_CONTEXT_RESULT",
  "STALE_BLUEPRINT_RESULT",
  "STALE_GATE_CONTEXT",
  "STALE_VARIANT_RESULT",
  "CONSTRAINT_LOST",
  "VARIANT_GENERATION_FAILED",
  "OPTIMIZER_FAILED",
  "PARTIAL_SAVE_FAILURE",
  "UNEXPECTED_STATE_TRANSITION",
  "UNHANDLED_PROMISE_REJECTION",
  "UI_RUNTIME_ERROR",
  "INTERNAL_OBSERVABILITY_ERROR",
  "FILE_TOO_LARGE",
  "UNSUPPORTED_EXTENSION",
  "NULL_BYTE_REJECTED",
  "FRONTMATTER_INVALID",
  "BLUEPRINT_EVALUATION_FAILED",
  "OPTIMIZER_UNCHANGED_BY_DESIGN",
  "NO_SAFE_OPTIMIZATION_AVAILABLE",
  "NO_ACTIONABLE_RECOMMENDATIONS",
  "CONSTRAINT_CONFLICT",
  "CONTENT_FINGERPRINT_MISMATCH",
]);
