/* eslint-disable @typescript-eslint/no-non-null-assertion */
// =============================================================================
// Admin Observability — Privacy Tests (fail-closed export boundary)
// =============================================================================
// v1.9.2 contract: UNKNOWN / UNAPPROVED data → OMIT (never "redact and keep").

import { describe, it, expect } from "vitest";
import {
  stripSecrets,
  buildDiagnosticExport,
  sanitizeEventForExport,
  DIAGNOSTIC_EXPORT_POLICY,
  EXPORT_POLICY_VERSION,
} from "../redaction";
import type {
  DiagnosticEvent,
  Trace,
  InvariantViolation,
} from "../contracts";

const SENTINEL = "PVL_PRIVACY_SENTINEL_9F3C7A42";

function makeEvent(overrides: Partial<DiagnosticEvent> = {}): DiagnosticEvent {
  return {
    schemaVersion: 1,
    traceId: "trace-safe",
    spanId: "span-safe",
    timestamp: "2026-01-01T00:00:00.000Z",
    layer: "store",
    operation: "analyze-selected",
    stage: "analyze",
    status: "succeeded",
    ...overrides,
  };
}

function exportJson(
  events: DiagnosticEvent[],
  traces: Trace[] = [],
  violations: InvariantViolation[] = [],
  featureFlags: Record<string, boolean> = {},
): string {
  const data = buildDiagnosticExport(
    "1.9.2",
    "Win32",
    featureFlags,
    traces,
    events,
    violations,
  );
  return JSON.stringify(data);
}

describe("stripSecrets (defense-in-depth helper)", () => {
  it("redacts API key patterns", () => {
    const result = stripSecrets('api_key="sk-abcdef1234567890abcdef1234567890"');
    expect(result).not.toContain("sk-abcdef");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts GitHub token patterns", () => {
    const syntheticGithubToken =
      "gh" + "p_" + "1234567890abcdef1234567890abcdef1234";
    expect(stripSecrets(syntheticGithubToken)).toContain("[REDACTED]");
  });

  it("does not redact arbitrary non-secret strings", () => {
    expect(stripSecrets(SENTINEL)).toBe(SENTINEL);
  });
});

