// =============================================================================
// PromptVault Lite — Admin Observability Mode — Trace Manager
// =============================================================================
// Creates and manages Trace and Span lifecycles.
// Trace-ID and Span-ID factories are injectable for deterministic tests.
// =============================================================================

import type {
  Trace,
  Span,
  DiagnosticLayer,
  DiagnosticStatus,
  DiagnosticCategory,
  ReasonCode,
  DiagnosticError,
  InvariantViolation,
} from "./contracts";
import { OBSERVABILITY_SCHEMA_VERSION } from "./contracts";

let traceIdFactory: () => string = () => crypto.randomUUID();
let spanIdFactory: () => string = () => crypto.randomUUID();
let clockFn: () => string = () => new Date().toISOString();
let performanceNow: () => number = () => performance.now();

export function injectTraceIdFactory(factory: () => string): void {
  traceIdFactory = factory;
}

export function injectSpanIdFactory(factory: () => string): void {
  spanIdFactory = factory;
}

export function injectClock(factory: () => string): void {
  clockFn = factory;
}

export function injectPerformanceNow(factory: () => number): void {
  performanceNow = factory;
}

export function resetFactories(): void {
  traceIdFactory = () => crypto.randomUUID();
  spanIdFactory = () => crypto.randomUUID();
  clockFn = () => new Date().toISOString();
  performanceNow = () => performance.now();
}

export interface SpanOptions {
  parentSpanId?: string;
  operation: string;
  layer: DiagnosticLayer;
  stage?: string;
  attributes?: Record<string, unknown>;
}

export interface SpanResult {
  span: Span;
  startTimeMs: number;
  endSpan: (
    status: DiagnosticStatus,
    options?: {
      category?: DiagnosticCategory;
      reasonCode?: ReasonCode;
      inputFingerprint?: string;
      outputFingerprint?: string;
      attributes?: Record<string, unknown>;
      error?: DiagnosticError;
      invariantViolations?: InvariantViolation[];
    },
  ) => Span;
}

export function createTrace(operation: string): Trace {
  return {
    traceId: traceIdFactory(),
    operation,
    startedAt: clockFn(),
    status: "started",
    spans: [],
  };
}

export function openSpan(trace: Trace, options: SpanOptions): SpanResult {
  const spanId = spanIdFactory();
  const now = clockFn();
  const startTimeMs = performanceNow();

  const span: Span = {
    spanId,
    parentSpanId: options.parentSpanId,
    operation: options.operation,
    layer: options.layer,
    stage: options.stage ?? options.operation,
    status: "started",
    startedAt: now,
    attributes: options.attributes,
  };

  trace.spans.push(span);

  const endSpan = (
    status: DiagnosticStatus,
    endOptions?: {
      category?: DiagnosticCategory;
      reasonCode?: ReasonCode;
      inputFingerprint?: string;
      outputFingerprint?: string;
      attributes?: Record<string, unknown>;
      error?: DiagnosticError;
      invariantViolations?: InvariantViolation[];
    },
  ): Span => {
    const endMs = performanceNow();
    span.status = status;
    span.endedAt = clockFn();
    span.durationMs = Math.round((endMs - startTimeMs) * 100) / 100;

    if (endOptions) {
      if (endOptions.category) span.category = endOptions.category;
      if (endOptions.reasonCode) span.reasonCode = endOptions.reasonCode;
      if (endOptions.inputFingerprint)
        span.inputFingerprint = endOptions.inputFingerprint;
      if (endOptions.outputFingerprint)
        span.outputFingerprint = endOptions.outputFingerprint;
      if (endOptions.error) span.error = endOptions.error;
      if (endOptions.invariantViolations)
        span.invariantViolations = endOptions.invariantViolations;
      if (endOptions.attributes) {
        span.attributes = {
          ...span.attributes,
          ...endOptions.attributes,
        };
      }
    }

    return span;
  };

  return { span, startTimeMs, endSpan };
}

export function completeTrace(trace: Trace, status: DiagnosticStatus): void {
  trace.status = status;
}

export function toDiagnosticEvent(
  trace: Trace,
  span: Span,
): import("./contracts").DiagnosticEvent {
  return {
    schemaVersion: OBSERVABILITY_SCHEMA_VERSION,
    traceId: trace.traceId,
    spanId: span.spanId,
    parentSpanId: span.parentSpanId,
    timestamp: span.endedAt ?? span.startedAt,
    durationMs: span.durationMs,
    layer: span.layer,
    operation: span.operation,
    stage: span.stage,
    status: span.status,
    category: span.category,
    reasonCode: span.reasonCode,
    inputFingerprint: span.inputFingerprint,
    outputFingerprint: span.outputFingerprint,
    attributes: span.attributes,
    error: span.error,
    invariantViolations: span.invariantViolations,
  };
}
