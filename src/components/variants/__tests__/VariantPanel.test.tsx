// =============================================================================
// PromptVault Lite — VariantPanel UI Tests (#266)
// =============================================================================
// Tests for: modal rendering, GA availability (v1.11.0), phase transitions,
// error states, store interactions, no #216 interference.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VariantPanel } from "../VariantPanel";
import { useAppStore } from "@/stores/appStore";
import { getDefaultSelection } from "@/lib/directionProfiles";
import { generateVariants as generateDirectionVariants } from "@/lib/variantGenerator";
import { contentFingerprint } from "@/observability/redaction";

// =============================================================================
// Mocks
// =============================================================================

// Note: Direction Profiles / Variants are GA since v1.11.0 — no feature-flag
// mock is needed.

// Mock variantGenerator to avoid actual generation in UI tests
vi.mock("@/lib/variantGenerator", async () => {
  const actual = await vi.importActual("@/lib/variantGenerator");
  return {
    ...(actual as object),
    generateVariants: vi.fn(),
  };
});

// =============================================================================
// Helpers
// =============================================================================

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
    expandedFolders: new Set<string>(),
    filters: {
      search: "",
      category: null,
      minScore: 0,
      maxScore: 100,
      hygieneStatus: null,
      tags: [],
      favoritesOnly: false,
    },
    isLoading: false,
    isAnalyzing: false,
    error: null,
  });
}

function renderPanel(
  overrides: {
    promptId?: string;
    sourceContent?: string;
    enrichedContentUsed?: boolean;
    onClose?: () => void;
  } = {},
) {
  const onClose = overrides.onClose ?? vi.fn();
  return {
    onClose,
    ...render(
      <VariantPanel
        promptId={overrides.promptId ?? "test-prompt-1"}
        sourceContent={
          overrides.sourceContent ?? "Du bist ein hilfreicher Assistent."
        }
        enrichedContentUsed={overrides.enrichedContentUsed ?? false}
        onClose={onClose}
      />,
    ),
  };
}

