import React, { useState, useCallback } from "react";
import { optimizeBlueprint } from "@/lib/blueprintOptimizer";
import { evaluateBlueprint } from "@/lib/blueprintDetection";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import type {
  BlueprintOptimizationMode,
  BlueprintOptimizationDiff,
  BlueprintEvaluation,
} from "@/types";

// =============================================================================
// BlueprintOptimizationPanel — Modal overlay for blueprint optimization
// =============================================================================
// Follows the same pattern as OptimizationPanel.tsx but is specific to
// blueprint content (not prompts). Reuses the blueprint optimizer lib
// directly — no action-layer dispatch (matching existing UI patterns).
// =============================================================================

interface BlueprintOptimizationPanelProps {
  content: string;
  onClose: () => void;
  /** Optional callback when user wants to apply the optimized result */
  onApply?: (optimizedContent: string) => void;
}

/** Combined result that includes before/after evaluations */
interface BlueprintOptimizeResult extends BlueprintOptimizationDiff {
  beforeEval: BlueprintEvaluation;
  afterEval: BlueprintEvaluation;
}

const MODE_LABELS: Record<
  BlueprintOptimizationMode,
  { label: string; description: string }
> = {
  conservative: {
    label: "Conservative",
    description: "Nur Whitespace/Format — Inhalt bleibt erhalten",
  },
  balanced: {
    label: "Balanced",
    description: "Strukturelle Optimierung — Fehlende Sektionen ergänzen",
  },
  aggressive: {
    label: "Aggressive",
    description:
      "Vollständiger Blueprint-Standard — Alle Sektionen sicherstellen",
  },
};

/**
 * Sanitize an error message for display.
 * Strips any content that could leak secrets, tokens, or original text.
 */
function sanitizeError(err: unknown): string {
  if (err instanceof Error) {
    const msg = err.message;
    // If the error contains the original content (extremely long),
    // only show a generic message
    if (msg.length > 500) {
      return "Blueprint-Optimierung fehlgeschlagen. Bitte versuchen Sie es mit einem anderen Modus erneut.";
    }
    // Strip anything that looks like a token or secret pattern
    const sanitized = msg
      .replace(/\b[a-zA-Z0-9_-]{32,}\b/g, "[redacted]")
      .replace(/\b[A-Za-z0-9+/=]{40,}\b/g, "[redacted]");
    return sanitized;
  }
  return "Ein unerwarteter Fehler ist aufgetreten.";
}

export const BlueprintOptimizationPanel: React.FC<
  BlueprintOptimizationPanelProps
