import React, { useCallback, useState, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import ReactMarkdown from "react-markdown";
import { OptimizationPanel } from "@/components/optimization/OptimizationPanel";
import { BlueprintOptimizationPanel } from "@/components/optimization/BlueprintOptimizationPanel";
import { MissingInfoGate } from "@/components/gates/MissingInfoGate";
import { VariantPanel } from "@/components/variants/VariantPanel";
import { isMissingInfoGateEnabled } from "@/lib/missingInfoFeatureFlag";
import { isDirectionProfilesEnabled } from "@/lib/directionFeatureFlag";
import ContentClassBadge from "@/components/common/ContentClassBadge";
import { PromptAudioSummary } from "@/components/details/PromptAudioSummary";
import type { BlueprintContamination, GateOutcome } from "@/types";

// ---------------------------------------------------------------------------
// PromptContent — renders markdown for the selected prompt
// ---------------------------------------------------------------------------

export const PromptContent: React.FC = () => {
  const prompt = useAppStore((s) => s.selectedPrompt)();

  if (!prompt) return null;

  return (
    <div className="prompt-content">
      <ReactMarkdown>{prompt.content}</ReactMarkdown>
    </div>
  );
};

// ---------------------------------------------------------------------------
// PromptMeta — metadata row with optional ContentClassBadge
// ---------------------------------------------------------------------------

export const PromptMeta: React.FC = () => {
  const prompt = useAppStore((s) => s.selectedPrompt)();
  const detection = useAppStore((s) => s.selectedBlueprintDetection)();

  if (!prompt) return null;

  return (
    <div className="prompt-meta">
      <div className="meta-row">
        <span className="meta-label">Version</span>
        <span className="meta-value">{prompt.version}</span>
      </div>
      <div className="meta-row">
        <span className="meta-label">Kategorie</span>
        <span className="meta-value">
          <span className="badge">{prompt.category}</span>
          {detection?.content_class != null && (
            <ContentClassBadge
              contentClass={detection.content_class}
              size="sm"
            />
          )}
        </span>
      </div>
      {prompt.tags.length > 0 && (
        <div className="meta-row">
          <span className="meta-label">Tags</span>
          <span className="meta-value">
            {prompt.tags.map((tag) => (
              <span key={tag} className="badge badge-tag">
                {tag}
              </span>
            ))}
          </span>
        </div>
      )}
      <div className="meta-row">
        <span className="meta-label">Pfad</span>
        <span className="meta-value meta-path">{prompt.file_path}</span>
      </div>
      <div className="meta-row">
        <span className="meta-label">Erstellt</span>
        <span className="meta-value">{formatDate(prompt.created_at)}</span>
      </div>
      <div className="meta-row">
        <span className="meta-label">Geändert</span>
        <span className="meta-value">{formatDate(prompt.updated_at)}</span>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContaminationWarning — shows contamination status bar
// ---------------------------------------------------------------------------

/** Configuration for each contamination level */
const CONTAMINATION_CONFIG: Record<
  Exclude<BlueprintContamination, "CLEAN">,
  { cssModifier: string; icon: string; message: string }
> = {
  POSSIBLE_CONTAMINATION: {
    cssModifier: "contamination-possible",
    icon: "⚠️",
    message:
      "Mögliche Kontamination erkannt — dieser Inhalt enthält möglicherweise veraltete oder fremde Artefakte.",
  },
  CONTAMINATED_NEEDS_REVIEW: {
    cssModifier: "contamination-review",
    icon: "🚫",
    message:
      "Kontaminiert — manuelle Überprüfung auf ungewollte Änderungen empfohlen.",
  },
  BLOCKING_SENSITIVE_CONTENT: {
    cssModifier: "contamination-blocked",
    icon: "🔒",
    message:
      "Vertraulicher Inhalt — die Anzeige wurde aus Sicherheitsgründen blockiert.",
  },
};

/**
 * ContaminationWarning
 *
 * Reads the selected blueprint detection from the store and displays a
 * contamination warning bar when the status is not CLEAN.
 * - POSSIBLE_CONTAMINATION → yellow/orange warning bar
 * - CONTAMINATED_NEEDS_REVIEW → red warning bar
 * - BLOCKING_SENSITIVE_CONTENT → prominent red blocking bar
 * - CLEAN or no detection → renders nothing
 *
 * NEVER renders secret values, token fragments, or original content lines.
 */
export const ContaminationWarning: React.FC = () => {
  const detection = useAppStore((s) => s.selectedBlueprintDetection)();

  if (!detection) return null;

  const status = detection.contamination_status;
  if (status === "CLEAN") return null;

  const config = CONTAMINATION_CONFIG[status];

  return (
    <div
      className={`contamination-bar ${config.cssModifier}`}
      role="alert"
      aria-live="polite"
    >
      <span className="contamination-icon" aria-hidden="true">
        {config.icon}
      </span>
      <span className="contamination-message">{config.message}</span>
    </div>
  );
};

// ---------------------------------------------------------------------------
// BlockingMessage — shown when content is blocked for security
// ---------------------------------------------------------------------------

/**
 * BlockingMessage
 *
 * Displayed in place of PromptContent when contamination_status is
 * BLOCKING_SENSITIVE_CONTENT. Shows a safe, generic message without any
 * reference to the original secret values.
 */
export const BlockingMessage: React.FC = () => (
  <div className="blocking-message" role="alert" aria-live="assertive">
    <span className="blocking-message-icon" aria-hidden="true">
      🔒
    </span>
    <span className="blocking-message-text">
      Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden.
    </span>
    <span className="blocking-message-hint">
      Der Inhalt enthält vertrauliche Daten. Bitte prüfen Sie die Quelldatei
      direkt.
    </span>
  </div>
);

// ---------------------------------------------------------------------------
// ActionBar — button bar with optional Blueprint-Optimize button
// ---------------------------------------------------------------------------

export const ActionBar: React.FC<{
  onOptimize?: () => void;
  onBlueprintOptimize?: () => void;
  onMissingInfoGate?: () => void;
  onOpenVariantPanel?: () => void;
  blocked?: boolean;
}> = ({
  onOptimize,
  onBlueprintOptimize,
  onMissingInfoGate,
  onOpenVariantPanel,
  blocked = false,
}) => {
  const prompt = useAppStore((s) => s.selectedPrompt)();
  const detection = useAppStore((s) => s.selectedBlueprintDetection)();
  const toggleFavorite = useAppStore((s) => s.toggleFavorite);
  const analyzeSelected = useAppStore((s) => s.analyzeSelected);
  const openEditPrompt = useAppStore((s) => s.openEditPrompt);
  const isAnalyzing = useAppStore((s) => s.isAnalyzing);

  const handleCopy = useCallback(async () => {
    if (!prompt) return;
    try {
      await navigator.clipboard.writeText(prompt.content);
    } catch {
      try {
        const { writeText } =
          await import("@tauri-apps/plugin-clipboard-manager");
        await writeText(prompt.content);
      } catch {
        // ignore
      }
    }
  }, [prompt]);

  const handleOpenFile = useCallback(async () => {
    if (!prompt) return;
    try {
      const { open } = await import("@tauri-apps/plugin-shell");
      await open(prompt.file_path);
    } catch {
      // ignore
    }
  }, [prompt]);

  if (!prompt) return null;

  // Determine blueprint button visibility and state
  const contentClass = detection?.content_class ?? null;
  const contaminationStatus = detection?.contamination_status ?? null;
  const showBlueprintBtn =
    contentClass === "BLUEPRINT" ||
    contentClass === "PROMPT_BLUEPRINT_HYBRID" ||
    contentClass === "GUIDELINE";
  const blueprintBlocked = contaminationStatus === "BLOCKING_SENSITIVE_CONTENT";
  const optimizerBlocked = blocked || blueprintBlocked;

  // Missing-Info-Gate feature flag and session state (Batch 5)
  const gateEnabled = isMissingInfoGateEnabled(
    (typeof process !== "undefined" ? process.env : undefined) as
      | Record<string, string | undefined>
      | undefined,
  );

  const gateSession = gateEnabled
    ? useAppStore.getState().missingInfoSessions[prompt.id]
    : undefined;
  const gateRequiredCount = gateSession
    ? gateSession.items.filter((item) => item.tier === "REQUIRED").length
    : 0;
  const gateLabel =
    gateRequiredCount > 0
      ? `❓ ${gateRequiredCount} fehlende Info${gateRequiredCount === 1 ? "" : "s"}`
      : "❓ Fehlende Infos prüfen";

  // Direction Profiles feature flag (Batch 6)
  const variantEnabled = isDirectionProfilesEnabled(
    (typeof process !== "undefined" ? process.env : undefined) as
      | Record<string, string | undefined>
      | undefined,
  );

  return (
    <div className="action-bar">
      <button
        className="btn"
        onClick={() => {
          void toggleFavorite(prompt.id);
        }}
        aria-label={
          prompt.is_favorite ? "Favorit entfernen" : "Als Favorit markieren"
        }
        aria-pressed={prompt.is_favorite}
        title={
          prompt.is_favorite ? "Favorit entfernen" : "Als Favorit markieren"
        }
      >
        {prompt.is_favorite ? "⭐" : "☆"}
      </button>
      <button
        className="btn"
        onClick={() => {
          void handleCopy();
        }}
        title="Inhalt kopieren"
      >
        📋 Kopieren
      </button>
      <button
        className="btn"
        onClick={() => {
          void handleOpenFile();
        }}
        title="Datei öffnen"
      >
        📂 Öffnen
      </button>
      <button
        className="btn"
        onClick={() => {
          openEditPrompt(prompt.id);
        }}
        disabled={optimizerBlocked}
        title={
          optimizerBlocked
            ? "Bearbeitung für blockierte Inhalte nicht verfügbar"
            : "Prompt bearbeiten"
        }
        aria-label="Prompt bearbeiten"
      >
        ✏️ Bearbeiten
      </button>
      <button
        className="btn"
        onClick={onOptimize}
        disabled={!onOptimize || optimizerBlocked}
        title={
          optimizerBlocked
            ? "Optimierung für blockierte Inhalte nicht verfügbar"
            : "Prompt optimieren"
        }
      >
        ✨ Optimieren
      </button>
      <button
        className="btn btn-primary"
        onClick={() => {
          void analyzeSelected();
        }}
        disabled={isAnalyzing}
        title="Neu analysieren"
      >
        {isAnalyzing ? "⏳" : "🔄"} Analysieren
      </button>
      {showBlueprintBtn && (
        <button
          className="btn btn-primary"
          onClick={onBlueprintOptimize}
          disabled={!onBlueprintOptimize || blueprintBlocked}
          title={
            blueprintBlocked
              ? "Blueprint-Optimierung für blockierte Inhalte nicht verfügbar"
              : "Blueprint optimieren"
          }
          aria-label="Blueprint optimieren"
        >
          🔷 BP optimieren
        </button>
      )}
      {gateEnabled && onMissingInfoGate && (
        <button
          className="btn"
          onClick={onMissingInfoGate}
          title="Fehlende Informationen prüfen und ergänzen"
          data-testid="gate-actionbar-btn"
        >
          {gateLabel}
        </button>
      )}
      {variantEnabled && onOpenVariantPanel && (
        <button
          className="btn btn-primary"
          onClick={onOpenVariantPanel}
          title="Varianten mit Richtungsprofilen erzeugen"
          aria-label="Varianten erzeugen"
          data-testid="variant-actionbar-btn"
        >
          🧭 Varianten erzeugen
        </button>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// DetailsPanel — orchestrates all detail view components
// ---------------------------------------------------------------------------

export const DetailsPanel: React.FC = () => {
  const prompt = useAppStore((s) => s.selectedPrompt)();
  const detection = useAppStore((s) => s.selectedBlueprintDetection)();
  const [showOptimizer, setShowOptimizer] = useState(false);
  const [showBlueprintOptimizer, setShowBlueprintOptimizer] = useState(false);
  const [showGate, setShowGate] = useState(false);
  const [showVariantPanel, setShowVariantPanel] = useState(false);

  // Determine if content should be blocked
  const isBlocked =
    detection?.contamination_status === "BLOCKING_SENSITIVE_CONTENT";

  // Clean up optimizer state when content becomes blocked.
  // Prevents an open optimizer dialog from receiving blocked promptContent
  // after the user switches from a CLEAN prompt to a BLOCKED prompt.
  useEffect(() => {
    if (isBlocked) {
      setShowOptimizer(false);
      setShowBlueprintOptimizer(false);
    }
  }, [isBlocked]);

  // Gate feature-flag check
  const gateEnabled = isMissingInfoGateEnabled(
    (typeof process !== "undefined" ? process.env : undefined) as
      | Record<string, string | undefined>
      | undefined,
  );

  /** Open the MissingInfoGate (via ActionBar button or auto-trigger). */
  const handleOpenGate = useCallback(() => {
    if (!prompt) return;
    const store = useAppStore.getState();
    store.openMissingInfoGate(prompt.id);
    setShowGate(true);
  }, [prompt]);

  /** Open the Variant Panel (Direction Profiles, Batch 6). */
  const handleOpenVariantPanel = useCallback(() => {
    if (!prompt) return;
    const store = useAppStore.getState();
    store.openVariantPanel(prompt.id);
    setShowVariantPanel(true);
  }, [prompt]);

  /** Gate completion callback: close gate, optionally auto-open optimizer. */
  const handleGateComplete = useCallback(
    (outcome: GateOutcome) => {
      setShowGate(false);
      if (outcome !== "SKIPPED" && !isBlocked) {
        setShowOptimizer(true);
      }
    },
    [isBlocked],
  );

  /** Gate closed by user (✕ button). */
  const handleGateClose = useCallback(() => {
    setShowGate(false);
  }, []);

  const handleOpenOptimizer = useCallback(() => {
    if (!prompt || isBlocked) return;

    // Gate check: auto-open gate if REQUIRED items exist (Batch 5)
    if (gateEnabled) {
      const store = useAppStore.getState();
      const session = store.missingInfoSessions[prompt.id];
      const skipped = store.gateSkippedItems[prompt.id] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime key may be absent
      const items = session?.items ?? [];
      const hasRequired =
        items.length > 0 &&
        items.some(
          (item) => item.tier === "REQUIRED" && !skipped.includes(item.id),
        );

      if (hasRequired) {
        setShowGate(true);
        return;
      }
    }

    setShowOptimizer(true);
  }, [prompt, gateEnabled, isBlocked]);

  // Blueprint optimize — opens the optimization modal for BLUEPRINT/HYBRID content.
  // Disabled when BLOCKING_SENSITIVE_CONTENT (button stays disabled at the ActionBar level).
  const handleBlueprintOptimize = useCallback(() => {
    if (!prompt || isBlocked) return;

    // Same gate check as optimizer (Batch 5)
    if (gateEnabled) {
      const store = useAppStore.getState();
      const session = store.missingInfoSessions[prompt.id];
      const skipped = store.gateSkippedItems[prompt.id] ?? [];
      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime key may be absent
      const items = session?.items ?? [];
      const hasRequired =
        items.length > 0 &&
        items.some(
          (item) => item.tier === "REQUIRED" && !skipped.includes(item.id),
        );

      if (hasRequired) {
        setShowGate(true);
        return;
      }
    }

    setShowBlueprintOptimizer(true);
  }, [prompt, isBlocked, gateEnabled]);

  // Determine content to pass to optimizers: enriched if available, else original
  const optimizerContent = (() => {
    if (!prompt) return "";
    // Using type assertion because Record<string, EnrichedPromptContext>
    // doesn't reflect optional keys at runtime — guard with truthiness.
    const ctx = useAppStore.getState().enrichedContexts[prompt.id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime key may be absent
    return ctx && ctx.enrichedContent ? ctx.enrichedContent : prompt.content;
  })();

  // Determine content for VariantPanel: enriched if available, else original (Batch 6)
  const variantSourceContent = (() => {
    if (!prompt) return "";
    const ctx = useAppStore.getState().enrichedContexts[prompt.id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime key may be absent
    return ctx && ctx.enrichedContent ? ctx.enrichedContent : prompt.content;
  })();
  const variantEnrichedContentUsed = (() => {
    if (!prompt) return false;
    const ctx = useAppStore.getState().enrichedContexts[prompt.id];
    // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition -- runtime key may be absent
    return !!(ctx && ctx.enrichedContent);
  })();

  if (!prompt) {
    return (
      <div className="panel panel-details">
        <div className="panel-header">Prompt Details</div>
        <div className="panel-content">
          <div className="empty-state">
            <p>Kein Prompt ausgewählt.</p>
            <p className="hint">Wähle einen Prompt im Explorer aus.</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="panel panel-details">
      <div className="panel-header">
        <span>{prompt.title}</span>
        {prompt.description && (
          <span className="header-description">{prompt.description}</span>
        )}
      </div>
      <div className="panel-content">
        <PromptMeta />
        <ContaminationWarning />
        <PromptAudioSummary />
        <ActionBar
          onOptimize={handleOpenOptimizer}
          onBlueprintOptimize={handleBlueprintOptimize}
          onMissingInfoGate={handleOpenGate}
          onOpenVariantPanel={handleOpenVariantPanel}
          blocked={isBlocked}
        />
        {isBlocked ? <BlockingMessage /> : <PromptContent />}
      </div>
      {showGate && (
        <MissingInfoGate
          promptId={prompt.id}
          originalContent={prompt.content}
          onClose={handleGateClose}
          onComplete={handleGateComplete}
        />
      )}
      {showOptimizer && !isBlocked && (
        <OptimizationPanel
          promptContent={optimizerContent}
          onClose={() => {
            setShowOptimizer(false);
          }}
        />
      )}
      {showBlueprintOptimizer && !isBlocked && (
        <BlueprintOptimizationPanel
          content={optimizerContent}
          onClose={() => {
            setShowBlueprintOptimizer(false);
          }}
          onApply={(optimizedContent) => {
            // Safe onApply: copies result to clipboard as default action.
            navigator.clipboard.writeText(optimizedContent).catch(() => {});
            setShowBlueprintOptimizer(false);
          }}
        />
      )}
      {showVariantPanel && (
        <VariantPanel
          promptId={prompt.id}
          sourceContent={variantSourceContent}
          enrichedContentUsed={variantEnrichedContentUsed}
          onClose={() => {
            setShowVariantPanel(false);
          }}
        />
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString("de-DE", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return dateStr;
  }
}
