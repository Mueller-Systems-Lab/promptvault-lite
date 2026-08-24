// =============================================================================
// PromptVault Lite — Paste Prompt Analyzer
// =============================================================================
// Standalone panel that lets users paste a prompt directly and analyse it.
// No file required, no persistence, no cloud API.
// =============================================================================

import React, { useState, useCallback } from "react";
import { analyzePastedPrompt } from "@/lib/pastePromptAnalysis";
import type {
  PastePromptAnalysisResult,
  PasteValidationError,
} from "@/lib/pastePromptAnalysis";
import type { BlueprintDimensionScore } from "@/types";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type AnalysisState =
  | { status: "idle" }
  | { status: "analyzing" }
  | { status: "done"; result: PastePromptAnalysisResult }
  | { status: "error"; message: string };

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isValidationError(
  value: PastePromptAnalysisResult | PasteValidationError,
): value is PasteValidationError {
  return "type" in value;
}

const scoreColor = (score: number) =>
  score >= 70 ? "score-high" : score >= 40 ? "score-medium" : "score-low";

const classificationLabel = (contentClass: string): string => {
  const labels: Record<string, string> = {
    PROMPT: "Prompt",
    BLUEPRINT: "Blueprint",
    PROMPT_BLUEPRINT_HYBRID: "Prompt/Blueprint Hybrid",
    DOC: "Dokumentation",
    GUIDELINE: "Richtlinie",
    NOTE: "Notiz",
    CODE_FRAGMENT: "Code-Fragment",
    UNKNOWN_NEEDS_REVIEW: "Unbekannt",
  };
  return labels[contentClass];
};

const contaminationLabel = (status: string): { label: string; cls: string } => {
  switch (status) {
    case "CLEAN":
      return { label: "Sauber", cls: "hygiene-clean" };
    case "POSSIBLE_CONTAMINATION":
      return { label: "Mögliche Kontamination", cls: "hygiene-warning" };
    case "CONTAMINATED_NEEDS_REVIEW":
      return { label: "Kontaminiert — Prüfung nötig", cls: "hygiene-critical" };
    case "BLOCKING_SENSITIVE_CONTENT":
      return {
        label: "Sensible Inhalte erkannt",
        cls: "hygiene-critical",
      };
    default:
      return { label: status, cls: "" };
  }
};

const contextProfileLabel = (profile: string): string => {
  switch (profile) {
    case "minimal":
      return "Minimal";
    case "moderate":
      return "Moderat";
    case "rich":
      return "Reichhaltig";
    case "overloaded":
      return "Überladen";
    default:
      return profile;
  }
};

const contextProfileClass = (profile: string): string => {
  switch (profile) {
    case "minimal":
      return "profile-minimal";
    case "moderate":
      return "profile-moderate";
    case "rich":
      return "profile-rich";
    case "overloaded":
      return "profile-overloaded";
    default:
      return "";
  }
};

