// =============================================================================
// PromptVault Lite — Advanced Workflows GA Contract (Store) Tests
// =============================================================================
// Covers the v1.11.0 ADVANCED_WORKFLOWS_GA milestone (Issue #295):
//   a. openMissingInfoGate works with devMode=false and no env (entry point).
//   b. applyVariantToEditor → editor opens in edit mode with the variant
//      content, dirty, and NO tauri update/create is invoked.
//   c. Apply + cancel preserves the original prompt (no tauri call).
//   d. Apply + save persists via the canonical authoring layer.
//   e. applyVariantToEditor with a stale source is refused, variant results
//      are cleared, and direction.apply failed(STALE_SOURCE) is emitted.
//   f. invalidateAnalysisForPrompt also clears advanced results.
//   g. applyMissingInfoResultToEditor → editor gets enrichedContent, dirty.
//   h. openVariantPanel works with devMode=false.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/stores/appStore";
import {
  setObservabilityEnabled,
  clearAll,
  getEvents,
} from "@/observability/events";
import { contentFingerprint } from "@/observability/redaction";
import type {
  PromptItem,
  PromptEvaluation,
  PromptContextEvaluation,
  PromptHygiene,
  BlueprintDetectOutput,
  BlueprintEvaluation,
  PromptVariant,
  VariantGenerationResult,
  EnrichedPromptContext,
} from "@/types";

