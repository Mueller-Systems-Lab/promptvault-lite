import React, { useState, useCallback, useMemo } from "react";
import { useAppStore } from "@/stores/appStore";
import {
  extractHardConstraints,
  checkConflicts,
} from "@/lib/constraintChecker";
import type {
  MissingInfoAnswer,
  GateOutcome,
  ClassifiedMissingInfo,
  MissingInfoCategory,
} from "@/types";

// =============================================================================
// Missing-Info-Gate — Modal for structured follow-up questions (#228–#232)
// =============================================================================
// Isolated UI component (Batch 4). Reads session and enriched context from
// Zustand store. Mutates via store actions. No persistence, no optimizer
// integration, no #215 variant logic, no DetailsPanel/ActionBar integration.
//
// Follows the same modal pattern as OptimizationPanel.tsx.
// =============================================================================

interface MissingInfoGateProps {
  /** ID of the prompt the gate is open for. */
  promptId: string;
  /** Original prompt content (used for constraint detection). */
  originalContent: string;
  /** Called when the user closes the gate (✕ button). */
  onClose: () => void;
  /** Optional: called when the gate completes with an outcome. */
  onComplete?: (outcome: GateOutcome) => void;
}

// =============================================================================
// Constants
// =============================================================================

/** Maximum number of REQUIRED items displayed before overflow. */
const MAX_VISIBLE_REQUIRED = 5;

/** Tier display config. */
const TIER_CONFIG: Record<
  MissingInfoCategory,
  { badge: string; badgeClass: string; label: string }
> = {
  REQUIRED: {
    badge: "REQUIRED",
    badgeClass: "gate-tier-required",
    label: "Erforderlich",
  },
  RECOMMENDED: {
    badge: "RECOMMENDED",
    badgeClass: "gate-tier-recommended",
    label: "Empfohlen",
  },
  OPTIONAL: {
    badge: "OPTIONAL",
    badgeClass: "gate-tier-optional",
    label: "Optional",
  },
};

// =============================================================================
// Sub-components: Input Widgets
// =============================================================================

interface GateInputProps {
  item: ClassifiedMissingInfo;
  value: string;
  onChange: (value: string) => void;
  disabled: boolean;
}

/** Free text input (single-line). */
const FreeTextInput: React.FC<GateInputProps> = ({
  item,
  value,
  onChange,
  disabled,
}) => (
  <input
    type="text"
    className="gate-input"
    value={value}
    onChange={(e) => {
      onChange(e.target.value);
    }}
    placeholder={item.placeholder ?? ""}
    maxLength={
      item.maxLength && item.maxLength > 0 ? item.maxLength : undefined
    }
    disabled={disabled}
    data-testid={`gate-input-${item.id}`}
  />
);

/** Free text multiline input (textarea). */
const FreeMultilineInput: React.FC<GateInputProps> = ({
  item,
  value,
  onChange,
  disabled,
}) => (
  <textarea
    className="gate-input gate-textarea"
    value={value}
    onChange={(e) => {
      onChange(e.target.value);
    }}
    placeholder={item.placeholder ?? ""}
    maxLength={
      item.maxLength && item.maxLength > 0 ? item.maxLength : undefined
    }
    rows={3}
    disabled={disabled}
    data-testid={`gate-input-${item.id}`}
  />
);

/** Single select (dropdown). */
const SingleSelectInput: React.FC<GateInputProps> = ({
  item,
  value,
  onChange,
  disabled,
}) => (
  <select
    className="gate-input gate-select"
    value={value}
    onChange={(e) => {
      onChange(e.target.value);
    }}
    disabled={disabled}
    data-testid={`gate-input-${item.id}`}
  >
    <option value="">{item.placeholder ?? "— Bitte wählen —"}</option>
    {(item.options ?? []).map((opt) => (
      <option key={opt} value={opt}>
        {opt}
      </option>
    ))}
  </select>
);

