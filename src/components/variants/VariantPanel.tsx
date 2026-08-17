// =============================================================================
// PromptVault Lite — VariantPanel Modal-Container (#215, T-215-010)
// =============================================================================
// Modal container for the direction profiles variant generation flow.
// Three phases: select (profile selection), generating (loading), results.
//
// Batch 5 scope: UI only — no ActionBar integration, no Compare/Save,
// no Persistence, no Workflow integration. Reads/writes via Zustand store.
// =============================================================================

import React, { useState, useCallback, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { isObservabilityEnabled, emitDiagnosticEvent } from "@/observability/events";
import { DirectionProfileSelector } from "./DirectionProfileSelector";
import { VariantResultList } from "./VariantResultList";
import { VariantCompare } from "./VariantCompare";
import type { DirectionProfileSelection, PromptVariant } from "@/types";

// =============================================================================
// Types
// =============================================================================

export type VariantPanelPhase = "select" | "generating" | "results";

export interface VariantPanelProps {
  /** ID of the active prompt. */
  promptId: string;
  /** Source prompt content (original or enriched). */
  sourceContent: string;
  /** Whether the source content comes from the Missing-Info-Gate. */
  enrichedContentUsed: boolean;
  /** Called when the user closes the panel (✕ button or after generation). */
  onClose: () => void;
}

// =============================================================================
// VariantPanel
// =============================================================================

export const VariantPanel: React.FC<VariantPanelProps> = ({
  promptId,
  sourceContent,
  enrichedContentUsed,
  onClose,
}) => {
  // ---------------------------------------------------------------------------
  // Store — all hooks before any conditional return
  // ---------------------------------------------------------------------------
  const selectedProfileIds = useAppStore((s) => s.selectedProfileIds);
  const customDirectionInput = useAppStore((s) => s.customDirectionInput);
  const isGenerating = useAppStore((s) => s.isGeneratingVariants);
  const generationError = useAppStore((s) => s.variantGenerationError);
  const variantResult = useAppStore((s) => s.variantResults[promptId]);
  const storeGenerateVariants = useAppStore((s) => s.generateVariants);
  const storeCloseVariantPanel = useAppStore((s) => s.closeVariantPanel);

  // ---------------------------------------------------------------------------
  // Local state
  // ---------------------------------------------------------------------------
  const [phase, setPhase] = useState<VariantPanelPhase>("select");
  const [showCompare, setShowCompare] = useState(false);
  const [compareVariant, setCompareVariant] = useState<PromptVariant | null>(
    null,
  );

  // Reset phase when prompt changes (new panel open)
  useEffect(() => {
    setPhase("select");
    setShowCompare(false);
    setCompareVariant(null);
  }, [promptId]);

  // ---------------------------------------------------------------------------
  // Handlers — defined before conditional return for hook ordering
  // ---------------------------------------------------------------------------

  const handleGenerate = useCallback(() => {
    const hasProfileSelection = selectedProfileIds.length > 0;
    const hasCustomWithText =
      selectedProfileIds.includes("custom") &&
      customDirectionInput.trim().length > 0;
    const canGen = (hasProfileSelection || hasCustomWithText) && !isGenerating;

    if (!canGen) return;

    const selection: DirectionProfileSelection = {
      selectedProfileIds,
      customDirectionText: selectedProfileIds.includes("custom")
        ? customDirectionInput
        : undefined,
    };

    setPhase("generating");

    // generateVariants is synchronous (template-based)
    storeGenerateVariants(promptId, selection);

    // Use a microtask to allow the store update to propagate
    queueMicrotask(() => {
      const store = useAppStore.getState();
      const error = store.variantGenerationError;
      const result = store.variantResults[promptId];

      if (error) {
        setPhase("select");
        // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard: Record may not have key
      } else if (result) {
        setPhase("results");
      } else {
        setPhase("select");
      }
    });
  }, [
    selectedProfileIds,
    customDirectionInput,
    isGenerating,
    promptId,
    storeGenerateVariants,
  ]);

  const handleClose = useCallback(() => {
    storeCloseVariantPanel();
    onClose();
  }, [storeCloseVariantPanel, onClose]);

  /** Open the VariantCompare for a specific variant. */
  const handleCompareOpen = useCallback((variant: PromptVariant) => {
    setCompareVariant(variant);
    setShowCompare(true);
  }, []);

  /** Close the VariantCompare and return to results. */
  const handleCompareClose = useCallback(() => {
    setShowCompare(false);
    setCompareVariant(null);
  }, []);

  /** Save a variant as a new prompt version. */
  const handleSaveVariant = useCallback(
    (variant: PromptVariant) => {
      const store = useAppStore.getState();
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard for test environments
      if (store.saveVariantAsPrompt) {
        void store.saveVariantAsPrompt(variant);
      }
      // Close everything after save
      storeCloseVariantPanel();
      onClose();
    },
    [storeCloseVariantPanel, onClose],
  );

  /** Apply a variant to the prompt editor (GA #295). */
  const handleApply = useCallback(
    (variant: PromptVariant) => {
      if (isObservabilityEnabled()) {
        emitDiagnosticEvent({
          schemaVersion: 1,
          traceId: `direction-${promptId}`,
          spanId: `direction-select-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
          timestamp: new Date().toISOString(),
          layer: "ui",
          operation: "direction.variant_select",
          stage: "apply",
          status: "succeeded",
          attributes: {
            "promptvault.direction.profile_ids": [variant.profileId],
          },
        });
      }
      const store = useAppStore.getState();
      store.applyVariantToEditor(promptId, variant);
      onClose();
    },
    [promptId, onClose],
  );

  // ---------------------------------------------------------------------------
  // Derived
  // ---------------------------------------------------------------------------
  const hasProfileSelection = selectedProfileIds.length > 0;
  const hasCustomWithText =
    selectedProfileIds.includes("custom") &&
    customDirectionInput.trim().length > 0;
  const canGenerate =
    (hasProfileSelection || hasCustomWithText) && !isGenerating;

  const sourceLabel = enrichedContentUsed
    ? "enrichedContent (Missing-Info-Gate)"
    : "Original-Prompt";

  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
  const resultVariants = variantResult?.variants ?? [];

  // ---------------------------------------------------------------------------
  // Render: Modal
  // ---------------------------------------------------------------------------
  return (
    <div className="modal-overlay" data-testid="variant-panel-overlay">
      <div
        className="modal-container variant-panel"
        data-testid="variant-panel"
      >
        {/* Header */}
        <div className="modal-header">
          <h2 className="modal-title">
            🧭 Varianten erzeugen — Richtungsprofile
          </h2>
          <button
            type="button"
            className="modal-close-btn"
            onClick={handleClose}
            aria-label="Panel schließen"
            data-testid="variant-panel-close-icon"
          >
            ✕
          </button>
        </div>

        {/* Info banner */}
        <div className="variant-panel-info" data-testid="variant-source-info">
          ℹ️ Wählen Sie eine oder mehrere Ergebnisrichtungen. Jede Richtung
          erzeugt eine eigene Prompt-Variante.
          <br />
          ℹ️ Quelle: {sourceLabel}
        </div>

        {/* Phase: select */}
        {phase === "select" && (
          <>
            <div className="variant-panel-body">
              <DirectionProfileSelector promptContent={sourceContent} />
            </div>

            {generationError && (
              <div
                className="variant-panel-error"
                data-testid="variant-generate-error"
              >
                ⚠️ {generationError}
              </div>
            )}

            <div className="variant-panel-footer">
              <button
                type="button"
                className="btn btn-secondary variant-panel-close-btn"
                onClick={handleClose}
                data-testid="variant-panel-close-btn"
              >
                ✕ Schließen
              </button>
              <button
                type="button"
                className="btn btn-primary variant-generate-btn"
                disabled={!canGenerate}
                onClick={handleGenerate}
                data-testid="variant-generate-btn"
              >
                Varianten generieren
              </button>
            </div>
          </>
        )}

        {/* Phase: generating */}
        {phase === "generating" && (
          <div
            className="variant-panel-body variant-panel-loading"
            data-testid="variant-generating-spinner"
          >
            <div className="variant-spinner" />
            <p>Varianten werden generiert ...</p>
          </div>
        )}

        {/* Phase: results */}
        {phase === "results" && (
          <>
            <div className="variant-panel-body">
              <VariantResultList
                variants={resultVariants}
                enrichedContentUsed={
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
                  variantResult?.enrichedContentUsed ?? enrichedContentUsed
                }
                sourceContent={
                  // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
                  variantResult?.sourceContent ?? sourceContent
                }
                onCompare={handleCompareOpen}
                onSave={handleSaveVariant}
                onApply={handleApply}
              />
            </div>

            <div className="variant-panel-footer">
              <button
                type="button"
                className="btn btn-secondary variant-panel-close-btn"
                onClick={handleClose}
                data-testid="variant-results-close-btn"
              >
                ✕ Schließen
              </button>
              <button
                type="button"
                className="btn btn-secondary variant-back-to-select-btn"
                onClick={() => {
                  setPhase("select");
                }}
                data-testid="variant-back-to-select-btn"
              >
                ← Zurück zur Auswahl
              </button>
            </div>
          </>
        )}
        {/* Phase: compare */}
        {showCompare && compareVariant && (
          <VariantCompare
            sourceContent={
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
              variantResult?.sourceContent ?? sourceContent
            }
            enrichedContentUsed={
              // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime guard
              variantResult?.enrichedContentUsed ?? enrichedContentUsed
            }
            variant={compareVariant}
            onSave={handleSaveVariant}
            onApply={handleApply}
            onClose={handleCompareClose}
          />
        )}
      </div>
    </div>
  );
};
