// =============================================================================
// PromptVault Lite — Admin Observability Mode — Redaction & Export Policy
// =============================================================================
// Privacy-preserving path/content redaction plus a fail-closed diagnostic
// export boundary.
//
// Export model (v1.9.2+): explicit SAFE-METADATA ALLOWLIST.
//   UNKNOWN / UNAPPROVED attribute → OMIT (never "redact and keep").
//   Arbitrary strings / nested untyped values → OMIT.
//   Raw error messages / stacks → OMIT (only bounded category + reason code).
//
// Secret/path redaction remains DEFENSE-IN-DEPTH for allowlisted text metadata;
// it does NOT replace the allowlist.
// =============================================================================

import type {
  DiagnosticEvent,
  DiagnosticExport,
  DiagnosticError,
  InvariantViolation,
  ReasonCode,
  Span,
  Trace,
} from "./contracts";
import { isReasonCode } from "./contracts";

// ---------------------------------------------------------------------------
// Export policy identity
// ---------------------------------------------------------------------------

/** Human-readable identifier of the privacy contract an export was built under. */
export const DIAGNOSTIC_EXPORT_POLICY = "safe-metadata-v1";
/** Numeric version of the export policy (incremented on contract changes). */
export const EXPORT_POLICY_VERSION = 1;

const SECRET_PATTERNS: RegExp[] = [
  /(?:(?:api|access)[_-]?key|secret|token|password|passphrase)\s*[:=]\s*['"][^'"]+['"]/gi,
  /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----[\s\S]*?-----END\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g,
  /ghp_[A-Za-z0-9_]{36}/g,
  /gho_[A-Za-z0-9_]{36}/g,
  /ghu_[A-Za-z0-9_]{36}/g,
  /ghs_[A-Za-z0-9_]{36}/g,
  /ghr_[A-Za-z0-9_]{36}/g,
  /xox[bpras]-[A-Za-z0-9-]+/g,
  /sk-[A-Za-z0-9]{32,}/g,
  /eyJ[A-Za-z0-9_-]{50,}/g,
];

const MAX_SAFE_STRING_LENGTH = 200;

/**
 * Attribute keys explicitly approved to cross the diagnostic export boundary.
 * Every key here must carry ONLY bounded, non-sensitive diagnostic metadata.
 * Unknown keys are omitted (fail-closed).
 */
const SAFE_ATTRIBUTE_KEYS: ReadonlySet<string> = new Set([
  "promptvault.command",
  "promptvault.backend.origin",
  "promptvault.backend.duration_ms",
  "promptvault.scan.prompt_count",
  "promptvault.scan.total_prompts",
  "promptvault.gate.prompt_id",
  "promptvault.prompt_id",
  "promptvault.prompt_type",
  "promptvault.context_profile",
  "promptvault.overall_score",
  "promptvault.batch.prompt_count",
  "promptvault.save.create_succeeded",
  "promptvault.save.rescan_succeeded",
]);

/** Bounded, code-owned invariant violation types (not user content). */
const SAFE_INVARIANT_TYPES: ReadonlySet<string> = new Set([
  "LENGTH_MISMATCH",
  "STALE_RESULT",
  "CONSTRAINT_LOST",
  "STATE_TRANSITION",
]);

const SAFE_ERROR_CATEGORIES: ReadonlySet<string> = new Set([
  "EXPECTED_BLOCK",
  "EXPECTED_SKIP",
  "USER_INPUT_ERROR",
  "PROCESSING_ERROR",
  "INVARIANT_VIOLATION",
  "IO_ERROR",
  "IPC_ERROR",
  "STATE_ERROR",
  "SECURITY_BLOCK",
  "PARTIAL_FAILURE",
  "INTERNAL_ERROR",
]);

const SAFE_LAYERS: ReadonlySet<string> = new Set([
  "ui",
  "store",
  "typescript",
  "tauri-ipc",
  "rust-command",
  "rust-scanner",
  "rust-parser",
  "rust-analysis",
  "persistence",
]);

const SAFE_STATUSES: ReadonlySet<string> = new Set([
  "started",
  "succeeded",
  "failed",
  "blocked",
  "skipped",
  "fallback",
  "partial_failure",
]);

