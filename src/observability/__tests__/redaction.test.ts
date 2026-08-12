/* eslint-disable @typescript-eslint/no-non-null-assertion */
// =============================================================================
// Admin Observability — Unit Tests: Redaction & Privacy
// =============================================================================

import { describe, it, expect } from "vitest";
import {
  redactPath,
  contentFingerprint,
  stripSecrets,
  sanitizeEventForExport,
  buildDiagnosticCopy,
} from "../redaction";

describe("redactPath", () => {
  it("relativizes paths under vault root", () => {
    const result = redactPath(
      "C:\\Users\\test\\vault\\subfolder\\prompt.md",
      "C:\\Users\\test\\vault",
    );
    expect(result).toBe("vault:/subfolder/prompt.md");
  });

  it("truncates absolute paths to basename", () => {
    const result = redactPath("/home/user/documents/project/file.md");
    expect(result).toBe(".../file.md");
  });

  it("preserves short paths", () => {
    const result = redactPath("/tmp/file.md");
    expect(result).toBe(".../file.md");
  });

  it("handles empty path", () => {
    expect(redactPath("")).toBe("");
  });

  it("handles vault root without trailing slash", () => {
    const result = redactPath(
      "C:\\Users\\test\\vault\\prompt.md",
      "C:\\Users\\test\\vault",
    );
    expect(result).toBe("vault:/prompt.md");
  });
});

describe("contentFingerprint", () => {
  it("returns length and hash hex", () => {
    const fp = contentFingerprint("Hello World");
    expect(fp).toMatch(/^11:[0-9a-f]{8}$/);
  });

  it("returns 'empty' for empty content", () => {
    expect(contentFingerprint("")).toBe("empty");
  });

  it("is deterministic", () => {
    const a = contentFingerprint("test content");
    const b = contentFingerprint("test content");
    expect(a).toBe(b);
  });

  it("differs for different content", () => {
    const a = contentFingerprint("hello");
    const b = contentFingerprint("world");
    expect(a).not.toBe(b);
  });
});

describe("stripSecrets", () => {
  it("redacts API key patterns", () => {
    const input = 'api_key="sk-abcdef1234567890abcdef1234567890"';
    const result = stripSecrets(input);
    expect(result).not.toContain("sk-abcdef");
    expect(result).toContain("[REDACTED]");
  });

  it("redacts GitHub token patterns", () => {
    const input = "ghp_1234567890abcdef1234567890abcdef1234";
    const result = stripSecrets(input);
    expect(result).toContain("[REDACTED]");
  });

  it("redacts private key blocks", () => {
    const input = "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQ...\n-----END PRIVATE KEY-----";
    const result = stripSecrets(input);
    expect(result).toContain("[REDACTED]");
  });

  it("preserves normal text", () => {
    const input = "This is a normal message about prompt analysis.";
    expect(stripSecrets(input)).toBe(input);
  });

  it("does not redact TEST_SECRET_DO_NOT_EXPORT_123", () => {
    expect(stripSecrets("TEST_SECRET_DO_NOT_EXPORT_123")).toBe(
      "TEST_SECRET_DO_NOT_EXPORT_123",
    );
  });

  it("redacts password: 'secret' patterns", () => {
    const input = "password: 'my-secret-password-123' config";
    const result = stripSecrets(input);
    expect(result).toContain("[REDACTED]");
  });
});

describe("sanitizeEventForExport", () => {
  it("redacts path attributes", () => {
    const event = {
      schemaVersion: 1,
      traceId: "t-1",
      spanId: "s-1",
      timestamp: "2026-01-01",
      layer: "store" as const,
      operation: "scan",
      stage: "scan",
      status: "succeeded" as const,
      attributes: {
        file_path: "C:\\Users\\test\\vault\\secret\\key.md",
      },
    };
    const sanitized = sanitizeEventForExport(event, "C:\\Users\\test\\vault");
    const attrs = sanitized.attributes!;
    expect(attrs.file_path).toBe("vault:/secret/key.md");
  });

  it("handles null vault root", () => {
    const event = {
      schemaVersion: 1,
      traceId: "t-1",
      spanId: "s-1",
      timestamp: "2026-01-01",
      layer: "typescript" as const,
      operation: "test",
      stage: "test",
      status: "succeeded" as const,
      attributes: { path: "/home/user/data.txt" },
    };
    const sanitized = sanitizeEventForExport(event);
    expect(sanitized.attributes!.path).toMatch(/^\.\.\.\//);
  });
});

describe("buildDiagnosticCopy", () => {
  it("builds compact copy text for debugging", () => {
    const trace = {
      traceId: "trace-1",
      operation: "analyze-selected",
      startedAt: "2026-01-01T00:00:00Z",
      status: "failed" as const,
      spans: [
        {
          spanId: "s-1",
          operation: "quality",
          layer: "tauri-ipc" as const,
          stage: "evaluate_prompt",
          status: "succeeded" as const,
          startedAt: "2026-01-01T00:00:00Z",
          durationMs: 15,
        },
        {
          spanId: "s-2",
          operation: "context",
          layer: "typescript" as const,
          stage: "context-evaluation",
          status: "failed" as const,
          startedAt: "2026-01-01T00:00:00Z",
          durationMs: 2,
          reasonCode: "CLASSIFICATION_FAILED" as const,
          category: "PROCESSING_ERROR" as const,
        },
      ],
    };
    const result = buildDiagnosticCopy(trace, []);
    expect(result).toContain("analyze-selected");
    expect(result).toContain("trace-1");
    expect(result).toContain("CLASSIFICATION_FAILED");
    expect(result).toContain("Sensitive data exposed: NO");
  });
});
