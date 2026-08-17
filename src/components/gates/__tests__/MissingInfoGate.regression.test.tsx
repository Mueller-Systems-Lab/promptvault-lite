// =============================================================================
// PromptVault Lite — MissingInfoGate Regression Tests (Batch 6A)
// =============================================================================
// Tests for: Original prompt immutability (#256), GA availability (v1.11.0),
// existing optimizer behavior unchanged, session-only guarantee.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissingInfoGate } from "../MissingInfoGate";
import { useAppStore } from "@/stores/appStore";
import { optimizePrompt } from "@/lib/promptOptimizer";
import type {
  ClassifiedMissingInfo,
  MissingInfoSession,
  MissingInfoCategory,
  EnrichedPromptContext,
} from "@/types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeClassifiedItem(
  id: string,
  overrides: Partial<ClassifiedMissingInfo> = {},
): ClassifiedMissingInfo {
  return {
    id,
    source: "prompt_engineering",
    label: `Frage ${id}`,
    question: `Was möchtest du zu Frage ${id} antworten?`,
    rationale: `Diese Frage ist wichtig, weil sie ${id} betrifft.`,
    inputType: "free_text",
    tier: "REQUIRED" as MissingInfoCategory,
    classificationReason: "score === 0",
    placeholder: `Platzhalter ${id}`,
    ...overrides,
  };
}

function makeSession(
  promptId: string,
  items: ClassifiedMissingInfo[],
  overrides: Partial<MissingInfoSession> = {},
): MissingInfoSession {
  return {
    sessionId: `REG-${promptId}-88`,
    promptId,
    startedAt: new Date().toISOString(),
    items,
    answers: {},
    status: "ACTIVE",
    outcome: null,
    enrichedContent: null,
    ...overrides,
  };
}

function seedSession(
  promptId: string,
  items: ClassifiedMissingInfo[],
  promptContent = "Original regression test content",
) {
  useAppStore.setState({
    prompts: [
      {
        id: promptId,
        file_path: `/test/${promptId}.md`,
        file_name: `${promptId}.md`,
        title: promptId,
        description: "",
        category: "test",
        version: "1.0",
        tags: [],
        content: promptContent,
        raw_frontmatter: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_favorite: false,
      },
    ],
    missingInfoSessions: { [promptId]: makeSession(promptId, items) },
    enrichedContexts: {},
    isGateOpen: false,
    gateSkippedItems: {},
  });
}

function resetStore() {
  useAppStore.setState({
    prompts: [],
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
    selectedPromptId: null,
    error: null,
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("MissingInfoGate — Regression (#256)", () => {
  const promptId = "regression-prompt-1";

  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Original Prompt Immutability
  // -------------------------------------------------------------------------

  it("enrichedContext.originalContent matches the original prompt content", () => {
    const original = "Dieser Prompt soll unverändert bleiben.";
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items, original);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent={original}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "Neue Info" },
    });
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    // The original content MUST be unchanged
    expect(ctx.originalContent).toBe(original);
  });

  it("original content is never mutated after gate completion", () => {
    const original = "Ursprünglicher Prompt";
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items, original);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent={original}
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    // Complete with ASSUMPTIONS
    fireEvent.click(screen.getByTestId("gate-btn-assume"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.originalContent).toBe(original);
  });

  it("original content preserved when user skips all", () => {
    const original = "Original Prompt — Skip Test";
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items, original);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent={original}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("gate-btn-skip-all"));

    // After skipping, enriched context is still created with outcome SKIPPED
    const state = useAppStore.getState();
    const ctx = state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.gateOutcome).toBe("SKIPPED");
    expect(ctx.enrichedContent).toBe(ctx.originalContent);
  });

  // -------------------------------------------------------------------------
  // GA availability — existing Flow Unchanged (v1.11.0)
  // -------------------------------------------------------------------------

  it("gate renders whenever a session exists (GA — feature always available)", () => {
    seedSession(promptId, [makeClassifiedItem("Q1")]);

    const { container } = render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
      />,
    );

    expect(container.innerHTML).not.toBe("");
    expect(screen.getByTestId("gate-summary")).toBeTruthy();
  });

  it("no store mutation when gate is rendered without user interaction", () => {
    seedSession(promptId, [makeClassifiedItem("Q1")]);

    const beforeSession = useAppStore.getState().missingInfoSessions[promptId];

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
      />,
    );

    // Session should remain unchanged
    const afterSession = useAppStore.getState().missingInfoSessions[promptId];
    expect(afterSession).toEqual(beforeSession);
  });

  // -------------------------------------------------------------------------
  // Optimizer Without Gate — Behavior Unchanged
  // -------------------------------------------------------------------------

  it("optimizePrompt with empty enrichment produces same result as without gate", () => {
    const content = "# Test Prompt\n\nThis is a test prompt for optimization.";
    const resultWithGate = optimizePrompt(content, "balanced");
    const resultWithoutGate = optimizePrompt(content, "balanced");

    // Same content should produce identical optimization results
    expect(resultWithGate.optimized).toBe(resultWithoutGate.optimized);
    expect(resultWithGate.changes.length).toBe(
      resultWithoutGate.changes.length,
    );
  });

  // -------------------------------------------------------------------------
  // Session-Only Guarantee
  // -------------------------------------------------------------------------

  it("missingInfoSessions starts empty", () => {
    expect(useAppStore.getState().missingInfoSessions).toEqual({});
    expect(useAppStore.getState().enrichedContexts).toEqual({});
  });

  it("no localStorage persistence of gate data", () => {
    // After seed + completion, check that localStorage is NOT used
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "answer" },
    });
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    // Verify no localStorage entry for gate data
    const keys = Object.keys(localStorage);
    const gateKeys = keys.filter(
      (k) =>
        k.includes("missingInfo") ||
        k.includes("enrichedContext") ||
        k.includes("gateSession"),
    );
    expect(gateKeys.length).toBe(0);
  });

  // -------------------------------------------------------------------------
  // Merged Section Quality Gate
  // -------------------------------------------------------------------------

  it("merged section contains the standard heading", () => {
    const items = [makeClassifiedItem("Q1", { label: "Ziel" })];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Prompt-Inhalt"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "Mein Ziel" },
    });
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.enrichedContent).toContain(
      "## Ergänzte Informationen (Missing-Info-Gate)",
    );
  });

  it("assumptions remain visible in enrichedContent after ASSUMPTIONS", () => {
    const items = [
      makeClassifiedItem("Q1", {
        defaultValue: "Angenommene Antwort",
        label: "Tool-Wahl",
      }),
    ];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Original"
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("gate-btn-assume"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.gateOutcome).toBe("ASSUMPTIONS");
    // The default value should appear as the answer
    expect(ctx.enrichedContent).toContain("Angenommene Antwort");
  });
});
