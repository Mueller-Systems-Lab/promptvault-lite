import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useExport } from "../useExport";

const mocks = vi.hoisted(() => ({
  prompts: [
    {
      id: "synthetic-write-abort",
      file_path: "/tmp/synthetic/prompt.md",
      file_name: "prompt.md",
      title: "Synthetic prompt",
      description: "Synthetic export failure test",
      category: "test",
      version: "1",
      tags: [],
      content: "Synthetic content only",
      raw_frontmatter: {},
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
      is_favorite: false,
    },
  ],
}));

vi.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({ prompts: mocks.prompts, evaluations: {}, hygiene: {} }),
}));
vi.mock("@/lib/backend/factory", () => ({
  getBackend: () => ({ kind: "http" }),
}));
vi.mock("@/lib/tauri", () => ({
  exportJson: vi.fn(),
  exportMarkdown: vi.fn(),
  exportZip: vi.fn(),
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: vi.fn() }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

describe("useExport browser write failures", () => {
  it("surfaces an AbortError thrown after destination selection", async () => {
    const originalPicker = Object.getOwnPropertyDescriptor(
      window,
      "showSaveFilePicker",
    );
    const writeAbort = new DOMException("Write was aborted", "AbortError");
    const abort = vi.fn().mockResolvedValue(undefined);
    const write = vi.fn().mockRejectedValue(writeAbort);
    const close = vi.fn().mockResolvedValue(undefined);
    const createWritable = vi.fn().mockResolvedValue({ write, close, abort });
    const picker = vi.fn().mockResolvedValue({ createWritable });

    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    try {
      const { result } = renderHook(() => useExport());
      await act(async () => {
        await result.current.startExport(false);
      });

      expect(picker).toHaveBeenCalledOnce();
      expect(createWritable).toHaveBeenCalledOnce();
      expect(write).toHaveBeenCalledOnce();
      expect(abort).toHaveBeenCalledOnce();
      expect(close).not.toHaveBeenCalled();
      expect(result.current.error).toMatch(/^Fehler beim Schreiben:/);
      expect(result.current.error).toContain("Write was aborted");
      expect(result.current.isExporting).toBe(false);
    } finally {
      if (originalPicker) {
        Object.defineProperty(window, "showSaveFilePicker", originalPicker);
      } else {
        Reflect.deleteProperty(window, "showSaveFilePicker");
      }
    }
  });

  it("surfaces a picker AbortError caused by a failed file creation", async () => {
    const originalPicker = Object.getOwnPropertyDescriptor(
      window,
      "showSaveFilePicker",
    );
    // Chrome 140 reports a non-writable destination with AbortError and this
    // exact message; it must not be treated like a user cancellation.
    const picker = vi
      .fn()
      .mockRejectedValue(
        new DOMException(
          "Failed to execute 'showSaveFilePicker' on 'Window': Failed to create or truncate file",
          "AbortError",
        ),
      );

    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    try {
      const { result } = renderHook(() => useExport());
      await act(async () => {
        await result.current.startExport(false);
      });

      expect(result.current.error).toMatch(/^Fehler beim Schreiben:/);
      expect(result.current.error).toContain(
        "Failed to create or truncate file",
      );
      expect(result.current.isExporting).toBe(false);
    } finally {
      if (originalPicker) {
        Object.defineProperty(window, "showSaveFilePicker", originalPicker);
      } else {
        Reflect.deleteProperty(window, "showSaveFilePicker");
      }
    }
  });

  it("stays silent when the user dismisses the save picker", async () => {
    const originalPicker = Object.getOwnPropertyDescriptor(
      window,
      "showSaveFilePicker",
    );
    const picker = vi
      .fn()
      .mockRejectedValue(
        new DOMException(
          "Failed to execute 'showSaveFilePicker' on 'Window': The user aborted a request.",
          "AbortError",
        ),
      );

    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: picker,
    });

    try {
      const { result } = renderHook(() => useExport());
      await act(async () => {
        await result.current.startExport(false);
      });

      expect(picker).toHaveBeenCalledOnce();
      expect(result.current.error).toBeNull();
      expect(result.current.isExporting).toBe(false);
    } finally {
      if (originalPicker) {
        Object.defineProperty(window, "showSaveFilePicker", originalPicker);
      } else {
        Reflect.deleteProperty(window, "showSaveFilePicker");
      }
    }
  });
});
