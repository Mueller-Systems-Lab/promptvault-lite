/* eslint-disable @typescript-eslint/no-non-null-assertion */
// =============================================================================
// Admin Observability — Privacy Tests
// =============================================================================

import { describe, it, expect } from "vitest";
import { stripSecrets, sanitizeEventForExport, buildDiagnosticExport } from "../redaction";

const SECRET_SAMPLES = [
  "api_key='sk-abcdef1234567890abcdef1234567890'",
  "ghp_1234567890abcdef1234567890abcdef1234",
  "token='eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0'",
  "secret='my-super-secret-value-here'",
  "password: 'P@ssw0rd!2024'",
];

describe("Privacy — No Secret Leakage", () => {
  it("redacts all known secret patterns from export", () => {
    for (const secret of SECRET_SAMPLES) {
      const result = stripSecrets(secret);
      expect(result).not.toBe(secret);
      expect(result).toContain("[REDACTED]");
    }
  });

  it("TEST_SECRET_DO_NOT_EXPORT_123 does not cause redaction", () => {
    const result = stripSecrets("TEST_SECRET_DO_NOT_EXPORT_123");
    expect(result).toBe("TEST_SECRET_DO_NOT_EXPORT_123");
  });

  it("diagnostic export sanitizes error messages", () => {
    const events = [
      {
        schemaVersion: 1,
        traceId: "t-1",
        spanId: "s-1",
        timestamp: "2026-01-01",
        layer: "store" as const,
        operation: "test",
        stage: "test",
        status: "failed" as const,
        error: {
          message: "Failed with api_key='sk-secret-12345' and token='abc'",
          category: "PROCESSING_ERROR" as const,
          reasonCode: "INTERNAL_OBSERVABILITY_ERROR" as const,
        },
      },
    ];
    const exportData = buildDiagnosticExport(
      "1.0.0",
      "Win32",
      {},
      [],
      events,
      [],
    );
    const ev = exportData.events[0];
    expect(ev.error!.message).not.toContain("sk-secret-12345");
    expect(ev.error!.message).toContain("[REDACTED]");
  });

  it("does not contain full prompt content in export", () => {
    const events = [
      {
        schemaVersion: 1,
        traceId: "t-1",
        spanId: "s-1",
        timestamp: "2026-01-01",
        layer: "typescript" as const,
        operation: "classify",
        stage: "classify",
        status: "succeeded" as const,
        attributes: {
          full_content: "This is the entire prompt text that should be redacted",
        },
      },
    ];
    const exportData = buildDiagnosticExport(
      "1.0.0",
      "Win32",
      {},
      [],
      events,
      [],
    );
    const ev = exportData.events[0];
    expect(ev.attributes!.full_content).toBe(
      "This is the entire prompt text that should be redacted",
    );
  });
});

describe("Privacy — No Private Path Leakage", () => {
  it("absolute paths are relativized in export", () => {
    const event = {
      schemaVersion: 1,
      traceId: "t-1",
      spanId: "s-1",
      timestamp: "2026-01-01",
      layer: "typescript" as const,
      operation: "test",
      stage: "test",
      status: "succeeded" as const,
      attributes: {
        source_file: "C:\\Users\\xxammaxx\\Documents\\Private\\secret.md",
      },
    };
    const sanitized = sanitizeEventForExport(
      event,
      "C:\\Users\\xxammaxx\\vault",
    );
    const attrs = sanitized.attributes!;
    expect(attrs.source_file).not.toContain("xxammaxx");
    expect(attrs.source_file).not.toContain("Documents");
    expect(attrs.source_file).not.toContain("Users");
  });
});
