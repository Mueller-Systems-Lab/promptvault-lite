// =============================================================================
// Admin Diagnostics Panel — Component Tests (fail-closed export)
// =============================================================================
// Verifies the export button uses the canonical app version (not a hardcoded
// literal) and produces a fail-closed JSON bundle through the real store path.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { AdminDiagnosticsPanel } from "../AdminDiagnosticsPanel";
import {
  setObservabilityEnabled,
  emitDiagnosticEvent,
  clearAll,
} from "@/observability/events";
import { useObservabilityStore } from "@/observability/observabilityStore";
import type { DiagnosticEvent } from "@/observability/contracts";

const SENTINEL = "PVL_PRIVACY_SENTINEL_9F3C7A42";

function makeEvent(
  overrides: Partial<DiagnosticEvent> = {},
): DiagnosticEvent {
  return {
    schemaVersion: 1,
    traceId: "comp-t",
    spanId: "comp-s",
    timestamp: "2026-01-01T00:00:00.000Z",
    layer: "store",
    operation: "analyze-selected",
    stage: "analyze",
    status: "succeeded",
    ...overrides,
  };
}

describe("AdminDiagnosticsPanel export", () => {
  let capturedBlob: Blob | null = null;

  beforeEach(() => {
    capturedBlob = null;
    (URL as unknown as { createObjectURL: unknown }).createObjectURL = (
      blob: Blob,
    ) => {
      capturedBlob = blob;
      return "blob:fake-url";
    };
    (URL as unknown as { revokeObjectURL: unknown }).revokeObjectURL = () => {};

    clearAll();
    setObservabilityEnabled(true);
    useObservabilityStore.getState().clearDiagnostics();
  });

  afterEach(() => {
    setObservabilityEnabled(false);
  });

  it("exports the canonical app version and a fail-closed bundle", async () => {
    emitDiagnosticEvent(
      makeEvent({ attributes: { full_content: SENTINEL, arbitrary: SENTINEL } }),
    );
    emitDiagnosticEvent(
      makeEvent({
        operation: "quality",
        attributes: { "promptvault.overall_score": 88 },
      }),
    );

    render(<AdminDiagnosticsPanel onClose={vi.fn()} />);

    const exportButton = screen.getByLabelText("Diagnose exportieren");
    fireEvent.click(exportButton);

    expect(capturedBlob).not.toBeNull();
    const json = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve(reader.result as string);
      };
      reader.onerror = () => {
        reject(
          reader.error instanceof Error
            ? reader.error
            : new Error("FileReader failed"),
        );
      };
      reader.readAsText(capturedBlob as Blob);
    });
    const parsed = JSON.parse(json) as {
      diagnostic_export_policy: string;
      app_version: string;
    };

    expect(json).not.toContain(SENTINEL);
    expect(json).toContain("promptvault.overall_score");
    expect(parsed.diagnostic_export_policy).toBe("safe-metadata-v1");
    // Canonical version, not a stale literal.
    expect(parsed.app_version).toBe(__APP_VERSION__);
    expect(parsed.app_version).not.toBe("1.9.0");
  });
});
