import { useState, useCallback, useEffect, useRef } from "react";
import { useAppStore, resolveTheme } from "./stores/appStore";
import { useKeyboardShortcuts } from "./hooks/useKeyboardShortcuts";
import { useResizablePanel } from "./hooks/useResizablePanel";
import { ExplorerPanel } from "./components/explorer/ExplorerPanel";
import { DetailsPanel } from "./components/details/DetailsPanel";
import { AnalysisPanel } from "./components/analysis/AnalysisPanel";
import { PastePromptAnalyzer } from "./components/paste/PastePromptAnalyzer";
import { ExportDialog } from "./components/common/ExportDialog";
import { ThemeToggle } from "./components/common/ThemeToggle";
import { SettingsPanel } from "./components/settings/SettingsPanel";
import { AdminDiagnosticsPanel } from "./components/settings/AdminDiagnosticsPanel";
import { useObservabilityStore } from "./observability/observabilityStore";
import { ApprovalDialog } from "./components/settings/ApprovalDialog";
import { setApprovalProvider } from "./actions";
import type { ApprovalRequest } from "./actions";
import { classifyContent, evaluateBlueprint } from "./lib/blueprintDetection";
import { rememberProcessedFingerprint } from "./lib/cacheUtils";
import { installE2EBridgeIfAuthorized } from "./lib/e2eBridge";
import "./App.css";

const MIN_EXPLORER_WIDTH = 240;
const MAX_EXPLORER_WIDTH = 600;

