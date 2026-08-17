// =============================================================================
// PromptVault Lite — MissingInfoGate Constraint Tests (Batch 6A)
// =============================================================================
// Tests for: Constraint-Konflikte (#255), require_human_approval,
// BLOCKING-Konflikte, resolution flow, enrichedContent after resolution.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissingInfoGate } from "../MissingInfoGate";
import { useAppStore } from "@/stores/appStore";
import type {
  ClassifiedMissingInfo,
  MissingInfoSession,
  MissingInfoCategory,
} from "@/types";

// ---------------------------------------------------------------------------
// Note: The Missing-Info-Gate is GA since v1.11.0 — no feature-flag mock is
// needed; the gate always renders when a session exists.
// ---------------------------------------------------------------------------

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
    sessionId: `CT-${promptId}-99`,
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
  promptContent = "Test constraint prompt content",
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

describe("MissingInfoGate — Constraints (#255)", () => {
  const promptId = "constraint-prompt-1";

  beforeEach(() => {
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Conflict Detection
  // -------------------------------------------------------------------------

  it("shows conflict banner when prompt content triggers a constraint conflict", () => {
    // This prompt constrains cloud usage; we'll set an answer that says "Cloud"
    const items = [makeClassifiedItem("Q1", { tier: "REQUIRED" })];
    seedSession(promptId, items);

    // Pre-seed an answer that conflicts with a cloud constraint
    useAppStore.setState((s) => ({
      missingInfoSessions: {
        ...s.missingInfoSessions,
        [promptId]: {
          ...s.missingInfoSessions[promptId],
          answers: {
            Q1: {
              itemId: "Q1",
              value: "Cloud-LLM für Deep Research nutzen",
              answeredAt: new Date().toISOString(),
            },
          },
        },
      },
    }));

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Keine Cloud verwenden. Lokaler Prompt nur."
        onClose={vi.fn()}
      />,
    );

    // The constraint "Keine Cloud verwenden" should trigger offline_only
    // Check that the conflict banner is shown
    expect(screen.getByTestId("gate-conflict-banner")).toBeTruthy();
    expect(
      screen.getByText(/Konflikte mit bestehenden Constraints/),
    ).toBeTruthy();
  });

  it('disables "Fortfahren" button when conflicts exist', () => {
    const items = [makeClassifiedItem("Q1", { tier: "REQUIRED" })];
    seedSession(promptId, items);

    // Pre-seed a conflict-triggering answer
    useAppStore.setState((s) => ({
      missingInfoSessions: {
        ...s.missingInfoSessions,
        [promptId]: {
          ...s.missingInfoSessions[promptId],
          answers: {
            Q1: {
              itemId: "Q1",
              value: "Cloud-LLM für Deep Research nutzen",
              answeredAt: new Date().toISOString(),
            },
          },
        },
      },
    }));

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Keine Cloud verwenden!"
        onClose={vi.fn()}
      />,
    );

    const proceedBtn = screen.getByTestId("gate-btn-proceed");
    expect(proceedBtn).toBeDisabled();
    expect(proceedBtn.getAttribute("title")).toContain(
      "Konflikte mit bestehenden Constraints",
    );
  });

  it("no conflicts when prompt has no constraints", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Ein einfacher Prompt ohne Einschränkungen."
        onClose={vi.fn()}
      />,
    );

    // Answer the question
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "Beliebige Antwort" },
    });

    // No conflict banner should be visible
    expect(screen.queryByTestId("gate-conflict-banner")).toBeNull();

    // "Fortfahren" should be enabled
    expect(screen.getByTestId("gate-btn-proceed")).not.toBeDisabled();
  });

  it("no conflicts when prompt is empty", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent=""
        onClose={vi.fn()}
      />,
    );

    // Answer the question
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "test" },
    });

    expect(screen.queryByTestId("gate-conflict-banner")).toBeNull();
    expect(screen.getByTestId("gate-btn-proceed")).not.toBeDisabled();
  });

  // -------------------------------------------------------------------------
  // require_human_approval
  // -------------------------------------------------------------------------

  it("shows approval banner when originalContent contains approval constraint", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Menschliche Freigabe erforderlich für diesen Prompt."
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("gate-approval-banner")).toBeTruthy();
    expect(screen.getByText(/Menschliche Freigabe erforderlich/)).toBeTruthy();
  });

  it("does NOT show approval banner when content has no approval constraint", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Ein normaler Prompt ohne Genehmigungspflicht."
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("gate-approval-banner")).toBeNull();
  });

  it("human approval is never automatically resolved", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Menschliche Freigabe erforderlich."
        onClose={vi.fn()}
        onComplete={vi.fn()}
      />,
    );

    // The approval banner should remain visible even after answering
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "answer" },
    });

    expect(screen.getByTestId("gate-approval-banner")).toBeTruthy();

    // Proceeding should still work (approval is informational, not blocking)
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));
  });

  // -------------------------------------------------------------------------
  // Constraint Categories
  // -------------------------------------------------------------------------

  it("offline_only constraint is detected and never auto-resolved", () => {
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    // Seed a cloud-related answer to trigger conflict
    useAppStore.setState((s) => ({
      missingInfoSessions: {
        ...s.missingInfoSessions,
        [promptId]: {
          ...s.missingInfoSessions[promptId],
          answers: {
            Q1: {
              itemId: "Q1",
              value: "Cloud-Dienst nutzen",
              answeredAt: new Date().toISOString(),
            },
          },
        },
      },
    }));

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Nur lokal ausführen, keine Cloud verwenden."
        onClose={vi.fn()}
      />,
    );

    // offline_only constraint should trigger conflict
    expect(screen.getByTestId("gate-conflict-banner")).toBeTruthy();

    // "Fortfahren" should remain disabled (constraint not auto-resolved)
    expect(screen.getByTestId("gate-btn-proceed")).toBeDisabled();
  });

  it("max_length constraint warning is shown but not blocking", () => {
    // max_length constraints generate WARNING severity, not BLOCKING
    const items = [makeClassifiedItem("Q1")];
    seedSession(promptId, items);

    useAppStore.setState((s) => ({
      missingInfoSessions: {
        ...s.missingInfoSessions,
        [promptId]: {
          ...s.missingInfoSessions[promptId],
          answers: {
            Q1: {
              itemId: "Q1",
              value: "Extrem ausführliche Antwort",
              answeredAt: new Date().toISOString(),
            },
          },
        },
      },
    }));

    render(
      <MissingInfoGate
        promptId={promptId}
        originalContent="Maximal 200 Wörter. Kurz halten."
        onClose={vi.fn()}
      />,
    );

    // max_length is a WARNING (soft) — "Fortfahren" may still be enabled
    // depending on constraint severity. Verify conflict banner appears.
    expect(screen.getByTestId("gate-conflict-banner")).toBeTruthy();

    // Answer to satisfy REQUIRED
    fireEvent.change(screen.getByTestId("gate-input-Q1"), {
      target: { value: "short" },
    });

    // After answering, proceed should still be blocked because of
    // the conflicting pre-seeded answer
  });

  // -------------------------------------------------------------------------
  // EnrichedContent with Conflicts
  // -------------------------------------------------------------------------

  it("enrichedContent preserves original prompt text through conflict state", () => {
    const original = "Nur lokal ausführen, max. 200 Wörter.";
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
      target: { value: "eine Antwort" },
    });

    // Since the answer doesn't conflict with the prompt, we can proceed
    fireEvent.click(screen.getByTestId("gate-btn-proceed"));

    const state = useAppStore.getState();

    const ctx = state.enrichedContexts[promptId];
    expect(ctx).toBeDefined();
    // Original content should be preserved
    expect(ctx.originalContent).toBe(original);
    // enrichedContent should contain the original text
    expect(ctx.enrichedContent).toContain(
      "Nur lokal ausführen, max. 200 Wörter.",
    );
  });
});
