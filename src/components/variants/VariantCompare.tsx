// =============================================================================
// PromptVault Lite — VariantCompare (#215, T-215-016)
// =============================================================================
// Side-by-Side comparison between the source content and a variant.
// Shows constraint differences, profile metadata, and conflict warnings.
// Batch 7 scope: comparison only — Save delegates to parent via onSave.
// =============================================================================

import React, { useCallback } from "react";
import type { PromptVariant, PreservedConstraintReference } from "@/types";

// =============================================================================
// Types
// =============================================================================

export interface VariantCompareProps {
  /** Source prompt content (original or enriched). */
  sourceContent: string;
  /** Whether enrichedContent was used as source. */
  enrichedContentUsed: boolean;
  /** The variant to compare against the source. */
  variant: PromptVariant;
  /** Called when the user wants to save this variant. */
  onSave?: (variant: PromptVariant) => void;
  /** Called when the user wants to apply this variant to the editor (GA #295). */
  onApply?: (variant: PromptVariant) => void;
  /** Called when the user closes the comparison. */
  onClose: () => void;
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
// VariantCompare
// =============================================================================

export const VariantCompare: React.FC<VariantCompareProps> = ({
  sourceContent,
  enrichedContentUsed,
  variant,
  onSave,
  onApply,
  onClose,
}) => {
  const handleSave = useCallback(() => {
    if (!onSave) return;
    const blocking = variant.conflicts.filter((c) => c.severity === "blocking");
    if (blocking.length === 0) {
      onSave(variant);
    }
  }, [onSave, variant]);

  const handleApply = useCallback(() => {
    if (!onApply) return;
    const blocking = variant.conflicts.filter((c) => c.severity === "blocking");
    if (blocking.length === 0) {
      onApply(variant);
    }
  }, [onApply, variant]);

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const sourceLabel = enrichedContentUsed ? "Angereichert" : "Original";
  const icon = PROFILE_ICONS[variant.profileId] ?? "📄";

  const blockingConflicts = variant.conflicts.filter(
    (c) => c.severity === "blocking",
  );
  const warningConflicts = variant.conflicts.filter(
    (c) => c.severity === "warning",
  );
  const hasBlockingConflict = blockingConflicts.length > 0;
  const hasConflicts = variant.conflicts.length > 0;

  // ---------------------------------------------------------------------------
  // Render: Modal
  // ---------------------------------------------------------------------------
  return (
    <div className="modal-overlay" data-testid="variant-compare-overlay">
      <div
        className="modal-container variant-compare"
        data-testid="variant-compare"
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            ↔️ Vergleich: {sourceLabel} ↔ {variant.label}
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Vergleich schließen"
            data-testid="variant-compare-close-icon"
          >
            ✕
          </button>
        </div>

        {/* Conflict Banner */}
        {hasConflicts && (
          <div
            className={`variant-compare-conflict-banner${hasBlockingConflict ? " variant-compare-conflict-blocking" : ""}`}
            data-testid="variant-compare-conflict-banner"
          >
            {hasBlockingConflict && (
              <p className="variant-compare-conflict-blocking-msg">
                🚫 BLOCKING-Konflikt: Diese Variante kann nicht gespeichert
                werden, solange sicherheitsrelevante Konflikte bestehen.
              </p>
            )}
            {warningConflicts.length > 0 && (
              <p className="variant-compare-conflict-warning-msg">
                ⚠️ WARNING: {warningConflicts.length} Konflikt
                {warningConflicts.length !== 1 ? "e" : ""} — Variante kann
                gespeichert werden, beachten Sie jedoch die Hinweise.
              </p>
            )}
          </div>
        )}

        {/* Side-by-Side Content */}
        <div
          className="variant-compare-panes"
          data-testid="variant-compare-panes"
        >
          {/* Left: Source */}
          <div
            className="variant-compare-pane variant-compare-source"
            data-testid="variant-compare-source"
          >
            <h3 className="variant-compare-pane-header">
              {sourceLabel} {enrichedContentUsed && "(Missing-Info-Gate)"}
            </h3>
            <pre className="variant-compare-content">{sourceContent}</pre>
          </div>

          {/* Right: Variant */}
          <div
            className="variant-compare-pane variant-compare-variant"
            data-testid="variant-compare-variant"
          >
            <h3 className="variant-compare-pane-header">
              {icon} {variant.label}
            </h3>
            <pre className="variant-compare-content">{variant.content}</pre>
          </div>
        </div>

        {/* Direction & Recommendation */}
        <div
          className="variant-compare-meta"
          data-testid="variant-compare-meta"
        >
          <p className="variant-compare-direction">
            <strong>Richtung:</strong> {variant.directionExplanation}
          </p>
          {variant.recommendation && (
            <p className="variant-compare-recommendation">
              <strong>Empfehlung:</strong> <em>{variant.recommendation}</em>
            </p>
          )}
        </div>

        {/* Constraints Comparison */}
        {variant.preservedConstraints.length > 0 && (
          <div
            className="variant-compare-constraints"
            data-testid="variant-compare-constraints"
          >
            <h4>Erhaltene Constraints</h4>
            <table className="variant-compare-constraints-table">
              <thead>
                <tr>
                  <th>Kategorie</th>
                  <th>Constraint</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {variant.preservedConstraints.map(
                  (pc: PreservedConstraintReference) => (
                    <tr
                      key={pc.constraintId}
                      className={
                        pc.affectedByProfile
                          ? "variant-compare-constraint-affected"
                          : ""
                      }
                    >
                      <td>
                        <code>{pc.category}</code>
                      </td>
                      <td>{pc.constraintText}</td>
                      <td>
                        {pc.affectedByProfile
                          ? "⚠️ Vom Profil beeinflusst"
                          : "✅ Unverändert"}
                      </td>
                    </tr>
                  ),
                )}
              </tbody>
            </table>
          </div>
        )}

        {/* Conflicts Detail */}
        {hasConflicts && (
          <div
            className="variant-compare-conflicts"
            data-testid="variant-compare-conflicts"
          >
            <h4>Konflikte</h4>
            <ul className="variant-compare-conflicts-list">
              {variant.conflicts.map((conflict) => (
                <li
                  key={conflict.id}
                  className={`variant-compare-conflict-item variant-compare-conflict-${conflict.severity}`}
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
          </div>
        )}

        {/* Assumptions */}
        {variant.assumptions.length > 0 && (
          <div
            className="variant-compare-assumptions"
            data-testid="variant-compare-assumptions"
          >
            <h4>Annahmen</h4>
            <ul>
              {variant.assumptions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          </div>
        )}

        {/* Footer Actions */}
        <div
          className="variant-compare-footer"
          data-testid="variant-compare-footer"
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
            data-testid="variant-compare-close-btn"
          >
            ✕ Schließen
          </button>
          {onSave && (
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={hasBlockingConflict}
              title={
                hasBlockingConflict
                  ? "Speichern bei BLOCKING-Konflikten nicht möglich"
                  : "Variante als neue Version speichern"
              }
              data-testid="variant-compare-save-btn"
            >
              💾 Variante speichern
            </button>
          )}
          {onApply && (
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleApply}
              disabled={hasBlockingConflict}
              title={
                hasBlockingConflict
                  ? "Übernehmen bei BLOCKING-Konflikten nicht möglich"
                  : "Variante im Editor übernehmen"
              }
              aria-label="Variante im Editor übernehmen"
              data-testid="variant-compare-apply-btn"
            >
              ✏️ Im Editor übernehmen
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
