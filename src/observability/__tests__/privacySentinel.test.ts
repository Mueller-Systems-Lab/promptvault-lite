// =============================================================================
// Admin Observability — Privacy Sentinel Test (fail-closed)
// =============================================================================
// A single unambiguous sentinel is placed in every leak-prone position and the
// resulting diagnostic export JSON must contain ZERO occurrences of it.

import { describe, it, expect } from "vitest";
import {
  buildDiagnosticExport,
  buildDiagnosticCopy,
} from "../redaction";
import type { DiagnosticEvent, Trace } from "../contracts";

const SENTINEL = "PVL_PRIVACY_SENTINEL_9F3C7A42";

function makeEvent(
  overrides: Partial<DiagnosticEvent> = {},
): DiagnosticEvent {
  return {
    schemaVersion: 1,
    traceId: "sentinel-t",
    spanId: "sentinel-s",
    timestamp: "2026-01-01T00:00:00.000Z",
    layer: "store",
    operation: "test",
    stage: "test",
    status: "succeeded",
    ...overrides,
  };
}

function buildExport(events: DiagnosticEvent[], traces: Trace[] = []) {
  return buildDiagnosticExport("1.9.2", "Win32", {}, traces, events, []);
}

describe("Privacy Sentinel — zero occurrences in diagnostic export", () => {
  it("sentinel in arbitrary attribute values never crosses the export boundary", () => {
    const event = makeEvent({
      attributes: { arbitrary_user_text: SENTINEL },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });

  it("sentinel in nested user data never crosses the export boundary", () => {
    const event = makeEvent({
      attributes: {
        custom: { text: SENTINEL, answer: SENTINEL, data: [SENTINEL] },
      },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });

  it("sentinel in a user-answer-shaped value never crosses the export boundary", () => {
    const event = makeEvent({
      attributes: { user_answer: SENTINEL },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });

  it("sentinel in an error message never crosses the export boundary", () => {
    const event = makeEvent({
      status: "failed",
      error: {
        message: `api_key='${SENTINEL}' was rejected`,
        category: "PROCESSING_ERROR",
        reasonCode: "INTERNAL_OBSERVABILITY_ERROR",
      },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });

  it("sentinel in a raw-content-shaped attribute never crosses the export boundary", () => {
    const event = makeEvent({
      attributes: { full_content: SENTINEL },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });

  it("future instrumentation field is fail-closed without export-code changes", () => {
    const event = makeEvent({
      attributes: { future_instrumentation_field: SENTINEL },
    });
    const data = buildExport([event]);
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });
});

describe("Deep Diagnostics does not bypass the privacy boundary", () => {
  it("deep-enabled export still omits sentinel and prompt content", () => {
    const event = makeEvent({
      attributes: {
        full_content: SENTINEL,
        raw_input: SENTINEL,
        clipboard: SENTINEL,
      },
    });
    const data = buildDiagnosticExport(
      "1.9.2",
      "Win32",
      { observability: true, deepDiagnostics: true },
      [],
      [event],
      [],
    );
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
  });
});

describe("Copy-for-debugging summary", () => {
  it("never includes sentinel and reports no sensitive data", () => {
    const trace: Trace = {
      traceId: "trace-1",
      operation: "analyze-selected",
      startedAt: "2026-01-01T00:00:00Z",
      status: "failed",
      spans: [
        {
          spanId: "s-1",
          operation: "context",
          layer: "typescript",
          stage: "context-evaluation",
          status: "failed",
          startedAt: "2026-01-01T00:00:00Z",
          durationMs: 2,
          reasonCode: "CLASSIFICATION_FAILED",
          category: "PROCESSING_ERROR",
        },
      ],
    };
    const text = buildDiagnosticCopy(trace, []);
    expect(text).not.toContain(SENTINEL);
    expect(text).toContain("Sensitive data exposed: NO");
  });
});
