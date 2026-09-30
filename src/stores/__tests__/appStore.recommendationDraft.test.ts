// =============================================================================
// Recommendation Draft State Tests (Issue #45)
// =============================================================================
// Red tests for the recommendation-apply workflow store contract:
//   startRecommendationDraft / updateRecommendationBlock /
//   resetRecommendationDraft / applyRecommendationDraftToEditor /
//   analyzeRecommendationPreview
// Written BEFORE implementation (TDD).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/stores/appStore";
import { evaluatePrompt, analyzeHygiene } from "@/lib/tauri";
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

const PROMPT = makePrompt("p1", "# Rolle\nDu bist ein Tester.");

describe("recommendation draft (#45)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAppStore.setState({
      prompts: [PROMPT],
      selectedPromptId: "p1",
      promptEditor: null,
      recommendationDraft: null,
      evaluations: {
        p1: {
          id: "e1",
          prompt_id: "p1",
          overall_score: 42,
          criteria: [],
          missing_sections: [],
          recommendations: ["Definiere ein klares Ziel.", "Ergänze Kontext."],
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

  it("has no draft initially", () => {
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("startRecommendationDraft snapshots the original and builds blocks", () => {
    useAppStore
      .getState()
      .startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    const d = useAppStore.getState().recommendationDraft;
    expect(d).not.toBeNull();
    expect(d?.promptId).toBe("p1");
    expect(d?.originalContent).toBe(PROMPT.content);
    expect(d?.blocks).toHaveLength(1);
    expect(d?.blocks[0].heading).toBe("## Ziel");
    expect(d?.before.quality).toBe(42);
    expect(d?.before.hygiene).toBe(55);
    expect(d?.after).toBeNull();
  });

  it("startRecommendationDraft with no prompt selected is a no-op", () => {
    useAppStore.setState({ selectedPromptId: null });
    useAppStore.getState().startRecommendationDraft("missing", ["x"]);
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("startRecommendationDraft with empty selection is a no-op", () => {
    useAppStore.getState().startRecommendationDraft("p1", []);
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("updateRecommendationBlock edits block text", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    const blockId = useAppStore.getState().recommendationDraft?.blocks[0].id ?? "";
    useAppStore.getState().updateRecommendationBlock("p1", blockId, "## Ziel\n\nMein editiertes Ziel.");
    const d = useAppStore.getState().recommendationDraft;
    expect(d?.blocks[0].text).toBe("## Ziel\n\nMein editiertes Ziel.");
  });

  it("resetRecommendationDraft discards the draft (original preserved)", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.getState().resetRecommendationDraft();
    expect(useAppStore.getState().recommendationDraft).toBeNull();
    // Original prompt content untouched
    expect(useAppStore.getState().prompts[0].content).toBe(PROMPT.content);
  });

  it("applyRecommendationDraftToEditor opens editor dirty with preview content (no save)", async () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.getState().applyRecommendationDraftToEditor("p1");
    const editor = useAppStore.getState().promptEditor;
    expect(editor).not.toBeNull();
    expect(editor?.mode).toBe("edit");
    expect(editor?.promptId).toBe("p1");
    expect(editor?.isDirty).toBe(true);
    expect(editor?.content).toContain("## Ziel");
    expect(editor?.content.startsWith(PROMPT.content)).toBe(true);
    // No persistence call — saving happens only on explicit Speichern
    expect(vi.mocked(await import("@/lib/tauri")).updatePrompt).not.toHaveBeenCalled();
  });

  it("applyRecommendationDraftToEditor refuses on stale source (content changed)", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.setState({
      prompts: [makePrompt("p1", "# Geändert\nAnderer Inhalt.")],
    });
    useAppStore.getState().applyRecommendationDraftToEditor("p1");
    expect(useAppStore.getState().promptEditor).toBeNull();
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("analyzeRecommendationPreview re-analyzes preview content and records after scores", async () => {
    vi.mocked(evaluatePrompt).mockResolvedValue({
      id: "e2",
      prompt_id: "preview",
      overall_score: 80,
      criteria: [],
      missing_sections: [],
      recommendations: [],
      evaluated_at: "2026-09-30T00:00:00Z",
    });
    vi.mocked(analyzeHygiene).mockResolvedValue({
      id: "h2",
      prompt_id: "preview",
      hygiene_score: 90,
      status: "clean",
      artifacts: [],
      analyzed_at: "2026-09-30T00:00:00Z",
    });
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    await useAppStore.getState().analyzeRecommendationPreview();
    const d = useAppStore.getState().recommendationDraft;
    expect(d?.after).toEqual({ quality: 80, hygiene: 90 });
    // analysis must have been called with the PREVIEW content (original + block)
    const calledContent = vi.mocked(evaluatePrompt).mock.calls[0]?.[1] ?? "";
    expect(calledContent).toContain("## Ziel");
    expect(calledContent.startsWith(PROMPT.content)).toBe(true);
    // store analysis caches must NOT be overwritten by the preview analysis
    expect(useAppStore.getState().evaluations.p1.overall_score).toBe(42);
  });

  it("analyzeRecommendationPreview without draft is a no-op", async () => {
    await useAppStore.getState().analyzeRecommendationPreview();
    expect(evaluatePrompt).not.toHaveBeenCalled();
  });

  it("switching prompts discards a draft scoped to another prompt (stale invalidation)", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.setState({ prompts: [PROMPT, makePrompt("p2", "# Anderer")] });
    useAppStore.getState().selectPrompt("p2");
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });

  it("re-selecting the same prompt keeps the draft", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.getState().selectPrompt("p1");
    expect(useAppStore.getState().recommendationDraft).not.toBeNull();
  });

  it("invalidateAnalysisForPrompt discards the draft for that prompt", () => {
    useAppStore.getState().startRecommendationDraft("p1", ["Definiere ein klares Ziel."]);
    useAppStore.getState().invalidateAnalysisForPrompt("p1");
    expect(useAppStore.getState().recommendationDraft).toBeNull();
  });
});
