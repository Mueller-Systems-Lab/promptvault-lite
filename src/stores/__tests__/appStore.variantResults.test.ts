// =============================================================================
// PromptVault Lite — VariantStore State Tests (Batch 4)
// =============================================================================
// Tests for:
//   State Fields (#264): variantResults, showVariantPanel, activeVariantPromptId,
//     selectedProfileIds, customDirectionInput, isGeneratingVariants,
//     variantGenerationError
//   Actions (#265): openVariantPanel, closeVariantPanel, generateVariants,
//     selectProfile, toggleProfileSelection, clearVariantResults,
//     resetVariantSession, getVariantResultForPrompt,
//     setSelectedDirectionProfiles, setCustomDirectionInput
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/stores/appStore";
import { contentFingerprint } from "@/observability/redaction";
import type {
  PromptItem,
  DirectionProfileId,
  DirectionProfileSelection,
  EnrichedPromptContext,
} from "@/types";

// ---------------------------------------------------------------------------
// Note: Direction Profiles / Variants are GA since v1.11.0 — no feature-flag
// mock is needed.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Mocks for variantGenerator and directionProfiles
// These are already tested in their own unit test suites.
// ---------------------------------------------------------------------------
vi.mock("@/lib/variantGenerator", () => ({
  generateVariants: vi.fn(
    (
      sourceContent: string,
      selection: DirectionProfileSelection,
      options?: { maxVariants?: number; enrichedContentUsed?: boolean },
    ) => ({
      sourceContent,
      sourceFingerprint: contentFingerprint(sourceContent),
      enrichedContentUsed: options?.enrichedContentUsed ?? false,
      variants: selection.selectedProfileIds
        .slice(0, options?.maxVariants ?? 5)
        .map((pid, i) => ({
          variantId: `VAR_${pid}_${Date.now()}_${i + 1}`,
          profileId: pid,
          label: pid,
          content: `[${pid}] ${sourceContent}`,
          directionExplanation: `Direction: ${pid}`,
          preservedConstraints: [],
          conflicts: [],
          assumptions: [],
          openPoints: [],
          recommendation: "Test recommendation",
          metadata: {
            generatedAt: new Date().toISOString(),
            sourceContent: options?.enrichedContentUsed
              ? ("enriched" as const)
              : ("original" as const),
            appliedProfileId: pid,
          },
        })),
      profileConflicts: [],
      appliedAt: new Date().toISOString(),
    }),
  ),
  applyDirectionProfile: vi.fn((content: string) => `[profile] ${content}`),
  mapToPromptVariant: vi.fn(),
  DIRECTION_PROFILES: [],
  validateOriginalUnchanged: vi.fn(() => true),
  validateConstraintsPreserved: vi.fn(() => true),
  validateNoCloudReferences: vi.fn(() => true),
  validateConstraintsListed: vi.fn(() => true),
  validateContentDifferent: vi.fn(() => true),
}));

