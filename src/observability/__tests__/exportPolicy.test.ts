/* eslint-disable @typescript-eslint/no-non-null-assertion */
// =============================================================================
// Admin Observability — Diagnostic Export Policy Tests
// =============================================================================
// Exercises the real export path: event → observability store →
// diagnostics export builder → JSON, asserting the fail-closed contract.

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  setObservabilityEnabled,
  emitDiagnosticEvent,
  clearAll,
} from "../events";
import { useObservabilityStore } from "../observabilityStore";
import type { DiagnosticEvent } from "../contracts";

const SENTINEL = "PVL_PRIVACY_SENTINEL_9F3C7A42";

function makeEvent(
  overrides: Partial<DiagnosticEvent> = {},
): DiagnosticEvent {
  return {
    schemaVersion: 1,
    traceId: "policy-t",
    spanId: "policy-s",
    timestamp: "2026-01-01T00:00:00.000Z",
    layer: "store",
    operation: "scan-folder",
    stage: "scan",
    status: "succeeded",
    ...overrides,
  };
}

describe("Diagnostic export policy (store path)", () => {
  beforeEach(() => {
    clearAll();
    setObservabilityEnabled(true);
    useObservabilityStore.getState().clearDiagnostics();
  });

  afterEach(() => {
    setObservabilityEnabled(false);
  });

  it("produces a fail-closed JSON bundle from real store state", () => {
    emitDiagnosticEvent(
      makeEvent({
        attributes: { full_content: SENTINEL, arbitrary: SENTINEL },
      }),
    );
    emitDiagnosticEvent(
      makeEvent({
        operation: "quality",
        attributes: { "promptvault.overall_score": 88 },
      }),
    );

    const data = useObservabilityStore.getState().exportDiagnostics("1.9.2");
    expect(data).not.toBeNull();

    const json = JSON.stringify(data);
    expect(json).not.toContain(SENTINEL);
    expect(json).toContain("promptvault.overall_score");

    expect(data!.diagnostic_export_policy).toBe("safe-metadata-v1");
    expect(data!.export_policy_version).toBe(1);
    expect(data!.app_version).toBe("1.9.2");
    // Unknown + unsafe attributes from the sentinel event are omitted.
    expect(data!.omitted_event_attribute_count).toBe(2);
  });

  it("future instrumentation attributes are fail-closed at the store level", () => {
    emitDiagnosticEvent(
      makeEvent({
        attributes: { future_instrumentation_field: SENTINEL },
      }),
    );
    const data = useObservabilityStore.getState().exportDiagnostics("1.9.2");
    expect(JSON.stringify(data)).not.toContain(SENTINEL);
    expect(data!.omitted_event_attribute_count).toBe(1);
  });
});