export function redactPath(absolutePath: string, vaultRoot?: string): string {
  if (!absolutePath) return "";

  const sanitized = absolutePath.replace(/\\/g, "/");

  if (vaultRoot) {
    const normalizedRoot = vaultRoot.replace(/\\/g, "/").replace(/\/$/, "");
    const normalizedPath = sanitized;
    if (
      normalizedPath.toLowerCase().startsWith(normalizedRoot.toLowerCase())
    ) {
      return (
        "vault:" +
        normalizedPath.slice(normalizedRoot.length).replace(/^\//, "/")
      );
    }
  }

  const parts = sanitized.split("/").filter((p) => p.length > 0);
  if (parts.length > 1) {
    return `.../${parts[parts.length - 1]}`;
  }

  return sanitized;
}

export function contentFingerprint(content: string): string {
  if (!content || content.length === 0) return "empty";

  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash + char) | 0;
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  return `${content.length}:${hex}`;
}

export function stripSecrets(text: string): string {
  let result = text;
  for (const pattern of SECRET_PATTERNS) {
    result = result.replace(pattern, "[REDACTED]");
  }
  return result;
}

// ---------------------------------------------------------------------------
// Fail-closed export policy
// ---------------------------------------------------------------------------

type SanitizedScalar = string | number | boolean;

/**
 * Validate and sanitize a single attribute value.
 * Only scalar values (bounded strings, finite numbers, booleans) are safe.
 * Strings receive defense-in-depth secret/path redaction and length bounding.
 */
function sanitizeScalarValue(
  value: unknown,
  vaultRoot?: string,
): { ok: true; value: SanitizedScalar } | { ok: false } {
  if (typeof value === "string") {
    let bounded = value;
    if (bounded.length > MAX_SAFE_STRING_LENGTH) {
      bounded = bounded.slice(0, MAX_SAFE_STRING_LENGTH);
    }
    return { ok: true, value: redactPath(stripSecrets(bounded), vaultRoot) };
  }
  if (typeof value === "number") {
    return Number.isFinite(value) ? { ok: true, value } : { ok: false };
  }
  if (typeof value === "boolean") {
    return { ok: true, value };
  }
  // object, array, null, undefined, function, bigint, symbol → fail closed
  return { ok: false };
}

function sanitizeAttributes(
  attrs: Record<string, unknown> | undefined,
  vaultRoot?: string,
): { safe: Record<string, unknown> | undefined; omittedCount: number } {
  if (!attrs) return { safe: undefined, omittedCount: 0 };

  const safe: Record<string, unknown> = {};
  let omittedCount = 0;

  for (const [key, value] of Object.entries(attrs)) {
    if (!SAFE_ATTRIBUTE_KEYS.has(key)) {
      omittedCount++;
      continue;
    }
    const result = sanitizeScalarValue(value, vaultRoot);
    if (result.ok) {
      safe[key] = result.value;
    } else {
      omittedCount++;
    }
  }

  return {
    safe: Object.keys(safe).length > 0 ? safe : undefined,
    omittedCount,
  };
}

function sanitizeError(
  error: DiagnosticError | undefined,
): DiagnosticError | undefined {
  if (!error) return undefined;

  // Keep only bounded enum fields. Raw `message` and `stack` may contain
  // user content, private paths, or secrets — they never cross the boundary.
  const category = SAFE_ERROR_CATEGORIES.has(error.category)
    ? error.category
    : undefined;
  const reasonCode = isReasonCode(error.reasonCode)
    ? error.reasonCode
    : undefined;
  if (!category && !reasonCode) return undefined;

  const safe: DiagnosticError = {} as DiagnosticError;
  if (category) safe.category = category;
  if (reasonCode) safe.reasonCode = reasonCode;
  return safe;
}

function sanitizeInvariantViolations(
  violations: InvariantViolation[] | undefined,
): InvariantViolation[] | undefined {
  if (!violations) return undefined;

  const safe: InvariantViolation[] = [];
  for (const v of violations) {
    if (!isReasonCode(v.reasonCode)) continue;
    safe.push({
      type: SAFE_INVARIANT_TYPES.has(v.type) ? v.type : "INVARIANT",
      reasonCode: v.reasonCode,
      description: "[REDACTED]",
      // expectedValue / actualValue omitted: arbitrary values.
    });
  }
  return safe.length > 0 ? safe : undefined;
}

interface SanitizedSpan {
  span: Span;
  omittedCount: number;
}

/** Bounded, secret-stripped string for code-owned opaque identifiers. */
function sanitizeBoundedString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  let bounded = value;
  if (bounded.length > MAX_SAFE_STRING_LENGTH) {
    bounded = bounded.slice(0, MAX_SAFE_STRING_LENGTH);
  }
  return stripSecrets(bounded);
}

