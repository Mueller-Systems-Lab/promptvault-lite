// =============================================================================
// PromptVault Lite — VariantCompare UI Tests (Batch 7, T-215-016)
// =============================================================================
// Tests for: side-by-side rendering, source/variant content, constraints table,
// conflict banners, save/apply button state (BLOCKING disabled), GA (v1.11.0).
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { VariantCompare } from "../VariantCompare";
import type { PromptVariant } from "@/types";

// =============================================================================
// Helpers
// =============================================================================

function makeVariant(overrides: Partial<PromptVariant> = {}): PromptVariant {
  return {
    variantId: overrides.variantId ?? "VAR_compare_1",
    profileId: overrides.profileId ?? "sachlich",
    label: overrides.label ?? "Sachlich / Neutral",
    content: overrides.content ?? "Variierter Prompt-Inhalt.",
    directionExplanation:
      overrides.directionExplanation ?? "Neutrale, objektive Darstellung.",
    preservedConstraints: overrides.preservedConstraints ?? [
      {
        constraintId: "C_1",
        constraintText: "Keine Cloud verwenden",
        category: "offline_only",
        affectedByProfile: false,
      },
    ],
    conflicts: overrides.conflicts ?? [],
    assumptions: overrides.assumptions ?? ["Zielgruppe: Allgemein"],
    openPoints: overrides.openPoints ?? [],
    recommendation: overrides.recommendation ?? "Geeignet für Dokumentation.",
    metadata: overrides.metadata ?? {
      generatedAt: "2026-07-11T12:00:00Z",
      sourceContent: "original",
      appliedProfileId: "sachlich",
    },
  };
}

// =============================================================================
// Tests
// =============================================================================

describe("VariantCompare — Side-by-Side Rendering", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders side-by-side panes with source and variant content", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Originaler Source-Content"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    // Both panes should be present
    expect(screen.getByTestId("variant-compare-panes")).toBeTruthy();
    expect(screen.getByTestId("variant-compare-source")).toBeTruthy();
    expect(screen.getByTestId("variant-compare-variant")).toBeTruthy;

    // Source content visible
    expect(screen.getByText("Originaler Source-Content")).toBeTruthy();

    // Variant content visible
    expect(screen.getByText("Variierter Prompt-Inhalt.")).toBeTruthy();
  });

  it("renders correct header with variant label", () => {
    const variant = makeVariant({ label: "Technisch / Präzise" });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText("↔️ Vergleich: Original ↔ Technisch / Präzise"),
    ).toBeTruthy();
  });

  it("shows 'Angereichert' label when enrichedContentUsed is true", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Enriched source"
        enrichedContentUsed={true}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    // "Angereichert" appears in both title and pane header — verify at least 2 occurrences
    const enrichedEls = screen.getAllByText(/Angereichert/);
    expect(enrichedEls.length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Missing-Info-Gate/)).toBeTruthy();
  });

  it("shows 'Original' label when enrichedContentUsed is false", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Original source"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    // "Original" appears in both title and pane header — verify at least 2 occurrences
    const originalEls = screen.getAllByText(/Original/);
    expect(originalEls.length).toBeGreaterThanOrEqual(2);
  });
});

