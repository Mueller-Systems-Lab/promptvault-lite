// =============================================================================
// AnalysisPanel — Recommendation-Apply Workflow UI Tests (Issue #45)
// =============================================================================
// Acceptance criteria coverage:
//   1. Empfehlungen haben Checkboxen zur Auswahl
//   2. Ausgewählte Empfehlungen erscheinen als editierbare Blöcke
//   3. Vorschau des modifizierten Prompts ist sichtbar
//   4. "Neu analysieren"-Workflow (Vorher/Nachher)
//   5. Speichern nur über expliziten Editor-Pfad (kein Auto-Save)
//   6. Zurücksetzen stellt Original wieder her
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { AnalysisPanel } from "@/components/analysis/AnalysisPanel";
import { useAppStore } from "@/stores/appStore";
import type { PromptItem } from "@/types";

vi.mock("@/lib/tauri", () => ({
  createPrompt: vi.fn(),
  updatePrompt: vi.fn(),
  scanDirectory: vi.fn(),
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

const backendEvaluate = vi.fn();
const backendHygiene = vi.fn();
vi.mock("@/lib/backend", () => ({
  getBackend: () => ({
    kind: "http",
    capabilities: { nativeFolderDialog: false, fileWatcher: false, nativeClipboard: false },
    scanDirectory: vi.fn(() => Promise.resolve([])),
    evaluatePrompt: (id: string, c: string) =>
      Promise.resolve(backendEvaluate(id, c) as never),
    analyzeHygiene: (id: string, c: string) =>
      Promise.resolve(backendHygiene(id, c) as never),
    toggleFavorite: vi.fn(() => Promise.resolve(true)),
    getFavorites: vi.fn(() => Promise.resolve([])),
    startFileWatcher: vi.fn(() => Promise.resolve()),
    stopFileWatcher: vi.fn(() => Promise.resolve()),
  }),
}));

function makePrompt(id: string, content: string): PromptItem {
  return {
    id,
    file_path: `/test/${id}.md`,
    file_name: `${id}.md`,
    title: id,
    description: "",
    category: "tasks",
    version: "1.0.0",
    tags: [],
    content,
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

const ORIGINAL = "# Rolle\nDu bist ein Tester.";

describe("AnalysisPanel — Empfehlungen-Workflow (#45)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      prompts: [makePrompt("p1", ORIGINAL)],
      selectedPromptId: "p1",
      recommendationDraft: null,
      promptEditor: null,
      isAnalyzing: false,
      evaluations: {
        p1: {
          id: "e1",
          prompt_id: "p1",
          overall_score: 42,
          criteria: [],
          missing_sections: [],
          recommendations: [
            "Definiere ein klares Ziel.",
            "Ergänze Kontext für die Aufgabe.",
          ],
          evaluated_at: "2026-09-30T00:00:00Z",
        },
      },
      hygiene: {
        p1: {
          id: "h1",
          prompt_id: "p1",
          hygiene_score: 55,
          status: "warning",
          artifacts: [],
          analyzed_at: "2026-09-30T00:00:00Z",
        },
      },
    });
  });

  it("shows a checkbox per recommendation (Kriterium 1)", () => {
    render(<AnalysisPanel />);
    expect(
      screen.getByTestId("recommendation-checkbox-0"),
    ).toBeInTheDocument();
    expect(
      screen.getByTestId("recommendation-checkbox-1"),
    ).toBeInTheDocument();
  });

  it("start button is disabled until at least one checkbox is selected", () => {
    render(<AnalysisPanel />);
    const start = screen.getByTestId("recommendation-apply-start");
    expect(start).toBeDisabled();
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    expect(start).not.toBeDisabled();
  });

  it("selected recommendations become editable blocks with preview (Kriterien 2+3)", () => {
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    fireEvent.click(screen.getByTestId("recommendation-apply-start"));
    const draft = screen.getByTestId("recommendation-draft");
    expect(draft).toBeInTheDocument();
    const block = screen.getByTestId("recommendation-block-rec-block-0");
    expect(block).toBeInTheDocument();
    expect(block.tagName).toBe("TEXTAREA");
    const preview = screen.getByTestId("recommendation-preview");
    expect(preview.textContent).toContain("## Ziel");
    expect(preview.textContent).toContain("Du bist ein Tester.");
  });

  it("block text is editable (Kriterium 2)", () => {
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    fireEvent.click(screen.getByTestId("recommendation-apply-start"));
    const block = screen.getByTestId("recommendation-block-rec-block-0");
    fireEvent.change(block, { target: { value: "## Ziel\n\nMein Ziel." } });
    expect((block as HTMLTextAreaElement).value).toBe("## Ziel\n\nMein Ziel.");
    expect(
      useAppStore.getState().recommendationDraft?.blocks[0].text,
    ).toBe("## Ziel\n\nMein Ziel.");
  });

  it("Neu analysieren fills the after scores (Kriterium 4+5)", async () => {
    vi.mocked(backendEvaluate).mockResolvedValue({
      id: "e2",
      prompt_id: "preview:p1",
      overall_score: 80,
      criteria: [],
      missing_sections: [],
      recommendations: [],
      evaluated_at: "2026-09-30T00:00:00Z",
    });
    vi.mocked(backendHygiene).mockResolvedValue({
      id: "h2",
      prompt_id: "preview:p1",
      hygiene_score: 90,
      status: "clean",
      artifacts: [],
      analyzed_at: "2026-09-30T00:00:00Z",
    });
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    fireEvent.click(screen.getByTestId("recommendation-apply-start"));
    expect(
      screen.getByTestId("recommendation-score-after-quality").textContent,
    ).toBe("–");
    fireEvent.click(screen.getByTestId("recommendation-reanalyze"));
    await waitFor(() => {
      expect(
        screen.getByTestId("recommendation-score-after-quality").textContent,
      ).toBe("80");
    });
    expect(
      screen.getByTestId("recommendation-score-after-hygiene").textContent,
    ).toBe("90");
    expect(
      screen.getByTestId("recommendation-score-before-quality").textContent,
    ).toBe("42");
  });

  it("In Editor übernehmen opens the editor dirty without saving (Kriterium 6)", async () => {
    const { updatePrompt } = await import("@/lib/tauri");
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    fireEvent.click(screen.getByTestId("recommendation-apply-start"));
    fireEvent.click(screen.getByTestId("recommendation-apply-to-editor"));
    const editor = useAppStore.getState().promptEditor;
    expect(editor?.isDirty).toBe(true);
    expect(editor?.content).toContain("## Ziel");
    // kein Auto-Save
    expect(updatePrompt).not.toHaveBeenCalled();
    // Draft wird nach Übernehmen geschlossen
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("checkbox selection does not leak across prompts", () => {
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    expect(
      screen.getByTestId("recommendation-apply-start"),
    ).not.toBeDisabled();
    // Switch to another analyzed prompt (act: flush the re-render)
    act(() => {
      useAppStore.setState({
        prompts: [
          makePrompt("p1", ORIGINAL),
          makePrompt("p2", "# Anderer Prompt"),
        ],
        selectedPromptId: "p2",
        evaluations: {
          p2: {
            id: "e2",
            prompt_id: "p2",
            overall_score: 50,
            criteria: [],
            missing_sections: [],
            recommendations: ["Ergänze Kontext für die Aufgabe."],
            evaluated_at: "2026-09-30T00:00:00Z",
          },
        } as never,
        hygiene: {} as never,
      });
    });
    expect(
      screen.getByTestId("recommendation-checkbox-0"),
    ).not.toBeChecked();
    expect(screen.getByTestId("recommendation-apply-start")).toBeDisabled();
  });

  it("Zurücksetzen discards the draft and keeps the original (Kriterium 7)", () => {
    render(<AnalysisPanel />);
    fireEvent.click(screen.getByTestId("recommendation-checkbox-0"));
    fireEvent.click(screen.getByTestId("recommendation-apply-start"));
    fireEvent.click(screen.getByTestId("recommendation-reset"));
    expect(useAppStore.getState().recommendationDraft).toBeNull();
    expect(useAppStore.getState().prompts[0].content).toBe(ORIGINAL);
    // Checkboxes sichtbar wieder (Liste erneut nutzbar)
    expect(
      screen.getByTestId("recommendation-checkbox-0"),
    ).toBeInTheDocument();
  });
});
