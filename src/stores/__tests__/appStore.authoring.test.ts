// =============================================================================
// PromptVault Lite — Authoring Lifecycle Store Tests (v1.10.0)
// =============================================================================
// Covers:
//   - create flow persists via mocked tauri createPrompt + updates store
//   - edit flow persists via mocked updatePrompt + replaces in store
//   - save failure sets saveError + emits save_failed
//   - cancel clears state without tauri call + emits cancel when dirty
//   - dirty state transitions (open→clean, field update→dirty, close→null)
//   - invalidateAnalysisForPrompt clears all 5 analysis maps
//   - restart persistence — scanFolder writes promptvault.lastFolder
//   - no-data-loss: create → edit → save → content equal
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/stores/appStore";
import {
  setObservabilityEnabled,
  clearAll,
  getEvents,
} from "@/observability/events";
import type {
  PromptItem,
  PromptEvaluation,
  PromptHygiene,
  PromptContextEvaluation,
  BlueprintDetectOutput,
  BlueprintEvaluation,
} from "@/types";

// ---------------------------------------------------------------------------
// Tauri + event mocks (same pattern as VariantPanel.integration.test.tsx)
// ---------------------------------------------------------------------------
const { mockTauriCreatePrompt, mockTauriUpdatePrompt, mockTauriScanDirectory } =
  vi.hoisted(() => ({
    mockTauriCreatePrompt: vi.fn(),
    mockTauriUpdatePrompt: vi.fn(),
    mockTauriScanDirectory: vi.fn(),
  }));

