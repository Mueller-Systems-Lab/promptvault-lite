// =============================================================================
// PromptVault Lite — MissingInfoGate UI Tests (Batch 4)
// =============================================================================
// Tests for: rendering all input types, max 5 visible REQUIRED,
// "Erweiterte Angaben", button states, edge cases, feature-flag gating.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MissingInfoGate } from "../MissingInfoGate";
import { useAppStore } from "@/stores/appStore";
import type {
  ClassifiedMissingInfo,
  MissingInfoSession,
  MissingInfoAnswer,
  MissingInfoCategory,
} from "@/types";

// ---------------------------------------------------------------------------
// Note: The Missing-Info-Gate is GA since v1.11.0 — no feature-flag mock is
// needed; the gate renders whenever a session exists.
// ---------------------------------------------------------------------------

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

function makeAnswer(itemId: string, value: string): MissingInfoAnswer {
  return {
    itemId,
    value,
    answeredAt: new Date().toISOString(),
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

/**
 * Reset the Zustand store to a clean state before each test.
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
 * Seed the store with a gate session for a promptId.
 */
function seedSession(
  promptId: string,
  items: ClassifiedMissingInfo[],
  overrides: Partial<MissingInfoSession> = {},
) {
  const session = makeSession(promptId, items, overrides);
  useAppStore.setState({
    missingInfoSessions: { [promptId]: session },
    isGateOpen: true,
    activeGatePromptId: promptId,
    gateSkippedItems: { [promptId]: [] },
  });
}

/**
 * Get a session from the store for assertions.
 */
function getSession(promptId: string): MissingInfoSession | undefined {
  return useAppStore.getState().missingInfoSessions[promptId];
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("MissingInfoGate", () => {
  const promptId = "test-prompt-1";
  const onClose = vi.fn();
  const onComplete = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // ==========================================================================
  // Rendering
  // ==========================================================================

  describe("rendering", () => {
    it("renders the modal with header when session exists", () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(
        screen.getByRole("heading", { name: /Fehlende Informationen/i }),
      ).toBeTruthy();
    });

    it("renders REQUIRED badge on required items", () => {
      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByText("REQUIRED")).toBeTruthy();
    });

    it("renders summary with required count", () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", { tier: "REQUIRED" }),
        makeClassifiedItem("Q2", { tier: "REQUIRED" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-summary")).toBeTruthy();
      expect(screen.getByText(/2 Fragen müssen beantwortet/)).toBeTruthy();
    });

    it("renders singular summary when only 1 required question", () => {
      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByText(/1 Frage muss beantwortet/)).toBeTruthy();
    });

    it("renders RECOMMENDED items under advanced section", () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", { tier: "REQUIRED" }),
        makeClassifiedItem("Q2", { tier: "RECOMMENDED" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      // Advanced section should exist
      expect(screen.getByTestId("gate-advanced-section")).toBeTruthy();
      // Toggle it open
      fireEvent.click(screen.getByTestId("gate-toggle-advanced"));
      // Now the RECOMMENDED item should be visible
      expect(screen.getByTestId("gate-question-Q2")).toBeTruthy();
    });

    it("renders OPTIONAL items under advanced section when expanded", () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", { tier: "REQUIRED" }),
        makeClassifiedItem("Q2", { tier: "OPTIONAL" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      fireEvent.click(screen.getByTestId("gate-toggle-advanced"));
      expect(screen.getByTestId("gate-question-Q2")).toBeTruthy();
    });
  });

  // ==========================================================================
  // Max 5 REQUIRED Visible
  // ==========================================================================

  describe("max 5 visible REQUIRED", () => {
    it("shows exactly 5 REQUIRED items when 6 or more exist", () => {
      const items: ClassifiedMissingInfo[] = [];
      for (let i = 1; i <= 7; i++) {
        items.push(makeClassifiedItem(`RQ${i}`, { tier: "REQUIRED" }));
      }
      // Also add a RECOMMENDED item to verify it's separate
      items.push(makeClassifiedItem("RM1", { tier: "RECOMMENDED" }));

      seedSession(promptId, items);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      // First 5 REQUIRED should be directly visible
      expect(screen.getByTestId("gate-question-RQ1")).toBeTruthy();
      expect(screen.getByTestId("gate-question-RQ5")).toBeTruthy();

      // Overflow toggle should exist
      expect(screen.getByTestId("gate-toggle-overflow")).toBeTruthy();
      expect(screen.getByText(/Weitere erforderliche Angaben/)).toBeTruthy();
    });

    it("shows overflow REQUIRED when toggled", () => {
      const items: ClassifiedMissingInfo[] = [];
      for (let i = 1; i <= 7; i++) {
        items.push(makeClassifiedItem(`RQ${i}`, { tier: "REQUIRED" }));
      }
      seedSession(promptId, items);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      // RQ6 and RQ7 should NOT be visible until toggle
      expect(screen.queryByTestId("gate-question-RQ6")).toBeNull();

      // Toggle overflow
      fireEvent.click(screen.getByTestId("gate-toggle-overflow"));

      // Now RQ6 and RQ7 should be visible
      expect(screen.getByTestId("gate-question-RQ6")).toBeTruthy();
      expect(screen.getByTestId("gate-question-RQ7")).toBeTruthy();
    });
  });

  // ==========================================================================
  // Input Types
  // ==========================================================================

  describe("input types", () => {
    it("renders free_text input and accepts text", () => {
      seedSession(promptId, [
        makeClassifiedItem("FT", {
          inputType: "free_text",
          placeholder: "Gib etwas ein",
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      const input = screen.getByTestId("gate-input-FT");
      expect(input).toBeInstanceOf(HTMLInputElement);
      expect((input as HTMLInputElement).type).toBe("text");

      fireEvent.change(input, { target: { value: "Meine Antwort" } });
      expect((input as HTMLInputElement).value).toBe("Meine Antwort");

      // Verify store was updated
      const session = getSession(promptId);
      expect(session?.answers["FT"]?.value).toBe("Meine Antwort");
    });

    it("renders free_multiline textarea and accepts multi-line input", () => {
      seedSession(promptId, [
        makeClassifiedItem("ML", { inputType: "free_multiline" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      const textarea = screen.getByTestId("gate-input-ML");
      expect(textarea).toBeInstanceOf(HTMLTextAreaElement);

      fireEvent.change(textarea, {
        target: { value: "Zeile 1\nZeile 2" },
      });
      expect((textarea as HTMLTextAreaElement).value).toBe("Zeile 1\nZeile 2");
    });

    it("renders single_select dropdown and allows selection", () => {
      seedSession(promptId, [
        makeClassifiedItem("SS", {
          inputType: "single_select",
          options: ["Option A", "Option B", "Option C"],
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      const select = screen.getByTestId("gate-input-SS");
      expect(select).toBeInstanceOf(HTMLSelectElement);

      fireEvent.change(select, { target: { value: "Option B" } });
      expect((select as HTMLSelectElement).value).toBe("Option B");

      const session = getSession(promptId);
      expect(session?.answers["SS"]?.value).toBe("Option B");
    });

    it("renders multi_select checkboxes and allows multiple selections", () => {
      seedSession(promptId, [
        makeClassifiedItem("MS", {
          inputType: "multi_select",
          options: ["Rot", "Grün", "Blau"],
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      const checkboxes = screen
        .getByTestId("gate-input-MS")
        .querySelectorAll('input[type="checkbox"]');
      expect(checkboxes.length).toBe(3);

      // Select "Rot" and "Blau"
      fireEvent.click(checkboxes[0]);
      fireEvent.click(checkboxes[2]);

      const session = getSession(promptId);
      expect(session?.answers["MS"]?.value).toContain("Rot");
      expect(session?.answers["MS"]?.value).toContain("Blau");
    });

    it("renders boolean toggle (Ja/Nein radios)", () => {
      seedSession(promptId, [
        makeClassifiedItem("BOOL", { inputType: "boolean" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      const container = screen.getByTestId("gate-input-BOOL");
      const jaRadio = container.querySelector('input[value="Ja"]');
      const neinRadio = container.querySelector('input[value="Nein"]');

      expect(jaRadio).toBeTruthy();
      expect(neinRadio).toBeTruthy();
      expect(jaRadio).toBeInstanceOf(HTMLInputElement);
      expect(neinRadio).toBeInstanceOf(HTMLInputElement);

      fireEvent.click(jaRadio as Element);
      expect((jaRadio as HTMLInputElement).checked).toBe(true);

      const session = getSession(promptId);
      expect(session?.answers["BOOL"]?.value).toBe("Ja");
    });
  });

  // ==========================================================================
  // Skip Behavior
  // ==========================================================================

  describe("skip behavior", () => {
    it("allows skipping RECOMMENDED items", () => {
      seedSession(promptId, [
        makeClassifiedItem("RQ", { tier: "REQUIRED" }),
        makeClassifiedItem("RM", { tier: "RECOMMENDED" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      // Open advanced section to see RECOMMENDED
      fireEvent.click(screen.getByTestId("gate-toggle-advanced"));

      const skipBtn = screen.getByTestId("gate-skip-RM");
      fireEvent.click(skipBtn);

      // Item should now show as skipped
      expect(screen.getByText("Diese Frage wurde übersprungen.")).toBeTruthy();
    });

    it("allows skipping OPTIONAL items", () => {
      seedSession(promptId, [
        makeClassifiedItem("RQ", { tier: "REQUIRED" }),
        makeClassifiedItem("OP", { tier: "OPTIONAL" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByTestId("gate-toggle-advanced"));

      const skipBtn = screen.getByTestId("gate-skip-OP");
      fireEvent.click(skipBtn);

      expect(screen.getByText("Diese Frage wurde übersprungen.")).toBeTruthy();
    });

    it("does NOT show skip button for REQUIRED items", () => {
      seedSession(promptId, [makeClassifiedItem("RQ", { tier: "REQUIRED" })]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      expect(screen.queryByTestId("gate-skip-RQ")).toBeNull();
    });
  });

  // ==========================================================================
  // Action Buttons
  // ==========================================================================

  describe("action buttons", () => {
    it('"Angaben übernehmen" is disabled when REQUIRED questions are unanswered', () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", { tier: "REQUIRED" }),
        makeClassifiedItem("Q2", { tier: "REQUIRED" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      const proceedBtn = screen.getByTestId("gate-btn-proceed");
      expect(proceedBtn).toBeDisabled();
    });

    it('"Angaben übernehmen" is enabled when all REQUIRED are answered', () => {
      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })], {
        answers: { Q1: makeAnswer("Q1", "Antwort") },
      });
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      const proceedBtn2 = screen.getByTestId("gate-btn-proceed");
      expect(proceedBtn2).not.toBeDisabled();
    });

    it('"Alle überspringen" calls onClose and completeGate with SKIPPED', () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
          onComplete={onComplete}
        />,
      );

      fireEvent.click(screen.getByTestId("gate-btn-skip-all"));

      expect(onComplete).toHaveBeenCalledWith("SKIPPED");
      expect(onClose).toHaveBeenCalled();
    });

    it('"Mit Annahmen fortfahren" fills defaults and completes with ASSUMPTIONS', () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", {
          tier: "REQUIRED",
          defaultValue: "Standard-Antwort",
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
          onComplete={onComplete}
        />,
      );

      fireEvent.click(screen.getByTestId("gate-btn-assume"));

      // Session should be updated with default value
      const session = getSession(promptId);
      expect(session?.answers["Q1"]?.value).toBe("Standard-Antwort");
      expect(onComplete).toHaveBeenCalledWith("ASSUMPTIONS");
      expect(onClose).toHaveBeenCalled();
    });

    it('"Abbrechen" calls onClose', () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      fireEvent.click(screen.getByTestId("gate-btn-cancel"));
      expect(onClose).toHaveBeenCalled();
    });
  });

  // ==========================================================================
  // Edge Cases
  // ==========================================================================

  describe("edge cases", () => {
    it("renders empty state when no items in session", () => {
      seedSession(promptId, []);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-no-items")).toBeTruthy();
      expect(
        screen.getByText("Keine fehlenden Informationen erkannt."),
      ).toBeTruthy();
    });

    it("renders empty state when no session exists", () => {
      // Don't seed any session — let the component use default store state
      useAppStore.setState({
        isGateOpen: true,
        activeGatePromptId: promptId,
      });
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-empty-session")).toBeTruthy();
      expect(screen.getByText("Keine Analyse-Daten vorhanden.")).toBeTruthy();
    });

    it("renders minimal gate when only OPTIONAL items exist", () => {
      seedSession(promptId, [
        makeClassifiedItem("OP1", { tier: "OPTIONAL" }),
        makeClassifiedItem("OP2", { tier: "OPTIONAL" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-optional-only")).toBeTruthy();
      expect(screen.getByText(/nur optionale Verbesserungen/)).toBeTruthy();
    });

    it('shows "Erweiterte Angaben" for RECOMMENDED + OPTIONAL items behind toggle', () => {
      seedSession(promptId, [
        makeClassifiedItem("RQ", { tier: "REQUIRED" }),
        makeClassifiedItem("RM", { tier: "RECOMMENDED" }),
        makeClassifiedItem("OP", { tier: "OPTIONAL" }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      // Advanced section should be collapsed initially
      expect(screen.getByTestId("gate-toggle-advanced")).toBeTruthy();
      expect(screen.queryByTestId("gate-question-RM")).toBeNull();
      expect(screen.queryByTestId("gate-question-OP")).toBeNull();

      // Expand
      fireEvent.click(screen.getByTestId("gate-toggle-advanced"));
      expect(screen.getByTestId("gate-question-RM")).toBeTruthy();
      expect(screen.getByTestId("gate-question-OP")).toBeTruthy();
    });

    it("shows human approval banner when relevant item exists", () => {
      seedSession(promptId, [
        makeClassifiedItem("APPROVAL", {
          tier: "REQUIRED",
          label: "Keine menschliche Freigabe definiert",
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="Menschliche Freigabe erforderlich für diesen Prompt."
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-approval-banner")).toBeTruthy();
      expect(
        screen.getByText(/Menschliche Freigabe erforderlich/),
      ).toBeTruthy();
    });

    it("renders the gate whenever a session exists (GA — no feature flag)", () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      const { container } = render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      // GA: the gate renders — the feature is always available.
      expect(screen.getByTestId("gate-summary")).toBeTruthy();
      expect(container.innerHTML).not.toBe("");
    });

    it("renders rationale text for each question", () => {
      seedSession(promptId, [
        makeClassifiedItem("Q1", {
          rationale: "Begründung für Testfrage 1",
        }),
      ]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-rationale-Q1")).toBeTruthy();
      expect(screen.getByText("Begründung für Testfrage 1")).toBeTruthy();
    });

    it("shows session status notice when status is not ACTIVE", () => {
      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })], {
        status: "COMPLETED",
      });
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByTestId("gate-status-notice")).toBeTruthy();
      expect(screen.getByText(/COMPLETED/)).toBeTruthy();
    });

    it("does not mutate original prompt content (store separation)", () => {
      const originalContent = "# Original Prompt\n\nUnverändert.";
      useAppStore.setState({
        prompts: [
          {
            id: promptId,
            file_path: "/test/prompt.md",
            file_name: "prompt.md",
            title: "Test Prompt",
            description: "",
            category: "test",
            version: "1.0",
            tags: [],
            content: originalContent,
            raw_frontmatter: {},
            created_at: "2026-01-01T00:00:00Z",
            updated_at: "2026-01-01T00:00:00Z",
            is_favorite: false,
          },
        ],
      });

      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );

      // Type an answer
      const input = screen.getByTestId("gate-input-Q1");
      fireEvent.change(input, { target: { value: "Meine Antwort" } });

      // Original prompt must remain unchanged
      const state = useAppStore.getState();
      const prompt = state.prompts.find((p) => p.id === promptId);
      expect(prompt?.content).toBe(originalContent);
    });
  });

  // ==========================================================================
  // Accessibility
  // ==========================================================================

  describe("accessibility", () => {
    it("has dialog role and aria-label", () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      const dialog = screen.getByRole("dialog");
      expect(dialog).toBeTruthy();
      expect(dialog.getAttribute("aria-label")).toBe("Fehlende Informationen");
    });

    it("close button has accessible label", () => {
      seedSession(promptId, [makeClassifiedItem("Q1")]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      expect(screen.getByLabelText("Schließen")).toBeTruthy();
    });

    it("proceed button has descriptive title when disabled", () => {
      seedSession(promptId, [makeClassifiedItem("Q1", { tier: "REQUIRED" })]);
      render(
        <MissingInfoGate
          promptId={promptId}
          originalContent="test content"
          onClose={onClose}
        />,
      );
      const btn = screen.getByTestId("gate-btn-proceed");
      expect(btn.getAttribute("title")).toContain("noch nicht beantwortet");
    });
  });
});