const promptTypeLabel = (type: string): string => {
  switch (type) {
    case "simple_prompt":
      return "Einfach";
    case "structured_prompt":
      return "Strukturiert";
    case "agentic_prompt":
      return "Agentic";
    default:
      return type;
  }
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const PastePromptAnalyzer: React.FC = () => {
  const [text, setText] = useState("");
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [clipboardStatus, setClipboardStatus] = useState<string | null>(null);

  // --- Handlers ---

  const handlePasteFromClipboard = useCallback(async () => {
    setClipboardStatus(null);

    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
    if (typeof navigator.clipboard?.readText !== "function") {
      setClipboardStatus(
        "Die Zwischenablage konnte nicht gelesen werden. Bitte füge den Text manuell ein.",
      );
      return;
    }

    try {
      const clipboardText = await navigator.clipboard.readText();
      if (clipboardText.trim().length === 0) {
        setClipboardStatus("Die Zwischenablage enthält keinen lesbaren Text.");
        return;
      }
      setText(clipboardText);
      // Invalidate stale analysis after clipboard paste (OPTION A — reset to idle)
      // Mirrors appStore.invalidateAnalysisForPrompt semantics for file prompts.
      setAnalysis((prev) =>
        prev.status === "done" || prev.status === "error"
          ? { status: "idle" }
          : prev,
      );
      setClipboardStatus("Text aus der Zwischenablage eingefügt.");
    } catch {
      setClipboardStatus(
        "Die Zwischenablage konnte nicht gelesen werden. Bitte füge den Text manuell ein.",
      );
    }
  }, []);

  const handleAnalyze = useCallback(() => {
    if (text.trim().length === 0) {
      setAnalysis({
        status: "error",
        message:
          "Bitte füge einen Prompt-Text ein, bevor du die Analyse startest.",
      });
      return;
    }

    setAnalysis({ status: "analyzing" });

    // Use setTimeout to allow the UI to update before running analysis
    setTimeout(() => {
      try {
        const result = analyzePastedPrompt({ content: text });

        if (isValidationError(result)) {
          setAnalysis({ status: "error", message: result.message });
          return;
        }

        setAnalysis({ status: "done", result });
      } catch (err) {
        setAnalysis({
          status: "error",
          message: "Ein Fehler ist bei der Analyse aufgetreten.",
        });
        // Don't log content!
        console.error("Paste analysis failed");
      }
    }, 50);
  }, [text]);

  const handleClear = useCallback(() => {
    setText("");
    setAnalysis({ status: "idle" });
    setClipboardStatus(null);
  }, []);

  // --- Compute derived values for the result view ---

  const result = analysis.status === "done" ? analysis.result : null;

  return (
    <div className="panel paste-analyzer">
      <div className="panel-header">
        Direktanalyse
        <span className="header-description">
          Keine Datei erforderlich — der Text wird nicht automatisch
          gespeichert.
        </span>
      </div>
      <div className="panel-content paste-analyzer-content">
        {/* ── Input area ── */}
        <div className="paste-input-section">
          <textarea
            className="paste-textarea"
            value={text}
            onChange={(e) => {
              const next = e.target.value;
              setText(next);
              setClipboardStatus(null);
              // Invalidate stale analysis when content is edited after a successful analysis
              // (OPTION A — reset to idle). Mirrors appStore.invalidateAnalysisForPrompt.
              // Stale score/result must not remain visible as valid for changed text.
              setAnalysis((prev) =>
                prev.status === "done" || prev.status === "error"
                  ? { status: "idle" }
                  : prev,
              );
            }}
            placeholder="Füge deinen Prompt-Text hier ein..."
            rows={10}
            aria-label="Prompt-Text eingeben"
          />

          <div className="paste-actions">
            <div className="paste-actions-left">
              <button
                className="btn"
                onClick={() => {
                  void handlePasteFromClipboard();
                }}
                title="Text aus der Zwischenablage einfügen"
              >
                📋 Aus Zwischenablage einfügen
              </button>
              {clipboardStatus && (
                <span className="clipboard-status">{clipboardStatus}</span>
              )}
            </div>
            <div className="paste-actions-right">
              <button
                className="btn"
                onClick={handleClear}
                disabled={text.length === 0 && analysis.status === "idle"}
              >
                🗑️ Leeren
              </button>
              <button
                className="btn btn-primary"
                onClick={handleAnalyze}
                disabled={analysis.status === "analyzing"}
              >
                {analysis.status === "analyzing"
                  ? "⏳ Analysiere..."
                  : "🔍 Analysieren"}
              </button>
            </div>
          </div>
        </div>

        {/* ── Error message ── */}
        {(analysis.status === "error" || analysis.status === "idle") &&
          analysis.status === "error" && (
            <div className="paste-error">
              <p>{analysis.message}</p>
            </div>
          )}

        {/* ── Idle state ── */}
        {analysis.status === "idle" && (
          <div className="paste-idle">
            <p>Füge einen Prompt-Text ein und klicke auf »Analysieren«.</p>
            <p className="hint">Keine Datei erforderlich.</p>
          </div>
        )}

        {/* ── Analyzing state ── */}
        {analysis.status === "analyzing" && (
          <div className="paste-loading">
            <div className="spinner" />
            <p>Analysiere Prompt-Text...</p>
          </div>
        )}

        {/* ── Results ── */}
        {result && (
          <div className="paste-results">
            {/* Warnings */}
            {result.warnings.length > 0 && (
              <div className="paste-warnings">
                {result.warnings.map((w, i) => (
                  <p key={i} className="paste-warning-item">
                    ⚠️ {w}
                  </p>
                ))}
              </div>
            )}

            <div className="analysis-section">
              <h3>Klassifikation</h3>
              <div className="paste-classification">
                <div className="paste-class-row">
                  <span className="paste-class-label">Inhaltsklasse:</span>
                  <span className="paste-class-value">
                    {classificationLabel(result.contentClass.content_class)}
                  </span>
                </div>
                <div className="paste-class-row">
                  <span className="paste-class-label">Konfidenz:</span>
                  <span className="paste-class-value">
                    {Math.round(result.contentClass.confidence * 100)}%
                  </span>
                </div>
                {result.contentClass.blueprint_type && (
                  <div className="paste-class-row">
                    <span className="paste-class-label">Blueprint-Typ:</span>
                    <span className="paste-class-value">
                      {result.contentClass.blueprint_type}
                    </span>
                  </div>
                )}
                <div className="paste-class-row">
                  <span className="paste-class-label">Kontamination:</span>
                  <span
                    className={`paste-class-value ${
                      contaminationLabel(
                        result.contentClass.contamination_status,
                      ).cls
                    }`}
                  >
                    {
                      contaminationLabel(
                        result.contentClass.contamination_status,
                      ).label
                    }
                  </span>
                </div>
                {result.contentClass.tags &&
                  result.contentClass.tags.length > 0 && (
                    <div className="paste-class-row">
                      <span className="paste-class-label">Tags:</span>
                      <div className="paste-tags">
                        {result.contentClass.tags.map((tag: string) => (
                          <span key={tag} className="paste-tag">
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
              </div>
              {result.contentClass.reasons &&
                result.contentClass.reasons.length > 0 && (
                  <div className="paste-reasons">
                    <h4>Begründung</h4>
                    <ul>
                      {result.contentClass.reasons.map((r, i) => (
                        <li key={i}>{r}</li>
                      ))}
                    </ul>
                  </div>
                )}
            </div>

            {/* Context Engineering Summary */}
            <div className="analysis-section">
              <h3>Prompt &amp; Context Engineering</h3>
              <div className="context-badges">
                <span className="context-type-badge">
                  {promptTypeLabel(
                    result.contextEvaluation.detected_prompt_type,
                  )}
                </span>
                <span
                  className={`context-profile-badge ${contextProfileClass(result.contextEvaluation.detected_context_profile)}`}
                >
                  {contextProfileLabel(
                    result.contextEvaluation.detected_context_profile,
                  )}
                </span>
              </div>
              <div className="context-scores">
                <MiniScoreBar
                  label="Prompt Engineering"
                  score={result.contextEvaluation.prompt_engineering_score}
                />
                <MiniScoreBar
                  label="Context Engineering"
                  score={result.contextEvaluation.context_engineering_score}
                />
                <MiniScoreBar
                  label="Robustness"
                  score={result.contextEvaluation.robustness_score}
                  title="Higher is better. 100 = minimal detected risk."
                />
              </div>
              <div className="context-overall">
                <span className="context-overall-label">Overall Quality</span>
                <span
                  className={`context-overall-value ${scoreColor(result.contextEvaluation.overall_score)}`}
                >
                  {result.contextEvaluation.overall_score}
                </span>
              </div>
            </div>

            {/* Blueprint Evaluation Summary */}
            {result.blueprintEvaluation && (
              <div className="analysis-section">
                <h3>Blueprint Bewertung</h3>
                <div className="context-scores">
                  {result.blueprintEvaluation.dimensions.map(
                    (dim: BlueprintDimensionScore) => (
                      <MiniScoreBar
                        key={dim.dimension}
                        label={dim.name}
                        score={dim.score === 0 ? 0 : dim.score === 1 ? 50 : 100}
                        title={`${dim.name}: ${dim.score === 0 ? "Fehlend" : dim.score === 1 ? "Teilweise" : "Vollständig"}`}
                      />
                    ),
                  )}
                </div>
                <div className="context-overall">
                  <span className="context-overall-label">Blueprint Score</span>
                  <span
                    className={`context-overall-value ${scoreColor(result.blueprintEvaluation.overall_score)}`}
                  >
                    {result.blueprintEvaluation.overall_score}
                  </span>
                </div>
              </div>
            )}

            {/* Info */}
            <div className="paste-info-footer">
              <p>
                ℹ️ Der eingefügte Text wurde nicht gespeichert. Länge:{" "}
                {result.contentLength.toLocaleString()} Zeichen.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Mini Components
// ---------------------------------------------------------------------------

/** Compact horizontal score bar */
const MiniScoreBar: React.FC<{
  label: string;
  score: number;
  title?: string;
}> = React.memo(function MiniScoreBar({ label, score, title }) {
  const clamped = Math.min(100, Math.max(0, score));
  return (
    <div className="context-mini-score" title={title}>
      <span className="context-mini-label">{label}</span>
      <div className="score-bar-track score-bar-track-sm">
        <div
          className={`score-bar-fill ${scoreColor(clamped)}`}
          style={{ width: `${clamped}%` }}
        />
      </div>
      <span className={`context-mini-value ${scoreColor(clamped)}`}>
        {clamped}
      </span>
    </div>
  );
});
