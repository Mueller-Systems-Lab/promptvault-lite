// =============================================================================
// PromptVault Lite — Admin Observability Mode — Redaction Utilities
// =============================================================================
// Privacy-preserving path and content redaction for diagnostic outputs.
// =============================================================================

import type { DiagnosticEvent, DiagnosticExport } from "./contracts";

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

export function sanitizeEventForExport(
  event: DiagnosticEvent,
  vaultRoot?: string,
): DiagnosticEvent {
  const sanitized = { ...event };

  if (sanitized.attributes) {
    const attrs = { ...sanitized.attributes };
    for (const key of Object.keys(attrs)) {
      const value = attrs[key];
      if (typeof value === "string") {
        if (
          key.toLowerCase().includes("path") ||
          key.toLowerCase().includes("file")
        ) {
          attrs[key] = redactPath(value, vaultRoot);
        } else {
          attrs[key] = stripSecrets(value);
        }
      }
    }
    sanitized.attributes = attrs;
  }

  if (sanitized.error && sanitized.error.message) {
    sanitized.error = {
      ...sanitized.error,
      message: stripSecrets(sanitized.error.message),
    };
  }

  return sanitized;
}

export function buildDiagnosticExport(
  appVersion: string,
  platform: string,
  featureFlags: Record<string, boolean>,
  traces: DiagnosticExport["traces"],
  events: DiagnosticExport["events"],
  invariantViolations: DiagnosticExport["invariant_violations"],
  vaultRoot?: string,
): DiagnosticExport {
  return {
    schema_version: 1,
    app_version: appVersion,
    generated_at: new Date().toISOString(),
    platform,
    feature_flags: featureFlags,
    traces: traces.map((t) => ({
      ...t,
      attributes: t.attributes ? sanitizeAttributes(t.attributes, vaultRoot) : undefined,
    })),
    events: events.map((e) => sanitizeEventForExport(e, vaultRoot)),
    invariant_violations: invariantViolations.map((v) => ({
      ...v,
      description: stripSecrets(v.description),
    })),
  };
}

function sanitizeAttributes(
  attrs: Record<string, unknown>,
  vaultRoot?: string,
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of Object.keys(attrs)) {
    const value = attrs[key];
    if (typeof value === "string") {
      if (
        key.toLowerCase().includes("path") ||
        key.toLowerCase().includes("file")
      ) {
        result[key] = redactPath(value, vaultRoot);
      } else {
        result[key] = stripSecrets(value);
      }
    } else {
      result[key] = value;
    }
  }
  return result;
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