describe("Fail-closed attribute policy", () => {
  it("omits full_content entirely (prompt text never exported)", () => {
    const event = makeEvent({ attributes: { full_content: SENTINEL } });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("full_content");
  });

  it("omits arbitrary string attributes", () => {
    const event = makeEvent({ attributes: { foo: SENTINEL } });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("foo");
  });

  it("omits nested arbitrary data", () => {
    const event = makeEvent({
      attributes: { custom: { text: SENTINEL, answer: "x", data: [1, 2] } },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("custom");
  });

  it("omits prompt-shaped and raw-content fields", () => {
    const event = makeEvent({
      attributes: {
        prompt: SENTINEL,
        prompt_text: SENTINEL,
        content: SENTINEL,
        full_content: SENTINEL,
        clipboard: SENTINEL,
        user_answer: SENTINEL,
        raw_input: SENTINEL,
        raw_output: SENTINEL,
      },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
  });

  it("omits private absolute paths", () => {
    const event = makeEvent({
      attributes: {
        source_file: "C:\\Users\\Example\\Private\\file.txt",
      },
    });
    const sanitized = sanitizeEventForExport(event);
    expect(sanitized.attributes).toBeUndefined();
    const json = JSON.stringify(sanitized);
    expect(json).not.toContain("Example");
    expect(json).not.toContain("Private");
    expect(json).not.toContain("Users");
  });

  it("omits deeply nested sentinel (object → array → object)", () => {
    const event = makeEvent({
      attributes: { outer: { list: [{ inner: SENTINEL }] } },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("outer");
  });

  it("omits a known key carrying an unsafe (object) value", () => {
    const event = makeEvent({
      attributes: { "promptvault.overall_score": { content: SENTINEL } },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("overall_score");
  });

  it("omits a future instrumentation field without code changes", () => {
    const event = makeEvent({
      attributes: { future_instrumentation_field: SENTINEL },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("future_instrumentation_field");
  });

  it("keeps safe metadata while dropping unsafe content (mixed)", () => {
    const event = makeEvent({
      attributes: {
        "promptvault.overall_score": 90,
        "promptvault.prompt_type": "structured_prompt",
        arbitrary_unsafe: SENTINEL,
      },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("arbitrary_unsafe");
    expect(json).toContain("promptvault.overall_score");
    expect(json).toContain("structured_prompt");
  });
});

describe("Error sanitization", () => {
  it("never exports raw error messages", () => {
    const event = makeEvent({
      status: "failed",
      error: {
        message: `api_key='${SENTINEL}' rejected`,
        category: "IPC_ERROR",
        reasonCode: "TAURI_INVOKE_FAILED",
      },
    });
    const json = exportJson([event]);
    expect(json).not.toContain(SENTINEL);
    expect(json).not.toContain("rejected");
    expect(json).toContain("TAURI_INVOKE_FAILED");
    expect(json).toContain("IPC_ERROR");
    // message and stack must not appear as keys
    const data = buildDiagnosticExport("1.9.2", "Win32", {}, [], [event], []);
    expect(data.events[0].error).toBeDefined();
    expect(data.events[0].error!.message).toBeUndefined();
    expect(data.events[0].error!.stack).toBeUndefined();
  });
});

describe("Invariant violation sanitization", () => {
  it("keeps reason code but drops arbitrary description/values", () => {
    const violation: InvariantViolation = {
      type: "STATE_TRANSITION",
      reasonCode: "UNEXPECTED_STATE_TRANSITION",
      description: `${SENTINEL} leaked state detail`,
      expectedValue: SENTINEL,
      actualValue: { nested: SENTINEL },
    };
    const json = exportJson([], [], [violation]);
    expect(json).not.toContain(SENTINEL);
    expect(json).toContain("UNEXPECTED_STATE_TRANSITION");
  });
});

describe("Known safe metadata is preserved", () => {
  it("keeps operation, status, layer, duration, trace/span ids, reason code", () => {
    const event = makeEvent({
      durationMs: 15,
      category: "EXPECTED_SKIP",
      reasonCode: "FEATURE_DISABLED",
      attributes: { "promptvault.batch.prompt_count": 12 },
    });
    const json = exportJson([event]);
    expect(json).toContain("analyze-selected");
    expect(json).toContain("succeeded");
    expect(json).toContain("store");
    expect(json).toContain("trace-safe");
    expect(json).toContain("span-safe");
    expect(json).toContain("FEATURE_DISABLED");
    expect(json).toContain("EXPECTED_SKIP");
    expect(json).toContain("durationMs");
    expect(json).toContain("promptvault.batch.prompt_count");
  });
});

describe("Export policy metadata", () => {
  it("includes policy identity and omitted-attribute accounting", () => {
    const event = makeEvent({
      attributes: { full_content: SENTINEL, arbitrary: SENTINEL },
    });
    const data = buildDiagnosticExport("1.9.2", "Win32", {}, [], [event], []);
    expect(data.diagnostic_export_policy).toBe(DIAGNOSTIC_EXPORT_POLICY);
    expect(data.diagnostic_export_policy).toBe("safe-metadata-v1");
    expect(data.export_policy_version).toBe(EXPORT_POLICY_VERSION);
    expect(data.app_version).toBe("1.9.2");
    expect(data.omitted_attribute_count).toBe(2);
    expect(data.omitted_event_attribute_count).toBe(2);
  });

  it("reports zero omitted attributes for a clean event", () => {
    const data = buildDiagnosticExport("1.9.2", "Win32", {}, [], [makeEvent()], []);
    expect(data.omitted_attribute_count).toBe(0);
  });
});