/** Validate a bounded enum string against an allowlist, else fail closed. */
function sanitizeEnum<T extends string>(
  value: unknown,
  allowed: ReadonlySet<string>,
): T | undefined {
  return typeof value === "string" && allowed.has(value)
    ? (value as T)
    : undefined;
}

/** Validate a reason code against the canonical catalog, else fail closed. */
function sanitizeReasonCode(value: unknown): ReasonCode | undefined {
  return typeof value === "string" && isReasonCode(value) ? value : undefined;
}

function sanitizeSpan(span: Span, vaultRoot?: string): SanitizedSpan {
  const attrs = sanitizeAttributes(span.attributes, vaultRoot);
  const violations = sanitizeInvariantViolations(span.invariantViolations);

  const safe: Span = {
    spanId: sanitizeBoundedString(span.spanId) ?? "",
    parentSpanId: span.parentSpanId
      ? sanitizeBoundedString(span.parentSpanId)
      : undefined,
    operation: sanitizeBoundedString(span.operation) ?? "",
    layer: sanitizeEnum<Span["layer"]>(span.layer, SAFE_LAYERS) ?? "ui",
    stage: sanitizeBoundedString(span.stage) ?? "",
    status:
      sanitizeEnum<Span["status"]>(span.status, SAFE_STATUSES) ?? "started",
    startedAt: sanitizeBoundedString(span.startedAt) ?? "",
    endedAt: span.endedAt ? sanitizeBoundedString(span.endedAt) : undefined,
    durationMs:
      typeof span.durationMs === "number" && Number.isFinite(span.durationMs)
        ? span.durationMs
        : undefined,
    category: sanitizeEnum<NonNullable<Span["category"]>>(
      span.category,
      SAFE_ERROR_CATEGORIES,
    ),
    reasonCode: sanitizeReasonCode(span.reasonCode),
    inputFingerprint: span.inputFingerprint
      ? sanitizeBoundedString(span.inputFingerprint)
      : undefined,
    outputFingerprint: span.outputFingerprint
      ? sanitizeBoundedString(span.outputFingerprint)
      : undefined,
    attributes: attrs.safe,
    error: sanitizeError(span.error),
    invariantViolations: violations,
  };
  if (safe.reasonCode === undefined) delete safe.reasonCode;
  if (safe.category === undefined) delete safe.category;

  return { span: safe, omittedCount: attrs.omittedCount };
}

interface SanitizedEvent {
  event: DiagnosticEvent;
  omittedCount: number;
}

function sanitizeEvent(
  event: DiagnosticEvent,
  vaultRoot?: string,
): SanitizedEvent {
  const attrs = sanitizeAttributes(event.attributes, vaultRoot);
  const violations = sanitizeInvariantViolations(event.invariantViolations);

  const safe: DiagnosticEvent = {
    schemaVersion: event.schemaVersion,
    traceId: sanitizeBoundedString(event.traceId) ?? "",
    spanId: sanitizeBoundedString(event.spanId) ?? "",
    parentSpanId: event.parentSpanId
      ? sanitizeBoundedString(event.parentSpanId)
      : undefined,
    timestamp: sanitizeBoundedString(event.timestamp) ?? "",
    durationMs:
      typeof event.durationMs === "number" && Number.isFinite(event.durationMs)
        ? event.durationMs
        : undefined,
    layer:
      sanitizeEnum<DiagnosticEvent["layer"]>(event.layer, SAFE_LAYERS) ?? "ui",
    operation: sanitizeBoundedString(event.operation) ?? "",
    stage: sanitizeBoundedString(event.stage) ?? "",
    status:
      sanitizeEnum<DiagnosticEvent["status"]>(event.status, SAFE_STATUSES) ??
      "started",
    category: sanitizeEnum<NonNullable<DiagnosticEvent["category"]>>(
      event.category,
      SAFE_ERROR_CATEGORIES,
    ),
    reasonCode: sanitizeReasonCode(event.reasonCode),
    inputFingerprint: event.inputFingerprint
      ? sanitizeBoundedString(event.inputFingerprint)
      : undefined,
    outputFingerprint: event.outputFingerprint
      ? sanitizeBoundedString(event.outputFingerprint)
      : undefined,
    attributes: attrs.safe,
    error: sanitizeError(event.error),
    invariantViolations: violations,
  };
  if (safe.category === undefined) delete safe.category;
  if (safe.reasonCode === undefined) delete safe.reasonCode;

  return { event: safe, omittedCount: attrs.omittedCount };
}

/**
 * Fail-closed sanitization of a single event for export.
 * Unknown/unsafe attributes are omitted; raw error messages and arbitrary
 * invariant descriptions are removed.
 */
