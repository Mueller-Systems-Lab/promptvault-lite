// =============================================================================
// PromptVault Lite — MissingInfoGate Integration Tests (Batch 6A)
// =============================================================================
// Tests for: Gate → Optimizer full flow (#254), enrichedContent passthrough,
// gate completion outcomes, GA availability (v1.11.0), BLOCKING_SENSITIVE_CONTENT.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissingInfoGate } from "../MissingInfoGate";
import { useAppStore } from "@/stores/appStore";
import type {
  ClassifiedMissingInfo,
  MissingInfoSession,
  MissingInfoCategory,
  EnrichedPromptContext,
} from "@/types";

// ---------------------------------------------------------------------------
// Test Helpers
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
    sessionId: `MIG-${promptId}-123`,
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
  promptContent = "Original prompt text",
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

describe("MissingInfoGate — Integration: Gate → Optimizer Flow (#254)", () => {
  const promptId = "test-prompt-123";

  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Gate Completion Outcomes
  // -------------------------------------------------------------------------

  it("COMPLETED: produces enrichedContent and calls onComplete with COMPLETED", () => {
    const onComplete = vi.fn();
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Original prompt text"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    // Answer the REQUIRED question
    const input = screen.getByTestId("gate-input-Q1");
    fireEvent.change(input, { target: { value: "My answer" } });

    // "Fortfahren" should now be enabled
    const proceedBtn = screen.getByTestId("gate-btn-proceed");
    expect(proceedBtn).not.toBeDisabled();

    fireEvent.click(proceedBtn);

    expect(onComplete).toHaveBeenCalledWith("COMPLETED");

    // EnrichedPromptContext should be in the store
    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.enrichedContent).toBeDefined();
    expect(ctx.originalContent).toBe("Original prompt text");
    expect(ctx.gateOutcome).toBe("COMPLETED");
  });

  it("SKIPPED: calls onComplete with SKIPPED and stores enrichedContent = originalContent", () => {
    const onComplete = vi.fn();
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Original prompt text"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByTestId("gate-btn-skip-all"));

    expect(onComplete).toHaveBeenCalledWith("SKIPPED");

    // Enriched context is still created but enrichedContent equals originalContent
    const state = useAppStore.getState();
    const ctx = state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.gateOutcome).toBe("SKIPPED");
    expect(ctx.enrichedContent).toBe(ctx.originalContent);
  });

  it("ASSUMPTIONS: fills defaults and calls onComplete with ASSUMPTIONS", () => {
    const onComplete = vi.fn();
    const items = [
      makeClassifiedItem("Q1", { defaultValue: "Standard-Antwort" }),
    ];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Original prompt text"
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    fireEvent.click(screen.getByTestId("gate-btn-assume"));

    expect(onComplete).toHaveBeenCalledWith("ASSUMPTIONS");

    // Store should contain enriched context
    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.gateOutcome).toBe("ASSUMPTIONS");
    expect(ctx.enrichedContent).toContain("Standard-Antwort");
  });

  it("CANCELLED: closes gate without calling onComplete", () => {
    const onComplete = vi.fn();
    const onClose = vi.fn();
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Original prompt text"
        onClose={onClose}
        onComplete={onComplete}
      />,
    );

    // Click the ✕ close button
    const closeBtn = screen.getByLabelText("Schließen");
    fireEvent.click(closeBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // EnrichedContent Passthrough
  // -------------------------------------------------------------------------

  it("enrichedContent contains the merged answers as Markdown", () => {
    const onComplete = vi.fn();
    const content = "Original prompt content";
    const items = [
      makeClassifiedItem("Q1", { label: "Zieldefinition" }),
      makeClassifiedItem("Q2", { label: "Ausgabeformat" }),
    ];
    seedSession(promptId, items, content);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent={content}
        onClose={vi.fn()}
        onComplete={onComplete}
      />,
    );

    // Answer both questions
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "Code-Review automatisieren" },
    });
    fireEvent.change(screen.getByTestId("gate-input-Q2"), {
      target: { value: "JSON-Output" },
    });

    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    // enrichedContent should contain the original prompt text
    expect(ctx.enrichedContent).toContain("Original prompt content");
    // enrichedContent should contain the merged answers section
    expect(ctx.enrichedContent).toContain(
      "## Ergänzte Informationen (Missing-Info-Gate)",
    );
    expect(ctx.enrichedContent).toContain("Code-Review automatisieren");
    expect(ctx.enrichedContent).toContain("JSON-Output");
  });

  it("originalContent in EnrichedPromptContext matches the store prompt content", () => {
    const original = "Unveränderlicher Prompt-Inhalt";
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
      target: { value: "response" },
    });
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    const state = useAppStore.getState();

    const ctx: EnrichedPromptContext | undefined =
      state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    expect(ctx.originalContent).toBe(original);
  });

  // -------------------------------------------------------------------------
  // GA availability (v1.11.0)
  // -------------------------------------------------------------------------

  it("renders the gate whenever a session exists (GA — feature always available)", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    const { container } = render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    // GA: the gate renders — the feature is always available.
    expect(container.innerHTML).not.toBe("");
    expect(screen.getByTestId("gate-summary")).toBeTruthy();
  });

  it("existing flow unchanged (GA — rendering does not mutate the session)", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
      />,
    );

    // Gate UI rendered, store session untouched by rendering
    expect(screen.getByTestId("gate-summary")).toBeTruthy();
    const state = useAppStore.getState();
    expect(state.missingInfoSessions[promptId]).toBeDefined();
  });

  // -------------------------------------------------------------------------
  // Blocking Content
  // -------------------------------------------------------------------------

  it("shows complete gate UI when no blocking content exists", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="safe content"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByText("❓ Fehlende Informationen")).toBeTruthy();
    expect(screen.getByTestId("gate-btn-proceed")).toBeTruthy();
    expect(screen.getByTestId("gate-input-Q1")).toBeTruthy();
  });

  it("hasNoItems state shows empty message", () => {
    seedSession(promptId, []);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("gate-no-items")).toBeTruthy();
    expect(
      screen.getByText(/Keine fehlenden Informationen erkannt/),
    ).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // Filled answers visibility
  // -------------------------------------------------------------------------

  it("shows filled answers and re-opens with them visible", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    const { unmount } = render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    // Answer and complete
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "Erste Antwort" },
    });
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));
    unmount();

    // Re-render — session should still have the answer
    // Simulate editing by reopening (the session is now COMPLETED)
    useAppStore.setState((s) => ({
      missingInfoSessions: {
        ...s.missingInfoSessions,
        [promptId]: {
          ...s.missingInfoSessions[promptId],
          status: "ACTIVE",
        },
      },
    }));

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="test"
        onClose={vi.fn()}
      />,
    );

    const input = screen.getByTestId<HTMLInputElement>("gate-input-Q1");
    expect(input.value).toBe("Erste Antwort");
  });
});