vi.mock("@/lib/tauri", () => ({
  createPrompt: mockTauriCreatePrompt,
  updatePrompt: mockTauriUpdatePrompt,
  scanDirectory: mockTauriScanDirectory,
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

function makePrompt(
  id: string,
  overrides: Partial<PromptItem> = {},
): PromptItem {
  return {
    id,
    file_path: `/test/${id}.md`,
    file_name: `${id}.md`,
    title: overrides.title ?? id,
    description: "",
    category: overrides.category ?? "test",
    version: "1.0",
    tags: overrides.tags ?? [],
    content: overrides.content ?? "# Test Prompt\n\nThis is a test.",
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

function makeEvaluation(promptId: string): PromptEvaluation {
  return {
    id: `eval-${promptId}`,
    prompt_id: promptId,
    overall_score: 80,
    criteria: [],
    missing_sections: [],
    recommendations: [],
    evaluated_at: "2026-01-01T00:00:00Z",
  };
}

function makeHygiene(promptId: string): PromptHygiene {
  return {
    id: `hyg-${promptId}`,
    prompt_id: promptId,
    hygiene_score: 90,
    status: "clean",
    artifacts: [],
    analyzed_at: "2026-01-01T00:00:00Z",
  };
}

function makeContextEvaluation(_promptId: string): PromptContextEvaluation {
  return {
    detected_prompt_type: "simple_prompt",
    detected_context_profile: "minimal",
    prompt_engineering_score: 50,
    context_engineering_score: 50,
    agent_readiness_score: 50,
    robustness_score: 50,
    overall_score: 50,
    criteria: [],
    strengths: [],
    warnings: [],
    missing_elements: [],
    suggested_improvements: [],
    risk_flags: [],
    confidence: 0.5,
    evaluated_at: "2026-01-01T00:00:00Z",
  };
}

function makeBlueprintDetection(_promptId: string): BlueprintDetectOutput {
  return {
    content_class: "PROMPT",
    blueprint_type: null,
    contamination_status: "CLEAN",
    confidence: 0.9,
    prompt_signals: [],
    blueprint_signals: [],
    contamination_signals: [],
  };
}

function makeBlueprintEvaluation(_promptId: string): BlueprintEvaluation {
  return {
    content_class: "PROMPT",
    blueprint_type: null,
    contamination_status: "CLEAN",
    goal_clarity_score: 50,
    scope_sharpness_score: 50,
    architecture_score: 50,
    feasibility_score: 50,
    risk_coverage_score: 50,
    security_privacy_score: 50,
    testability_score: 50,
    evidence_readiness_score: 50,
    context_purity_score: 50,
    overall_score: 50,
    dimensions: [],
    strengths: [],
    warnings: [],
    missing_elements: [],
    suggested_improvements: [],
    confidence: 0.5,
    evaluated_at: "2026-01-01T00:00:00Z",
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
    missingInfoSessions: {},
    enrichedContexts: {},
    isGateOpen: false,
    activeGatePromptId: null,
    gateSkippedItems: {},
    variantResults: {},
    showVariantPanel: false,
    activeVariantPromptId: null,
    selectedProfileIds: [],
    customDirectionInput: "",
    isGeneratingVariants: false,
    variantGenerationError: null,
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
    expandedFolders: new Set<string>(),
    currentFolderPath: null,
    watcherNotification: null,
    promptEditor: null,
  });
}

function seedPrompt(prompt: PromptItem) {
  useAppStore.setState((state) => ({
    prompts: [...state.prompts, prompt],
  }));
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Authoring — create flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("openCreatePrompt initializes a clean create-mode editor", () => {
    useAppStore.getState().openCreatePrompt();
    const editor = useAppStore.getState().promptEditor;
    expect(editor).not.toBeNull();
    expect(editor?.mode).toBe("create");
    expect(editor?.title).toBe("");
    expect(editor?.content).toBe("");
    expect(editor?.isDirty).toBe(false);
    expect(editor?.isSaving).toBe(false);
    expect(editor?.saveError).toBeNull();
  });

  it("create flow persists via mocked tauri createPrompt and updates store", async () => {
    const created = makePrompt("new-1", {
      title: "Neuer Prompt",
      content: "Neuinhalt",
    });
    mockTauriCreatePrompt.mockResolvedValue(created);

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "Neuer Prompt");
    useAppStore.getState().updateEditorField("content", "Neuinhalt");

    await useAppStore.getState().savePromptEditor();

    expect(mockTauriCreatePrompt).toHaveBeenCalledWith({
      title: "Neuer Prompt",
      content: "Neuinhalt",
    });
    const state = useAppStore.getState();
    expect(state.prompts).toContainEqual(created);
    expect(state.selectedPromptId).toBe("new-1");
    expect(state.promptEditor).toBeNull();
  });

  it("create flow also handles the wrapper response shape { prompt, created }", async () => {
    const created = makePrompt("new-2", {
      title: "Wrapper",
      content: "Wrapper-Inhalt",
    });
    mockTauriCreatePrompt.mockResolvedValue({
      prompt: created,
      created: true,
    });

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "Wrapper");
    useAppStore.getState().updateEditorField("content", "Wrapper-Inhalt");

    await useAppStore.getState().savePromptEditor();

    const state = useAppStore.getState();
    expect(state.prompts).toContainEqual(created);
    expect(state.selectedPromptId).toBe("new-2");
  });
});

describe("Authoring — edit flow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("openEditPrompt pre-fills editor from the prompt, clean state", () => {
    seedPrompt(makePrompt("p1", { title: "Alt", content: "Alter Inhalt" }));

    useAppStore.getState().openEditPrompt("p1");
    const editor = useAppStore.getState().promptEditor;
    expect(editor?.mode).toBe("edit");
    expect(editor?.promptId).toBe("p1");
    expect(editor?.title).toBe("Alt");
    expect(editor?.content).toBe("Alter Inhalt");
    expect(editor?.isDirty).toBe(false);
  });

  it("edit flow persists via mocked updatePrompt (only changed fields) and replaces in store", async () => {
    seedPrompt(makePrompt("p1", { title: "Alt", content: "Alter Inhalt" }));
    const updated = makePrompt("p1", { title: "Alt", content: "Neuer Inhalt" });
    mockTauriUpdatePrompt.mockResolvedValue(updated);

    useAppStore.getState().openEditPrompt("p1");
    useAppStore.getState().updateEditorField("content", "Neuer Inhalt");
    await useAppStore.getState().savePromptEditor();

    // Only the changed field is sent
    expect(mockTauriUpdatePrompt).toHaveBeenCalledWith({
      prompt_id: "p1",
      content: "Neuer Inhalt",
    });
    const state = useAppStore.getState();
    expect(state.prompts).toContainEqual(updated);
    expect(state.prompts).toHaveLength(1);
    expect(state.selectedPromptId).toBe("p1");
    expect(state.promptEditor).toBeNull();
  });

  it("edit flow invalidates stale analysis for the saved prompt", async () => {
    seedPrompt(makePrompt("p1", { title: "Alt", content: "Alter Inhalt" }));
    mockTauriUpdatePrompt.mockResolvedValue(
      makePrompt("p1", { title: "Alt", content: "Neuer Inhalt" }),
    );

    useAppStore.setState({
      evaluations: { p1: makeEvaluation("p1") },
      hygiene: { p1: makeHygiene("p1") },
      contextEvaluations: { p1: makeContextEvaluation("p1") },
      blueprintDetections: { p1: makeBlueprintDetection("p1") },
      blueprintEvaluations: { p1: makeBlueprintEvaluation("p1") },
    });

    useAppStore.getState().openEditPrompt("p1");
    useAppStore.getState().updateEditorField("content", "Neuer Inhalt");
    await useAppStore.getState().savePromptEditor();

    const s = useAppStore.getState();
    expect(s.evaluations["p1"]).toBeUndefined();
    expect(s.hygiene["p1"]).toBeUndefined();
    expect(s.contextEvaluations["p1"]).toBeUndefined();
    expect(s.blueprintDetections["p1"]).toBeUndefined();
    expect(s.blueprintEvaluations["p1"]).toBeUndefined();
  });
});

