// =============================================================================
// PromptVault Lite — VariantPanel GA Contract Tests (#295)
// =============================================================================
// Component-level GA tests:
//   - variant result cards show the "✏️ Übernehmen" (apply-to-editor) button
//   - clicking it applies the variant to the editor via applyVariantToEditor
//   - BLOCKING-conflict variants disable the apply button (same rule as Save)
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { useAppStore } from "@/stores/appStore";
import { VariantPanel } from "../VariantPanel";
import { contentFingerprint } from "@/observability/redaction";
import type {
  PromptItem,
  DirectionProfileId,
  PromptVariant,
} from "@/types";

// =============================================================================
// Mocks
// =============================================================================

// variantGenerator — controlled per test via vi.hoisted
const { mockGenerateVariants } = vi.hoisted(() => ({
  mockGenerateVariants: vi.fn(),
}));

vi.mock("@/lib/variantGenerator", () => ({
  generateVariants: mockGenerateVariants,
  applyDirectionProfile: vi.fn((content: string) => content),
  mapToPromptVariant: vi.fn(),
  DIRECTION_PROFILES: [],
}));

// =============================================================================
// Helpers
// =============================================================================

const PANEL_SOURCE = "Du bist ein hilfreicher Assistent.";

function makePrompt(id: string, content: string = PANEL_SOURCE): PromptItem {
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

function makeTestVariant(
  variantId: string,
  profileId: string,
  label: string,
  conflicts: PromptVariant["conflicts"] = [],
): PromptVariant {
  return {
    variantId,
    profileId,
    label,
    content: `[${profileId}] Varianten-Inhalt für ${label}.`,
    directionExplanation: `Richtung: ${label}`,
    preservedConstraints: [],
    conflicts,
    assumptions: ["Annahme 1"],
    openPoints: [],
    recommendation: `Empfohlen für ${label}.`,
    metadata: {
      generatedAt: new Date().toISOString(),
      sourceContent: "original",
      appliedProfileId: profileId,
    },
  };
}

function makeBlockingConflict(): PromptVariant["conflicts"][number] {
  return {
    id: "BC_GA_1",
    profileId: "deep_research",
    constraint: {
      id: "HC_OFFLINE",
      constraintText: "Keine Cloud verwenden",
      category: "offline_only",
      severity: "hard",
      position: { line: 1, column: 1 },
    },
    description: "BLOCKING: Profil verletzt Offline-Constraint.",
    severity: "blocking",
    resolution: "constraint_preserved",
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
    promptEditor: null,
  });
}

function renderPanel() {
  return render(
    <VariantPanel
      promptId="test-prompt-1"
      sourceContent={PANEL_SOURCE}
      enrichedContentUsed={false}
      onClose={vi.fn()}
    />,
  );
}

/** Seed prompt + selected profiles + generator result, then reach results phase. */
async function reachResultsPhase(
  variants: PromptVariant[],
  seedPromptContent: string = PANEL_SOURCE,
) {
  useAppStore.setState({
    selectedProfileIds: ["sachlich"] as DirectionProfileId[],
  });
  useAppStore.setState((state) => ({
    prompts: [...state.prompts, makePrompt("test-prompt-1", seedPromptContent)],
  }));

  mockGenerateVariants.mockReturnValue({
    sourceContent: seedPromptContent,
    enrichedContentUsed: false,
    sourceFingerprint: contentFingerprint(seedPromptContent),
    variants,
    profileConflicts: [],
    appliedAt: new Date().toISOString(),
  });

  renderPanel();

  fireEvent.click(screen.getByTestId("variant-generate-btn"));

  await waitFor(() => {
    expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
  });
}

// =============================================================================
// Tests
// =============================================================================

describe("VariantPanel — GA Apply-to-Editor (#295)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows a ✏️ Übernehmen button on each variant card", async () => {
    await reachResultsPhase([
      makeTestVariant("VAR_GA_1", "sachlich", "Sachlich / Neutral"),
      makeTestVariant("VAR_GA_2", "technisch", "Technisch / Präzise"),
    ]);

    const apply1 = screen.getByTestId("variant-apply-btn-VAR_GA_1");
    const apply2 = screen.getByTestId("variant-apply-btn-VAR_GA_2");
    expect(apply1).toBeInTheDocument();
    expect(apply2).toBeInTheDocument();
    expect(apply1.getAttribute("aria-label")).toBe(
      "Variante im Editor übernehmen",
    );
    expect(apply1.textContent).toContain("Übernehmen");
    expect(apply1).not.toBeDisabled();
  });

  it("clicking Übernehmen applies the variant to the editor and closes the panel", async () => {
    const variant = makeTestVariant("VAR_GA_3", "sachlich", "Sachlich / Neutral");
    await reachResultsPhase([variant]);

    fireEvent.click(screen.getByTestId("variant-apply-btn-VAR_GA_3"));

    const state = useAppStore.getState();
    expect(state.promptEditor).not.toBeNull();
    expect(state.promptEditor?.mode).toBe("edit");
    expect(state.promptEditor?.content).toBe(variant.content);
    expect(state.promptEditor?.isDirty).toBe(true);
    expect(state.showVariantPanel).toBe(false);
    expect(state.activeVariantPromptId).toBeNull();
  });

  it("disables Übernehmen for BLOCKING-conflict variants (same rule as Save)", async () => {
    await reachResultsPhase([
      makeTestVariant(
        "VAR_GA_BLOCK",
        "deep_research",
        "Deep Research",
        [makeBlockingConflict()],
      ),
      makeTestVariant("VAR_GA_OK", "sachlich", "Sachlich / Neutral"),
    ]);

    const blockedBtn = screen.getByTestId("variant-apply-btn-VAR_GA_BLOCK");
    const okBtn = screen.getByTestId("variant-apply-btn-VAR_GA_OK");
    expect(blockedBtn).toBeDisabled();
    expect(okBtn).not.toBeDisabled();

    // Clicking a disabled button must not apply anything.
    fireEvent.click(blockedBtn);
    const state = useAppStore.getState();
    expect(state.promptEditor).toBeNull();
  });

  it("apply button is keyboard-reachable (native button element)", async () => {
    await reachResultsPhase([
      makeTestVariant("VAR_GA_4", "sachlich", "Sachlich / Neutral"),
    ]);

    const applyBtn = screen.getByTestId("variant-apply-btn-VAR_GA_4");
    // Native <button> — keyboard reachable by default
    expect(applyBtn.tagName).toBe("BUTTON");
  });
});