function App() {
  const {
    scanFolder,
    analyzeAll,
    batchClassifyBlueprints,
    isLoading,
    isAnalyzing,
    error,
    prompts,
    watcherNotification,
    cleanupWatcher,
  } = useAppStore();
  const [folderPath, setFolderPath] = useState<string | null>(null);
  const [showExportDialog, setShowExportDialog] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showPasteAnalyzer, setShowPasteAnalyzer] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);
  const obsEnabled = useObservabilityStore((s) => s.isEnabled);
  const [pendingApproval, setPendingApproval] = useState<{
    request: ApprovalRequest;
    resolve: (approved: boolean) => void;
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const approvalPendingRef = useRef(false);

  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

  const isMac = navigator.platform.toUpperCase().includes("MAC");
  const modLabel = isMac ? "Cmd" : "Strg";

  // E2E-Test-Einstieg (ADR-005, Variante B — Owner-Freigabe 2026-08-05):
  // Erlaubt dem nativen E2E-Test (E19), den Archivpfad über den ECHTEN
  // scanFolder-Store-Pfad zu setzen — der macht den echten
  // scan_directory-Invoke, echte Rust-Commands und echtes Dateisystem.
  // Ersatz für den OS-Dateidialog, der unter CI-Xvfb nicht automatisierbar
  // ist (AtkAction löst GtkButton.clicked nicht aus). Kein Mock.
  // Der native Dialog selbst wird separat als E21-Smoke getestet.
  //
  // SICHERHEITSVERTRAG (ADR-005): installE2EBridgeIfAuthorized exponiert
  // die Bridge NUR, wenn is_e2e_bridge_available() true liefert (Rust,
  // cfg!(debug_assertions)). Produktions-Build: false → window.__pvlLoadArchive
  // bleibt undefined. invoke-Fehler: fail-closed. Die Bridge ersetzt
  // scanFolder nicht — der Pfad durchläuft die reale Produktvalidierung.
  useEffect(() => {
    void installE2EBridgeIfAuthorized(scanFolder);
  }, [scanFolder]);

  // Cleanup watcher on component unmount
  useEffect(() => {
    return () => {
      void cleanupWatcher();
    };
  }, [cleanupWatcher]);

  // Register the UI approval provider for write actions
  useEffect(() => {
    setApprovalProvider(async (request: ApprovalRequest): Promise<boolean> => {
      // Re-entrant guard: reject if an approval is already pending.
      // Prevents the second request from overwriting the first resolver.
      if (approvalPendingRef.current) {
        return false;
      }
      approvalPendingRef.current = true;
      return new Promise<boolean>((resolve) => {
        setPendingApproval({ request, resolve });
      });
    });

    return () => {
      setApprovalProvider(null);
      approvalPendingRef.current = false;
      // Resolve any pending approval as denied on unmount
      setPendingApproval((prev) => {
        if (prev) prev.resolve(false);
        return null;
      });
    };
  }, []);

  // Sync theme to document element
  const theme = useAppStore((s) => s.theme);
  useEffect(() => {
    const resolved = resolveTheme(theme);
    document.documentElement.setAttribute("data-theme", resolved);
  }, [theme]);

  // Re-evaluate auto theme when OS preference changes
  useEffect(() => {
    if (theme !== "auto") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = (e: MediaQueryListEvent) => {
      document.documentElement.setAttribute(
        "data-theme",
        e.matches ? "dark" : "light",
      );
    };
    mq.addEventListener("change", handleChange);
    return () => {
      mq.removeEventListener("change", handleChange);
    };
  }, [theme]);

  // T8: Auto-Detection & Auto-Evaluation for Blueprint Content
  // When the selected prompt changes, automatically classify the content
  // and evaluate if it's a BLUEPRINT or PROMPT_BLUEPRINT_HYBRID.
  const selectedPromptId = useAppStore((s) => s.selectedPromptId);
  const processedFingerprints = useRef<Map<string, string>>(new Map());

  useEffect(() => {
    if (!selectedPromptId) return;

    const state = useAppStore.getState();
    const prompt = state.prompts.find((p) => p.id === selectedPromptId);
    if (!prompt || !prompt.content) return;

    // Simple content fingerprint to avoid re-processing unchanged content.
    // Uses content length and first 64 characters as a lightweight hash.
    const contentFingerprint = `${prompt.content.length}:${prompt.content.slice(0, 64)}`;
    const lastFingerprint = processedFingerprints.current.get(selectedPromptId);
    if (lastFingerprint === contentFingerprint) return;

    try {
      const detection = classifyContent(prompt.content);
      state.setBlueprintDetection(prompt.id, detection);
      rememberProcessedFingerprint(
        processedFingerprints.current,
        selectedPromptId,
        contentFingerprint,
      );

      // Auto-evaluate for BLUEPRINT, HYBRID, and GUIDELINE content classes
      if (
        detection.content_class === "BLUEPRINT" ||
        detection.content_class === "PROMPT_BLUEPRINT_HYBRID" ||
        detection.content_class === "GUIDELINE"
      ) {
        const evaluation = evaluateBlueprint(prompt.content);
        state.setBlueprintEvaluation(prompt.id, evaluation);
      }
    } catch (_err) {
      // Error-safe: don't crash the UI, don't log content or secrets.
      console.error("Blueprint auto-detection failed");
    }
  }, [selectedPromptId]);

  const handleSelectFolder = useCallback(async () => {
    if (!isTauri) return;

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Prompt-Ordner auswählen",
      });

      if (selected && typeof selected === "string") {
        setFolderPath(selected);
        await scanFolder(selected);
        // Issue #150: Batch classify blueprint content after scan so
        // Explorer badges appear immediately. Fire-and-forget to avoid
        // blocking the UI; lazy-on-select (T8) remains as fallback.
        void batchClassifyBlueprints();
      }
    } catch (err) {
      console.error("Ordner-Auswahl fehlgeschlagen:", err);
    }
  }, [isTauri, scanFolder, batchClassifyBlueprints]);

  const handleAnalyzeAll = useCallback(async () => {
    await analyzeAll();
  }, [analyzeAll]);

  // Keyboard shortcuts
  useKeyboardShortcuts({
    onOpenFolder: isLoading || !isTauri ? undefined : handleSelectFolder,
    onFocusSearch: () => {
      searchInputRef.current?.focus();
    },
    onAnalyzeAll:
      isAnalyzing || isLoading || prompts.length === 0
        ? undefined
        : handleAnalyzeAll,
    onEscape: () => {
      useAppStore.getState().resetFilters();
      searchInputRef.current?.blur();
    },
    onExport:
      isLoading || isAnalyzing || prompts.length === 0
        ? undefined
        : () => {
            setShowExportDialog(true);
          },
  });

  const filteredCount = useAppStore((s) => s.filteredPrompts)().length;

  // Resizable explorer panel
  const explorerWidth = useAppStore((s) => s.explorerWidth);
  const setExplorerWidth = useAppStore((s) => s.setExplorerWidth);
  const { handleRef, handleProps } = useResizablePanel({
    width: explorerWidth,
    minWidth: MIN_EXPLORER_WIDTH,
    maxWidth: MAX_EXPLORER_WIDTH,
    onResize: setExplorerWidth,
  });

  return (
    <div className="app-container">
      {/* Toolbar */}
      <header className="app-toolbar">
        <h1 className="app-title">🗄️ PromptVault Lite</h1>
        <div className="toolbar-actions">
          {folderPath && (
            <span className="folder-path" title={folderPath}>
              📁 {folderPath.split(/[/\\]/).pop() || folderPath}
            </span>
          )}
          <ThemeToggle />
          <button
            className={`btn ${showPasteAnalyzer ? "btn-primary" : ""}`}
            onClick={() => {
              setShowPasteAnalyzer(!showPasteAnalyzer);
            }}
            title="Direktanalyse — Prompt ohne Datei analysieren"
            aria-label={
              showPasteAnalyzer
                ? "Zurück zur Dateiansicht"
                : "Direktanalyse öffnen"
            }
          >
            {showPasteAnalyzer ? "📁 Dateien" : "📝 Direktanalyse"}
          </button>
          <button
            className="btn"
            onClick={() => {
              setShowSettings(true);
            }}
            title="Einstellungen"
            aria-label="Einstellungen öffnen"
          >
            ⚙️
          </button>
          {obsEnabled && (
            <button
              className="btn"
              onClick={() => {
                setShowDiagnostics(true);
              }}
              title="Admin Diagnostics"
              aria-label="Admin Diagnostics öffnen"
              style={{ color: "#4caf50" }}
            >
              🔍
            </button>
          )}
          <button
            className="btn btn-primary"
            onClick={() => {
              void handleSelectFolder();
            }}
            disabled={isLoading || !isTauri}
            title={`Ordner öffnen (${modLabel}+O)`}
          >
            {isLoading ? "⏳ Scanne..." : "📁 Ordner öffnen"}
          </button>
          {prompts.length > 0 && (
            <>
              <button
                className="btn"
                onClick={() => {
                  void handleAnalyzeAll();
                }}
                disabled={isAnalyzing}
                title={`Alle analysieren (${modLabel}+Shift+A)`}
              >
                {isAnalyzing ? "⏳ Analysiere..." : "🔄 Alle analysieren"}
              </button>
              <button
                className="btn"
                onClick={() => {
                  setShowExportDialog(true);
                }}
                title={`Exportieren (${modLabel}+E)`}
              >
                📦 Exportieren
              </button>
            </>
          )}
          {error && <span className="error-message">{error}</span>}
        </div>
      </header>

      {/* Drei-Spalten-Layout (Dateimodus) / Direktanalyse (Paste-Modus) */}
      {showPasteAnalyzer ? (
        <main className="app-layout">
          <PastePromptAnalyzer />
        </main>
      ) : (
        <main
          className="app-layout"
          style={
            { "--explorer-width": explorerWidth + "px" } as React.CSSProperties
          }
        >
          <ExplorerPanel searchRef={searchInputRef} />
          <div className="resize-handle" ref={handleRef} {...handleProps} />
          <DetailsPanel />
          <AnalysisPanel />
        </main>
      )}

      {/* Statusleiste */}
      <footer className="app-statusbar">
        <span>
          {prompts.length > 0
            ? `${filteredCount} von ${prompts.length} Prompt(s)`
            : "Bereit"}
          {isLoading && " — Scanne..."}
          {isAnalyzing && " — Analysiere..."}
          {watcherNotification && (
            <span
              style={{
                marginLeft: "1em",
                color: "var(--color-accent, #4fc3f7)",
              }}
            >
              {watcherNotification}
            </span>
          )}
        </span>
        <span>PromptVault Lite v{__APP_VERSION__}</span>
      </footer>

      {/* Export Dialog */}
      {showExportDialog && (
        <ExportDialog
          onClose={() => {
            setShowExportDialog(false);
          }}
        />
      )}

      {/* Settings Panel */}
      {showSettings && (
        <SettingsPanel
          onClose={() => {
            setShowSettings(false);
          }}
        />
      )}

      {/* Admin Diagnostics Panel */}
      {showDiagnostics && (
        <AdminDiagnosticsPanel
          onClose={() => {
            setShowDiagnostics(false);
          }}
        />
      )}

      {/* Approval Dialog for write actions */}
      {pendingApproval && (
        <ApprovalDialog
          request={pendingApproval.request}
          onApprove={() => {
            approvalPendingRef.current = false;
            pendingApproval.resolve(true);
            setPendingApproval(null);
          }}
          onCancel={() => {
            approvalPendingRef.current = false;
            pendingApproval.resolve(false);
            setPendingApproval(null);
          }}
        />
      )}
    </div>
  );
}

export default App;
