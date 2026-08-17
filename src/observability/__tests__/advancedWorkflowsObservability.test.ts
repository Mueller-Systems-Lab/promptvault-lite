// =============================================================================
// PromptVault Lite — Advanced Workflows Observability Tests (#295)
// =============================================================================
// Covers:
//   - opening the gate emits missing_info.open
//   - generating variants emits direction.generate with variant_count
//   - privacy: sentinel strings placed in answers/variant text/prompt body
//     NEVER appear in a buildDiagnosticExport JSON
//   - OFF/ON equivalence: gate complete + variant generate produce identical
//     enriched/variant content with observability OFF vs ON
// =============================================================================

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { useAppStore } from "@/stores/appStore";
import {
  setObservabilityEnabled,
  clearAll,
  getEvents,
} from "@/observability/events";
import { buildDiagnosticExport } from "@/observability/redaction";
import type {
  PromptItem,
  PromptContextEvaluation,
  PromptHygiene,
  DirectionProfileSelection,
} from "@/types";

// =============================================================================
// Helpers
// =============================================================================

function makePrompt(
  id: string,
  content: string = "# Test\n\nGA observability prompt.",
): PromptItem {
  return {
    id,
    file_path: `/test/${id}.md`,
    file_name: `${id}.md`,
    title: id,
    description: "",
    category: "test",
    version: "1.0",
    tags: [],
    content,
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

function makeContextEval(): PromptContextEvaluation {
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
  });
}

/** Seed prompt + analysis data and open the gate, answering every REQUIRED item. */
function runGateFlowToCompletion(promptId: string, answerText: string) {
  const store = useAppStore.getState();
  store.openMissingInfoGate(promptId);
  const session = useAppStore.getState().missingInfoSessions[promptId];
  const required = session.items.filter((i) => i.tier === "REQUIRED");
  for (const item of required) {
    store.answerGateItem(promptId, {
      itemId: item.id,
      value: `${answerText} ${item.label}`,
      answeredAt: new Date().toISOString(),
    });
  }
  store.completeGate(promptId, "COMPLETED");
  return useAppStore.getState().enrichedContexts[promptId];
}

// =============================================================================
// Tests
// =============================================================================

