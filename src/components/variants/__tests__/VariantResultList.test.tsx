// =============================================================================
// PromptVault Lite — VariantResultList UI Tests (#269)
// =============================================================================
// Tests for: variant card rendering, constraints display, conflict display,
// empty state, action buttons (placeholder), enrichedSource indicator.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantResultList } from "../VariantResultList";
import { useAppStore } from "@/stores/appStore";
import type { PromptVariant } from "@/types";
import type { VariantResultListProps } from "../VariantResultList";

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

function makeVariant(overrides: Partial<PromptVariant> = {}): PromptVariant {
  const id = overrides.variantId ?? "VAR_test_1";
  const profileId = overrides.profileId ?? "sachlich";
  return {
    variantId: id,
    profileId,
    label: overrides.label ?? "Sachlich / Neutral",
    content:
      overrides.content ?? "Du bist ein Assistent.\n\nTest Prompt Content",
    directionExplanation:
      overrides.directionExplanation ?? "Neutrale, objektive Formulierung.",
    preservedConstraints: overrides.preservedConstraints ?? [
      {
        constraintId: "C_1",
        constraintText: "Keine Cloud verwenden",
        category: "offline_only",
        affectedByProfile: false,
      },
    ],
    conflicts: overrides.conflicts ?? [],
    assumptions: overrides.assumptions ?? [
      "Profil-Prefix wurde vorangestellt.",
    ],
    openPoints: overrides.openPoints ?? [],
    recommendation: overrides.recommendation ?? "Empfohlen für Dokumentation.",
    metadata: overrides.metadata ?? {
      generatedAt: new Date().toISOString(),
      sourceContent: "original",
      appliedProfileId: profileId,
    },
  };
}

function renderList(
  variants: PromptVariant[],
  overrides?: Partial<VariantResultListProps>,
) {
  return render(
    <VariantResultList
      variants={variants}
      enrichedContentUsed={overrides?.enrichedContentUsed ?? false}
      sourceContent={
        overrides?.sourceContent ?? "Original source prompt content."
      }
      onCompare={overrides?.onCompare}
      onSave={overrides?.onSave}
      onApply={overrides?.onApply}
    />,
  );
}

// =============================================================================
// Tests
// =============================================================================

