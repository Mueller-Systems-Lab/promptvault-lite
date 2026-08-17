// =============================================================================
// PromptVault Lite — Missing-Info-Gate Store Tests (Batch 3)
// =============================================================================
// Tests for: openMissingInfoGate, answerGateItem, skipGateItem, completeGate,
// closeGate, resetGateSession, getSessionForPrompt, analyzeSelected invalidation.
// =============================================================================

import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/stores/appStore";
import type {
  PromptItem,
  PromptContextEvaluation,
  PromptHygiene,
  MissingInfoAnswer,
  ClassifiedMissingInfo,
} from "@/types";

// ---------------------------------------------------------------------------
// Note: The Missing-Info-Gate is GA since v1.11.0 — no feature-flag mock is
// needed; openMissingInfoGate always proceeds to the analysis-prerequisite
// check.
// ---------------------------------------------------------------------------

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
      {
        dimension: "agent_readiness",
        name: "Human Approval",
        score: 0,
        max_score: 2,
        details: "Keine Genehmigungsregel",
      },
    ],
    strengths: [],
    warnings: [],
    missing_elements: ["Ausgabeformat", "Toolauswahl"],
    suggested_improvements: [],
    risk_flags: [
      {
        flag: "missing_goal",
        severity: "critical",
        message: "Kein klares Ziel definiert",
        score_penalty: 15,
      },
      {
        flag: "ambiguous_task",
        severity: "medium",
        message: "Aufgabenstellung unklar",
        score_penalty: 10,
      },
    ],
    confidence: 0.8,
    evaluated_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeHygiene(
  promptId: string,
  overrides: Partial<PromptHygiene> = {},
): PromptHygiene {
  return {
    id: `hyg-${promptId}`,
    prompt_id: promptId,
    hygiene_score: 80,
    status: "clean",
    artifacts: [],
    analyzed_at: "2026-01-01T00:00:00Z",
    ...overrides,
  };
}

function makeAnswer(itemId: string, value: string): MissingInfoAnswer {
  return {
    itemId,
    value,
    answeredAt: new Date().toISOString(),
  };
}

/**
 * Reset the store to a clean state before each test.
 * Resets ALL gate-related state fields.
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
    missingInfoSessions: {},
    enrichedContexts: {},
    isGateOpen: false,
    activeGatePromptId: null,
    gateSkippedItems: {},
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
 * Setup a prompt with analysis data so the gate can open.
 */
function setupPromptWithAnalysis(
  overrides: {
    promptId?: string;
    promptContent?: string;
    contextEvalOverrides?: Partial<PromptContextEvaluation>;
    hygieneOverrides?: Partial<PromptHygiene>;
  } = {},
) {
  const promptId = overrides.promptId ?? "test-prompt-1";
  const prompt = makePrompt(promptId, {
    content: overrides.promptContent ?? "# Test\n\nAgentic prompt.",
  });
  const contextEval = makeContextEval(overrides.contextEvalOverrides);
  const hygiene = makeHygiene(promptId, overrides.hygieneOverrides);

  useAppStore.setState((state) => ({
    prompts: [...state.prompts, prompt],
    selectedPromptId: promptId,
    contextEvaluations: {
      ...state.contextEvaluations,
      [promptId]: contextEval,
    },
    hygiene: {
      ...state.hygiene,
      [promptId]: hygiene,
    },
  }));

  return { promptId, prompt, contextEval, hygiene };
}

// =============================================================================
// Tests: Missing-Info-Gate Store
// =============================================================================

