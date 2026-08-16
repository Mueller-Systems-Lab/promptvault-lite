// =============================================================================
// PromptVault Lite — OptimizationPanel Apply Button Tests (v1.10.0)
// =============================================================================
// Covers: apply button appears with result, click opens editor with optimized
// content, no apply button without result.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { OptimizationPanel } from "../OptimizationPanel";
import { useAppStore } from "@/stores/appStore";
import type { PromptItem } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
vi.mock("@/lib/promptOptimizer", () => ({
  optimizePrompt: vi.fn((input: string, mode: string) => ({
    original: input,
    optimized: `[${mode}] ${input}`,
    changes: [{ type: "structure", description: `Applied ${mode} mode` }],
    warnings: [],
  })),
}));

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

vi.mock("@/lib/tauri", () => ({
  createPrompt: vi.fn(),
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

const PROMPT_CONTENT =
  "This is a test prompt for optimization.\n\nIt has multiple lines.";

function makePrompt(overrides: Partial<PromptItem> = {}): PromptItem {
  return {
    id: "opt-p1",
    file_path: "/test/opt-p1.md",
    file_name: "opt-p1.md",
    title: "Optimierbarer Prompt",
    description: "",
    category: "general",
    tags: [],
    content: PROMPT_CONTENT,
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

function seedSelectedPrompt() {
  const prompt = makePrompt();
  useAppStore.setState({
    prompts: [prompt],
    selectedPromptId: prompt.id,
  });
  return prompt;
}

/** Helper: selects a mode radio button by label text */
function selectMode(modeLabel: string) {
  const option = screen.getByText(modeLabel, { selector: "span" });
  const radio = option.closest("label")?.querySelector("input");
  if (radio) fireEvent.click(radio);
}

describe("OptimizationPanel — Apply (Übernehmen)", () => {
  const onClose = vi.fn();
  const defaultProps = {
    promptContent: PROMPT_CONTENT,
    onClose,
  };

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows no apply button when no result exists", () => {
    render(<OptimizationPanel {...defaultProps} />);
    expect(screen.queryByRole("button", { name: /übernehmen/i })).toBeNull();
  });

  it("shows apply button when a result exists", () => {
    render(<OptimizationPanel {...defaultProps} />);
    selectMode("Conservative");
    const applyButton = screen.getByRole("button", { name: /übernehmen/i });
    expect(applyButton).not.toBeDisabled();
  });

  it("apply button is hidden with empty prompt content", () => {
    render(<OptimizationPanel promptContent="" onClose={onClose} />);
    // Empty state: no mode selector, no result → no apply button
    expect(screen.getByText(/Kein Prompt-Inhalt/i)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /übernehmen/i })).toBeNull();
  });

  it("clicking apply opens the editor with the optimized content", () => {
    seedSelectedPrompt();
    render(<OptimizationPanel {...defaultProps} />);
    selectMode("Conservative");

    fireEvent.click(screen.getByRole("button", { name: /übernehmen/i }));

    const editor = useAppStore.getState().promptEditor;
    expect(editor).not.toBeNull();
    expect(editor?.mode).toBe("edit");
    expect(editor?.promptId).toBe("opt-p1");
    expect(editor?.content).toBe(`[conservative] ${PROMPT_CONTENT}`);
    expect(editor?.isDirty).toBe(true);
  });

  it("apply does nothing when no prompt is selected", () => {
    resetStore(); // no prompts at all
    render(<OptimizationPanel {...defaultProps} />);
    selectMode("Conservative");

    act(() => {
      fireEvent.click(screen.getByRole("button", { name: /übernehmen/i }));
    });

    expect(useAppStore.getState().promptEditor).toBeNull();
  });
});
