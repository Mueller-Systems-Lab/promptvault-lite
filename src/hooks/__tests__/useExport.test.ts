import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useExport } from "../useExport";

const mocks = vi.hoisted(() => ({
  backendKind: "http" as "http" | "tauri",
  prompts: [
    { id: "favorite", is_favorite: true, content: "safe" },
    { id: "ordinary", is_favorite: false, content: "safe" },
  ],
  evaluations: {},
  hygiene: {},
  buildDocument: vi.fn(() => ({ export_date: "2026-01-01", version: "1", prompts: [] })),
  buildContent: vi.fn(() => ({ filename: "export.json", mimeType: "application/json", content: "{}" })),
  saveWeb: vi.fn(() => Promise.resolve()),
  exportJson: vi.fn(() => Promise.resolve()),
  exportMarkdown: vi.fn(() => Promise.resolve()),
  exportZip: vi.fn(() => Promise.resolve()),
  open: vi.fn(() => Promise.resolve("/tmp/export")),
  listen: vi.fn(() => Promise.resolve(() => undefined)),
}));

vi.mock("@/stores/appStore", () => ({
  useAppStore: (selector: (state: unknown) => unknown) =>
    selector({
      prompts: mocks.prompts,
      evaluations: mocks.evaluations,
      hygiene: mocks.hygiene,
    }),
}));
vi.mock("@/lib/backend/factory", () => ({
  getBackend: () => ({ kind: mocks.backendKind }),
}));
vi.mock("@/lib/export/webExport", () => ({
  buildWebExportDocument: mocks.buildDocument,
  buildWebExportContent: mocks.buildContent,
  saveWebExportFile: mocks.saveWeb,
}));
vi.mock("@/lib/tauri", () => ({
  exportJson: mocks.exportJson,
  exportMarkdown: mocks.exportMarkdown,
  exportZip: mocks.exportZip,
}));
vi.mock("@tauri-apps/api/event", () => ({ listen: mocks.listen }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: mocks.open }));

describe("useExport backend behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.backendKind = "http";
    mocks.saveWeb.mockResolvedValue(undefined);
    mocks.open.mockResolvedValue("/tmp/export");
  });

  it("exports only favorites in web mode without calling Tauri IPC", async () => {
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(true));

    expect(mocks.buildDocument).toHaveBeenCalledWith(
      [mocks.prompts[0]],
      mocks.evaluations,
      mocks.hygiene,
    );
    expect(mocks.saveWeb).toHaveBeenCalledOnce();
    expect(mocks.exportJson).not.toHaveBeenCalled();
    expect(mocks.exportMarkdown).not.toHaveBeenCalled();
    expect(mocks.exportZip).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(result.current.error).toBeNull();
  });

  it("handles browser cancellation without presenting an error", async () => {
    mocks.saveWeb.mockRejectedValueOnce(new DOMException("Cancelled", "AbortError"));
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isExporting).toBe(false);
  });

  it("shows a useful error when browser file writing fails", async () => {
    mocks.saveWeb.mockRejectedValueOnce(new Error("Write failed"));
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBe("Write failed");
    expect(result.current.isExporting).toBe(false);
  });

  it("uses Tauri IPC in desktop mode", async () => {
    mocks.backendKind = "tauri";
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(mocks.open).toHaveBeenCalledOnce();
    expect(mocks.exportJson).toHaveBeenCalledOnce();
    expect(mocks.saveWeb).not.toHaveBeenCalled();
  });
});
