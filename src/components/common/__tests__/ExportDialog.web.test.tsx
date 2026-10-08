import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ExportDialog } from "../ExportDialog";

const mocks = vi.hoisted(() => ({
  setExportFormat: vi.fn(),
  startExport: vi.fn(),
  error: null as string | null,
}));

vi.mock("@/hooks/useExport", () => ({
  useExport: () => ({
    isExporting: false,
    progress: 0,
    error: mocks.error,
    exportFormat: "json",
    setExportFormat: mocks.setExportFormat,
    startExport: mocks.startExport,
  }),
}));
vi.mock("@/hooks/useFocusTrap", () => ({ useFocusTrap: () => null }));
vi.mock("@/lib/backend/factory", () => ({
  getBackend: () => ({ kind: "http" }),
}));

describe("ExportDialog in web mode", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("shows the German failure message and no raw browser text", () => {
    mocks.error =
      "Die Exportdatei konnte nicht geschrieben werden. Bitte freien Speicherplatz prüfen und erneut versuchen.";
    try {
      render(<ExportDialog onClose={vi.fn()} />);
      expect(
        screen.getByText(
          "Die Exportdatei konnte nicht geschrieben werden. Bitte freien Speicherplatz prüfen und erneut versuchen.",
        ),
      ).toBeVisible();
      expect(
        screen.queryByText(/Failed to execute|showSaveFilePicker|AbortError/),
      ).toBeNull();
    } finally {
      mocks.error = null;
    }
  });

  it("offers JSON and Markdown but hides the unsupported ZIP format", () => {
    render(<ExportDialog onClose={vi.fn()} />);
    expect(screen.getByRole("radio", { name: /JSON/ })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: /Markdown/ })).toBeInTheDocument();
    expect(
      screen.queryByRole("radio", { name: /ZIP/ }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText("ZIP-Export ist im Webmodus nicht verfügbar."),
    ).toBeVisible();
  });
});