// ---------------------------------------------------------------------------
// Tauri + event mocks (same pattern as appStore.authoring.test.ts)
// ---------------------------------------------------------------------------
const { mockTauriCreatePrompt, mockTauriUpdatePrompt } = vi.hoisted(() => ({
  mockTauriCreatePrompt: vi.fn(),
  mockTauriUpdatePrompt: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  createPrompt: mockTauriCreatePrompt,
  updatePrompt: mockTauriUpdatePrompt,
  scanDirectory: vi.fn(() => Promise.resolve([])),
  startFileWatcher: vi.fn(() => Promise.resolve()),
  stopFileWatcher: vi.fn(() => Promise.resolve()),
  toggleFavorite: vi.fn(() => Promise.resolve(false)),
  evaluatePrompt: vi.fn(),
  analyzeHygiene: vi.fn(),
  analyzeAll: vi.fn(),
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
    content:
      overrides.content ?? "# Test Prompt\n\nThis is a test prompt for GA.",
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

function makeContextEval(
  overrides: Partial<PromptContextEvaluation> = {},
): PromptContextEvaluation {
  return {
    detected_prompt_type: "agentic_prompt",
    detected_context_profile: "minimal",
    prompt_engineering_score: 50,
    context_engineering_score: 50,
    agent_readiness_score: 50,
    robustness_score: 50,
    overall_score: 50,
    criteria: [
      {
        dimension: "prompt_engineering",
        name: "Zieldefinition",
        score: 0,
        max_score: 2,
        details: "Kein Ziel definiert",
      },
    ],
    strengths: [],
    warnings: [],
    missing_elements: ["Ausgabeformat"],
    suggested_improvements: [],
    risk_flags: [
      {
        flag: "missing_goal",
        severity: "critical",
        message: "Kein klares Ziel definiert",
        score_penalty: 15,
      },
    ],
    confidence: 0.8,
    evaluated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHygiene(promptId: string): PromptHygiene {
  return {
    id: `hyg-${promptId}`,
    prompt_id: promptId,
    hygiene_score: 80,
    status: "clean",
    artifacts: [],
    analyzed_at: "2026-01-01T00:00:00Z",
  };
}

function makeVariant(
  variantId: string,
  content: string,
  profileId = "sachlich",
): PromptVariant {
  return {
    variantId,
    profileId,
    label: "Sachlich / Neutral",
    content,
    directionExplanation: "Neutrale Formulierung.",
    preservedConstraints: [],
    conflicts: [],
    assumptions: [],
    openPoints: [],
    recommendation: "Für Dokumentation.",
    metadata: {
      generatedAt: "2026-01-01T00:00:00Z",
      sourceContent: "original",
      appliedProfileId: profileId,
    },
  };
}

function makeVariantResult(
  sourceContent: string,
  variants: PromptVariant[],
): VariantGenerationResult {
  return {
    sourceContent,
    enrichedContentUsed: false,
    sourceFingerprint: contentFingerprint(sourceContent),
    variants,
    profileConflicts: [],
    appliedAt: "2026-01-01T00:00:00Z",
  };
}

function makeEnrichedContext(
  originalContent: string,
  enrichedContent: string,
): EnrichedPromptContext {
  return {
    originalContent,
    enrichedContent,
    answers: [],
    gateOutcome: "COMPLETED",
    sessionId: "SESS_GA_1",
    enrichedAt: "2026-01-01T00:00:00Z",
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

function makeBlueprintDetection(promptId: string): BlueprintDetectOutput {
  return {
    content_class: "PROMPT",
    blueprint_type: null,
    contamination_status: "CLEAN",
    confidence: 0.9,
    prompt_signals: [],
    blueprint_signals: [],
    contamination_signals: [],
    tags: [`detect-${promptId}`],
  };
}

function makeBlueprintEvaluation(promptId: string): BlueprintEvaluation {
  return {
    content_class: "PROMPT",
    blueprint_type: null,
    contamination_status: "CLEAN",
    goal_clarity_score: 70,
    scope_sharpness_score: 70,
    architecture_score: 70,
    feasibility_score: 70,
    risk_coverage_score: 70,
    security_privacy_score: 70,
    testability_score: 70,
    evidence_readiness_score: 70,
    context_purity_score: 70,
    overall_score: 70,
    dimensions: [],
    strengths: [],
    warnings: [],
    missing_elements: [],
    suggested_improvements: [],
    confidence: 0.8,
    evaluated_at: "2026-01-01T00:00:00Z",
    classification_tags: [`bp-${promptId}`],
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
    currentFolderPath: null,
    devMode: false,
    promptEditor: null,
  });
}

function seedPrompt(
  id: string = "p1",
  content: string = "# Test\n\nGA content.",
) {
  const prompt = makePrompt(id, { content });
  useAppStore.setState((state) => ({
    prompts: [...state.prompts, prompt],
  }));
  return prompt;
}

function seedVariantResult(promptId: string, result: VariantGenerationResult) {
  useAppStore.setState((state) => ({
    variantResults: { ...state.variantResults, [promptId]: result },
  }));
}

// =============================================================================
// Tests
// =============================================================================

describe("Advanced Workflows GA — Store Contract (#295)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setObservabilityEnabled(false);
    clearAll();
    resetStore();
  });

  // -------------------------------------------------------------------------
  // a. Entry point: gate open with devMode=false and no env
  // -------------------------------------------------------------------------

  it("a) openMissingInfoGate works with devMode=false and no env", () => {
    const prompt = seedPrompt("gate-p", "Gate entry prompt");
    useAppStore.setState({
      selectedPromptId: prompt.id,
      contextEvaluations: { [prompt.id]: makeContextEval() },
      hygiene: { [prompt.id]: makeHygiene(prompt.id) },
      devMode: false,
    });

    useAppStore.getState().openMissingInfoGate(prompt.id);

    const state = useAppStore.getState();
    expect(state.missingInfoSessions[prompt.id]).toBeDefined();
    expect(state.isGateOpen).toBe(true);
  });

  // -------------------------------------------------------------------------
  // b. applyVariantToEditor → editor open, dirty, no tauri
  // -------------------------------------------------------------------------

  it("b) applyVariantToEditor opens editor in edit mode with variant content (no tauri call)", () => {
    const prompt = seedPrompt("p1", "Original content");
    const variant = makeVariant("VAR_1", "Variant content v1");
    seedVariantResult(
      "p1",
      makeVariantResult(prompt.content, [variant]),
    );

    useAppStore.getState().applyVariantToEditor("p1", variant);

    const state = useAppStore.getState();
    expect(state.promptEditor).not.toBeNull();
    expect(state.promptEditor?.mode).toBe("edit");
    expect(state.promptEditor?.promptId).toBe("p1");
    expect(state.promptEditor?.content).toBe("Variant content v1");
    expect(state.promptEditor?.isDirty).toBe(true);
    // Variant panel closed by apply
    expect(state.showVariantPanel).toBe(false);
    expect(state.activeVariantPromptId).toBeNull();
    // NO tauri create/update invoked — apply is editor-local
    expect(mockTauriCreatePrompt).not.toHaveBeenCalled();
    expect(mockTauriUpdatePrompt).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // c. Apply + cancel preserves original
  // -------------------------------------------------------------------------

  it("c) apply then cancel preserves the original prompt (no tauri call)", () => {
    const prompt = seedPrompt("p1", "ORIGINAL — DO NOT MODIFY");
    const variant = makeVariant("VAR_1", "Variant content");
    seedVariantResult("p1", makeVariantResult(prompt.content, [variant]));

    useAppStore.getState().applyVariantToEditor("p1", variant);
    useAppStore.getState().closePromptEditor();

    const state = useAppStore.getState();
    expect(state.promptEditor).toBeNull();
    const stored = state.prompts.find((p) => p.id === "p1");
    expect(stored?.content).toBe("ORIGINAL — DO NOT MODIFY");
    expect(mockTauriCreatePrompt).not.toHaveBeenCalled();
    expect(mockTauriUpdatePrompt).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // d. Apply + save persists
  // -------------------------------------------------------------------------

  it("d) apply then save persists the variant content via updatePrompt", async () => {
    const prompt = seedPrompt("p1", "Original content");
    const variant = makeVariant("VAR_1", "Variant content v2");
    seedVariantResult("p1", makeVariantResult(prompt.content, [variant]));

    const updated = makePrompt("p1", {
      title: prompt.title,
      content: "Variant content v2",
    });
    mockTauriUpdatePrompt.mockResolvedValue({ prompt: updated });

    useAppStore.getState().applyVariantToEditor("p1", variant);
    await useAppStore.getState().savePromptEditor();

    const state = useAppStore.getState();
    expect(mockTauriUpdatePrompt).toHaveBeenCalledTimes(1);
    const stored = state.prompts.find((p) => p.id === "p1");
    expect(stored?.content).toBe("Variant content v2");
    expect(state.promptEditor).toBeNull();
  });

  // -------------------------------------------------------------------------
  // e. Stale source → refused + cleared + event
  // -------------------------------------------------------------------------

  it("e) applyVariantToEditor refuses stale source, clears results, emits STALE_SOURCE", () => {
    setObservabilityEnabled(true);
    clearAll();

    seedPrompt("p1", "CURRENT CONTENT");
    const variant = makeVariant("VAR_1", "Variant from OLD source");
    // Result was generated from an OLD source whose fingerprint differs
    // from the current prompt content.
    seedVariantResult("p1", makeVariantResult("OLD SOURCE", [variant]));

    useAppStore.getState().applyVariantToEditor("p1", variant);

    const state = useAppStore.getState();
    // Refused: editor never opened
    expect(state.promptEditor).toBeNull();
    // Stale results cleared
    expect(state.variantResults["p1"]).toBeUndefined();

    const staleEvents = getEvents().filter(
      (e) => e.operation === "direction.apply",
    );
    expect(staleEvents.length).toBeGreaterThan(0);
    expect(staleEvents[staleEvents.length - 1].status).toBe("failed");
    expect(staleEvents[staleEvents.length - 1].reasonCode).toBe(
      "STALE_SOURCE",
    );
  });

  // -------------------------------------------------------------------------
  // f. invalidateAnalysisForPrompt clears advanced results too
  // -------------------------------------------------------------------------

  it("f) invalidateAnalysisForPrompt clears advanced results (gate + variants)", () => {
    const prompt = seedPrompt("p1", "Content");
    const variant = makeVariant("VAR_1", "V1");
    const ctx = makeEnrichedContext(prompt.content, "Enriched");
    useAppStore.setState({
      missingInfoSessions: {
        p1: {
          sessionId: "SESS",
          promptId: "p1",
          startedAt: "2026-01-01T00:00:00Z",
          items: [],
          answers: {},
          status: "ACTIVE",
          outcome: null,
          enrichedContent: null,
        },
      },
      enrichedContexts: { p1: ctx },
      gateSkippedItems: { p1: ["SKIP_1"] },
      variantResults: { p1: makeVariantResult(prompt.content, [variant]) },
      evaluations: { p1: makeEvaluation("p1") },
      hygiene: { p1: makeHygiene("p1") },
      contextEvaluations: { p1: makeContextEval() },
      blueprintDetections: { p1: makeBlueprintDetection("p1") },
      blueprintEvaluations: { p1: makeBlueprintEvaluation("p1") },
    });

    useAppStore.getState().invalidateAnalysisForPrompt("p1");

    const s = useAppStore.getState();
    expect(s.missingInfoSessions["p1"]).toBeUndefined();
    expect(s.enrichedContexts["p1"]).toBeUndefined();
    expect(s.gateSkippedItems["p1"]).toBeUndefined();
    expect(s.variantResults["p1"]).toBeUndefined();
    expect(s.evaluations["p1"]).toBeUndefined();
    expect(s.hygiene["p1"]).toBeUndefined();
    expect(s.contextEvaluations["p1"]).toBeUndefined();
    expect(s.blueprintDetections["p1"]).toBeUndefined();
    expect(s.blueprintEvaluations["p1"]).toBeUndefined();
  });

  // -------------------------------------------------------------------------
  // g. applyMissingInfoResultToEditor → enrichedContent in editor
  // -------------------------------------------------------------------------

  it("g) applyMissingInfoResultToEditor puts enrichedContent in editor (dirty, no tauri)", () => {
    const prompt = seedPrompt("p1", "Original prompt body");
    const ctx = makeEnrichedContext(
      prompt.content,
      "Enriched prompt body with answers",
    );
    useAppStore.setState({
      enrichedContexts: { p1: ctx },
      isGateOpen: true,
      activeGatePromptId: "p1",
    });

    useAppStore.getState().applyMissingInfoResultToEditor("p1");

    const state = useAppStore.getState();
    expect(state.promptEditor).not.toBeNull();
    expect(state.promptEditor?.mode).toBe("edit");
    expect(state.promptEditor?.content).toBe("Enriched prompt body with answers");
    expect(state.promptEditor?.isDirty).toBe(true);
    // Gate state closed
    expect(state.isGateOpen).toBe(false);
    expect(state.activeGatePromptId).toBeNull();
    expect(mockTauriCreatePrompt).not.toHaveBeenCalled();
    expect(mockTauriUpdatePrompt).not.toHaveBeenCalled();
  });

  it("g2) applyMissingInfoResultToEditor refuses when no enriched content exists", () => {
    setObservabilityEnabled(true);
    clearAll();
    seedPrompt("p1", "Content");
    // No enrichedContexts seeded

    useAppStore.getState().applyMissingInfoResultToEditor("p1");

    const state = useAppStore.getState();
    expect(state.promptEditor).toBeNull();
    const failed = getEvents().filter(
      (e) => e.operation === "missing_info.failed",
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[failed.length - 1].reasonCode).toBe("NO_MISSING_INFO");
  });

  // -------------------------------------------------------------------------
  // h. Variant entry: openVariantPanel works with devMode=false
  // -------------------------------------------------------------------------

  it("h) openVariantPanel works with devMode=false and no env", () => {
    seedPrompt("p1", "Content");
    useAppStore.setState({ devMode: false });

    useAppStore.getState().openVariantPanel("p1");

    const state = useAppStore.getState();
    expect(state.showVariantPanel).toBe(true);
    expect(state.activeVariantPromptId).toBe("p1");
  });
});