describe("VariantResultList", () => {
  beforeEach(() => {
    resetStore();
  });

  // ---------------------------------------------------------------------------
  // Empty State
  // ---------------------------------------------------------------------------

  describe("Empty State", () => {
    it("renders empty state when no variants are provided", () => {
      renderList([]);

      expect(screen.getByTestId("variant-result-empty")).toBeInTheDocument();
      expect(screen.getByText("Keine Varianten erzeugt.")).toBeInTheDocument();
    });

    it("renders empty state with empty array", () => {
      renderList([]);

      expect(screen.getByTestId("variant-result-empty")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Rendering Variants
  // ---------------------------------------------------------------------------

  describe("Rendering Variants", () => {
    it("renders the correct number of variants", () => {
      const variants = [
        makeVariant({ variantId: "VAR_1" }),
        makeVariant({ variantId: "VAR_2" }),
        makeVariant({ variantId: "VAR_3" }),
      ];

      renderList(variants);

      expect(screen.getByTestId("variant-result-list")).toBeInTheDocument();
      expect(screen.getByTestId("variant-result-cards")).toBeInTheDocument();
      expect(screen.getByTestId("variant-card-VAR_1")).toBeInTheDocument();
      expect(screen.getByTestId("variant-card-VAR_2")).toBeInTheDocument();
      expect(screen.getByTestId("variant-card-VAR_3")).toBeInTheDocument();
    });

    it("displays variant count in header", () => {
      const variants = [makeVariant(), makeVariant()];

      renderList(variants);

      expect(screen.getByTestId("variant-result-count")).toBeInTheDocument();
      expect(screen.getByText(/✅ 2 Varianten erzeugt/)).toBeInTheDocument();
    });

    it("displays singular count for 1 variant", () => {
      renderList([makeVariant()]);

      expect(screen.getByText(/✅ 1 Variante erzeugt/)).toBeInTheDocument();
    });

    it("displays source label as original when enrichedContentUsed is false", () => {
      renderList([makeVariant()], { enrichedContentUsed: false });
    });

    it("shows enrichedContent source label when true", () => {
      resetStore();
      renderList([makeVariant()], { enrichedContentUsed: true });

      expect(
        screen.getByText(/Quelle: enrichedContent \(Missing-Info-Gate\)/),
      ).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Variant Card Details
  // ---------------------------------------------------------------------------

  describe("Variant Card Details", () => {
    it("renders variant label", () => {
      renderList([makeVariant({ label: "Test Label" })]);

      expect(screen.getByText("Test Label")).toBeInTheDocument();
    });

    it("renders variant recommendation", () => {
      const variant = makeVariant({
        variantId: "VAR_REC",
        recommendation: "Empfohlen für Tests.",
      });

      renderList([variant]);

      expect(screen.getByTestId("variant-rec-VAR_REC")).toBeInTheDocument();
      expect(screen.getByText("Empfohlen für Tests.")).toBeInTheDocument();
    });

    it("renders direction explanation", () => {
      const variant = makeVariant({
        variantId: "VAR_DIR",
        directionExplanation: "Eine spezifische Richtung.",
      });

      renderList([variant]);

      expect(screen.getByTestId("variant-dir-VAR_DIR")).toBeInTheDocument();
      expect(
        screen.getByText("Eine spezifische Richtung."),
      ).toBeInTheDocument();
    });

    it("renders variant content in a details/summary element", () => {
      const variant = makeVariant({
        variantId: "VAR_CT",
        content: "Generated prompt text.",
      });

      renderList([variant]);

      expect(
        screen.getByTestId("variant-content-toggle-VAR_CT"),
      ).toBeInTheDocument();
      expect(screen.getByTestId("variant-content-VAR_CT")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Constraints Display
  // ---------------------------------------------------------------------------

  describe("Constraints Display", () => {
    it("renders preserved constraints", () => {
      const variant = makeVariant({
        variantId: "VAR_CONS",
        preservedConstraints: [
          {
            constraintId: "C_A",
            constraintText: "Nur auf Deutsch",
            category: "language",
            affectedByProfile: false,
          },
          {
            constraintId: "C_B",
            constraintText: "Keine Cloud",
            category: "offline_only",
            affectedByProfile: false,
          },
        ],
      });

      renderList([variant]);

      expect(
        screen.getByTestId("variant-constraints-VAR_CONS"),
      ).toBeInTheDocument();
      expect(screen.getByText(/Nur auf Deutsch/)).toBeInTheDocument();
      expect(screen.getByText(/Keine Cloud/)).toBeInTheDocument();
    });

    it("marks constraints affected by profile", () => {
      const variant = makeVariant({
        variantId: "VAR_AFFECTED",
        preservedConstraints: [
          {
            constraintId: "C_X",
            constraintText: "Max 200 Wörter",
            category: "max_length",
            affectedByProfile: true,
          },
        ],
      });

      renderList([variant]);

      expect(screen.getByText(/vom Profil beeinflusst/)).toBeInTheDocument();
    });

    it("does not show constraints section when empty", () => {
      const variant = makeVariant({
        variantId: "VAR_NOCONS",
        preservedConstraints: [],
      });

      renderList([variant]);

      expect(
        screen.queryByTestId("variant-constraints-VAR_NOCONS"),
      ).not.toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Conflicts Display
  // ---------------------------------------------------------------------------

  describe("Conflicts Display", () => {
    it("renders conflict toggle when conflicts exist", () => {
      const variant = makeVariant({
        variantId: "VAR_CONF",
        conflicts: [
          {
            id: "VC_1",
            profileId: "deep_research",
            constraint: {
              id: "C_O",
              constraintText: "Keine Cloud",
              category: "offline_only",
              severity: "hard",
              position: null,
            },
            description: "Profil benötigt Cloud, Constraint verbietet sie.",
            severity: "blocking",
            resolution: "constraint_preserved",
          },
        ],
      });

      renderList([variant]);

      expect(
        screen.getByTestId("variant-conflicts-VAR_CONF"),
      ).toBeInTheDocument();
      expect(
        screen.getByTestId("variant-conflicts-toggle-VAR_CONF"),
      ).toBeInTheDocument();
    });

    it("expands conflicts on toggle click", () => {
      const variant = makeVariant({
        variantId: "VAR_EXPAND",
        conflicts: [
          {
            id: "VC_EXP",
            profileId: "agentisch",
            constraint: {
              id: "C_APP",
              constraintText: "Human Approval required",
              category: "approval_required",
              severity: "hard",
              position: null,
            },
            description: "Agenten-Modus vs. Human Approval.",
            severity: "blocking",
            resolution: "constraint_preserved",
          },
        ],
      });

      renderList([variant]);

      const toggle = screen.getByTestId("variant-conflicts-toggle-VAR_EXPAND");
      fireEvent.click(toggle);

      // After expanding, BLOCKING badge should be visible
      expect(screen.getByText(/🚫 BLOCKING/)).toBeInTheDocument();
    });

    it("displays BLOCKING badge for blocking conflicts", () => {
      const variant = makeVariant({
        variantId: "VAR_BLOCK",
        conflicts: [
          {
            id: "VC_BLOCK",
            profileId: "deep_research",
            constraint: {
              id: "C_OFF",
              constraintText: "Keine Cloud",
              category: "offline_only",
              severity: "hard",
              position: null,
            },
            description: "BLOCKING conflict.",
            severity: "blocking",
            resolution: "constraint_preserved",
          },
        ],
      });

      renderList([variant]);

      const toggle = screen.getByTestId("variant-conflicts-toggle-VAR_BLOCK");
      fireEvent.click(toggle);

      expect(screen.getByText(/🚫 BLOCKING/)).toBeInTheDocument();
    });

    it("displays WARNING badge for warning conflicts", () => {
      const variant = makeVariant({
        variantId: "VAR_WARN",
        conflicts: [
          {
            id: "VC_WARN",
            profileId: "ausfuehrlich",
            constraint: {
              id: "C_LEN",
              constraintText: "Max 200 Wörter",
              category: "max_length",
              severity: "hard",
              position: null,
            },
            description: "WARNING: Länge begrenzt.",
            severity: "warning",
            resolution: "constraint_preserved",
          },
        ],
      });

      renderList([variant]);

      const toggle = screen.getByTestId("variant-conflicts-toggle-VAR_WARN");
      fireEvent.click(toggle);

      expect(screen.getByText(/⚠️ WARNING/)).toBeInTheDocument();
    });

    it("shows 'Keine Konflikte' when no conflicts", () => {
      const variant = makeVariant({
        variantId: "VAR_NO_CONF",
        conflicts: [],
      });

      renderList([variant]);

      expect(
        screen.getByTestId("variant-no-conflicts-VAR_NO_CONF"),
      ).toBeInTheDocument();
      expect(screen.getByText(/Keine Konflikte/)).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Assumptions
  // ---------------------------------------------------------------------------

  describe("Assumptions", () => {
    it("renders assumptions list", () => {
      const variant = makeVariant({
        variantId: "VAR_ASM",
        assumptions: ["Annahme 1", "Annahme 2"],
      });

      renderList([variant]);

      expect(
        screen.getByTestId("variant-assumptions-VAR_ASM"),
      ).toBeInTheDocument();
      expect(screen.getByText("Annahme 1")).toBeInTheDocument();
      expect(screen.getByText("Annahme 2")).toBeInTheDocument();
    });
  });

  // ---------------------------------------------------------------------------
  // Action Buttons (Placeholder / Batch 7)
  // ---------------------------------------------------------------------------

  describe("Action Buttons", () => {
    it("renders save button as disabled (Batch 7 placeholder)", () => {
      renderList([makeVariant({ variantId: "VAR_SAVE" })]);

      const saveBtn = screen.getByTestId("variant-save-btn-VAR_SAVE");
      expect(saveBtn).toBeInTheDocument();
      expect(saveBtn).toBeDisabled();
    });

    it("renders compare button as disabled (Batch 7 placeholder)", () => {
      renderList([makeVariant({ variantId: "VAR_CMP" })]);

      const cmpBtn = screen.getByTestId("variant-compare-btn-VAR_CMP");
      expect(cmpBtn).toBeInTheDocument();
      expect(cmpBtn).toBeDisabled();
    });

    it("renders copy button as enabled", () => {
      renderList([makeVariant({ variantId: "VAR_CPY" })]);

      const cpyBtn = screen.getByTestId("variant-copy-btn-VAR_CPY");
      expect(cpyBtn).toBeInTheDocument();
      expect(cpyBtn).not.toBeDisabled();
    });
  });

  // ---------------------------------------------------------------------------
  // No Persistence / No #216
  // ---------------------------------------------------------------------------

  describe("No Persistence / No #216 Interference", () => {
    it("does not modify Missing-Info-Gate state on render", () => {
      useAppStore.setState({
        isGateOpen: true,
        activeGatePromptId: "gate-id",
      });

      renderList([makeVariant()]);

      const store = useAppStore.getState();
      expect(store.isGateOpen).toBe(true);
      expect(store.activeGatePromptId).toBe("gate-id");
    });

    it("does not modify variantResults in store on render", () => {
      renderList([makeVariant()]);

      const store = useAppStore.getState();
      // variantResults should still be empty — we passed variants as props
      expect(Object.keys(store.variantResults)).toHaveLength(0);
    });
  });
});

// =============================================================================
// Batch 7 — Compare & Save Button Integration (T-215-017)
// =============================================================================

describe("VariantResultList — Compare & Save Buttons (Batch 7)", () => {
  beforeEach(() => {
    resetStore();
  });

  it("compare button is enabled when onCompare is provided", () => {
    const variant = makeVariant({ variantId: "VAR_cmp_1" });
    renderList([variant], { onCompare: vi.fn() });

    const compareBtn = screen.getByTestId("variant-compare-btn-VAR_cmp_1");
    expect(compareBtn).not.toBeDisabled();
  });

  it("compare button is disabled when onCompare is NOT provided", () => {
    const variant = makeVariant({ variantId: "VAR_cmp_2" });
    renderList([variant]); // No onCompare

    const compareBtn = screen.getByTestId("variant-compare-btn-VAR_cmp_2");
    expect(compareBtn).toBeDisabled();
  });

  it("compare button calls onCompare with the variant on click", () => {
    const onCompare = vi.fn();
    const variant = makeVariant({ variantId: "VAR_cmp_3" });
    renderList([variant], { onCompare });

    fireEvent.click(screen.getByTestId("variant-compare-btn-VAR_cmp_3"));
    expect(onCompare).toHaveBeenCalledTimes(1);
    expect(onCompare).toHaveBeenCalledWith(variant);
  });

  it("save button is enabled when onSave provided and no BLOCKING conflict", () => {
    const variant = makeVariant({
      variantId: "VAR_save_1",
      conflicts: [], // No conflicts
    });
    renderList([variant], { onSave: vi.fn() });

    const saveBtn = screen.getByTestId("variant-save-btn-VAR_save_1");
    expect(saveBtn).not.toBeDisabled();
  });

  it("save button is disabled when onSave is NOT provided", () => {
    const variant = makeVariant({ variantId: "VAR_save_2" });
    renderList([variant]); // No onSave

    const saveBtn = screen.getByTestId("variant-save-btn-VAR_save_2");
    expect(saveBtn).toBeDisabled();
  });

  it("save button is disabled when BLOCKING conflict exists", () => {
    const variant = makeVariant({
      variantId: "VAR_blocked",
      conflicts: [
        {
          id: "conf_b",
          profileId: "deep_research",
          constraint: {
            id: "hc_b",
            category: "offline_only",
            constraintText: "Keine Cloud",
            severity: "hard" as const,
            position: null,
          },
          description: "Blocking conflict",
          severity: "blocking",
          resolution: "constraint_preserved",
        },
      ],
    });
    renderList([variant], { onSave: vi.fn() });

    const saveBtn = screen.getByTestId("variant-save-btn-VAR_blocked");
    expect(saveBtn).toBeDisabled();
  });

  it("save button is enabled when only WARNING conflicts exist", () => {
    const variant = makeVariant({
      variantId: "VAR_warn",
      conflicts: [
        {
          id: "conf_w",
          profileId: "ausfuehrlich",
          constraint: {
            id: "hc_w",
            category: "max_length",
            constraintText: "Max 200",
            severity: "hard" as const,
            position: null,
          },
          description: "Warning conflict",
          severity: "warning",
          resolution: "constraint_preserved",
        },
      ],
    });
    renderList([variant], { onSave: vi.fn() });

    const saveBtn = screen.getByTestId("variant-save-btn-VAR_warn");
    expect(saveBtn).not.toBeDisabled();
  });

  it("save button calls onSave with the variant on click", () => {
    const onSave = vi.fn();
    const variant = makeVariant({
      variantId: "VAR_save_3",
      conflicts: [],
    });
    renderList([variant], { onSave });

    fireEvent.click(screen.getByTestId("variant-save-btn-VAR_save_3"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(variant);
  });

  it("copy button is always enabled", () => {
    const variant = makeVariant({ variantId: "VAR_cpy" });
    renderList([variant]);

    const copyBtn = screen.getByTestId("variant-copy-btn-VAR_cpy");
    expect(copyBtn).not.toBeDisabled();
  });

  // ---------------------------------------------------------------------------
  // Apply-to-Editor Button (GA #295)
  // ---------------------------------------------------------------------------

  it("apply button is enabled when onApply provided and no BLOCKING conflict", () => {
    const variant = makeVariant({ variantId: "VAR_apply_1" });
    renderList([variant], { onApply: vi.fn() });

    const applyBtn = screen.getByTestId("variant-apply-btn-VAR_apply_1");
    expect(applyBtn).toBeInTheDocument();
    expect(applyBtn).not.toBeDisabled();
    expect(applyBtn.getAttribute("aria-label")).toBe(
      "Variante im Editor übernehmen",
    );
  });

  it("apply button is disabled when onApply is NOT provided", () => {
    const variant = makeVariant({ variantId: "VAR_apply_2" });
    renderList([variant]); // No onApply

    const applyBtn = screen.getByTestId("variant-apply-btn-VAR_apply_2");
    expect(applyBtn).toBeDisabled();
  });

  it("apply button is disabled when BLOCKING conflict exists", () => {
    const variant = makeVariant({
      variantId: "VAR_apply_blocked",
      conflicts: [
        {
          id: "conf_ab",
          profileId: "deep_research",
          constraint: {
            id: "hc_ab",
            category: "offline_only",
            constraintText: "Keine Cloud",
            severity: "hard" as const,
            position: null,
          },
          description: "Blocking apply conflict",
          severity: "blocking",
          resolution: "constraint_preserved",
        },
      ],
    });
    renderList([variant], { onApply: vi.fn() });

    const applyBtn = screen.getByTestId(
      "variant-apply-btn-VAR_apply_blocked",
    );
    expect(applyBtn).toBeDisabled();
  });

  it("apply button is enabled when only WARNING conflicts exist", () => {
    const variant = makeVariant({
      variantId: "VAR_apply_warn",
      conflicts: [
        {
          id: "conf_aw",
          profileId: "ausfuehrlich",
          constraint: {
            id: "hc_aw",
            category: "max_length",
            constraintText: "Max 200",
            severity: "hard" as const,
            position: null,
          },
          description: "Warning apply conflict",
          severity: "warning",
          resolution: "constraint_preserved",
        },
      ],
    });
    renderList([variant], { onApply: vi.fn() });

    const applyBtn = screen.getByTestId("variant-apply-btn-VAR_apply_warn");
    expect(applyBtn).not.toBeDisabled();
  });

  it("apply button calls onApply with the variant on click", () => {
    const onApply = vi.fn();
    const variant = makeVariant({ variantId: "VAR_apply_3" });
    renderList([variant], { onApply });

    fireEvent.click(screen.getByTestId("variant-apply-btn-VAR_apply_3"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(variant);
  });
});
