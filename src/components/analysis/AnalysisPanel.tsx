import React, { useState } from "react";
import { useAppStore } from "@/stores/appStore";
import { buildPreviewContent } from "@/lib/recommendationBlocks";
import { BlueprintEvaluationPanel } from "@/components/analysis/BlueprintEvaluationPanel";
import type { RiskFlagType } from "@/types";

const scoreColor = (score: number) =>
  score >= 70 ? "score-high" : score >= 40 ? "score-medium" : "score-low";

const scoreColorHex = (score: number) => {
  if (score >= 70) return "var(--color-success)";
  if (score >= 40) return "var(--color-warning)";
  return "var(--color-danger)";
};

/** SVG circular score gauge — clamps score to [0, 100] */
const CircularScore: React.FC<{ score: number; size?: number }> = React.memo(
  function CircularScore({ score, size = 90 }) {
    const clampedScore = Math.min(100, Math.max(0, score));
    const radius = (size - 8) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (clampedScore / 100) * circumference;
    const color = scoreColorHex(clampedScore);

    return (
      <div className="circular-score" style={{ width: size, height: size }}>
        <svg viewBox={`0 0 ${size} ${size}`} className="circular-score-svg">
          {/* Background circle */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="var(--color-border)"
            strokeWidth="6"
          />
          {/* Score arc */}
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            strokeWidth="6"
            strokeLinecap="round"
            strokeDasharray={circumference}
            strokeDashoffset={offset}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{
              stroke: color,
              transition: "stroke-dashoffset 0.6s ease, stroke 0.3s ease",
            }}
          />
        </svg>
        <span className={`circular-score-value ${scoreColor(clampedScore)}`}>
          {clampedScore}
        </span>
      </div>
    );
  },
);

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

/** Severity pill for risk flags */
const severityPillClass = (severity: string): string => {
  switch (severity) {
    case "critical":
      return "risk-pill-critical";
    case "high":
      return "risk-pill-high";
    case "medium":
      return "risk-pill-medium";
    default:
      return "risk-pill-low";
  }
};

const flagLabel = (flag: RiskFlagType): string => {
  const labels: Record<RiskFlagType, string> = {
    ambiguous_task: "Ambiguous Task",
    missing_goal: "Missing Goal",
    missing_output_format: "Missing Output Format",
    missing_constraints: "Missing Constraints",
    missing_verification: "Missing Verification",
    context_missing: "Missing Context",
    context_overload: "Context Overload",
    source_of_truth_missing: "No Source of Truth",
    mixed_objectives: "Mixed Objectives",
    scope_creep_risk: "Scope Creep Risk",
    no_human_approval: "No Human Approval",
    no_evidence_contract: "No Evidence Contract",
    unbounded_agent_autonomy: "Unbounded Autonomy",
    stale_or_undated_context: "Stale Context",
  };
  return labels[flag] || flag;
};

const promptTypeLabel = (type: string): string => {
  switch (type) {
    case "simple_prompt":
      return "Simple";
    case "structured_prompt":
      return "Structured";
    case "agentic_prompt":
      return "Agentic";
    default:
      return type;
  }
};