describe("Advanced Workflows Observability (#295)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setObservabilityEnabled(false);
    clearAll();
    resetStore();
  });

  afterEach(() => {
    setObservabilityEnabled(false);
  });

  // -------------------------------------------------------------------------
  // Event emission
  // -------------------------------------------------------------------------

  it("opening the gate emits missing_info.open (succeeded)", () => {
    setObservabilityEnabled(true);
    clearAll();
    const prompt = makePrompt("obs-gate");
    useAppStore.setState({
      prompts: [prompt],
      selectedPromptId: prompt.id,
      contextEvaluations: { [prompt.id]: makeContextEval() },
      hygiene: { [prompt.id]: makeHygiene(prompt.id) },
    });

    useAppStore.getState().openMissingInfoGate(prompt.id);

    const events = getEvents().filter((e) => e.operation === "missing_info.open");
    expect(events.length).toBeGreaterThan(0);
    const open = events[events.length - 1];
    expect(open.status).toBe("succeeded");
    expect(open.layer).toBe("store");
    // Safe metadata only: question count present
    expect(
      open.attributes?.["promptvault.missing_info.question_count"],
    ).toBeTypeOf("number");
  });

  it("generating variants emits direction.generate with variant_count", () => {
    setObservabilityEnabled(true);
    clearAll();
    const prompt = makePrompt("obs-variants", "Variant source content");
    useAppStore.setState({
      prompts: [prompt],
      selectedPromptId: prompt.id,
      selectedProfileIds: ["sachlich"],
    });

    const selection: DirectionProfileSelection = {
      selectedProfileIds: ["sachlich"],
    };
    useAppStore.getState().generateVariants(prompt.id, selection);

    const events = getEvents().filter(
      (e) => e.operation === "direction.generate",
    );
    expect(events.length).toBeGreaterThan(0);
    const gen = events[events.length - 1];
    expect(gen.status).toBe("succeeded");
    expect(gen.attributes?.["promptvault.direction.variant_count"]).toBe(1);
  });

  it("generateVariants without source content emits direction.generate failed(NO_PROMPT_SELECTED)", () => {
    setObservabilityEnabled(true);
    clearAll();
    // No prompts in store → no source content
    const selection: DirectionProfileSelection = {
      selectedProfileIds: ["sachlich"],
    };
    useAppStore.getState().generateVariants("missing", selection);

    const events = getEvents().filter(
      (e) => e.operation === "direction.generate",
    );
    expect(events.length).toBeGreaterThan(0);
    const gen = events[events.length - 1];
    expect(gen.status).toBe("failed");
    expect(gen.reasonCode).toBe("NO_PROMPT_SELECTED");
    expect(gen.attributes?.["promptvault.direction.variant_count"]).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Privacy — sentinels never cross the export boundary
  // -------------------------------------------------------------------------

  it("privacy: sentinels in answers/variant text/prompt body never appear in diagnostic export", () => {
    setObservabilityEnabled(true);
    clearAll();

    const SENTINEL_PROMPT = "SENTINEL_PROMPT_7A2E";
    const SENTINEL_ANSWER = "SENTINEL_ANSWER_9B1C";
    const SENTINEL_VARIANT = "SENTINEL_VARIANT_5D8F";

    const prompt = makePrompt("obs-privacy", SENTINEL_PROMPT);
    useAppStore.setState({
      prompts: [prompt],
      selectedPromptId: prompt.id,
      contextEvaluations: { [prompt.id]: makeContextEval() },
      hygiene: { [prompt.id]: makeHygiene(prompt.id) },
    });

    // Gate flow with sentinel answers → enriched content embeds them
    runGateFlowToCompletion(prompt.id, SENTINEL_ANSWER);
    const ctx = useAppStore.getState().enrichedContexts[prompt.id];
    expect(ctx).toBeDefined();
    expect(ctx.enrichedContent).toContain(SENTINEL_ANSWER);

    // Variant generation with sentinel custom direction → variant content embeds it
    const selection: DirectionProfileSelection = {
      selectedProfileIds: ["custom"],
      customDirectionText: SENTINEL_VARIANT,
    };
    useAppStore.getState().generateVariants(prompt.id, selection);
    const result = useAppStore.getState().variantResults[prompt.id];
    expect(result).toBeDefined();
    expect(result.variants.length).toBeGreaterThan(0);
    expect(result.variants[0].content).toContain(SENTINEL_VARIANT);

    // Build the diagnostic export from the real event bus
    const exportData = buildDiagnosticExport(
      "1.11.0",
      "Win32",
      {},
      [],
      getEvents() as never,
      [],
    );
    const json = JSON.stringify(exportData);

    // Sentinels must NEVER appear — content never crosses the boundary
    expect(json).not.toContain(SENTINEL_PROMPT);
    expect(json).not.toContain(SENTINEL_ANSWER);
    expect(json).not.toContain(SENTINEL_VARIANT);

    // Safe bounded metadata IS exported
    expect(json).toContain("missing_info.open");
    expect(json).toContain("direction.generate");
  });

  // -------------------------------------------------------------------------
  // OFF/ON equivalence
  // -------------------------------------------------------------------------

  it("OFF/ON equivalence: gate complete + variant generate produce identical content", () => {
    const runFlow = (obsOn: boolean) => {
      setObservabilityEnabled(obsOn);
      clearAll();
      resetStore();

      const prompt = makePrompt("obs-equiv", "Equivalence source content");
      useAppStore.setState({
        prompts: [prompt],
        selectedPromptId: prompt.id,
        contextEvaluations: { [prompt.id]: makeContextEval() },
        hygiene: { [prompt.id]: makeHygiene(prompt.id) },
      });

      const ctx = runGateFlowToCompletion(prompt.id, "Antworttext");

      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich"],
      };
      useAppStore.getState().generateVariants(prompt.id, selection);
      const result = useAppStore.getState().variantResults[prompt.id];

      return {
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime: Record key may be absent
        enrichedContent: ctx?.enrichedContent ?? "",
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime: Record key may be absent
        variantContent: result?.variants[0]?.content ?? "",
      };
    };

    const off = runFlow(false);
    const on = runFlow(true);

    expect(on.enrichedContent).toBe(off.enrichedContent);
    expect(on.variantContent).toBe(off.variantContent);
    expect(on.enrichedContent).toBeTruthy();
    expect(on.variantContent).toBeTruthy();
  });
});