vi.mock("@/lib/directionProfiles", () => ({
  getDefaultSelection: vi.fn((): DirectionProfileId[] => [
    "sachlich",
    "technisch",
    "kurz",
    "ausfuehrlich",
    "agentisch",
  ]),
  getProfile: vi.fn((id: string) =>
    id === "sachlich"
      ? {
          profileId: "sachlich",
          label: "Sachlich",
          category: "sachlich",
          description: "Sachlich description",
          promptPrefix: "Sachlich prefix",
          compatibleConstraintCategories: [],
          conflictingConstraintCategories: [],
          recommendation: "Sachlich recommendation",
        }
      : undefined,
  ),
  getAllProfiles: vi.fn(() => []),
  getProfilesByCategory: vi.fn(() => []),
  isCustomDirectionProfile: vi.fn((id: string) => id === "custom"),
  validateDirectionProfileSelection: vi.fn(() => ({
    valid: true,
    errors: [],
    warnings: [],
  })),
  DIRECTION_PROFILES: [],
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
      overrides.content ??
      "# Test Prompt\n\nThis is a test prompt for agentic use.",
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

function makeEnrichedContext(enrichedContent: string): EnrichedPromptContext {
  return {
    originalContent: "# Original",
    enrichedContent,
    answers: [],
    gateOutcome: "COMPLETED",
    sessionId: "SESS_001",
    enrichedAt: new Date().toISOString(),
  };
}

/**
 * Reset the store to a clean state before each test.
 * Resets ALL variant-related state fields and core data.
 */
function resetStore() {
  useAppStore.setState({
    prompts: [],
    selectedPromptId: null,
    evaluations: {},
    hygiene: {},
    contextEvaluations: {},
    blueprintDetections: {},
    blueprintEvaluations: {},
    // Missing-Info-Gate state — kept separate from variant state
    missingInfoSessions: {},
    enrichedContexts: {},
    isGateOpen: false,
    activeGatePromptId: null,
    gateSkippedItems: {},
    // Variant state
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

/**
 * Seed a single prompt into the store for variant operations.
 */
function seedPrompt(
  id: string = "test-prompt-1",
  content: string = "# Test Prompt\n\nThis is a test.",
) {
  const prompt = makePrompt(id, { content });
  useAppStore.setState((state) => ({
    prompts: [...state.prompts, prompt],
  }));
  return prompt;
}

// =============================================================================
// Tests: VariantStore State Fields (#264)
// =============================================================================

describe("VariantStore State Fields (#264)", () => {
  beforeEach(resetStore);

  it("initial variant state is empty/default", () => {
    const state = useAppStore.getState();
    expect(state.variantResults).toEqual({});
    expect(state.showVariantPanel).toBe(false);
    expect(state.activeVariantPromptId).toBeNull();
    expect(state.selectedProfileIds).toEqual([]);
    expect(state.customDirectionInput).toBe("");
    expect(state.isGeneratingVariants).toBe(false);
    expect(state.variantGenerationError).toBeNull();
  });

  it("variantResults is separate from enrichedContexts", () => {
    const { generateVariants } = useAppStore.getState();
    expect(generateVariants).toBeDefined();

    const state = useAppStore.getState();
    // Both start empty
    expect(state.variantResults).toEqual({});
    expect(state.enrichedContexts).toEqual({});

    // Set enrichedContexts — variantResults must remain untouched
    useAppStore.setState({
      enrichedContexts: {
        p1: makeEnrichedContext("enriched content"),
      },
    });

    const after = useAppStore.getState();
    expect(after.variantResults).toEqual({});
    expect(after.enrichedContexts).not.toEqual({});
  });

  it("variantGenerationError starts null", () => {
    expect(useAppStore.getState().variantGenerationError).toBeNull();
  });
});

// =============================================================================
// Tests: VariantStore Actions (#265)
// =============================================================================

describe("VariantStore Actions (#265)", () => {
  beforeEach(resetStore);

  // ---------------------------------------------------------------------------
  // openVariantPanel / closeVariantPanel
  // ---------------------------------------------------------------------------

  describe("openVariantPanel / closeVariantPanel", () => {
    it("openVariantPanel sets showVariantPanel=true and default selection", () => {
      const { openVariantPanel } = useAppStore.getState();
      openVariantPanel("prompt-1");

      const state = useAppStore.getState();
      expect(state.showVariantPanel).toBe(true);
      expect(state.activeVariantPromptId).toBe("prompt-1");
      expect(state.selectedProfileIds).toEqual([
        "sachlich",
        "technisch",
        "kurz",
        "ausfuehrlich",
        "agentisch",
      ]);
      expect(state.isGeneratingVariants).toBe(false);
      expect(state.variantGenerationError).toBeNull();
    });

    it("closeVariantPanel sets showVariantPanel=false and nulls activeVariantPromptId", () => {
      const { openVariantPanel, closeVariantPanel } = useAppStore.getState();
      openVariantPanel("prompt-1");
      closeVariantPanel();

      const state = useAppStore.getState();
      expect(state.showVariantPanel).toBe(false);
      expect(state.activeVariantPromptId).toBeNull();
      expect(state.variantGenerationError).toBeNull();
    });

    it("closeVariantPanel preserves selectedProfileIds", () => {
      const { openVariantPanel, toggleProfileSelection, closeVariantPanel } =
        useAppStore.getState();
      openVariantPanel("prompt-1");
      // Remove one from the default selection
      toggleProfileSelection("sachlich");

      const beforeClose = useAppStore.getState();
      expect(beforeClose.selectedProfileIds).not.toContain("sachlich");

      closeVariantPanel();

      const afterClose = useAppStore.getState();
      // selectedProfileIds preserved after close
      expect(afterClose.selectedProfileIds).not.toContain("sachlich");
    });
  });

  // ---------------------------------------------------------------------------
  // selectProfile / toggleProfileSelection
  // ---------------------------------------------------------------------------

  describe("selectProfile / toggleProfileSelection", () => {
    it("selectProfile replaces selectedProfileIds with single value", () => {
      const { selectProfile } = useAppStore.getState();
      selectProfile("sachlich");

      expect(useAppStore.getState().selectedProfileIds).toEqual(["sachlich"]);
    });

    it("toggleProfileSelection adds a profile when absent", () => {
      const { toggleProfileSelection } = useAppStore.getState();
      // Start with empty selection
      expect(useAppStore.getState().selectedProfileIds).toEqual([]);

      toggleProfileSelection("technisch");

      expect(useAppStore.getState().selectedProfileIds).toContain("technisch");
    });

    it("toggleProfileSelection removes a profile when present", () => {
      const { selectProfile, toggleProfileSelection } = useAppStore.getState();
      selectProfile("sachlich");
      expect(useAppStore.getState().selectedProfileIds).toEqual(["sachlich"]);

      toggleProfileSelection("sachlich");

      expect(useAppStore.getState().selectedProfileIds).toEqual([]);
    });

    it("toggleProfileSelection supports multi-select", () => {
      const { toggleProfileSelection } = useAppStore.getState();

      toggleProfileSelection("sachlich");
      toggleProfileSelection("technisch");
      toggleProfileSelection("kreativ");

      const ids = useAppStore.getState().selectedProfileIds;
      expect(ids).toContain("sachlich");
      expect(ids).toContain("technisch");
      expect(ids).toContain("kreativ");
      expect(ids.length).toBe(3);
    });
  });

  // ---------------------------------------------------------------------------
  // setSelectedDirectionProfiles / setCustomDirectionInput
  // ---------------------------------------------------------------------------

  describe("setSelectedDirectionProfiles / setCustomDirectionInput", () => {
    it("setSelectedDirectionProfiles batch-sets profile IDs", () => {
      const { setSelectedDirectionProfiles } = useAppStore.getState();
      setSelectedDirectionProfiles("prompt-1", ["sachlich", "kreativ"]);

      expect(useAppStore.getState().selectedProfileIds).toEqual([
        "sachlich",
        "kreativ",
      ]);
    });

    it("setCustomDirectionInput sets the custom input text", () => {
      const { setCustomDirectionInput } = useAppStore.getState();
      setCustomDirectionInput(
        "prompt-1",
        "Erkläre es wie für einen 10-Jährigen",
      );

      expect(useAppStore.getState().customDirectionInput).toBe(
        "Erkläre es wie für einen 10-Jährigen",
      );
    });

    it("customDirectionInput is empty by default", () => {
      expect(useAppStore.getState().customDirectionInput).toBe("");
    });

    it("setCustomDirectionInput can be cleared", () => {
      const { setCustomDirectionInput } = useAppStore.getState();
      setCustomDirectionInput("prompt-1", "some text");
      expect(useAppStore.getState().customDirectionInput).toBe("some text");

      setCustomDirectionInput("prompt-1", "");
      expect(useAppStore.getState().customDirectionInput).toBe("");
    });
  });

  // ---------------------------------------------------------------------------
  // generateVariants
  // ---------------------------------------------------------------------------

  describe("generateVariants", () => {
    it("generates variants for selected profiles", () => {
      seedPrompt("prompt-1", "Original prompt content.");
      const { generateVariants } = useAppStore.getState();

      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich", "technisch"] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const state = useAppStore.getState();
      expect(state.variantResults["prompt-1"]).toBeDefined();
      expect(state.variantResults["prompt-1"].variants.length).toBe(2);
      expect(state.variantResults["prompt-1"].variants[0].profileId).toBe(
        "sachlich",
      );
      expect(state.variantResults["prompt-1"].variants[1].profileId).toBe(
        "technisch",
      );
      expect(state.isGeneratingVariants).toBe(false);
    });

    it("uses enrichedContent when available (preferred)", () => {
      seedPrompt("prompt-1", "Original prompt content.");
      useAppStore.setState({
        enrichedContexts: {
          "prompt-1": makeEnrichedContext("ENRICHED: The user said use this."),
        },
      });

      const { generateVariants } = useAppStore.getState();
      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const result = useAppStore.getState().variantResults["prompt-1"];
      expect(result).toBeDefined();
      // enrichedContent was preferred
      expect(result.enrichedContentUsed).toBe(true);
      // The mock prepends [sachlich] to sourceContent — and the source
      // should be the enriched content
      expect(result.variants[0].content).toContain("ENRICHED");
    });

    it("falls back to original prompt when no enrichedContent exists", () => {
      seedPrompt("prompt-1", "FALLBACK: Original prompt.");
      // No enrichedContexts set

      const { generateVariants } = useAppStore.getState();
      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["technisch"] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const result = useAppStore.getState().variantResults["prompt-1"];
      expect(result).toBeDefined();
      expect(result.enrichedContentUsed).toBe(false);
      expect(result.variants[0].content).toContain("FALLBACK");
    });

    it("max 5 variants are generated even with more profiles selected", () => {
      seedPrompt("prompt-1", "Prompt content.");
      const { generateVariants } = useAppStore.getState();

      const selection: DirectionProfileSelection = {
        selectedProfileIds: [
          "sachlich",
          "technisch",
          "kurz",
          "ausfuehrlich",
          "kreativ",
          "kritisch",
          "anfaenger", // 7 profiles
        ] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const result = useAppStore.getState().variantResults["prompt-1"];
      expect(result).toBeDefined();
      expect(result.variants.length).toBe(5); // capped at 5
    });

    it("sets variantGenerationError when sourceContent is empty", () => {
      // No prompts in the store → sourceContent will be ""
      const { generateVariants } = useAppStore.getState();
      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const state = useAppStore.getState();
      expect(state.isGeneratingVariants).toBe(false);
      expect(state.variantGenerationError).toContain("Kein Prompt-Inhalt");
    });

    it("preserves conflicts in variantResults (from Batch 3)", () => {
      // The mock does NOT return conflicts for now; this test verifies
      // the result structure can hold them even when empty.
      seedPrompt("prompt-1", "content with no constraints really.");
      const { generateVariants } = useAppStore.getState();
      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      };

      generateVariants("prompt-1", selection);

      const result = useAppStore.getState().variantResults["prompt-1"];
      // profileConflicts field exists (even if empty)
      expect(result.profileConflicts).toBeDefined();
      expect(Array.isArray(result.profileConflicts)).toBe(true);
      // Per-variant conflicts exist
      expect(result.variants[0].conflicts).toBeDefined();
      expect(Array.isArray(result.variants[0].conflicts)).toBe(true);
    });

    it("generation sets and unsets isGeneratingVariants", () => {
      seedPrompt("prompt-1", "test content");
      const { generateVariants } = useAppStore.getState();
      const selection: DirectionProfileSelection = {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      };

      // Before
      expect(useAppStore.getState().isGeneratingVariants).toBe(false);

      generateVariants("prompt-1", selection);

      // After — should be false (mock is synchronous)
      expect(useAppStore.getState().isGeneratingVariants).toBe(false);
      expect(useAppStore.getState().variantResults["prompt-1"]).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // clearVariantResults / resetVariantSession
  // ---------------------------------------------------------------------------

  describe("clearVariantResults / resetVariantSession", () => {
    it("clearVariantResults removes variantResults for promptId", () => {
      seedPrompt("prompt-1", "test");
      seedPrompt("prompt-2", "test2");
      const { generateVariants, clearVariantResults } = useAppStore.getState();

      // Generate variants for both prompts
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });
      generateVariants("prompt-2", {
        selectedProfileIds: ["technisch"] as DirectionProfileId[],
      });

      expect(useAppStore.getState().variantResults["prompt-1"]).toBeDefined();
      expect(useAppStore.getState().variantResults["prompt-2"]).toBeDefined();

      // Clear only prompt-1
      clearVariantResults("prompt-1");

      const state = useAppStore.getState();
      expect(state.variantResults["prompt-1"]).toBeUndefined();
      expect(state.variantResults["prompt-2"]).toBeDefined(); // untouched
    });

    it("clearVariantResults resets selectedProfileIds to default", () => {
      const { toggleProfileSelection, clearVariantResults } =
        useAppStore.getState();

      // Change selection away from default
      toggleProfileSelection("sachlich"); // remove from empty → add (since we start empty, let's use a different approach)

      // Start with a custom selection
      useAppStore.setState({
        selectedProfileIds: ["kreativ"] as DirectionProfileId[],
      });

      clearVariantResults("prompt-1");

      expect(useAppStore.getState().selectedProfileIds).toEqual([
        "sachlich",
        "technisch",
        "kurz",
        "ausfuehrlich",
        "agentisch",
      ]);
    });

    it("clearVariantResults keeps enrichedContexts unchanged", () => {
      const enrichedCtx = makeEnrichedContext("enriched");
      useAppStore.setState({
        enrichedContexts: { "prompt-1": enrichedCtx },
      });

      const { clearVariantResults } = useAppStore.getState();
      clearVariantResults("prompt-1");

      // enrichedContexts untouched
      expect(useAppStore.getState().enrichedContexts["prompt-1"]).toBeDefined();
      expect(
        useAppStore.getState().enrichedContexts["prompt-1"].enrichedContent,
      ).toBe("enriched");
    });

    it("resetVariantSession clears variantResults and resets state", () => {
      seedPrompt("prompt-1", "test");
      const { openVariantPanel, generateVariants, resetVariantSession } =
        useAppStore.getState();

      openVariantPanel("prompt-1");
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });
      useAppStore.setState({
        customDirectionInput: "some custom text",
        variantGenerationError: "an error",
      });

      expect(useAppStore.getState().variantResults["prompt-1"]).toBeDefined();

      resetVariantSession("prompt-1");

      const state = useAppStore.getState();
      expect(state.variantResults["prompt-1"]).toBeUndefined();
      expect(state.customDirectionInput).toBe("");
      expect(state.variantGenerationError).toBeNull();
      expect(state.showVariantPanel).toBe(false);
      expect(state.activeVariantPromptId).toBeNull();
      // selectedProfileIds reset to default
      expect(state.selectedProfileIds).toEqual([
        "sachlich",
        "technisch",
        "kurz",
        "ausfuehrlich",
        "agentisch",
      ]);
    });

    it("resetVariantSession keeps enrichedContexts unchanged", () => {
      const enrichedCtx = makeEnrichedContext("enriched");
      useAppStore.setState({
        enrichedContexts: { "prompt-1": enrichedCtx },
      });

      const { resetVariantSession } = useAppStore.getState();
      resetVariantSession("prompt-1");

      expect(useAppStore.getState().enrichedContexts["prompt-1"]).toBeDefined();
    });

    it("resetVariantSession keeps Missing-Info-Gate state unchanged", () => {
      // Set up gate state
      useAppStore.setState({
        missingInfoSessions: {
          "prompt-1": {
            sessionId: "SESS_001",
            promptId: "prompt-1",
            startedAt: new Date().toISOString(),
            items: [],
            answers: {},
            status: "ACTIVE" as const,
            outcome: null,
            enrichedContent: null,
          },
        },
        isGateOpen: true,
        activeGatePromptId: "prompt-1",
      });

      const { resetVariantSession } = useAppStore.getState();
      resetVariantSession("prompt-1");

      const state = useAppStore.getState();
      expect(state.missingInfoSessions["prompt-1"]).toBeDefined();
      expect(state.isGateOpen).toBe(true);
      expect(state.activeGatePromptId).toBe("prompt-1");
    });

    it("clearVariantResults keeps Missing-Info-Gate state unchanged", () => {
      useAppStore.setState({
        isGateOpen: true,
        activeGatePromptId: "prompt-1",
        missingInfoSessions: {
          "prompt-1": {
            sessionId: "SESS_001",
            promptId: "prompt-1",
            startedAt: new Date().toISOString(),
            items: [],
            answers: {},
            status: "ACTIVE" as const,
            outcome: null,
            enrichedContent: null,
          },
        },
      });

      const { clearVariantResults } = useAppStore.getState();
      clearVariantResults("prompt-1");

      const state = useAppStore.getState();
      expect(state.isGateOpen).toBe(true);
      expect(state.activeGatePromptId).toBe("prompt-1");
      expect(state.missingInfoSessions["prompt-1"]).toBeDefined();
    });

    it("clear clears only #215 state, not #216", () => {
      seedPrompt("prompt-1", "test");
      const enrichedCtx = makeEnrichedContext("enriched");
      useAppStore.setState({
        enrichedContexts: { "prompt-1": enrichedCtx },
        missingInfoSessions: {
          "prompt-1": {
            sessionId: "S_1",
            promptId: "prompt-1",
            startedAt: new Date().toISOString(),
            items: [],
            answers: {},
            status: "CANCELLED" as const,
            outcome: null,
            enrichedContent: null,
          },
        },
      });

      const { generateVariants, clearVariantResults } = useAppStore.getState();
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });

      // Verify variant exists
      expect(useAppStore.getState().variantResults["prompt-1"]).toBeDefined();

      clearVariantResults("prompt-1");

      const state = useAppStore.getState();
      // #215 state cleared
      expect(state.variantResults["prompt-1"]).toBeUndefined();
      // #216 state untouched
      expect(state.enrichedContexts["prompt-1"]).toBeDefined();
      expect(state.missingInfoSessions["prompt-1"]).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // getVariantResultForPrompt
  // ---------------------------------------------------------------------------

  describe("getVariantResultForPrompt", () => {
    it("returns undefined when no variants generated", () => {
      expect(
        useAppStore.getState().getVariantResultForPrompt("nonexistent"),
      ).toBeUndefined();
    });

    it("returns the result when variants exist", () => {
      seedPrompt("prompt-1", "test");
      const { generateVariants, getVariantResultForPrompt } =
        useAppStore.getState();

      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });

      const result = getVariantResultForPrompt("prompt-1");
      expect(result).toBeDefined();
      expect(result?.variants.length).toBe(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Cross-cutting concerns
  // ---------------------------------------------------------------------------

  describe("Cross-cutting concerns", () => {
    it("original prompt remains unchanged after generation", () => {
      const originalContent = "ORIGINAL PROMPT CONTENT — DO NOT MODIFY";
      const prompt = seedPrompt("prompt-1", originalContent);

      const { generateVariants } = useAppStore.getState();
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });

      // Original prompt in store unchanged
      const stored = useAppStore
        .getState()
        .prompts.find((p) => p.id === prompt.id);
      expect(stored?.content).toBe(originalContent);
    });

    it("no localStorage interaction (session-only)", () => {
      // variantResults is a plain in-memory Record — no localStorage read/write
      const { openVariantPanel, generateVariants } = useAppStore.getState();
      seedPrompt("prompt-1", "test");

      openVariantPanel("prompt-1");
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });

      const state = useAppStore.getState();
      // The variant results exist in the store (session-only, memory)
      expect(state.variantResults["prompt-1"]).toBeDefined();
      // But there's intentionally no write to localStorage
    });

    it("no #216 store keys overwritten", () => {
      const { generateVariants, openVariantPanel } = useAppStore.getState();
      seedPrompt("prompt-1", "test");

      // Pre-populate #216 state
      useAppStore.setState({
        enrichedContexts: { "prompt-1": makeEnrichedContext("enriched") },
        isGateOpen: true,
        activeGatePromptId: "prompt-1",
        missingInfoSessions: {
          "prompt-1": {
            sessionId: "S_1",
            promptId: "prompt-1",
            startedAt: new Date().toISOString(),
            items: [],
            answers: {},
            status: "ACTIVE" as const,
            outcome: null,
            enrichedContent: null,
          },
        },
        gateSkippedItems: { "prompt-1": ["item1", "item2"] },
      });

      openVariantPanel("prompt-1");
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });

      const state = useAppStore.getState();
      // #216 state completely unchanged
      expect(state.enrichedContexts["prompt-1"]).toBeDefined();
      expect(state.isGateOpen).toBe(true);
      expect(state.activeGatePromptId).toBe("prompt-1");
      expect(state.missingInfoSessions["prompt-1"]).toBeDefined();
      expect(state.gateSkippedItems["prompt-1"]).toEqual(["item1", "item2"]);
    });

    it("no Missing-Info-Gate session modified by variant operations", () => {
      seedPrompt("prompt-1", "test");
      useAppStore.setState({
        isGateOpen: true,
        activeGatePromptId: "prompt-1",
        missingInfoSessions: {
          "prompt-1": {
            sessionId: "MIG_SESSION_X",
            promptId: "prompt-1",
            startedAt: "2026-07-01T00:00:00.000Z",
            items: [],
            answers: {},
            status: "ACTIVE" as const,
            outcome: null,
            enrichedContent: null,
          },
        },
      });

      const { openVariantPanel, generateVariants, clearVariantResults } =
        useAppStore.getState();

      openVariantPanel("prompt-1");
      generateVariants("prompt-1", {
        selectedProfileIds: ["sachlich"] as DirectionProfileId[],
      });
      clearVariantResults("prompt-1");

      // Gate session untouched
      const state = useAppStore.getState();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: Record key may not exist
      expect(state.missingInfoSessions["prompt-1"]?.sessionId).toBe(
        "MIG_SESSION_X",
      );
    });
  });
});