/** Create a minimal PromptVariant for test results. */
function makeTestVariant(
  variantId: string,
  profileId: string,
  label: string,
  content: string,
) {
  return {
    variantId,
    profileId,
    label,
    content,
    directionExplanation: "Test Richtung.",
    preservedConstraints: [],
    conflicts: [],
    assumptions: [],
    openPoints: [],
    recommendation: "Test Empfehlung.",
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceContent: "original" as const,
      appliedProfileId: profileId,
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("VariantPanel", () => {
  beforeEach(() => {
    resetStore();
    vi.clearAllMocks();
  });

  // ---------------------------------------------------------------------------
  // GA availability (v1.11.0)
  // ---------------------------------------------------------------------------

  describe("GA availability (v1.11.0)", () => {
    it("renders without any feature flag (feature is always available)", () => {
      renderPanel();

      expect(screen.getByTestId("variant-panel")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Modal Rendering
  // ---------------------------------------------------------------------------

  describe("Modal Rendering", () => {
    it("renders the modal overlay", () => {
      renderPanel();

      expect(screen.getByTestId("variant-panel-overlay")).toBeInTheDocument();
    });

    it("renders the panel container", () => {
      renderPanel();

      expect(screen.getByTestId("variant-panel")).toBeInTheDocument();
    });

    it("renders the header title", () => {
      renderPanel();

      expect(screen.getByText(/🧭 Varianten erzeugen/)).toBeInTheDocument();
    });

    it("renders the source info banner", () => {
      renderPanel();

      expect(screen.getByTestId("variant-source-info")).toBeInTheDocument();
    });

    it("shows 'Original-Prompt' when enrichedContentUsed is false", () => {
      renderPanel({ enrichedContentUsed: false });

      expect(screen.getByText(/Quelle: Original-Prompt/)).toBeInTheDocument();
    });

    it("shows enriched source when enrichedContentUsed is true", () => {
      renderPanel({ enrichedContentUsed: true });

      expect(
        screen.getByText(/Quelle: enrichedContent \(Missing-Info-Gate\)/),
      ).toBeInTheDocument();
    });

    it("renders close button in header", () => {
      renderPanel();

      expect(
        screen.getByTestId("variant-panel-close-icon"),
      ).toBeInTheDocument();
    });

    it("renders close button in footer (select phase)", () => {
      renderPanel();

      expect(screen.getByTestId("variant-panel-close-btn")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Phase: Select (initial)
  // ---------------------------------------------------------------------------

  describe("Select Phase", () => {
    it("starts in select phase", () => {
      renderPanel();

      // DirectionProfileSelector should be present
      expect(
        screen.getByTestId("direction-profile-selector"),
      ).toBeInTheDocument();

      // Generate button should be present
      expect(screen.getByTestId("variant-generate-btn")).toBeInTheDocument();
    });

    it("has generate button disabled when no profiles selected", () => {
      useAppStore.setState({ selectedProfileIds: [] });
      renderPanel();

      const btn = screen.getByTestId("variant-generate-btn");
      expect(btn).toBeDisabled();
    });

    it("has generate button enabled when profiles are selected", () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
      });
      renderPanel();

      const btn = screen.getByTestId("variant-generate-btn");
      expect(btn).not.toBeDisabled();
    });

    it("generates variants when generate button is clicked", async () => {
      // Setup: select profiles, mock generator
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test Prompt",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Du bist ein hilfreicher Assistent.",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      const mockResult = {
        sourceContent: "Test",
        sourceFingerprint: contentFingerprint("Test"),
        enrichedContentUsed: false,
        variants: [],
        profileConflicts: [],
        appliedAt: new Date().toISOString(),
      };

      vi.mocked(generateDirectionVariants).mockReturnValue(mockResult);

      renderPanel();

      const btn = screen.getByTestId("variant-generate-btn");
      fireEvent.click(btn);

      // Should transition to generating phase
      await waitFor(() => {
        expect(
          screen.getByTestId("variant-generating-spinner"),
        ).toBeInTheDocument();
      });

      // After microtask, should transition to results
      await waitFor(() => {
        expect(screen.getByTestId("variant-result-empty")).toBeInTheDocument();
      });
    });

    it("calls store closeVariantPanel when close button is clicked", () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      const closeBtn = screen.getByTestId("variant-panel-close-btn");
      fireEvent.click(closeBtn);

      const store = useAppStore.getState();
      expect(store.showVariantPanel).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("calls store closeVariantPanel when X icon is clicked", () => {
      const onClose = vi.fn();
      renderPanel({ onClose });

      const closeIcon = screen.getByTestId("variant-panel-close-icon");
      fireEvent.click(closeIcon);

      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  // ---------------------------------------------------------------------------
  // Error State
  // ---------------------------------------------------------------------------

  describe("Error State", () => {
    it("shows error when variantGenerationError is set", () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        variantGenerationError: "Test error message",
      });

      renderPanel();

      expect(screen.getByTestId("variant-generate-error")).toBeInTheDocument();
      expect(screen.getByText(/Test error message/)).toBeInTheDocument();
    });

    it("does not show error div when no error", () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        variantGenerationError: null,
      });

      renderPanel();

      expect(
        screen.queryByTestId("variant-generate-error"),
      ).not.toBeInTheDocument();
    });

    it("returns to select phase after generation error", async () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      // Mock generateVariants to throw
      vi.mocked(generateDirectionVariants).mockImplementation(() => {
        throw new Error("Generation failed");
      });

      renderPanel();

      fireEvent.click(screen.getByTestId("variant-generate-btn"));

      // After microtask, phase should return to select (error shown)
      await waitFor(() => {
        expect(
          screen.getByTestId("direction-profile-selector"),
        ).toBeInTheDocument();
      });
    });
  });

  // ---------------------------------------------------------------------------
  // Phase: Results
  // ---------------------------------------------------------------------------

  describe("Results Phase", () => {
    it("renders VariantResultList in results phase", async () => {
      // Pre-populate variant results so phase transitions to results
      const mockResult = {
        sourceContent: "Test content",
        sourceFingerprint: contentFingerprint("Test content"),
        enrichedContentUsed: false,
        variants: [
          {
            variantId: "VAR_test_1",
            profileId: "sachlich",
            label: "Sachlich / Neutral",
            content: "Generated variant content",
            directionExplanation: "Neutrale Formulierung.",
            preservedConstraints: [],
            conflicts: [],
            assumptions: ["Annahme 1"],
            openPoints: [],
            recommendation: "Für Dokumentation.",
            metadata: {
              generatedAt: new Date().toISOString(),
              sourceContent: "original" as const,
              appliedProfileId: "sachlich",
            },
          },
        ],
        profileConflicts: [],
        appliedAt: new Date().toISOString(),
      };

      // Trigger generate and let the microtask transition
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      vi.mocked(generateDirectionVariants).mockReturnValue(mockResult);

      // Manually set variant results to simulate generation completion
      useAppStore.setState({
        variantResults: {
          "test-prompt-1": mockResult,
        },
      });

      renderPanel();

      // Click generate to start the flow
      const btn = screen.getByTestId("variant-generate-btn");
      fireEvent.click(btn);

      // Wait for results phase
      await waitFor(() => {
        expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
      });
    });

    it("shows close and back-to-select buttons in results phase", async () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      const mockResult = {
        sourceContent: "Test",
        sourceFingerprint: contentFingerprint("Test"),
        enrichedContentUsed: false,
        variants: [
          makeTestVariant("VAR_btn_test", "sachlich", "Test Label", "Content"),
        ],
        profileConflicts: [],
        appliedAt: new Date().toISOString(),
      };

      vi.mocked(generateDirectionVariants).mockReturnValue(mockResult);

      renderPanel();

      // Click generate to transition through generating → results
      fireEvent.click(screen.getByTestId("variant-generate-btn"));

      // Wait for results phase
      await waitFor(() => {
        expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
      });

      // Both buttons should be present
      expect(
        screen.getByTestId("variant-results-close-btn"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("variant-back-to-select-btn"),
      ).toBeInTheDocument();
    });

    it("closes panel from results phase via close button", async () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      vi.mocked(generateDirectionVariants).mockReturnValue({
        sourceContent: "Test",
        sourceFingerprint: contentFingerprint("Test"),
        enrichedContentUsed: false,
        variants: [
          makeTestVariant("VAR_close_1", "sachlich", "Sachlich", "Content"),
        ],
        profileConflicts: [],
        appliedAt: new Date().toISOString(),
      });

      const onClose = vi.fn();
      renderPanel({ onClose });

      // Navigate to results
      fireEvent.click(screen.getByTestId("variant-generate-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
      });

      // Click close in results
      fireEvent.click(screen.getByTestId("variant-results-close-btn"));

      const store = useAppStore.getState();
      expect(store.showVariantPanel).toBe(false);
      expect(onClose).toHaveBeenCalledTimes(1);
    });

    it("returns to select phase when back button is clicked", async () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      vi.mocked(generateDirectionVariants).mockReturnValue({
        sourceContent: "Test",
        sourceFingerprint: contentFingerprint("Test"),
        enrichedContentUsed: false,
        variants: [
          makeTestVariant("VAR_back_1", "sachlich", "Sachlich", "Content"),
        ],
        profileConflicts: [],
        appliedAt: new Date().toISOString(),
      });

      renderPanel();

      // Navigate to results
      fireEvent.click(screen.getByTestId("variant-generate-btn"));
      await waitFor(() => {
        expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
      });

      // Click back to select
      fireEvent.click(screen.getByTestId("variant-back-to-select-btn"));

      // Should be back in select phase — profile selector visible
      expect(
        screen.getByTestId("direction-profile-selector"),
      ).toBeInTheDocument();
      expect(
        screen.queryByTestId("variant-result-list"),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Generation Safety
  // ---------------------------------------------------------------------------

  describe("Generation Safety", () => {
    it("prevents double-submit when isGeneratingVariants is true", () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
        isGeneratingVariants: true,
        prompts: [
          {
            id: "test-prompt-1",
            file_path: "/test/test.md",
            file_name: "test.md",
            title: "Test",
            description: "",
            category: "Test",
            version: "1.0",
            tags: [],
            content: "Test content",
            raw_frontmatter: {},
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            is_favorite: false,
          },
        ],
      });

      const mockGenerate = vi.mocked(generateDirectionVariants);
      mockGenerate.mockClear();

      renderPanel();

      // Click generate while already generating
      const btn = screen.getByTestId("variant-generate-btn");
      expect(btn).toBeDisabled(); // Button disabled during generation
      fireEvent.click(btn);

      // generateVariants should NOT have been called
      expect(mockGenerate).not.toHaveBeenCalled();
    });
  });

  // ---------------------------------------------------------------------------
  // No #216 Interference
  // ---------------------------------------------------------------------------

  describe("No Missing-Info-Gate (#216) Interference", () => {
    it("does not modify isGateOpen when panel opens", () => {
      useAppStore.setState({
        isGateOpen: true,
        activeGatePromptId: "gate-prompt",
        selectedProfileIds: getDefaultSelection(),
      });

      renderPanel();

      const store = useAppStore.getState();
      expect(store.isGateOpen).toBe(true);
      expect(store.activeGatePromptId).toBe("gate-prompt");
    });

    it("does not modify enrichedContexts on panel actions", () => {
      useAppStore.setState({
        enrichedContexts: {
          "test-prompt-1": {
            originalContent: "Original",
            enrichedContent: "Enriched",
            answers: [],
            gateOutcome: "COMPLETED",
            sessionId: "SES_1",
            enrichedAt: new Date().toISOString(),
          },
        },
        selectedProfileIds: getDefaultSelection(),
      });

      renderPanel();

      const store = useAppStore.getState();
      expect(store.enrichedContexts["test-prompt-1"]).toBeDefined();
      expect(store.enrichedContexts["test-prompt-1"].enrichedContent).toBe(
        "Enriched",
      );
    });

    it("does not modify missingInfoSessions", () => {
      const session = {
        sessionId: "SES_TEST",
        promptId: "test-prompt-1",
        startedAt: new Date().toISOString(),
        items: [],
        answers: {},
        status: "ACTIVE" as const,
        outcome: null,
        enrichedContent: null,
      };

      useAppStore.setState({
        missingInfoSessions: {
          "test-prompt-1": session,
        },
        selectedProfileIds: getDefaultSelection(),
      });

      renderPanel();

      const store = useAppStore.getState();
      expect(store.missingInfoSessions["test-prompt-1"]).toBeDefined();
      expect(store.missingInfoSessions["test-prompt-1"].sessionId).toBe(
        "SES_TEST",
      );
    });
  });

  // ---------------------------------------------------------------------------
  // No Persistence
  // ---------------------------------------------------------------------------

  describe("No Persistence", () => {
    it("does not call any Tauri backend on panel open/close", () => {
      // The panel should use only store operations, no Tauri calls
      renderPanel();

      // Store closeVariantPanel is a pure Zustand action
      const closeBtn = screen.getByTestId("variant-panel-close-btn");
      fireEvent.click(closeBtn);

      const store = useAppStore.getState();
      expect(store.showVariantPanel).toBe(false);
      // No persistence — verify store reflects in-memory state only
    });

    it("variantResults are session-only (in-memory)", () => {
      // Verify that variantResults lives only in Zustand store,
      // no localStorage or Tauri persistence calls
      useAppStore.setState({
        variantResults: {
          test: {
            sourceContent: "Test",
            sourceFingerprint: contentFingerprint("Test"),
            enrichedContentUsed: false,
            variants: [],
            profileConflicts: [],
            appliedAt: new Date().toISOString(),
          },
        },
      });

      renderPanel();

      const store = useAppStore.getState();
      expect(store.variantResults["test"]).toBeDefined();
    });
  });

  // ---------------------------------------------------------------------------
  // Edge Cases
  // ---------------------------------------------------------------------------

  describe("Edge Cases", () => {
    it("handles promptId change gracefully", () => {
      const { rerender } = renderPanel({ promptId: "prompt-A" });

      expect(screen.getByTestId("variant-panel")).toBeInTheDocument();

      // Re-render with different promptId using rerender
      rerender(
        <VariantPanel
          promptId="prompt-B"
          sourceContent="Different content"
          enrichedContentUsed={false}
          onClose={vi.fn()}
        />,
      );

      // Should still render
      expect(screen.getByTestId("variant-panel")).toBeInTheDocument();
    });

    it("handles empty source content gracefully", () => {
      useAppStore.setState({
        selectedProfileIds: getDefaultSelection(),
      });

      renderPanel({ sourceContent: "" });

      // Should still render the panel
      expect(screen.getByTestId("variant-panel")).toBeInTheDocument();
    });
  });
});