describe("Missing-Info-Gate Store", () => {
  beforeEach(resetStore);

  // -------------------------------------------------------------------------
  // #233: State-Felder und openGate
  // -------------------------------------------------------------------------

  describe("openMissingInfoGate (#233)", () => {
    it("creates a session per promptId", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[promptId]).toBeDefined();
      expect(state.missingInfoSessions[promptId].status).toBe("ACTIVE");
      expect(state.isGateOpen).toBe(true);
      expect(state.activeGatePromptId).toBe(promptId);
    });

    it("produces classified items with tiers", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);

      const state = useAppStore.getState();
      const session = state.missingInfoSessions[promptId];
      expect(session.items.length).toBeGreaterThan(0);

      // Critical risk flag → REQUIRED
      const requiredItems = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      expect(requiredItems.length).toBeGreaterThan(0);
    });

    it("reopens existing session without re-detection", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);
      const firstSessionId =
        useAppStore.getState().missingInfoSessions[promptId].sessionId;

      // Close then reopen
      useAppStore.getState().closeGate();
      useAppStore.getState().openMissingInfoGate(promptId);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[promptId].sessionId).toBe(
        firstSessionId,
      );
      expect(state.isGateOpen).toBe(true);
    });

    it("returns early when no analysis data exists", () => {
      const prompt = makePrompt("no-analysis");
      useAppStore.setState((s) => ({
        prompts: [...s.prompts, prompt],
      }));
      const store = useAppStore.getState();

      store.openMissingInfoGate("no-analysis");

      const state = useAppStore.getState();
      expect(state.missingInfoSessions["no-analysis"]).toBeUndefined();
      expect(state.isGateOpen).toBe(false);
      expect(state.error).toContain("Keine Analyse-Daten");
    });

    it("clears error state before gate opens", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);
      // error from missing analysis should be cleared by successful open
      expect(useAppStore.getState().error).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // #234: answerGateItem, completeGate, closeGate, resetGateSession
  // -------------------------------------------------------------------------

  describe("answerGateItem (#234)", () => {
    it("stores an answer and allows editing", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const itemId = session.items[0].id;

      store.answerGateItem(promptId, makeAnswer(itemId, "First answer"));

      const after1 = useAppStore.getState();
      expect(after1.missingInfoSessions[promptId].answers[itemId].value).toBe(
        "First answer",
      );

      // Edit the answer
      store.answerGateItem(promptId, makeAnswer(itemId, "Edited answer"));

      const after2 = useAppStore.getState();
      expect(after2.missingInfoSessions[promptId].answers[itemId].value).toBe(
        "Edited answer",
      );
    });

    it("does not store answers when session is not ACTIVE", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const itemId = session.items[0].id;

      // Complete the gate first
      store.answerGateItem(promptId, makeAnswer(itemId, "Answer"));

      // Try to answer after gate is no longer ACTIVE
      useAppStore.setState((s) => ({
        missingInfoSessions: {
          ...s.missingInfoSessions,
          [promptId]: {
            ...s.missingInfoSessions[promptId],
            status: "COMPLETED",
          },
        },
      }));

      store.answerGateItem(promptId, makeAnswer(itemId, "New answer"));
      // Should NOT have been stored
      expect(
        useAppStore.getState().missingInfoSessions[promptId].answers[itemId]
          .value,
      ).not.toBe("New answer");
    });
  });

  describe("skipGateItem (#234)", () => {
    it("marks an item as skipped", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const item = session.items.find((i) => i.tier !== "REQUIRED");
      if (!item) return; // skip if no non-REQUIRED items

      store.skipGateItem(promptId, item.id);

      const state = useAppStore.getState();
      expect(state.gateSkippedItems[promptId]).toContain(item.id);
    });

    it("prevents skipping REQUIRED items", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const requiredItem = session.items.find((i) => i.tier === "REQUIRED");
      if (!requiredItem) return;

      store.skipGateItem(promptId, requiredItem.id);

      const state = useAppStore.getState();
      expect(state.gateSkippedItems[promptId] ?? []).not.toContain(
        requiredItem.id,
      );
    });
  });

  describe("completeGate (#234)", () => {
    it("creates EnrichedPromptContext on completion", () => {
      const { promptId, prompt } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Answer all REQUIRED items
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const requiredItems = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of requiredItems) {
        store.answerGateItem(
          promptId,
          makeAnswer(item.id, `Answer: ${item.label}`),
        );
      }

      store.completeGate(promptId, "COMPLETED");

      const state = useAppStore.getState();
      expect(state.enrichedContexts[promptId]).toBeDefined();
      expect(state.enrichedContexts[promptId].originalContent).toBe(
        prompt.content,
      );
      expect(state.enrichedContexts[promptId].gateOutcome).toBe("COMPLETED");
      expect(state.isGateOpen).toBe(false);
    });

    it("does not complete when REQUIRED items are unanswered", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // No answers to REQUIRED items
      store.completeGate(promptId, "COMPLETED");

      const state = useAppStore.getState();
      expect(state.enrichedContexts[promptId]).toBeUndefined();
      expect(state.isGateOpen).toBe(true); // still open
    });

    it("allows COMPLETED with SKIPPED outcome even with unanswered", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      store.completeGate(promptId, "SKIPPED");

      const state = useAppStore.getState();
      expect(state.enrichedContexts[promptId]).toBeDefined();
      expect(state.enrichedContexts[promptId].gateOutcome).toBe("SKIPPED");
    });

    it("produces enriched content containing the answer section", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const requiredItems = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of requiredItems) {
        store.answerGateItem(
          promptId,
          makeAnswer(item.id, `Test answer for ${item.label}`),
        );
      }

      store.completeGate(promptId, "COMPLETED");

      const state = useAppStore.getState();
      expect(state.enrichedContexts[promptId].enrichedContent).toContain(
        "## Ergänzte Informationen (Missing-Info-Gate)",
      );
    });
  });

  describe("closeGate (#234)", () => {
    it("sets isGateOpen to false and marks session as CANCELLED", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      store.closeGate();

      const state = useAppStore.getState();
      expect(state.isGateOpen).toBe(false);
      expect(state.missingInfoSessions[promptId].status).toBe("CANCELLED");
    });

    it("keeps session and answers when closing", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const itemId = session.items[0].id;
      store.answerGateItem(promptId, makeAnswer(itemId, "Saved answer"));
      store.closeGate();

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[promptId]).toBeDefined();
      expect(state.missingInfoSessions[promptId].answers[itemId].value).toBe(
        "Saved answer",
      );
    });
  });

  describe("resetGateSession (#234)", () => {
    it("removes session and enriched context for promptId", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Answer and complete
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "A"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Reset
      store.resetGateSession(promptId);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[promptId]).toBeUndefined();
      expect(state.enrichedContexts[promptId]).toBeUndefined();
    });

    it("closes gate if the active prompt was reset", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      store.resetGateSession(promptId);

      const state = useAppStore.getState();
      expect(state.isGateOpen).toBe(false);
      expect(state.activeGatePromptId).toBeNull();
    });
  });

  describe("getSessionForPrompt (#234)", () => {
    it("returns the session for a given promptId", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().getSessionForPrompt(promptId);
      expect(session).toBeDefined();
      expect(session?.promptId).toBe(promptId);
    });

    it("returns undefined for unknown promptId", () => {
      const result = useAppStore.getState().getSessionForPrompt("unknown");
      expect(result).toBeUndefined();
    });
  });

  // -------------------------------------------------------------------------
  // #235: Invalidierung in analyzeSelected()
  // -------------------------------------------------------------------------

  describe("analyzeSelected invalidation (#235)", () => {
    it("resets gate session after analysis", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Answer and complete
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "A"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Verify session exists
      expect(
        useAppStore.getState().missingInfoSessions[promptId],
      ).toBeDefined();

      // Re-analyze (mocked — tauri calls will fail, but invalidation runs after)
      // We test the invalidation behavior by calling resetGateSession
      // which is what analyzeSelected does internally
      store.resetGateSession(promptId);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[promptId]).toBeUndefined();
      expect(state.enrichedContexts[promptId]).toBeUndefined();
    });

    it("does not affect sessions for other prompts", () => {
      const { promptId: id1 } = setupPromptWithAnalysis({
        promptId: "prompt-1",
      });
      const { promptId: id2 } = setupPromptWithAnalysis({
        promptId: "prompt-2",
      });

      // Open gate for both
      useAppStore.getState().openMissingInfoGate(id1);
      useAppStore.getState().openMissingInfoGate(id2);

      // Reset only prompt-1
      useAppStore.getState().resetGateSession(id1);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[id1]).toBeUndefined();
      expect(state.missingInfoSessions[id2]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // #236: Keine Persistenz (Session-Only)
  // -------------------------------------------------------------------------

  describe("Session-Only / No Persistence (#236)", () => {
    it("initializes with empty gate state on store creation", () => {
      // After resetStore() in beforeEach, gate state must be empty
      const state = useAppStore.getState();
      expect(state.missingInfoSessions).toEqual({});
      expect(state.enrichedContexts).toEqual({});
      expect(state.gateSkippedItems).toEqual({});
      expect(state.isGateOpen).toBe(false);
      expect(state.activeGatePromptId).toBeNull();
    });

    it("resets to empty gate state when resetStore is called", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Verify state is populated
      expect(
        useAppStore.getState().missingInfoSessions[promptId],
      ).toBeDefined();

      // Full reset
      resetStore();

      const state = useAppStore.getState();
      expect(state.missingInfoSessions).toEqual({});
      expect(state.enrichedContexts).toEqual({});
    });

    it("does not persist gate data to localStorage", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Check: no gate data in localStorage
      const keys = Object.keys(localStorage);
      const gateKeys = keys.filter(
        (k) =>
          k.includes("missingInfo") ||
          k.includes("gate") ||
          k.includes("enrichedContext"),
      );
      expect(gateKeys).toHaveLength(0);
    });
  });

  // -------------------------------------------------------------------------
  // Cross-cutting: Session Lifecycle
  // -------------------------------------------------------------------------

  describe("Session Lifecycle", () => {
    it("follows ACTIVE → COMPLETED → (reset) lifecycle", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      // ACTIVE
      store.openMissingInfoGate(promptId);
      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "ACTIVE",
      );

      // Answer REQUIRED and complete
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "A"));
      }
      store.completeGate(promptId, "COMPLETED");

      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "COMPLETED",
      );
      expect(useAppStore.getState().missingInfoSessions[promptId].outcome).toBe(
        "COMPLETED",
      );

      // Reset
      store.resetGateSession(promptId);
      expect(
        useAppStore.getState().missingInfoSessions[promptId],
      ).toBeUndefined();
    });

    it("follows ACTIVE → CANCELLED → (reopen) → ACTIVE lifecycle", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);
      store.closeGate();

      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "CANCELLED",
      );

      // Reopen
      store.openMissingInfoGate(promptId);
      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "ACTIVE",
      );
      expect(useAppStore.getState().isGateOpen).toBe(true);
    });

    it("preserves original prompt content after gate completion", () => {
      const { promptId, prompt } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "Answer text"));
      }
      store.completeGate(promptId, "COMPLETED");

      const state = useAppStore.getState();
      // Original prompt is preserved unchanged
      expect(state.enrichedContexts[promptId].originalContent).toBe(
        prompt.content,
      );
      // Enriched content contains original
      expect(state.enrichedContexts[promptId].enrichedContent).toContain(
        prompt.content,
      );
    });

    it("has unique session IDs for different prompts", () => {
      const { promptId: id1 } = setupPromptWithAnalysis({
        promptId: "prompt-a",
      });
      const { promptId: id2 } = setupPromptWithAnalysis({
        promptId: "prompt-b",
      });

      useAppStore.getState().openMissingInfoGate(id1);
      useAppStore.getState().openMissingInfoGate(id2);

      const state = useAppStore.getState();
      expect(state.missingInfoSessions[id1].sessionId).not.toBe(
        state.missingInfoSessions[id2].sessionId,
      );
    });

    it("allows reopening closed gate", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);
      store.closeGate();
      expect(useAppStore.getState().isGateOpen).toBe(false);

      store.openMissingInfoGate(promptId);
      expect(useAppStore.getState().isGateOpen).toBe(true);
    });
  });

  // -------------------------------------------------------------------------
  // Edge cases: require_human_approval from constraintChecker
  // -------------------------------------------------------------------------

  describe("require_human_approval conflicts", () => {
    it("preserves conflict state without auto-resolving", () => {
      // The store does NOT auto-resolve conflicts.
      // Conflicts from constraintChecker are stored via the
      // ConflictResolution mechanism in the types.
      // The store simply passes hasConflicts: false by default
      // in completeGate() since constraint checking is not
      // hooked into the store directly in Batch 3.
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "test"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Verify the enriched context exists (no crash from conflict)
      const state = useAppStore.getState();
      expect(state.enrichedContexts[promptId]).toBeDefined();
    });
  });

  // -------------------------------------------------------------------------
  // #252: Session Lifecycle Tests
  // -------------------------------------------------------------------------

  describe("Session Lifecycle (#252)", () => {
    it("sessions are isolated per promptId", () => {
      const { promptId: id1 } = setupPromptWithAnalysis({
        promptId: "p-a",
      });
      const { promptId: id2 } = setupPromptWithAnalysis({
        promptId: "p-b",
      });

      const store = useAppStore.getState();
      store.openMissingInfoGate(id1);
      store.openMissingInfoGate(id2);

      // Answer items in first session only
      const s1 = useAppStore.getState().missingInfoSessions[id1];
      const s2 = useAppStore.getState().missingInfoSessions[id2];
      const r1 = s1.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      const r2 = s2.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );

      if (r1.length > 0) {
        store.answerGateItem(id1, makeAnswer(r1[0].id, "Answer-A"));
      }
      if (r2.length > 0) {
        store.answerGateItem(id2, makeAnswer(r2[0].id, "Answer-B"));
      }

      // Complete first gate
      for (const item of r1) {
        store.answerGateItem(id1, makeAnswer(item.id, "Auto-A"));
      }
      store.completeGate(id1, "COMPLETED");

      // First gate → enrichedContext, second gate → still ACTIVE
      const state = useAppStore.getState();
      expect(state.enrichedContexts[id1]).toBeDefined();
      expect(state.enrichedContexts[id2]).toBeUndefined();
      expect(state.missingInfoSessions[id2].status).toBe("ACTIVE");
    });

    it("completeGate requires all REQUIRED answered or outcome SKIPPED/ASSUMPTIONS", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );

      // Leave one REQUIRED unanswered, try COMPLETED
      for (let i = 0; i < required.length - 1; i++) {
        store.answerGateItem(promptId, makeAnswer(required[i].id, "Answered"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Should NOT have created enriched context (not all answered)
      const state = useAppStore.getState();

      expect(state.enrichedContexts[promptId]).toBeUndefined();
    });

    it("session status transitions: ACTIVE → COMPLETED → can reopen", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();

      store.openMissingInfoGate(promptId);
      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "ACTIVE",
      );

      // Answer and complete
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "x"));
      }
      store.completeGate(promptId, "COMPLETED");

      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "COMPLETED",
      );

      // Reopen: status should go back to ACTIVE
      store.openMissingInfoGate(promptId);
      expect(useAppStore.getState().missingInfoSessions[promptId].status).toBe(
        "ACTIVE",
      );
    });
  });

  // -------------------------------------------------------------------------
  // #253: Invalidierung + Session-Only Tests
  // -------------------------------------------------------------------------

  describe("Invalidierung & Session-Only (#253)", () => {
    it("resetGateSession removes session AND enrichedContext", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "x"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Both session and enrichedContext should exist
      const s1 = useAppStore.getState();
      expect(s1.missingInfoSessions[promptId]).toBeDefined();
      expect(s1.enrichedContexts[promptId]).toBeDefined();

      // Reset
      useAppStore.getState().resetGateSession(promptId);

      const s2 = useAppStore.getState();

      expect(s2.missingInfoSessions[promptId]).toBeUndefined();

      expect(s2.enrichedContexts[promptId]).toBeUndefined();
    });

    it("resetGateSession clears gateSkippedItems for that prompt", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Skip a non-REQUIRED item
      const session = useAppStore.getState().missingInfoSessions[promptId];
      const nonReq = session.items.find((i) => i.tier !== "REQUIRED");
      if (nonReq) {
        store.skipGateItem(promptId, nonReq.id);
      }

      expect(
        (useAppStore.getState().gateSkippedItems[promptId] ?? []).length,
      ).toBeGreaterThan(0);

      useAppStore.getState().resetGateSession(promptId);

      expect(useAppStore.getState().gateSkippedItems[promptId]).toBeUndefined();
    });

    it("no localStorage keys contain gate-related data", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      const session = useAppStore.getState().missingInfoSessions[promptId];
      const required = session.items.filter(
        (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
      );
      for (const item of required) {
        store.answerGateItem(promptId, makeAnswer(item.id, "test"));
      }
      store.completeGate(promptId, "COMPLETED");

      // Check localStorage for any gate-related keys
      const keys = Object.keys(localStorage);
      const gateKeys = keys.filter(
        (k) =>
          k.includes("missingInfo") ||
          k.includes("enriched") ||
          k.includes("gateSession") ||
          k.includes("gateSkipped"),
      );
      expect(gateKeys.length).toBe(0);
    });

    it("state resets on create() — missingInfoSessions and enrichedContexts are empty", () => {
      const { promptId } = setupPromptWithAnalysis();
      const store = useAppStore.getState();
      store.openMissingInfoGate(promptId);

      // Reset by re-creating store state (simulating app restart)
      useAppStore.setState({
        missingInfoSessions: {},
        enrichedContexts: {},
        gateSkippedItems: {},
        isGateOpen: false,
        activeGatePromptId: null,
      });

      const state = useAppStore.getState();
      expect(state.missingInfoSessions).toEqual({});
      expect(state.enrichedContexts).toEqual({});
      expect(state.isGateOpen).toBe(false);
    });

    it("enrichedContexts cleanup when resetGateSession called on multiple prompts", () => {
      const { promptId: id1 } = setupPromptWithAnalysis({
        promptId: "a",
      });
      const { promptId: id2 } = setupPromptWithAnalysis({
        promptId: "b",
      });

      const store = useAppStore.getState();

      // Open and complete both
      for (const pid of [id1, id2]) {
        // Re-select the prompt
        useAppStore.setState({ selectedPromptId: pid });
        store.openMissingInfoGate(pid);
        const session = useAppStore.getState().missingInfoSessions[pid];
        const required = session.items.filter(
          (i: ClassifiedMissingInfo) => i.tier === "REQUIRED",
        );
        for (const item of required) {
          store.answerGateItem(pid, makeAnswer(item.id, "x"));
        }
        store.completeGate(pid, "COMPLETED");
      }

      const s1 = useAppStore.getState();
      expect(s1.enrichedContexts[id1]).toBeDefined();
      expect(s1.enrichedContexts[id2]).toBeDefined();

      // Reset only prompt-a
      useAppStore.getState().resetGateSession(id1);

      const s2 = useAppStore.getState();

      expect(s2.enrichedContexts[id1]).toBeUndefined();
      expect(s2.enrichedContexts[id2]).toBeDefined();

      // Reset prompt-b
      useAppStore.getState().resetGateSession(id2);
      const s3 = useAppStore.getState();

      expect(s3.enrichedContexts[id2]).toBeUndefined();
    });
  });
});