describe("Authoring — save failure", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("sets saveError, keeps editor open, emits save_failed with AUTHORING_SAVE_FAILED", async () => {
    setObservabilityEnabled(true);
    clearAll();
    mockTauriCreatePrompt.mockRejectedValue(new Error("IPC boom"));

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "T");
    useAppStore.getState().updateEditorField("content", "C");
    await useAppStore.getState().savePromptEditor();

    const editor = useAppStore.getState().promptEditor;
    expect(editor).not.toBeNull();
    expect(editor?.saveError).toBeTruthy();
    expect(editor?.isSaving).toBe(false);

    const failed = getEvents().filter(
      (e) => e.operation === "prompt.save_failed",
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].status).toBe("failed");
    expect(failed[0].reasonCode).toBe("AUTHORING_SAVE_FAILED");
  });

  it("rejects empty title/content without calling tauri", async () => {
    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "");
    useAppStore.getState().updateEditorField("content", "Nur Inhalt");
    await useAppStore.getState().savePromptEditor();

    expect(mockTauriCreatePrompt).not.toHaveBeenCalled();
    expect(useAppStore.getState().promptEditor?.saveError).toBeTruthy();
  });
});

describe("Authoring — cancel / discard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("closePromptEditor clears state without tauri call and emits cancel when dirty", () => {
    setObservabilityEnabled(true);
    clearAll();

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "T");
    useAppStore.getState().closePromptEditor();

    expect(useAppStore.getState().promptEditor).toBeNull();
    expect(mockTauriCreatePrompt).not.toHaveBeenCalled();

    const cancelled = getEvents().filter((e) => e.operation === "prompt.cancel");
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled[0].status).toBe("succeeded");
  });

  it("clean close (not dirty) does NOT emit prompt.cancel", () => {
    setObservabilityEnabled(true);
    clearAll();

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().closePromptEditor();

    expect(useAppStore.getState().promptEditor).toBeNull();
    const cancelled = getEvents().filter((e) => e.operation === "prompt.cancel");
    expect(cancelled).toHaveLength(0);
  });
});

describe("Authoring — dirty state transitions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("open → clean, field update → dirty, close → null", () => {
    useAppStore.getState().openCreatePrompt();
    expect(useAppStore.getState().promptEditor?.isDirty).toBe(false);

    useAppStore.getState().updateEditorField("title", "X");
    expect(useAppStore.getState().promptEditor?.isDirty).toBe(true);

    useAppStore.getState().closePromptEditor();
    expect(useAppStore.getState().promptEditor).toBeNull();
  });

  it("updateEditorField updates the field value", () => {
    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("content", "Inhalt v1");
    useAppStore.getState().updateEditorField("content", "Inhalt v2");
    expect(useAppStore.getState().promptEditor?.content).toBe("Inhalt v2");
  });
});

describe("Authoring — invalidateAnalysisForPrompt", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("clears all 5 analysis maps for the prompt, keeps others", () => {
    seedPrompt(makePrompt("p1"));
    useAppStore.setState({
      evaluations: { p1: makeEvaluation("p1"), p2: makeEvaluation("p2") },
      hygiene: { p1: makeHygiene("p1") },
      contextEvaluations: { p1: makeContextEvaluation("p1") },
      blueprintDetections: { p1: makeBlueprintDetection("p1") },
      blueprintEvaluations: { p1: makeBlueprintEvaluation("p1") },
    });

    useAppStore.getState().invalidateAnalysisForPrompt("p1");

    const s = useAppStore.getState();
    expect(s.evaluations["p1"]).toBeUndefined();
    expect(s.hygiene["p1"]).toBeUndefined();
    expect(s.contextEvaluations["p1"]).toBeUndefined();
    expect(s.blueprintDetections["p1"]).toBeUndefined();
    expect(s.blueprintEvaluations["p1"]).toBeUndefined();
    // unrelated prompt untouched
    expect(s.evaluations["p2"]).toBeDefined();
  });
});

describe("Authoring — restart persistence", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
    try {
      localStorage.removeItem("promptvault.lastFolder");
    } catch {
      // ignore
    }
  });

  it("scanFolder writes promptvault.lastFolder to localStorage on success", async () => {
    mockTauriScanDirectory.mockResolvedValue([makePrompt("p1")]);

    await useAppStore.getState().scanFolder("C:\\vault\\prompts");

    expect(useAppStore.getState().currentFolderPath).toBe("C:\\vault\\prompts");
    expect(localStorage.getItem("promptvault.lastFolder")).toBe(
      "C:\\vault\\prompts",
    );
  });
});

describe("Authoring — no data loss", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(false);
    resetStore();
  });

  it("create → edit → save keeps store content identical to saved content", async () => {
    const created = makePrompt("np", { title: "Start", content: "V1" });
    mockTauriCreatePrompt.mockResolvedValue(created);

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", "Start");
    useAppStore.getState().updateEditorField("content", "V1");
    await useAppStore.getState().savePromptEditor();

    const updated = makePrompt("np", { title: "Start", content: "V2 bearbeitet" });
    mockTauriUpdatePrompt.mockResolvedValue(updated);

    useAppStore.getState().openEditPrompt("np");
    useAppStore.getState().updateEditorField("content", "V2 bearbeitet");
    await useAppStore.getState().savePromptEditor();

    const finalPrompt = useAppStore
      .getState()
      .prompts.find((p) => p.id === "np");
    expect(finalPrompt?.content).toBe("V2 bearbeitet");
    expect(finalPrompt?.title).toBe("Start");
    expect(useAppStore.getState().promptEditor).toBeNull();
  });
});
