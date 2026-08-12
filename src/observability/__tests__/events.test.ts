// =============================================================================
// Admin Observability — Unit Tests: Event Bus & Ring Buffer
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import {
  setObservabilityEnabled,
  isObservabilityEnabled,
  emitDiagnosticEvent,
  recordTrace,
  getEvents,
  getTraces,
  clearAll,
  subscribeToEvents,
  isDeepDiagnosticsEnabled,
  setDeepDiagnosticsEnabled,
} from "../events";

function makeEvent(overrides: Partial<import("../contracts").DiagnosticEvent> = {}) {
  return {
    schemaVersion: 1,
    traceId: overrides.traceId ?? "t-1",
    spanId: overrides.spanId ?? "s-1",
    timestamp: overrides.timestamp ?? new Date().toISOString(),
    layer: overrides.layer ?? "store",
    operation: overrides.operation ?? "test-op",
    stage: overrides.stage ?? "test-stage",
    status: overrides.status ?? "succeeded",
    ...overrides,
  };
}

function makeTrace(overrides: Partial<import("../contracts").Trace> = {}) {
  return {
    traceId: overrides.traceId ?? "t-1",
    operation: overrides.operation ?? "test",
    startedAt: overrides.startedAt ?? new Date().toISOString(),
    status: overrides.status ?? "succeeded",
    spans: overrides.spans ?? [],
    ...overrides,
  };
}

describe("Event Bus", () => {
  beforeEach(() => {
    clearAll();
    setObservabilityEnabled(true);
    setDeepDiagnosticsEnabled(false);
  });

  describe("ON/OFF", () => {
    it("emits events when enabled", () => {
      setObservabilityEnabled(true);
      emitDiagnosticEvent(makeEvent());
      expect(getEvents().length).toBe(1);
    });

    it("does NOT emit events when disabled", () => {
      setObservabilityEnabled(false);
      emitDiagnosticEvent(makeEvent());
      expect(getEvents().length).toBe(0);
    });

    it("persists enabled state to localStorage", () => {
      setObservabilityEnabled(true);
      expect(isObservabilityEnabled()).toBe(true);
      expect(localStorage.getItem("promptvault.observability")).toBe("true");

      setObservabilityEnabled(false);
      expect(isObservabilityEnabled()).toBe(false);
      expect(localStorage.getItem("promptvault.observability")).toBeNull();
    });
  });

  describe("Deep Diagnostics", () => {
    it("defaults to OFF", () => {
      expect(isDeepDiagnosticsEnabled()).toBe(false);
    });

    it("toggles ON/OFF in memory only", () => {
      setDeepDiagnosticsEnabled(true);
      expect(isDeepDiagnosticsEnabled()).toBe(true);
      setDeepDiagnosticsEnabled(false);
      expect(isDeepDiagnosticsEnabled()).toBe(false);
    });
  });

  describe("Ring Buffer", () => {
    it("caps events at MAX_EVENTS (2000)", () => {
      for (let i = 0; i < 2500; i++) {
        emitDiagnosticEvent(makeEvent({ spanId: `s-${i}` }));
      }
      expect(getEvents().length).toBe(2000);
      expect(getEvents()[0].spanId).toBe("s-500");
    });

    it("caps traces at MAX_TRACES (100)", () => {
      for (let i = 0; i < 150; i++) {
        recordTrace(makeTrace({ traceId: `t-${i}` }));
      }
      expect(getTraces().length).toBe(100);
    });
  });

  describe("Subscribe", () => {
    it("notifies subscribers on new events", () => {
      const received: unknown[][] = [];
      subscribeToEvents((events) => received.push([...events]));
      emitDiagnosticEvent(makeEvent({ spanId: "s-a" }));
      emitDiagnosticEvent(makeEvent({ spanId: "s-b" }));
      expect(received.length).toBe(2);
    });

    it("unsubscribe stops notifications", () => {
      const received: unknown[][] = [];
      const unsub = subscribeToEvents((events) => received.push([...events]));
      unsub();
      emitDiagnosticEvent(makeEvent());
      expect(received.length).toBe(0);
    });

    it("isolates subscriber failures", () => {
      let threw = false;
      subscribeToEvents(() => {
        threw = true;
        throw new Error("subscriber crash");
      });
      emitDiagnosticEvent(makeEvent());
      expect(threw).toBe(true);
    });
  });

  describe("Clear", () => {
    it("clears all events and traces", () => {
      emitDiagnosticEvent(makeEvent());
      recordTrace(makeTrace());
      expect(getEvents().length).toBe(1);
      expect(getTraces().length).toBe(1);

      clearAll();
      expect(getEvents().length).toBe(0);
      expect(getTraces().length).toBe(0);
    });
  });
});