/** Multi-select (checkboxes). */
const MultiSelectInput: React.FC<GateInputProps> = ({
  item,
  value,
  onChange,
  disabled,
}) => {
  const selected = useMemo(() => {
    if (!value) return new Set<string>();
    return new Set(value.split("|").filter(Boolean));
  }, [value]);

  const toggle = useCallback(
    (opt: string) => {
      const next = new Set(selected);
      if (next.has(opt)) {
        next.delete(opt);
      } else {
        next.add(opt);
      }
      onChange(Array.from(next).join("|"));
    },
    [selected, onChange],
  );

  return (
    <div className="gate-multiselect" data-testid={`gate-input-${item.id}`}>
      {(item.options ?? []).map((opt) => (
        <label key={opt} className="gate-multiselect-option">
          <input
            type="checkbox"
            checked={selected.has(opt)}
            onChange={() => {
              toggle(opt);
            }}
            disabled={disabled}
          />
          <span>{opt}</span>
        </label>
      ))}
    </div>
  );
};

/** Boolean toggle (Ja/Nein). */
const BooleanInput: React.FC<GateInputProps> = ({
  item,
  value,
  onChange,
  disabled,
}) => (
  <div className="gate-boolean" data-testid={`gate-input-${item.id}`}>
    <label className="gate-boolean-option">
      <input
        type="radio"
        name={`bool-${item.id}`}
        value="Ja"
        checked={value === "Ja"}
        onChange={() => {
          onChange("Ja");
        }}
        disabled={disabled}
      />
      <span>Ja</span>
    </label>
    <label className="gate-boolean-option">
      <input
        type="radio"
        name={`bool-${item.id}`}
        value="Nein"
        checked={value === "Nein"}
        onChange={() => {
          onChange("Nein");
        }}
        disabled={disabled}
      />
      <span>Nein</span>
    </label>
  </div>
);

/** Renders the appropriate input widget for the item's inputType. */
const GateQuestionInput: React.FC<GateInputProps> = (props) => {
  switch (props.item.inputType) {
    case "free_text":
      return <FreeTextInput {...props} />;
    case "free_multiline":
      return <FreeMultilineInput {...props} />;
    case "single_select":
      return <SingleSelectInput {...props} />;
    case "multi_select":
      return <MultiSelectInput {...props} />;
    case "boolean":
      return <BooleanInput {...props} />;
    default:
      return <FreeTextInput {...props} item={props.item} />;
  }
};

// =============================================================================
// Main Component
// =============================================================================

