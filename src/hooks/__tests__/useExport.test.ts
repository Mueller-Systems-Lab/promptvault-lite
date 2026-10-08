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
  buildDocument: vi.fn(() => ({
    export_date: "2026-01-01",
    version: "1",
    prompts: [],
  })),
  buildContent: vi.fn(() => ({
    filename: "export.json",
    mimeType: "application/json",
    content: "{}",
  })),
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
vi.mock("@/lib/export/webExport", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/export/webExport")
  >();
  return {
    ...actual,
    buildWebExportDocument: mocks.buildDocument,
    buildWebExportContent: mocks.buildContent,
    saveWebExportFile: mocks.saveWeb,
  };
});
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
    mocks.prompts = [
      { id: "favorite", is_favorite: true, content: "safe" },
      { id: "ordinary", is_favorite: false, content: "safe" },
    ];
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
    mocks.saveWeb.mockRejectedValueOnce(
      new DOMException("Cancelled", "AbortError"),
    );
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBeNull();
    expect(result.current.isExporting).toBe(false);
  });

  it("shows a useful error when browser file writing fails", async () => {
    mocks.saveWeb.mockRejectedValueOnce(
      new Error("Fehler beim Schreiben: Write failed"),
    );
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBe("Fehler beim Schreiben: Write failed");
    expect(result.current.isExporting).toBe(false);
  });

  it("keeps browser picker setup errors distinct from write errors", async () => {
    mocks.saveWeb.mockRejectedValueOnce(new Error("Picker blocked"));
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));

    expect(result.current.error).toBe("Picker blocked");
    expect(mocks.open).not.toHaveBeenCalled();
  });

  it("rejects an empty selection without invoking browser save or Tauri IPC", async () => {
    mocks.prompts = [];
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));

    expect(result.current.error).toBe(
      "Keine Prompts zum Exportieren ausgewählt",
    );
    expect(mocks.saveWeb).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.exportJson).not.toHaveBeenCalled();
  });

  it("rejects ZIP in web mode before browser save or Tauri IPC", async () => {
    const { result } = renderHook(() => useExport());
    act(() => {
      result.current.setExportFormat("zip");
    });
    await act(async () => result.current.startExport(false));

    expect(result.current.error).toBe(
      "ZIP-Export ist im Webmodus nicht verfügbar.",
    );
    expect(mocks.buildDocument).not.toHaveBeenCalled();
    expect(mocks.saveWeb).not.toHaveBeenCalled();
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.exportZip).not.toHaveBeenCalled();
  });

  it("clears an earlier write error when the next export starts", async () => {
    mocks.saveWeb.mockRejectedValueOnce(
      new Error("Fehler beim Schreiben: Disk full"),
    );
    const { result } = renderHook(() => useExport());
    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBe("Fehler beim Schreiben: Disk full");

    await act(async () => result.current.startExport(false));
    expect(result.current.error).toBeNull();
    expect(mocks.saveWeb).toHaveBeenCalledTimes(2);
    expect(mocks.open).not.toHaveBeenCalled();
    expect(mocks.exportJson).not.toHaveBeenCalled();
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
