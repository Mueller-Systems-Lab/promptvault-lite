// =============================================================================
// PromptVault Lite — PromptEditor Component Tests (v1.10.0)
// =============================================================================
// Covers: labeled title/content inputs, dirty indicator, save-disabled states,
// cancel, save-in-progress disables controls, save error association,
// Escape cancels, Ctrl+S saves, no double-save while saving.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
} from "@testing-library/react";
import { PromptEditor } from "../PromptEditor";
import { useAppStore } from "@/stores/appStore";
import type { PromptItem } from "@/types";

// ---------------------------------------------------------------------------
// Mocks: tauri + event bus (store imports these)
// ---------------------------------------------------------------------------
const { mockCreatePrompt } = vi.hoisted(() => ({
  mockCreatePrompt: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  createPrompt: mockCreatePrompt,
  updatePrompt: vi.fn(),
  scanDirectory: vi.fn(() => Promise.resolve([])),
  startFileWatcher: vi.fn(() => Promise.resolve()),
  stopFileWatcher: vi.fn(() => Promise.resolve()),
  toggleFavorite: vi.fn(() => Promise.resolve(false)),
  evaluatePrompt: vi.fn(),
  analyzeHygiene: vi.fn(),
  analyzeAll: vi.fn(),
  exportJson: vi.fn(),
  exportMarkdown: vi.fn(),
  exportZip: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrompt(overrides: Partial<PromptItem> = {}): PromptItem {
  return {
    id: "p1",
    file_path: "/test/p1.md",
    file_name: "p1.md",
    title: "Bestehender Titel",
    description: "",
    category: "general",
    tags: [],
    content: "Bestehender Inhalt.",
    version: "1.0",
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
    ...overrides,
  };
}

function resetStore() {
  useAppStore.setState({
    prompts: [],
    selectedPromptId: null,
    evaluations: {},
    hygiene: {},
    contextEvaluations: {},
    blueprintDetections: {},
    blueprintEvaluations: {},
    isLoading: false,
    isAnalyzing: false,
    error: null,
    filters: {
      search: "",
      category: null,
      minScore: 0,
      maxScore: 100,
      hygieneStatus: null,
      tags: [],
      favoritesOnly: false,
    },
    currentFolderPath: null,
    promptEditor: null,
  });
}

/** Open the editor via the real store action (create mode by default). */
function openCreateEditor() {
  act(() => {
    useAppStore.getState().openCreatePrompt();
  });
}

function openEditEditor(prompt: PromptItem) {
  act(() => {
    useAppStore.setState({ prompts: [prompt], selectedPromptId: prompt.id });
    useAppStore.getState().openEditPrompt(prompt.id);
  });
}

describe("PromptEditor", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  describe("rendering", () => {
    it("renders labeled title and content inputs", () => {
      openCreateEditor();
      render(<PromptEditor />);

      expect(screen.getByLabelText(/Titel/)).toBeInTheDocument();
      expect(screen.getByLabelText(/Inhalt/)).toBeInTheDocument();
    });

    it("pre-fills title and content in edit mode", () => {
      openEditEditor(makePrompt());
      render(<PromptEditor />);

      const titleInput = screen.getByLabelText<HTMLInputElement>(/Titel/);
      const contentInput = screen.getByLabelText<HTMLTextAreaElement>(
        /Inhalt/,
      );
      expect(titleInput.value).toBe("Bestehender Titel");
      expect(contentInput.value).toBe("Bestehender Inhalt.");
    });

    it("renders nothing when editor is closed", () => {
      render(<PromptEditor />);
      expect(screen.queryByLabelText(/Titel/)).not.toBeInTheDocument();
    });
  });

  describe("dirty indicator", () => {
    it("shows dirty indicator after typing", () => {
      openCreateEditor();
      render(<PromptEditor />);

      expect(screen.queryByText(/Ungespeicherte Änderungen/)).toBeNull();

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Neuer Titel" },
      });

      expect(
        screen.getByText(/Ungespeicherte Änderungen/),
      ).toBeInTheDocument();
    });

    it("does not show dirty indicator when clean", () => {
      openEditEditor(makePrompt());
      render(<PromptEditor />);
      expect(screen.queryByText(/Ungespeicherte Änderungen/)).toBeNull();
    });
  });

  describe("save button state", () => {
    it("save is disabled when title is empty", () => {
      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Nur Inhalt" },
      });

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      expect(saveButton).toBeDisabled();
    });

    it("save is disabled when content is empty", () => {
      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Nur Titel" },
      });

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      expect(saveButton).toBeDisabled();
    });

    it("save is enabled in create mode when dirty and non-empty", () => {
      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      expect(saveButton).not.toBeDisabled();
    });

    it("save is disabled in edit mode when clean (not dirty)", () => {
      openEditEditor(makePrompt());
      render(<PromptEditor />);

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      expect(saveButton).toBeDisabled();
    });

    it("save is enabled in edit mode when dirty and non-empty", () => {
      openEditEditor(makePrompt());
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Geänderter Inhalt" },
      });

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      expect(saveButton).not.toBeDisabled();
    });
  });

  describe("cancel", () => {
    it("cancel closes the editor without saving", () => {
      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Wegwerf-Titel" },
      });
      fireEvent.click(screen.getByRole("button", { name: /Abbrechen/ }));

      expect(useAppStore.getState().promptEditor).toBeNull();
      expect(mockCreatePrompt).not.toHaveBeenCalled();
    });
  });

  describe("save-in-progress", () => {
    it("disables all controls while saving", async () => {
      let resolveSave: (value: unknown) => void = () => {};
      mockCreatePrompt.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );

      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));

      expect(screen.getByRole("button", { name: /Speichern…/ })).toBeDisabled();
      expect(screen.getByRole("button", { name: /Abbrechen/ })).toBeDisabled();
      expect(screen.getByLabelText(/Titel/)).toBeDisabled();
      expect(screen.getByLabelText(/Inhalt/)).toBeDisabled();

      await act(async () => {
        resolveSave({
          id: "np",
          file_path: "/test/np.md",
          file_name: "np.md",
          title: "Titel",
          description: "",
          category: "general",
          tags: [],
          content: "Inhalt",
          version: "1.0",
          raw_frontmatter: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_favorite: false,
        });
        await Promise.resolve();
      });
    });

    it("does not double-save while saving", async () => {
      let resolveSave: (value: unknown) => void = () => {};
      mockCreatePrompt.mockImplementation(
        () =>
          new Promise((resolve) => {
            resolveSave = resolve;
          }),
      );

      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      fireEvent.click(saveButton);
      // Button is now disabled — a second click must be ignored
      fireEvent.click(screen.getByRole("button", { name: /Speichern…/ }));

      expect(mockCreatePrompt).toHaveBeenCalledTimes(1);

      await act(async () => {
        resolveSave({
          id: "np",
          file_path: "/test/np.md",
          file_name: "np.md",
          title: "Titel",
          description: "",
          category: "general",
          tags: [],
          content: "Inhalt",
          version: "1.0",
          raw_frontmatter: {},
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
          is_favorite: false,
        });
        await Promise.resolve();
      });
    });
  });

  describe("save error", () => {
    it("shows the save error with role alert", async () => {
      mockCreatePrompt.mockRejectedValue(new Error("Speichern fehlgeschlagen"));

      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));

      const alert = await screen.findByRole("alert");
      expect(alert).toHaveTextContent(/Speichern fehlgeschlagen/);

      // The save button is associated with the error region
      const saveButton = screen.getByRole("button", { name: /Speichern/ });
      const describedBy = saveButton.getAttribute("aria-describedby");
      expect(describedBy).toBeTruthy();
      if (describedBy) {
        const described = document.getElementById(describedBy);
        expect(described).not.toBeNull();
      }
    });
  });

  describe("keyboard", () => {
    it("Escape cancels the editor", () => {
      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "X" },
      });
      fireEvent.keyDown(window, { key: "Escape" });

      expect(useAppStore.getState().promptEditor).toBeNull();
    });

    it("Ctrl+S saves (create mode)", async () => {
      mockCreatePrompt.mockResolvedValue({
        id: "np",
        file_path: "/test/np.md",
        file_name: "np.md",
        title: "Titel",
        description: "",
        category: "general",
        tags: [],
        content: "Inhalt",
        version: "1.0",
        raw_frontmatter: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_favorite: false,
      });

      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      fireEvent.keyDown(window, { key: "s", ctrlKey: true });

      await waitFor(() => {
        expect(mockCreatePrompt).toHaveBeenCalledTimes(1);
      });
    });

    it("Escape does not cancel while saving", () => {
      mockCreatePrompt.mockImplementation(
        () => new Promise(() => {}), // never resolves
      );

      openCreateEditor();
      render(<PromptEditor />);

      fireEvent.change(screen.getByLabelText(/Titel/), {
        target: { value: "Titel" },
      });
      fireEvent.change(screen.getByLabelText(/Inhalt/), {
        target: { value: "Inhalt" },
      });

      fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
      fireEvent.keyDown(window, { key: "Escape" });

      // Editor stays open (save in progress blocks Escape)
      expect(useAppStore.getState().promptEditor).not.toBeNull();
    });
  });
});