describe("VariantCompare — Constraints Table", () => {
  beforeEach(() => {
  });

  it("renders preserved constraints table", () => {
    const variant = makeVariant({
      preservedConstraints: [
        {
          constraintId: "C_A",
          constraintText: "Nur auf Deutsch",
          category: "language",
          affectedByProfile: false,
        },
        {
          constraintId: "C_B",
          constraintText: "Max 200 Wörter",
          category: "max_length",
          affectedByProfile: true,
        },
      ],
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    const constraints = screen.getByTestId("variant-compare-constraints");
    expect(constraints).toBeTruthy();

    // Check constraint texts
    expect(screen.getByText("Nur auf Deutsch")).toBeTruthy();
    expect(screen.getByText("Max 200 Wörter")).toBeTruthy();

    // Check status indicators
    expect(screen.getByText("✅ Unverändert")).toBeTruthy();
    expect(screen.getByText("⚠️ Vom Profil beeinflusst")).toBeTruthy();
  });

  it("does NOT render constraints table when no constraints", () => {
    const variant = makeVariant({ preservedConstraints: [] });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("variant-compare-constraints")).toBeNull();
  });
});

describe("VariantCompare — Conflicts", () => {
  beforeEach(() => {
  });

  it("shows BLOCKING conflict banner and disables save", () => {
    const variant = makeVariant({
      conflicts: [
        {
          id: "conf_1",
          profileId: "deep_research",
          constraint: {
            id: "hc_1",
            category: "offline_only",
            constraintText: "Keine Cloud verwenden",
            severity: "hard" as const,
            position: null,
          },
          description: "Deep Research benötigt Cloud-Zugriff",
          severity: "blocking",
          resolution: "constraint_preserved",
        },
      ],
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // BLOCKING banner visible
    expect(screen.getByText(/BLOCKING-Konflikt/)).toBeTruthy();
    expect(screen.getByText(/nicht gespeichert werden/)).toBeTruthy();

    // Save button disabled
    const saveBtn = screen.getByTestId("variant-compare-save-btn");
    expect(saveBtn).toBeDisabled();
  });

  it("shows WARNING conflict but save is enabled", () => {
    const variant = makeVariant({
      conflicts: [
        {
          id: "conf_2",
          profileId: "ausfuehrlich",
          constraint: {
            id: "hc_2",
            category: "max_length",
            constraintText: "Max 200 Wörter",
            severity: "hard" as const,
            position: null,
          },
          description: "Ausführliches Profil mit Längenbegrenzung",
          severity: "warning",
          resolution: "constraint_preserved",
        },
      ],
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    // WARNING banner visible
    expect(screen.getByText(/WARNING:/)).toBeTruthy();

    // Save button enabled
    const saveBtn = screen.getByTestId("variant-compare-save-btn");
    expect(saveBtn).not.toBeDisabled();
  });

  it("shows no conflict banner when no conflicts", () => {
    const variant = makeVariant({ conflicts: [] });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onSave={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("variant-compare-conflict-banner")).toBeNull();
  });
});

describe("VariantCompare — Actions", () => {
  beforeEach(() => {
  });

  it("save button calls onSave with the variant", () => {
    const onSave = vi.fn();
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onSave={onSave}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("variant-compare-save-btn"));
    expect(onSave).toHaveBeenCalledTimes(1);
    expect(onSave).toHaveBeenCalledWith(variant);
  });

  it("save button not rendered when onSave is not provided", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("variant-compare-save-btn")).toBeNull();
  });

  it("close button calls onClose", () => {
    const onClose = vi.fn();
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={onClose}
      />,
    );

    // Close via X icon
    fireEvent.click(screen.getByTestId("variant-compare-close-icon"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("close via footer button calls onClose", () => {
    const onClose = vi.fn();
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={onClose}
      />,
    );

    fireEvent.click(screen.getByTestId("variant-compare-close-btn"));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});

describe("VariantCompare — Direction and Recommendation", () => {
  beforeEach(() => {
  });

  it("displays direction explanation", () => {
    const variant = makeVariant({
      directionExplanation: "Technisch präzise Sprache mit Fachbegriffen.",
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("variant-compare-meta")).toBeTruthy();
    expect(
      screen.getByText(/Technisch präzise Sprache mit Fachbegriffen/),
    ).toBeTruthy();
  });

  it("displays recommendation", () => {
    const variant = makeVariant({
      recommendation: "Für technische Dokumentation empfohlen.",
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(
      screen.getByText(/Für technische Dokumentation empfohlen/),
    ).toBeTruthy();
  });

  it("displays assumptions", () => {
    const variant = makeVariant({
      assumptions: ["Annahme A", "Annahme B"],
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("variant-compare-assumptions")).toBeTruthy();
    expect(screen.getByText("Annahme A")).toBeTruthy();
    expect(screen.getByText("Annahme B")).toBeTruthy();
  });
});

describe("VariantCompare — GA availability (v1.11.0)", () => {
  it("renders without any feature flag (feature is always available)", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onClose={vi.fn()}
      />,
    );

    expect(screen.getByTestId("variant-compare")).toBeTruthy();
  });

  it("shows the ✏️ Im Editor übernehmen button when onApply is provided", () => {
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const applyBtn = screen.getByTestId("variant-compare-apply-btn");
    expect(applyBtn).toBeInTheDocument();
    expect(applyBtn).not.toBeDisabled();
  });

  it("disables the apply button for BLOCKING conflicts", () => {
    const variant = makeVariant({
      conflicts: [
        {
          id: "conf_block",
          profileId: "deep_research",
          constraint: {
            id: "hc_block",
            constraintText: "Keine Cloud",
            category: "offline_only",
            severity: "hard" as const,
            position: null,
          },
          description: "Blocking conflict",
          severity: "blocking",
          resolution: "constraint_preserved",
        },
      ],
    });

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onApply={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const applyBtn = screen.getByTestId("variant-compare-apply-btn");
    expect(applyBtn).toBeDisabled();
  });

  it("apply button calls onApply with the variant (no BLOCKING conflicts)", () => {
    const onApply = vi.fn();
    const variant = makeVariant();

    render(
      <VariantCompare
        sourceContent="Test"
        enrichedContentUsed={false}
        variant={variant}
        onApply={onApply}
        onClose={vi.fn()}
      />,
    );

    fireEvent.click(screen.getByTestId("variant-compare-apply-btn"));
    expect(onApply).toHaveBeenCalledTimes(1);
    expect(onApply).toHaveBeenCalledWith(variant);
  });
});