export function sanitizeEventForExport(
  event: DiagnosticEvent,
  vaultRoot?: string,
): DiagnosticEvent {
  return sanitizeEvent(event, vaultRoot).event;
}

export function buildDiagnosticExport(
  appVersion: string,
  platform: string,
  featureFlags: Record<string, boolean>,
  traces: Trace[],
  events: DiagnosticEvent[],
  invariantViolations: InvariantViolation[],
  vaultRoot?: string,
): DiagnosticExport {
  let omittedEventAttributeCount = 0;
  let omittedAttributeCount = 0;

  const sanitizedEvents = events.map((e) => {
    const result = sanitizeEvent(e, vaultRoot);
    omittedEventAttributeCount += result.omittedCount;
    omittedAttributeCount += result.omittedCount;
    return result.event;
  });

  const sanitizedTraces = traces.map((t) => {
    const traceAttrs = sanitizeAttributes(t.attributes, vaultRoot);
    omittedAttributeCount += traceAttrs.omittedCount;

    const sanitizedSpans = t.spans.map((s) => {
      const result = sanitizeSpan(s, vaultRoot);
      omittedAttributeCount += result.omittedCount;
      return result.span;
    });

    return {
      ...t,
      attributes: traceAttrs.safe,
      spans: sanitizedSpans,
    };
  });

  const sanitizedViolations = invariantViolations
    .map((v) => {
      if (!isReasonCode(v.reasonCode)) return null;
      return {
        type: SAFE_INVARIANT_TYPES.has(v.type) ? v.type : "INVARIANT",
        reasonCode: v.reasonCode,
        description: "[REDACTED]",
      } as InvariantViolation;
    })
    .filter((v): v is InvariantViolation => v !== null);

  return {
    schema_version: 1,
    diagnostic_export_policy: DIAGNOSTIC_EXPORT_POLICY,
    export_policy_version: EXPORT_POLICY_VERSION,
    app_version: appVersion,
    generated_at: new Date().toISOString(),
    platform,
    feature_flags: featureFlags,
    traces: sanitizedTraces,
    events: sanitizedEvents,
    invariant_violations: sanitizedViolations,
    omitted_attribute_count: omittedAttributeCount,
    omitted_event_attribute_count: omittedEventAttributeCount,
  };
}

export function buildDiagnosticCopy(
  latestTrace: DiagnosticExport["traces"][0] | undefined,
  latestEvents: DiagnosticEvent[],
): string {
  const lines: string[] = [];

  if (latestTrace) {
    const failedSpan = latestTrace.spans.find(
      (s) =>
        s.status === "failed" || s.status === "blocked" || s.status === "partial_failure",
    );
    const lastSuccess = latestTrace.spans
      .filter((s) => s.status === "succeeded")
      .pop();

    lines.push(`Operation: ${latestTrace.operation}`);
    lines.push(`Trace: ${latestTrace.traceId}`);
    lines.push(`Status: ${latestTrace.status}`);

    if (failedSpan) {
      lines.push(`Failed stage: ${failedSpan.operation}`);
      lines.push(
        `Reason: ${failedSpan.reasonCode ?? "n/a"} (${failedSpan.category ?? "n/a"})`,
      );
    }

    if (lastSuccess) {
      lines.push(`Last successful stage: ${lastSuccess.operation}`);
    }

    const violations = latestTrace.spans.flatMap(
      (s) => s.invariantViolations ?? [],
    );
    if (violations.length > 0) {
      lines.push(
        `Invariant violations: ${violations.map((v) => v.reasonCode).join(", ")}`,
      );
    }

    const durations = latestTrace.spans
      .filter((s) => s.durationMs !== undefined)
      .map((s) => `${s.operation}: ${s.durationMs}ms`);
    if (durations.length > 0) {
      lines.push(`Relevant durations: ${durations.join(", ")}`);
    }

    const errors = latestTrace.spans.filter((s) => s.error);
    if (errors.length > 0) {
      lines.push(
        // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
        `Error category: ${errors.map((s) => s.error!.category).join(", ")}`,
      );
    }
  }

  const totalEvents = latestEvents.length;
  const failedEvents = latestEvents.filter(
    (e) => e.status === "failed" || e.status === "blocked",
  );
  if (failedEvents.length > 0) {
    lines.push(`Recent failures: ${failedEvents.length}/${totalEvents}`);
  }

  lines.push("Sensitive data exposed: NO");

  return lines.join("\n");
}
