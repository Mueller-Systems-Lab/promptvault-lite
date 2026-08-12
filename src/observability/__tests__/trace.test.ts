// =============================================================================
// Admin Observability — Unit Tests: Trace Manager
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  createTrace,
  openSpan,
  completeTrace,
  injectTraceIdFactory,
  injectSpanIdFactory,
  injectClock,
  injectPerformanceNow,
  resetFactories,
  toDiagnosticEvent,
} from "../trace";

describe("createTrace", () => {
  beforeEach(() => {
    resetFactories();
    injectTraceIdFactory(() => "trace-001");
  });

  it("creates a trace with generated traceId", () => {
    const trace = createTrace("test-operation");
    expect(trace.traceId).toBe("trace-001");
    expect(trace.operation).toBe("test-operation");
    expect(trace.status).toBe("started");
    expect(trace.spans).toEqual([]);
  });
});

describe("openSpan", () => {
  beforeEach(() => {
    resetFactories();
    injectTraceIdFactory(() => "trace-002");
    injectSpanIdFactory(() => "span-001");
    injectClock(() => "2026-01-01T00:00:00.000Z");
    injectPerformanceNow(() => 1000);
  });

  it("opens a span in a trace", () => {
    const trace = createTrace("test-op");
    const { span } = openSpan(trace, {
      operation: "child-op",
      layer: "store",
    });
    expect(span.spanId).toBe("span-001");
    expect(span.operation).toBe("child-op");
    expect(span.layer).toBe("store");
    expect(span.status).toBe("started");
    expect(trace.spans.length).toBe(1);
  });

  it("sets parentSpanId when provided", () => {
    const trace = createTrace("test-op");
    const { span } = openSpan(trace, {
      operation: "child",
      layer: "store",
      parentSpanId: "parent-001",
    });
    expect(span.parentSpanId).toBe("parent-001");
  });

  it("endSpan sets status, endedAt, and durationMs", () => {
    injectPerformanceNow((() => {
      let call = 0;
      return () => {
        call++;
        return call === 1 ? 1000 : 1500;
      };
    })());

    const trace = createTrace("test-op");
    const { endSpan } = openSpan(trace, {
      operation: "timed-op",
      layer: "typescript",
    });

    const closed = endSpan("succeeded");
    expect(closed.status).toBe("succeeded");
    expect(closed.durationMs).toBe(500);
    expect(closed.endedAt).toBeDefined();
  });

  it("endSpan accepts reasonCode and error", () => {
    const trace = createTrace("test-op");
    const { endSpan } = openSpan(trace, {
      operation: "failing-op",
      layer: "tauri-ipc",
    });

    const closed = endSpan("failed", {
      reasonCode: "TAURI_INVOKE_FAILED",
      error: {
        message: "Connection lost",
        category: "IPC_ERROR",
        reasonCode: "TAURI_INVOKE_FAILED",
      },
    });
    expect(closed.reasonCode).toBe("TAURI_INVOKE_FAILED");
    expect(closed.error?.message).toBe("Connection lost");
    expect(closed.category).toBeUndefined();
  });
});

describe("completeTrace", () => {
  it("sets the trace status", () => {
    const trace = createTrace("test-op");
    completeTrace(trace, "succeeded");
    expect(trace.status).toBe("succeeded");

    const trace2 = createTrace("fail-op");
    completeTrace(trace2, "failed");
    expect(trace2.status).toBe("failed");
  });
});

describe("toDiagnosticEvent", () => {
  it("converts a trace+span to a diagnostic event", () => {
    resetFactories();
    injectTraceIdFactory(() => "trace-evt");
    injectSpanIdFactory(() => "span-evt");
    injectClock(() => "2026-06-15T12:00:00.000Z");

    const trace = createTrace("scan-folder");
    const { endSpan } = openSpan(trace, {
      operation: "scan-directory",
      layer: "tauri-ipc",
    });
    const span = endSpan("succeeded", {
      inputFingerprint: "abc123",
      attributes: { count: 5 },
    });

    const event = toDiagnosticEvent(trace, span);
    expect(event.traceId).toBe("trace-evt");
    expect(event.spanId).toBe("span-evt");
    expect(event.operation).toBe("scan-directory");
    expect(event.layer).toBe("tauri-ipc");
    expect(event.status).toBe("succeeded");
    expect(event.inputFingerprint).toBe("abc123");
    expect(event.schemaVersion).toBe(1);
  });
});