> = ({ content, onClose, onApply }) => {
  const [selectedMode, setSelectedMode] =
    useState<BlueprintOptimizationMode>("conservative");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<BlueprintOptimizeResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isEmpty = content.trim().length === 0;

  const handleOptimize = useCallback(async () => {
    if (isEmpty) return;

    setLoading(true);
    setError(null);
    setCopied(false);

    try {
      // Brief delay to make loading state visible for UX testing
      await new Promise((resolve) => setTimeout(resolve, 30));

      const diff = optimizeBlueprint(content, selectedMode);
      const beforeEval = evaluateBlueprint(content);
      const afterEval = evaluateBlueprint(diff.optimized);

      setResult({
        ...diff,
        beforeEval,
        afterEval,
      });
    } catch (err) {
      setError(sanitizeError(err));
      setResult(null);
    } finally {
      setLoading(false);
    }
  }, [content, selectedMode, isEmpty]);

  const handleModeSelect = useCallback((mode: BlueprintOptimizationMode) => {
    setSelectedMode(mode);
    setError(null);
    setCopied(false);
  }, []);

  const handleCopy = useCallback(async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.optimized);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
      }, 2000);
    } catch {
      try {
        const { writeText } =
          await import("@tauri-apps/plugin-clipboard-manager");
        await writeText(result.optimized);
        setCopied(true);
        setTimeout(() => {
          setCopied(false);
        }, 2000);
      } catch {
        // Clipboard fully unavailable — ignore silently
      }
    }
  }, [result]);

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-dialog optimizer-dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-label="Blueprint-Optimierung"
        ref={useFocusTrap(true)}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>🔷 Blueprint-Optimierung</h2>
          <button
            className="btn btn-icon modal-close"
            onClick={onClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body optimizer-body">
          {isEmpty ? (
            <div className="empty-state">
              <p>Kein Blueprint-Inhalt vorhanden.</p>
              <p className="hint">
                Wähle einen Blueprint im Explorer aus, um ihn zu optimieren.
              </p>
            </div>
          ) : (
            <>
              {/* Mode Selector */}
              <fieldset className="optimizer-mode-group">
                <legend>Optimierungsmodus</legend>
                <div className="optimizer-mode-options">
                  {(
                    Object.keys(MODE_LABELS) as BlueprintOptimizationMode[]
                  ).map((mode) => (
                    <label
                      key={mode}
                      className={`optimizer-mode-option ${selectedMode === mode ? "optimizer-mode-active" : ""}`}
                    >
                      <input
                        type="radio"
                        name="blueprintOptimizationMode"
                        value={mode}
                        checked={selectedMode === mode}
                        onChange={() => {
                          handleModeSelect(mode);
                        }}
                      />
                      <div className="optimizer-mode-info">
                        <span className="optimizer-mode-label">
                          {MODE_LABELS[mode].label}
                        </span>
                        <span className="optimizer-mode-desc">
                          {MODE_LABELS[mode].description}
                        </span>
                      </div>
                    </label>
                  ))}
                </div>
              </fieldset>

              {/* Optimize Button */}
              <div>
                <button
                  className="btn btn-primary"
                  onClick={() => {
                    void handleOptimize();
                  }}
                  disabled={loading || isEmpty}
                  aria-label="Blueprint optimieren"
                >
                  {loading ? "⏳ Optimiere…" : "🔷 Blueprint optimieren"}
                </button>
              </div>

              {/* Loading State */}
              {loading && (
                <div
                  className="optimizer-loading"
                  role="status"
                  aria-live="polite"
                >
                  <p>Blueprint wird optimiert…</p>
                </div>
              )}

              {/* Error State */}
              {error && !loading && (
                <div
                  className="optimizer-error"
                  role="alert"
                  aria-live="assertive"
                >
                  <p>❌ {error}</p>
                </div>
              )}

              {/* Results */}
              {result && !loading && (
                <div className="optimizer-results">
                  {/* Score Improvement */}
                  <div className="optimizer-score-change">
                    <span className="score-change-label">
                      Score-Verbesserung:
                    </span>
                    <span className="score-change-before">
                      {result.beforeEval.overall_score}
                    </span>
                    <span className="score-change-arrow">→</span>
                    <span
                      className={`score-change-after ${
                        result.afterEval.overall_score >
                        result.beforeEval.overall_score
                          ? "score-improved"
                          : result.afterEval.overall_score <
                              result.beforeEval.overall_score
                            ? "score-decreased"
                            : ""
                      }`}
                    >
                      {result.afterEval.overall_score}
                    </span>
                    {result.contamination_cleaned && (
                      <span className="badge badge-success contamination-cleaned-badge">
                        ✓ Bereinigt
                      </span>
                    )}
                  </div>

                  {/* Changes Summary */}
                  {result.changes.length > 0 && (
                    <div className="optimizer-changes">
                      <h3>Änderungen ({result.changes.length})</h3>
                      <ul className="optimizer-changes-list">
                        {result.changes.map((change, i) => (
                          <li
                            key={i}
                            className={`change-item change-${change.type}`}
                          >
                            <span className="change-type">{change.type}</span>
                            <span className="change-desc">
                              {change.description}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* No changes */}
                  {result.changes.length === 0 && (
                    <div className="optimizer-changes">
                      <h3>Änderungen</h3>
                      <p className="hint">Keine Änderungen vorgenommen.</p>
                    </div>
                  )}

                  {/* Warnings */}
                  {result.warnings.length > 0 && (
                    <div className="optimizer-warnings">
                      <h3>⚠️ Hinweise ({result.warnings.length})</h3>
                      <ul>
                        {result.warnings.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Before/After Diff */}
                  <div className="optimizer-diff">
                    <div className="optimizer-diff-pane">
                      <h3>Vorher</h3>
                      <pre className="optimizer-diff-content">
                        {result.original}
                      </pre>
                    </div>
                    <div className="optimizer-diff-pane">
                      <h3>Optimiert</h3>
                      <pre className="optimizer-diff-content">
                        {result.optimized}
                      </pre>
                    </div>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="modal-footer">
          <button className="btn" onClick={onClose}>
            Schließen
          </button>
          {onApply && result && (
            <button
              className="btn btn-primary"
              onClick={() => {
                onApply(result.optimized);
              }}
              disabled={!result}
            >
              ✅ Übernehmen
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              void handleCopy();
            }}
            disabled={!result || isEmpty}
            aria-label="Optimiertes Ergebnis kopieren"
          >
            {copied ? "✅ Kopiert!" : "📋 Ergebnis kopieren"}
          </button>
        </div>
      </div>
    </div>
  );
};
