// =============================================================================
// PromptVault Lite — VariantResultList (#215, T-215-013)
// =============================================================================
// Displays generated prompt variants as result cards with full metadata:
// label, direction, constraints, conflicts, assumptions, recommendation.
//
// Batch 5 scope: display only — no Save-as-New, no Compare, no
// integration with DetailsPanel. Buttons are present but have no-op
// handlers (placeholders for future batches).
// =============================================================================

import React, { useState, useCallback } from "react";
import { isObservabilityEnabled, emitDiagnosticEvent } from "@/observability/events";
import type { PromptVariant } from "@/types";

// =============================================================================
// Types
// =============================================================================

export interface VariantResultListProps {
  /** The generated variants to display. */
  variants: PromptVariant[];
  /** Whether enrichedContent was used as the source. */
  enrichedContentUsed: boolean;
  /** Source content (for copy-to-clipboard reference). */
  sourceContent: string;
  /** Called when the user clicks "↔️ Vergleichen" on a variant. */
  onCompare?: (variant: PromptVariant) => void;
  /** Called when the user clicks "💾 Speichern" on a variant. */
  onSave?: (variant: PromptVariant) => void;
  /** Called when the user clicks "✏️ Übernehmen" on a variant (GA #295). */
  onApply?: (variant: PromptVariant) => void;
}

// =============================================================================
// Helpers
// =============================================================================

/** Profile-specific emojis matching DirectionProfileSelector. */
const PROFILE_ICONS: Record<string, string> = {
  sachlich: "📄",
  verkaeuferisch: "💰",
  technisch: "⚙️",
  kurz: "📏",
  ausfuehrlich: "📚",
  kreativ: "🎨",
  kritisch: "🔍",
  anfaenger: "🌱",
  experte: "🎓",
  deep_research: "🔬",
  agentisch: "🤖",
  compliance: "🛡️",
  custom: "✏️",
};

// =============================================================================
// VariantResultCard — single variant display
// =============================================================================

interface VariantResultCardProps {
  variant: PromptVariant;
  onCompare?: (variant: PromptVariant) => void;
  onSave?: (variant: PromptVariant) => void;
  onApply?: (variant: PromptVariant) => void;
}

