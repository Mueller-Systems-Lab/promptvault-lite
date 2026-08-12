// =============================================================================
// PromptVault Lite — Admin Observability Mode — Event Bus
// =============================================================================
// Session-based ring buffer for DiagnosticEvents.
// Memory-only, no persistence. Observable via subscribe().
// =============================================================================

import type { DiagnosticEvent, Trace, DiagnosticStatus } from "./contracts";
import { toDiagnosticEvent } from "./trace";

export type EventSubscriber = (events: DiagnosticEvent[]) => void;

export type TraceSubscriber = (traces: Trace[]) => void;

const MAX_TRACES = 100;
const MAX_EVENTS = 2000;

let events: DiagnosticEvent[] = [];
let traces: Trace[] = [];
let eventSubscribers: EventSubscriber[] = [];
let traceSubscribers: TraceSubscriber[] = [];
let enabled = false;
let deepEnabled = false;

export function isObservabilityEnabled(): boolean {
  return enabled;
}

export function setObservabilityEnabled(value: boolean): void {
  enabled = value;
  try {
    if (value) {
      localStorage.setItem("promptvault.observability", "true");
    } else {
      localStorage.removeItem("promptvault.observability");
    }
  } catch {
    // localStorage not available
  }
}

export function isDeepDiagnosticsEnabled(): boolean {
  return deepEnabled;
}

export function setDeepDiagnosticsEnabled(value: boolean): void {
  deepEnabled = value;
}

export function loadObservabilityState(): void {
  try {
    enabled = localStorage.getItem("promptvault.observability") === "true";
  } catch {
    enabled = false;
  }
  deepEnabled = false;
}

export function emitDiagnosticEvent(event: DiagnosticEvent): void {
  if (!enabled) return;

  events.push(event);
  if (events.length > MAX_EVENTS) {
    events = events.slice(events.length - MAX_EVENTS);
  }

  for (const subscriber of eventSubscribers) {
    try {
      subscriber([...events]);
    } catch {
      // Failure in subscriber must not break the bus
    }
  }
}

export function recordTrace(trace: Trace): void {
  if (!enabled) return;

  traces.push(trace);
  if (traces.length > MAX_TRACES) {
    traces = traces.slice(traces.length - MAX_TRACES);
  }

  for (const subscriber of traceSubscribers) {
    try {
      subscriber([...traces]);
    } catch {
      // Failure in subscriber must not break the bus
    }
  }
}

export function recordCompletedTrace(
  trace: Trace,
  status: DiagnosticStatus,
): void {
  trace.status = status;
  recordTrace(trace);
  for (const span of trace.spans) {
    emitDiagnosticEvent(toDiagnosticEvent(trace, span));
  }
}

export function subscribeToEvents(callback: EventSubscriber): () => void {
  eventSubscribers.push(callback);
  return () => {
    eventSubscribers = eventSubscribers.filter((s) => s !== callback);
  };
}

export function subscribeToTraces(callback: TraceSubscriber): () => void {
  traceSubscribers.push(callback);
  return () => {
    traceSubscribers = traceSubscribers.filter((s) => s !== callback);
  };
}

export function getEvents(): ReadonlyArray<DiagnosticEvent> {
  return events;
}

export function getTraces(): ReadonlyArray<Trace> {
  return traces;
}

export function clearEvents(): void {
  events = [];
}

export function clearTraces(): void {
  traces = [];
}

export function clearAll(): void {
  clearEvents();
  clearTraces();
}