export const MissingInfoGate: React.FC<MissingInfoGateProps> = ({
  promptId,
  originalContent,
  onClose,
  onComplete,
}) => {
  // --- Store selectors (memoized to stabilize useMemo/useCallback deps) ---
  // Record<string,T> indexing returns T (not T|undefined) per TS but can
  // be undefined at runtime. Match the codebase pattern from appStore.ts.
  const session = useAppStore((s) => s.missingInfoSessions[promptId]);
  const rawSkippedArr = useAppStore((s) => s.gateSkippedItems[promptId]);
  const answerGateItem = useAppStore((s) => s.answerGateItem);
  const skipGateItem = useAppStore((s) => s.skipGateItem);
  const completeGate = useAppStore((s) => s.completeGate);
  const closeGate = useAppStore((s) => s.closeGate);

  // Memoize derived values so useMemo/useCallback deps are stable
  const skippedItems: string[] = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime: Record key may not exist
    () => rawSkippedArr ?? [],
    [rawSkippedArr],
  );
  const items: ClassifiedMissingInfo[] = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
    () => (session ? session.items : []),
    [session],
  );
  const sessionAnswers: Record<string, MissingInfoAnswer> = useMemo(
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
    () => (session ? session.answers : {}),
    [session],
  );

  // --- Local UI state ---
  const [expandedRequired, setExpandedRequired] = useState(false);
  const [expandedAdvanced, setExpandedAdvanced] = useState(false);
  const [localAnswers, setLocalAnswers] = useState<Record<string, string>>({});

  // --- Derived data ---
  const requiredItems = useMemo(
    () => items.filter((i) => i.tier === "REQUIRED"),
    [items],
  );
  const recommendedItems = useMemo(
    () => items.filter((i) => i.tier === "RECOMMENDED"),
    [items],
  );
  const optionalItems = useMemo(
    () => items.filter((i) => i.tier === "OPTIONAL"),
    [items],
  );

  const visibleRequired = useMemo(
    () => requiredItems.slice(0, MAX_VISIBLE_REQUIRED),
    [requiredItems],
  );
  const overflowRequired = useMemo(
    () => requiredItems.slice(MAX_VISIBLE_REQUIRED),
    [requiredItems],
  );
  const advancedItems = useMemo(
    () => [...recommendedItems, ...optionalItems],
    [recommendedItems, optionalItems],
  );

  const hasRequired = requiredItems.length > 0;
  const hasAdvanced = advancedItems.length > 0;
  const hasOverflow = overflowRequired.length > 0;
  const totalItems = items.length;

  // Count how many REQUIRED items have answers (from store OR local state)
  const answeredRequiredCount = useMemo(() => {
    let count = 0;
    for (const item of requiredItems) {
      const ans = sessionAnswers[item.id];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
      const storeAnswer = ans ? ans.value : undefined;
      const localAnswer = localAnswers[item.id];
      // Prefer localAnswer when non-empty; fall back to store answer
      const effectiveAnswer = localAnswer ? localAnswer : storeAnswer;
      if (effectiveAnswer && effectiveAnswer.trim()) {
        count++;
      }
    }
    return count;
  }, [requiredItems, sessionAnswers, localAnswers]);

  const allRequiredAnswered = answeredRequiredCount >= requiredItems.length;

  // No session / empty state
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
  const hasNoItems = !session || totalItems === 0;
  const onlyOptional = !hasRequired && optionalItems.length > 0;

  // Conflict state: uses constraintChecker (Batch 5 integration).
  const conflicts = useMemo(() => {
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- session at runtime may be undefined (Record key)
    if (!originalContent || !session) return [];
    const constraints = extractHardConstraints(originalContent);
    const answersArray = Object.values(session.answers);
    return checkConflicts(constraints, answersArray);
  }, [originalContent, session]);

  const hasConflicts = conflicts.length > 0;

  // Human approval requirement: detected from the prompt's hard constraints
  // (not fragile string matching on detector-generated labels).
  const requireHumanApproval = useMemo(() => {
    if (!originalContent) return false;
    const constraints = extractHardConstraints(originalContent);
    return constraints.some((c) => c.category === "approval_required");
  }, [originalContent]);

  // --- Handlers ---

  /** Commit a local answer to the store. */
  const commitAnswer = useCallback(
    (itemId: string, value: string) => {
      const answer: MissingInfoAnswer = {
        itemId,
        value,
        answeredAt: new Date().toISOString(),
      };
      answerGateItem(promptId, answer);
      // Clear local state for this item
      setLocalAnswers((prev) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { [itemId]: _removed, ...rest } = prev;
        return rest;
      });
    },
    [promptId, answerGateItem],
  );

  /** Handle input change (update local state + commit to store immediately). */
  const handleInputChange = useCallback(
    (itemId: string, value: string) => {
      setLocalAnswers((prev) => ({ ...prev, [itemId]: value }));
      commitAnswer(itemId, value);
    },
    [commitAnswer],
  );

  /** Get the effective answer value (store + local overlay). */
  const getAnswerValue = useCallback(
    (itemId: string): string => {
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record<string,string>, guard for absent key
      if (localAnswers[itemId] !== undefined) return localAnswers[itemId];
      const ans = sessionAnswers[itemId];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
      return ans ? ans.value : "";
    },
    [localAnswers, sessionAnswers],
  );

  /** Check if an item has been skipped. */
  const isItemSkipped = useCallback(
    (itemId: string): boolean => skippedItems.includes(itemId),
    [skippedItems],
  );

  /** Handle "Fortfahren" (only if all REQUIRED answered, no conflicts). */
  const handleProceed = useCallback(() => {
    // Guard: all REQUIRED must be answered, no conflicts may exist
    if (!allRequiredAnswered || hasConflicts) return;
    // Commit all pending local answers first
    for (const [itemId, value] of Object.entries(localAnswers)) {
      commitAnswer(itemId, value);
    }
    completeGate(promptId, "COMPLETED");
    if (onComplete) onComplete("COMPLETED");
    onClose();
  }, [
    allRequiredAnswered,
    hasConflicts,
    localAnswers,
    commitAnswer,
    completeGate,
    promptId,
    onComplete,
    onClose,
  ]);

  /** Handle "Alle überspringen". */
  const handleSkipAll = useCallback(() => {
    completeGate(promptId, "SKIPPED");
    if (onComplete) onComplete("SKIPPED");
    onClose();
  }, [completeGate, promptId, onComplete, onClose]);

  /** Handle "Mit Annahmen fortfahren". */
  const handleAssume = useCallback(() => {
    // Fill REQUIRED items with defaultValue (placeholder as fallback)
    for (const item of requiredItems) {
      const fallback = item.defaultValue ?? item.placeholder ?? "Keine Angabe";
      const existing = getAnswerValue(item.id);
      if (!existing || !existing.trim()) {
        commitAnswer(item.id, fallback);
      }
    }
    // Commit any remaining local answers
    for (const [itemId, value] of Object.entries(localAnswers)) {
      commitAnswer(itemId, value);
    }
    completeGate(promptId, "ASSUMPTIONS");
    if (onComplete) onComplete("ASSUMPTIONS");
    onClose();
  }, [
    requiredItems,
    getAnswerValue,
    commitAnswer,
    localAnswers,
    completeGate,
    promptId,
    onComplete,
    onClose,
  ]);

  /** Handle close (✕). */
  const handleClose = useCallback(() => {
    // Commit any pending local answers before closing (so edits aren't lost)
    for (const [itemId, value] of Object.entries(localAnswers)) {
      commitAnswer(itemId, value);
    }
    closeGate();
    onClose();
  }, [localAnswers, commitAnswer, closeGate, onClose]);

  /** Handle skipping a single item (RECOMMENDED/OPTIONAL only). */
  const handleSkipItem = useCallback(
    (itemId: string) => {
      skipGateItem(promptId, itemId);
    },
    [promptId, skipGateItem],
  );

  // --- Render helpers ---

  /** Render a single question item. */
  const renderQuestion = useCallback(
    (item: ClassifiedMissingInfo, isOverflow: boolean = false) => {
      const tier = TIER_CONFIG[item.tier];
      const skipped = isItemSkipped(item.id);
      const canSkip = item.tier !== "REQUIRED";
      const value = getAnswerValue(item.id);

      return (
        <div
          key={item.id}
          className={`gate-question ${skipped ? "gate-question-skipped" : ""} ${isOverflow ? "gate-question-overflow" : ""}`}
          data-testid={`gate-question-${item.id}`}
        >
          <div className="gate-question-header">
            <span className={`gate-tier-badge ${tier.badgeClass}`}>
              {tier.badge}
            </span>
            <span className="gate-question-label">{item.label}</span>
            {canSkip && (
              <button
                className="btn btn-small gate-skip-btn"
                onClick={() => {
                  handleSkipItem(item.id);
                }}
                disabled={skipped}
                aria-label={`Frage "${item.label}" überspringen`}
                data-testid={`gate-skip-${item.id}`}
              >
                {skipped ? "Übersprungen" : "Überspringen"}
              </button>
            )}
          </div>

          <p
            className="gate-question-rationale"
            data-testid={`gate-rationale-${item.id}`}
          >
            {item.rationale}
          </p>

          {skipped ? (
            <p className="gate-skipped-notice">
              Diese Frage wurde übersprungen.
            </p>
          ) : (
            <GateQuestionInput
              item={item}
              value={value}
              onChange={(v) => {
                handleInputChange(item.id, v);
              }}
              disabled={false}
            />
          )}
        </div>
      );
    },
    [getAnswerValue, isItemSkipped, handleSkipItem, handleInputChange],
  );

  // --- States that prevent rendering ---

  // No session at all: render empty gate message
  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- Record key may not exist at runtime
  if (!session) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div
          className="modal-dialog gate-dialog"
          onClick={(e) => {
            e.stopPropagation();
          }}
          role="dialog"
          aria-label="Fehlende Informationen"
        >
          <div className="modal-header">
            <h2>❓ Fehlende Informationen</h2>
            <button
              className="btn btn-icon modal-close"
              onClick={handleClose}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="empty-state" data-testid="gate-empty-session">
              <p>Keine Analyse-Daten vorhanden.</p>
              <p className="hint">
                Bitte führe zuerst eine Analyse durch, um fehlende Informationen
                zu erkennen.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={handleClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // No items detected
  if (hasNoItems) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div
          className="modal-dialog gate-dialog"
          onClick={(e) => {
            e.stopPropagation();
          }}
          role="dialog"
          aria-label="Fehlende Informationen"
        >
          <div className="modal-header">
            <h2>❓ Fehlende Informationen</h2>
            <button
              className="btn btn-icon modal-close"
              onClick={handleClose}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="empty-state" data-testid="gate-no-items">
              <p>Keine fehlenden Informationen erkannt.</p>
              <p className="hint">
                Der Prompt ist vollständig — es wurden keine Lücken oder
                Verbesserungsmöglichkeiten gefunden.
              </p>
            </div>
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={handleClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Only OPTIONAL items — minimal gate
  if (onlyOptional) {
    return (
      <div className="modal-overlay" onClick={handleClose}>
        <div
          className="modal-dialog gate-dialog"
          onClick={(e) => {
            e.stopPropagation();
          }}
          role="dialog"
          aria-label="Fehlende Informationen"
        >
          <div className="modal-header">
            <h2>❓ Fehlende Informationen</h2>
            <button
              className="btn btn-icon modal-close"
              onClick={handleClose}
              aria-label="Schließen"
            >
              ✕
            </button>
          </div>
          <div className="modal-body">
            <div className="empty-state" data-testid="gate-optional-only">
              <p>Es sind nur optionale Verbesserungen verfügbar.</p>
              <p className="hint">
                Es wurden keine erforderlichen oder empfohlenen Fragen erkannt.
                Du kannst die optionalen Angaben bei Bedarf unter
                &quot;Erweiterte Angaben&quot; einsehen.
              </p>
            </div>
            {hasAdvanced && (
              <div className="gate-advanced-section">
                <button
                  className="btn btn-small gate-expander"
                  onClick={() => {
                    setExpandedAdvanced((v) => !v);
                  }}
                  data-testid="gate-toggle-advanced"
                >
                  {expandedAdvanced ? "▼" : "▶"} Erweiterte Angaben (
                  {advancedItems.length}{" "}
                  {advancedItems.length === 1 ? "Frage" : "Fragen"})
                </button>
                {expandedAdvanced && (
                  <div className="gate-questions-list">
                    {advancedItems.map((item) => renderQuestion(item))}
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button className="btn" onClick={handleClose}>
              Schließen
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Main gate rendering (has REQUIRED items) ---

  return (
    <div className="modal-overlay" onClick={handleClose}>
      <div
        className="modal-dialog gate-dialog"
        onClick={(e) => {
          e.stopPropagation();
        }}
        role="dialog"
        aria-label="Fehlende Informationen"
      >
        {/* Header */}
        <div className="modal-header">
          <h2>❓ Fehlende Informationen</h2>
          <button
            className="btn btn-icon modal-close"
            onClick={handleClose}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        {/* Body */}
        <div className="modal-body gate-body">
          {/* Summary */}
          <div className="gate-summary" data-testid="gate-summary">
            <span className="gate-summary-count">
              ⚠️ {requiredItems.length}{" "}
              {requiredItems.length === 1 ? "Frage muss" : "Fragen müssen"}{" "}
              beantwortet werden
            </span>
            {totalItems > requiredItems.length && (
              <span className="gate-summary-extra">
                ({totalItems - requiredItems.length} weitere vorhanden)
              </span>
            )}
          </div>

          {/* Conflict State */}
          {hasConflicts && (
            <div
              className="gate-conflict-banner"
              data-testid="gate-conflict-banner"
            >
              ⚠️ Es wurden Konflikte mit bestehenden Constraints erkannt. Bitte
              prüfe die Hinweise.
            </div>
          )}

          {/* Human Approval Required */}
          {requireHumanApproval && (
            <div
              className="gate-approval-banner"
              data-testid="gate-approval-banner"
            >
              🔒 Menschliche Freigabe erforderlich — diese Anforderung kann
              nicht automatisch gelöst werden.
            </div>
          )}

          {/* REQUIRED Questions (max. 5 visible) */}
          <div
            className="gate-questions-section"
            data-testid="gate-required-section"
          >
            <h3 className="gate-section-title">
              Erforderliche Angaben ({requiredItems.length})
            </h3>
            <div className="gate-questions-list">
              {visibleRequired.map((item) => renderQuestion(item))}
            </div>

            {/* Overflow REQUIRED (beyond 5) */}
            {hasOverflow && (
              <div className="gate-overflow-section">
                <button
                  className="btn btn-small gate-expander"
                  onClick={() => {
                    setExpandedRequired((v) => !v);
                  }}
                  data-testid="gate-toggle-overflow"
                >
                  {expandedRequired ? "▼" : "▶"} Weitere erforderliche Angaben (
                  {overflowRequired.length})
                </button>
                {expandedRequired && (
                  <div className="gate-questions-list">
                    {overflowRequired.map((item) => renderQuestion(item, true))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Advanced Section (RECOMMENDED + OPTIONAL) */}
          {hasAdvanced && (
            <div
              className="gate-advanced-section"
              data-testid="gate-advanced-section"
            >
              <button
                className="btn btn-small gate-expander"
                onClick={() => {
                  setExpandedAdvanced((v) => !v);
                }}
                data-testid="gate-toggle-advanced"
              >
                {expandedAdvanced ? "▼" : "▶"} Erweiterte Angaben (
                {advancedItems.length}{" "}
                {advancedItems.length === 1 ? "Frage" : "Fragen"})
              </button>
              {expandedAdvanced && (
                <div className="gate-questions-list">
                  {advancedItems.map((item) => renderQuestion(item))}
                </div>
              )}
            </div>
          )}

          {/* Non-ACTIVE session status notice */}
          {session.status !== "ACTIVE" && (
            <div
              className="gate-status-notice"
              data-testid="gate-status-notice"
            >
              Status der Session: {session.status}
            </div>
          )}
        </div>

        {/* Footer with action buttons */}
        <div className="modal-footer gate-footer">
          <div className="gate-footer-left">
            <button
              className="btn"
              onClick={handleClose}
              data-testid="gate-btn-cancel"
            >
              Abbrechen
            </button>
            <button
              className="btn"
              onClick={handleAssume}
              data-testid="gate-btn-assume"
            >
              🤖 Mit Annahmen fortfahren
            </button>
          </div>
          <div className="gate-footer-right">
            <button
              className="btn"
              onClick={handleSkipAll}
              data-testid="gate-btn-skip-all"
            >
              ⏭ Alle überspringen
            </button>
            <button
              className="btn btn-primary"
              onClick={handleProceed}
              disabled={!allRequiredAnswered || hasConflicts}
              data-testid="gate-btn-proceed"
              title={
                hasConflicts
                  ? "Konflikte mit bestehenden Constraints müssen zuerst gelöst werden"
                  : !allRequiredAnswered
                    ? `${requiredItems.length - answeredRequiredCount} erforderliche Fragen sind noch nicht beantwortet`
                    : "Angaben übernehmen und fortfahren"
              }
            >
              ▶ Angaben übernehmen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MissingInfoGate;