const VariantResultCard: React.FC<VariantResultCardProps> = ({
  variant,
  onCompare,
  onSave,
  onApply,
}) => {
  const [conflictsExpanded, setConflictsExpanded] = useState(false);
  const [copied, setCopied] = useState(false);

  const icon = PROFILE_ICONS[variant.profileId] ?? "📄";
  const hasConflicts = variant.conflicts.length > 0;
  const blockingConflicts = variant.conflicts.filter(
    (c) => c.severity === "blocking",
  );
  const warningConflicts = variant.conflicts.filter(
    (c) => c.severity === "warning",
  );

  const handleCopy = useCallback(async () => {
    if (isObservabilityEnabled()) {
      emitDiagnosticEvent({
        schemaVersion: 1,
        traceId: `direction-copy-${variant.profileId}`,
        spanId: `direction-copy-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
        timestamp: new Date().toISOString(),
        layer: "ui",
        operation: "direction.copy",
        stage: "copy",
        status: "succeeded",
        attributes: {
          "promptvault.direction.profile_ids": [variant.profileId],
        },
      });
    }
    try {
      await navigator.clipboard.writeText(variant.content);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      // Fallback: no clipboard access
    }
  }, [variant.content, variant.profileId]);

  return (
    <div
      className="variant-result-card"
      data-testid={`variant-card-${variant.variantId}`}
    >
      {/* Card Header */}
      <div className="variant-result-header">
        <span className="variant-result-icon">{icon}</span>
        <h3 className="variant-result-label">{variant.label}</h3>
      </div>

      {/* Recommendation */}
      {variant.recommendation && (
        <p
          className="variant-result-recommendation"
          data-testid={`variant-rec-${variant.variantId}`}
        >
          <em>{variant.recommendation}</em>
        </p>
      )}

      {/* Direction Explanation */}
      <p
        className="variant-result-direction"
        data-testid={`variant-dir-${variant.variantId}`}
      >
        {variant.directionExplanation}
      </p>

      {/* Generated Content */}
      <details className="variant-result-content-details">
        <summary data-testid={`variant-content-toggle-${variant.variantId}`}>
          Generierten Prompt anzeigen
        </summary>
        <pre
          className="variant-result-content"
          data-testid={`variant-content-${variant.variantId}`}
        >
          {variant.content}
        </pre>
      </details>

      {/* Preserved Constraints */}
      {variant.preservedConstraints.length > 0 && (
        <div
          className="variant-result-constraints"
          data-testid={`variant-constraints-${variant.variantId}`}
        >
          <strong>Erhaltene Constraints:</strong>
          <ul className="variant-constraints-list">
            {variant.preservedConstraints.map((pc) => (
              <li
                key={pc.constraintId}
                className={`variant-constraint-item${pc.affectedByProfile ? " variant-constraint-affected" : ""}`}
              >
                ✅ [{pc.category}] {pc.constraintText}
                {pc.affectedByProfile && (
                  <span className="variant-constraint-affected-badge">
                    {" "}
                    (vom Profil beeinflusst)
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Conflicts */}
      {hasConflicts && (
        <div
          className={`variant-result-conflicts${conflictsExpanded ? " variant-conflicts-expanded" : ""}`}
          data-testid={`variant-conflicts-${variant.variantId}`}
        >
          <button
            type="button"
            className="variant-conflicts-toggle"
            onClick={() => {
              setConflictsExpanded(!conflictsExpanded);
            }}
            aria-expanded={conflictsExpanded}
            data-testid={`variant-conflicts-toggle-${variant.variantId}`}
          >
            {conflictsExpanded ? "▲" : "▼"} ⚠️ {variant.conflicts.length}{" "}
            Konflikt{variant.conflicts.length !== 1 ? "e" : ""}
            {blockingConflicts.length > 0 &&
              ` (${blockingConflicts.length} BLOCKING)`}
            {warningConflicts.length > 0 &&
              ` (${warningConflicts.length} WARNING)`}
          </button>

          {conflictsExpanded && (
            <ul className="variant-conflicts-list">
              {variant.conflicts.map((conflict) => (
                <li
                  key={conflict.id}
                  className={`variant-conflict-item variant-conflict-${conflict.severity}`}
                >
                  <span
                    className={`variant-conflict-badge variant-conflict-badge-${conflict.severity}`}
                  >
                    {conflict.severity === "blocking"
                      ? "🚫 BLOCKING"
                      : "⚠️ WARNING"}
                  </span>{" "}
                  {conflict.description}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* No conflicts indicator */}
      {!hasConflicts && (
        <p
          className="variant-no-conflicts"
          data-testid={`variant-no-conflicts-${variant.variantId}`}
        >
          ⚠️ Keine Konflikte
        </p>
      )}

      {/* Assumptions */}
      {variant.assumptions.length > 0 && (
        <div
          className="variant-result-assumptions"
          data-testid={`variant-assumptions-${variant.variantId}`}
        >
          <strong>Annahmen:</strong>
          <ul className="variant-assumptions-list">
            {variant.assumptions.map((a, i) => (
              <li key={i}>{a}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Card Actions */}
      <div
        className="variant-result-actions"
        data-testid={`variant-actions-${variant.variantId}`}
      >
        <button
          type="button"
          className="btn btn-sm variant-action-btn"
          onClick={() => {
            if (onSave) onSave(variant);
          }}
          disabled={!onSave || blockingConflicts.length > 0}
          title={
            blockingConflicts.length > 0
              ? "Speichern bei BLOCKING-Konflikten nicht möglich"
              : !onSave
                ? "Speichern nicht verfügbar"
                : "Variante als neue Version speichern"
          }
          data-testid={`variant-save-btn-${variant.variantId}`}
        >
          💾 Speichern
        </button>
        <button
          type="button"
          className="btn btn-sm variant-action-btn"
          onClick={() => {
            if (onCompare) onCompare(variant);
          }}
          disabled={!onCompare}
          title={
            !onCompare
              ? "Vergleichen nicht verfügbar"
              : "Mit Original vergleichen"
          }
          data-testid={`variant-compare-btn-${variant.variantId}`}
        >
          ↔️ Vergleichen
        </button>
        <button
          type="button"
          className="btn btn-sm variant-action-btn"
          onClick={() => {
            if (onApply) onApply(variant);
          }}
          disabled={!onApply || blockingConflicts.length > 0}
          title={
            blockingConflicts.length > 0
              ? "Übernehmen bei BLOCKING-Konflikten nicht möglich"
              : !onApply
                ? "Übernehmen nicht verfügbar"
                : "Variante im Editor übernehmen"
          }
          aria-label="Variante im Editor übernehmen"
          data-testid={`variant-apply-btn-${variant.variantId}`}
        >
          ✏️ Übernehmen
        </button>
        <button
          type="button"
          className="btn btn-sm variant-action-btn"
          onClick={() => {
            void handleCopy();
          }}
          data-testid={`variant-copy-btn-${variant.variantId}`}
        >
          {copied ? "📋 Kopiert ✓" : "📋 Kopieren"}
        </button>
      </div>
    </div>
  );
};

// =============================================================================
// VariantResultList
// =============================================================================

export const VariantResultList: React.FC<VariantResultListProps> = ({
  variants,
  enrichedContentUsed,
  sourceContent: _sourceContent,
  onCompare,
  onSave,
  onApply,
}) => {
  // ---------------------------------------------------------------------------
  // Empty state
  // ---------------------------------------------------------------------------
  if (variants.length === 0) {
    return (
      <div className="variant-result-empty" data-testid="variant-result-empty">
        <p>Keine Varianten erzeugt.</p>
        <p className="variant-result-hint">
          Wählen Sie eine oder mehrere Richtungen und klicken Sie auf
          &quot;Varianten generieren&quot;.
        </p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Results
  // ---------------------------------------------------------------------------
  const sourceLabel = enrichedContentUsed
    ? "enrichedContent (Missing-Info-Gate)"
    : "Original-Prompt";

  return (
    <div className="variant-result-list" data-testid="variant-result-list">
      {/* Header */}
      <div className="variant-result-header-section">
        <p className="variant-result-count" data-testid="variant-result-count">
          ✅ {variants.length} Variante{variants.length !== 1 ? "n" : ""}{" "}
          erzeugt
        </p>
        <p
          className="variant-result-source"
          data-testid="variant-result-source"
        >
          ℹ️ Quelle: {sourceLabel}
        </p>
      </div>

      {/* Variant cards */}
      <div className="variant-result-cards" data-testid="variant-result-cards">
        {variants.map((variant) => (
          <VariantResultCard
            key={variant.variantId}
            variant={variant}
            onCompare={onCompare}
            onSave={onSave}
            onApply={onApply}
          />
        ))}
      </div>
    </div>
  );
};