const contextProfileLabel = (profile: string): string => {
  switch (profile) {
    case "minimal":
      return "Minimal";
    case "moderate":
      return "Moderate";
    case "rich":
      return "Rich";
    case "overloaded":
      return "Overloaded";
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

export const AnalysisPanel: React.FC = () => {
  const prompt = useAppStore((s) => s.selectedPrompt)();
  const evaluation = useAppStore((s) => s.selectedEvaluation)();
  const hygiene = useAppStore((s) => s.selectedHygiene)();
  const contextEval = useAppStore((s) => s.selectedContextEvaluation)();
  const blueprintEval = useAppStore((s) => s.selectedBlueprintEvaluation)();
  const isAnalyzing = useAppStore((s) => s.isAnalyzing);
  const analyzeSelected = useAppStore((s) => s.analyzeSelected);
  const recommendationDraft = useAppStore((s) => s.recommendationDraft);
  const startRecommendationDraft = useAppStore(
    (s) => s.startRecommendationDraft,
  );
  const updateRecommendationBlock = useAppStore(
    (s) => s.updateRecommendationBlock,
  );
  const resetRecommendationDraft = useAppStore(
    (s) => s.resetRecommendationDraft,
  );
  const applyRecommendationDraftToEditor = useAppStore(
    (s) => s.applyRecommendationDraftToEditor,
  );
  const analyzeRecommendationPreview = useAppStore(
    (s) => s.analyzeRecommendationPreview,
  );

  const [showAllImprovements, setShowAllImprovements] = useState(false);
  const [selectedRecommendations, setSelectedRecommendations] = useState<
    Set<number>
  >(new Set());
  const [isPreviewAnalyzing, setIsPreviewAnalyzing] = useState(false);

  const toggleRecommendation = (index: number) => {
    setSelectedRecommendations((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  };

  const handleReanalyze = async (): Promise<void> => {
    setIsPreviewAnalyzing(true);
    try {
      await analyzeRecommendationPreview();
    } finally {
      setIsPreviewAnalyzing(false);
    }
  };

  if (!prompt) {
    return (
      <div className="panel panel-analysis">
        <div className="panel-header">Analyse</div>
        <div className="panel-content">
          <div className="empty-state">
            <p>Keine Analyse verfügbar.</p>
            <p className="hint">
              Wähle einen Prompt und klicke auf »Analysieren«.
            </p>
          </div>
        </div>
      </div>
    );
  }

  if (isAnalyzing) {
    return (
      <div className="panel panel-analysis">
        <div className="panel-header">Analyse</div>
        <div className="panel-content">
          <div className="loading-state">
            <div className="spinner" />
            <p>Analysiere...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!evaluation && !hygiene && !blueprintEval) {
    return (
      <div className="panel panel-analysis">
        <div className="panel-header">Analyse</div>
        <div className="panel-content">
          <div className="empty-state">
            <p>Noch nicht analysiert.</p>
            <button
              className="btn btn-primary"
              onClick={() => {
                void analyzeSelected();
              }}
            >
              Jetzt analysieren
            </button>
          </div>
        </div>
      </div>
    );
  }

  const topImprovements = contextEval
    ? showAllImprovements
      ? contextEval.suggested_improvements
      : contextEval.suggested_improvements.slice(0, 3)
    : [];

  const totalImprovements = contextEval
    ? contextEval.suggested_improvements.length
    : 0;

  return (
    <div className="panel panel-analysis">
      <div className="panel-header">Analyse</div>
      <div className="panel-content">
        {/* ── Blueprint Evaluation ── */}
        {blueprintEval && (
          <div className="analysis-section analysis-section-blueprint">
            <BlueprintEvaluationPanel evaluation={blueprintEval} />
          </div>
        )}

        {/* Qualitäts-Score */}
        {evaluation && (
          <div className="analysis-section">
            <h3>Qualitätsanalyse</h3>
            <div className="score-display">
              <CircularScore score={evaluation.overall_score} />
              <span className="score-label">Gesamtwertung</span>
            </div>

            <div className="criteria-list">
              {evaluation.criteria.map((c) => (
                <div key={c.name} className="criterion-row">
                  <div className="criterion-header">
                    <span className="criterion-name">{c.name}</span>
                    <span
                      className={`criterion-score ${scoreColor(c.score * 10)}`}
                    >
                      {c.score}/{c.max_score}
                    </span>
                  </div>
                  <div className="score-bar-track">
                    <div
                      className={`score-bar-fill ${scoreColor(c.score * 10)}`}
                      style={{ width: `${(c.score / c.max_score) * 100}%` }}
                    />
                  </div>
                  <p className="criterion-detail">{c.details}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Hygiene-Score */}
        {hygiene && (
          <div className="analysis-section">
            <h3>Hygieneanalyse</h3>
            <div className="hygiene-status">
              <span className={`hygiene-badge hygiene-${hygiene.status}`}>
                {hygiene.status === "clean" && "✅ Sauber"}
                {hygiene.status === "warning" && "⚠️ Warnung"}
                {hygiene.status === "critical" && "🔴 Kritisch"}
              </span>
              <CircularScore score={hygiene.hygiene_score} size={80} />
            </div>

            {hygiene.artifacts.length > 0 && (
              <div className="artifact-list">
                <h4>Gefundene Artefakte ({hygiene.artifacts.length})</h4>
                {hygiene.artifacts.map((a) => (
                  <div
                    key={a.id}
                    className={`artifact-item severity-${a.severity}`}
                  >
                    <span className="artifact-category">{a.category}</span>
                    <span className="artifact-severity">
                      {a.severity === "critical" && (
                        <span aria-hidden="true">🔴</span>
                      )}
                      {a.severity === "warning" && (
                        <span aria-hidden="true">⚠️</span>
                      )}
                      {a.severity === "info" && (
                        <span aria-hidden="true">ℹ️</span>
                      )}
                    </span>
                    <span className="artifact-match">{a.match}</span>
                    {a.replacement_suggestion && (
                      <span className="artifact-replacement">
                        → {a.replacement_suggestion}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ── Prompt & Context Engineering Evaluation ── */}
        {contextEval && (
          <div className="analysis-section analysis-section-context">
            <h3>Prompt &amp; Context Engineering</h3>

            {/* Prompt type and context profile badges */}
            <div className="context-badges">
              <span className="context-type-badge">
                {promptTypeLabel(contextEval.detected_prompt_type)}
              </span>
              <span
                className={`context-profile-badge ${contextProfileClass(contextEval.detected_context_profile)}`}
                title={`Confidence: ${Math.round(contextEval.confidence * 100)}%`}
              >
                {contextProfileLabel(contextEval.detected_context_profile)}{" "}
                context
              </span>
            </div>

            {/* Score summary */}
            <div className="context-scores">
              <MiniScoreBar
                label="Prompt Engineering"
                score={contextEval.prompt_engineering_score}
              />
              <MiniScoreBar
                label="Context Engineering"
                score={contextEval.context_engineering_score}
              />
              {contextEval.detected_prompt_type === "agentic_prompt" && (
                <MiniScoreBar
                  label="Agent Readiness"
                  score={contextEval.agent_readiness_score}
                />
              )}
              <MiniScoreBar
                label="Robustness"
                score={contextEval.robustness_score}
                title="Higher is better. 100 = minimal detected risk."
              />
            </div>

            {/* Overall quality score */}
            <div className="context-overall">
              <span className="context-overall-label">Overall Quality</span>
              <span
                className={`context-overall-value ${scoreColor(contextEval.overall_score)}`}
              >
                {contextEval.overall_score}
              </span>
            </div>

            {/* Risk flags */}
            {contextEval.risk_flags.length > 0 && (
              <div className="context-risk-flags">
                <h4>Risk Flags ({contextEval.risk_flags.length})</h4>
                <div className="risk-flags-list">
                  {contextEval.risk_flags.map((flag) => (
                    <span
                      key={flag.flag}
                      className={`risk-pill ${severityPillClass(flag.severity)}`}
                      title={flag.message}
                    >
                      {flagLabel(flag.flag)}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Suggested improvements */}
            {topImprovements.length > 0 && (
              <div className="context-improvements">
                <h4>Suggested Improvements</h4>
                <ul className="improvements-list">
                  {topImprovements.map((imp, i) => (
                    <li
                      key={i}
                      className={`improvement-item priority-${imp.priority}`}
                    >
                      <span className="improvement-message">{imp.message}</span>
                    </li>
                  ))}
                </ul>
                {totalImprovements > 3 && !showAllImprovements && (
                  <button
                    className="btn btn-link"
                    onClick={() => {
                      setShowAllImprovements(true);
                    }}
                  >
                    Show all {totalImprovements} improvements
                  </button>
                )}
                {showAllImprovements && totalImprovements > 3 && (
                  <button
                    className="btn btn-link"
                    onClick={() => {
                      setShowAllImprovements(false);
                    }}
                  >
                    Show fewer
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Empfehlungen (Issue #45 — auswählbar und als editierbare Blöcke übernehmbar) */}
        {evaluation && evaluation.recommendations.length > 0 && !recommendationDraft && (
          <div className="analysis-section">
            <h3>Empfehlungen</h3>
            <ul className="recommendations-checklist">
              {evaluation.recommendations.map((rec, i) => (
                <li key={i} className="recommendation-item">
                  <label className="recommendation-label">
                    <input
                      type="checkbox"
                      checked={selectedRecommendations.has(i)}
                      onChange={() => {
                    toggleRecommendation(i);
                  }}
                      data-testid={`recommendation-checkbox-${i}`}
                    />
                    <span>{rec}</span>
                  </label>
                </li>
              ))}
            </ul>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              disabled={selectedRecommendations.size === 0}
              onClick={() => {
                startRecommendationDraft(
                  prompt.id,
                  evaluation.recommendations.filter((_, i) =>
                    selectedRecommendations.has(i),
                  ),
                );
              }}
              data-testid="recommendation-apply-start"
            >
              ✅ Vorschläge übernehmen ({selectedRecommendations.size})
            </button>
          </div>
        )}

        {/* Recommendation-Apply Draft (Issue #45) */}
        {recommendationDraft && recommendationDraft.promptId === prompt.id && (
          <div className="analysis-section recommendation-draft" data-testid="recommendation-draft">
            <h3>Vorschläge als Textbausteine</h3>
            {recommendationDraft.blocks.map((block) => (
              <div key={block.id} className="recommendation-block">
                <div className="recommendation-block-source" title={block.sourceRecommendation}>
                  {block.heading}
                </div>
                <textarea
                  className="recommendation-block-text"
                  value={block.text}
                  onChange={(e) => {
                    updateRecommendationBlock(
                      recommendationDraft.promptId,
                      block.id,
                      e.target.value,
                    );
                  }}
                  rows={4}
                  data-testid={`recommendation-block-${block.id}`}
                  aria-label={`Textbaustein ${block.heading}`}
                />
              </div>
            ))}
            <h4>Vorschau des umgeschriebenen Prompts</h4>
            <pre
              className="recommendation-preview"
              data-testid="recommendation-preview"
            >
              {buildPreviewContent(
                recommendationDraft.originalContent,
                recommendationDraft.blocks,
              )}
            </pre>
            <div className="recommendation-score-compare" data-testid="recommendation-score-compare">
              <h4>Vorher / Nachher</h4>
              <div className="recommendation-score-row">
                <span>Qualität:</span>
                <span data-testid="recommendation-score-before-quality">
                  {recommendationDraft.before.quality ?? "–"}
                </span>
                <span>→</span>
                <span data-testid="recommendation-score-after-quality">
                  {recommendationDraft.after?.quality ?? "–"}
                </span>
              </div>
              <div className="recommendation-score-row">
                <span>Hygiene:</span>
                <span data-testid="recommendation-score-before-hygiene">
                  {recommendationDraft.before.hygiene ?? "–"}
                </span>
                <span>→</span>
                <span data-testid="recommendation-score-after-hygiene">
                  {recommendationDraft.after?.hygiene ?? "–"}
                </span>
              </div>
            </div>
            <div className="recommendation-actions">
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={isPreviewAnalyzing}
                onClick={() => {
                  void handleReanalyze();
                }}
                data-testid="recommendation-reanalyze"
              >
                {isPreviewAnalyzing ? "⏳ Analysiere..." : "🔄 Neu analysieren"}
              </button>
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={() => {
                  applyRecommendationDraftToEditor(prompt.id);
                }}
                data-testid="recommendation-apply-to-editor"
                title="In Editor übernehmen — Speichern nur explizit im Editor"
              >
                ✏️ In Editor übernehmen
              </button>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => {
                  resetRecommendationDraft();
                  setSelectedRecommendations(new Set());
                }}
                data-testid="recommendation-reset"
              >
                ↩️ Zurücksetzen
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
