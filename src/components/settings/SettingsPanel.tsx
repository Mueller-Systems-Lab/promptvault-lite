// =============================================================================
// SettingsPanel — Full Settings Modal (Issue #63)
// =============================================================================
// Expanded from the Dev-Mode-only modal (Issue #92) to a full settings dialog
// with Theme, Export, Layout, Keyboard Shortcuts, and Language sections.

import { useEffect, useState } from "react";
import { useFocusTrap } from "@/hooks/useFocusTrap";
import { useAppStore } from "@/stores/appStore";
import {
  getEmbeddingsStatus,
  reindexEmbeddings,
  semanticSearch,
  type EmbeddingsStatus,
  type ReindexReport,
  type SemanticSearchHit,
} from "@/lib/embeddings/tauriClient";
import { useObservabilityStore } from "@/observability/observabilityStore";
import type { Theme, ExportFormat } from "@/stores/appStore";

interface SettingsPanelProps {
  onClose: () => void;
}

const THEME_LABELS: Record<Theme, string> = {
  light: "Hell",
  dark: "Dunkel",
  auto: "Auto (System)",
};

const FORMAT_LABELS: Record<ExportFormat, string> = {
  json: "JSON",
  markdown: "Markdown",
  csv: "CSV",
};

const FORMAT_DESCRIPTIONS: Record<ExportFormat, string> = {
  json: "Strukturierte Daten mit Bewertungen und Hygiene-Ergebnissen",
  markdown: "Formatierte Markdown-Datei mit Frontmatter-Metadaten",
  csv: "Tabellarische Übersicht aller Prompts und Scores",
};

export function SettingsPanel({ onClose }: SettingsPanelProps) {
  const theme = useAppStore((s) => s.theme);
  const setTheme = useAppStore((s) => s.setTheme);
  const exportFormat = useAppStore((s) => s.exportFormat);
  const setExportFormat = useAppStore((s) => s.setExportFormat);
  const devMode = useAppStore((s) => s.devMode);
  const toggleDevMode = useAppStore((s) => s.toggleDevMode);
  const resetSettings = useAppStore((s) => s.resetSettings);
  const obsEnabled = useObservabilityStore((s) => s.isEnabled);
  const obsDeepEnabled = useObservabilityStore((s) => s.isDeepEnabled);
  const toggleObservability = useObservabilityStore((s) => s.toggleObservability);
  const toggleDeepDiagnostics = useObservabilityStore((s) => s.toggleDeepDiagnostics);

  // Lokale Embeddings (Issue #199) — flag-gegate, nur-lesende Anzeige
  const [embStatus, setEmbStatus] = useState<EmbeddingsStatus | null>(null);
  const [embError, setEmbError] = useState<string | null>(null);
  const [embReindexing, setEmbReindexing] = useState(false);
  const [embReport, setEmbReport] = useState<ReindexReport | null>(null);
  const [embQuery, setEmbQuery] = useState("");
  const [embResults, setEmbResults] = useState<SemanticSearchHit[] | null>(null);
  const [embSearching, setEmbSearching] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getEmbeddingsStatus()
      .then((st) => {
        if (!cancelled) setEmbStatus(st);
      })
      .catch(() => {
        // Command nicht verfügbar (z. B. Web-Modus) → Sektion bleibt verborgen
        if (!cancelled) setEmbStatus(null);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Escape key closes the modal (Issue #63 AC)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  const isMac =
    typeof navigator !== "undefined" &&
    navigator.platform.toUpperCase().includes("MAC");
  const modLabel = isMac ? "Cmd" : "Strg";

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Einstellungen"
        ref={useFocusTrap(true)}
      >
        <div className="modal-header">
          <h2>Einstellungen</h2>
          <button
            className="btn btn-icon modal-close"
            onClick={onClose}
            aria-label="Einstellungen schließen"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* ---- Theme ---- */}
          <section className="settings-section">
            <h3 className="settings-section-title">Theme</h3>
            <fieldset className="settings-radio-group">
              {(Object.keys(THEME_LABELS) as Theme[]).map((t) => (
                <label
                  key={t}
                  className={`settings-radio-option ${theme === t ? "settings-radio-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="theme"
                    value={t}
                    checked={theme === t}
                    onChange={() => {
                      setTheme(t);
                    }}
                    aria-label={THEME_LABELS[t]}
                  />
                  <span className="settings-radio-info">
                    <span className="settings-radio-label">
                      {THEME_LABELS[t]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          {/* ---- Export ---- */}
          <section className="settings-section">
            <h3 className="settings-section-title">Export</h3>
            <fieldset className="settings-radio-group">
              {(Object.keys(FORMAT_LABELS) as ExportFormat[]).map((fmt) => (
                <label
                  key={fmt}
                  className={`settings-radio-option ${exportFormat === fmt ? "settings-radio-active" : ""}`}
                >
                  <input
                    type="radio"
                    name="exportFormat"
                    value={fmt}
                    checked={exportFormat === fmt}
                    onChange={() => {
                      setExportFormat(fmt);
                    }}
                    aria-label={FORMAT_LABELS[fmt]}
                  />
                  <span className="settings-radio-info">
                    <span className="settings-radio-label">
                      {FORMAT_LABELS[fmt]}
                    </span>
                    <span className="settings-radio-desc">
                      {FORMAT_DESCRIPTIONS[fmt]}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          </section>

          {/* ---- Tastenkürzel ---- */}
          <section className="settings-section">
            <h3 className="settings-section-title">Tastenkürzel</h3>
            <div className="settings-shortcuts">
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-key">
                  <kbd>{modLabel}</kbd> + <kbd>O</kbd>
                </span>
                <span className="settings-shortcut-desc">Ordner öffnen</span>
              </div>
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-key">
                  <kbd>{modLabel}</kbd> + <kbd>E</kbd>
                </span>
                <span className="settings-shortcut-desc">Exportieren</span>
              </div>
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-key">
                  <kbd>{modLabel}</kbd> + <kbd>Shift</kbd> + <kbd>A</kbd>
                </span>
                <span className="settings-shortcut-desc">Alle analysieren</span>
              </div>
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-key">
                  <kbd>{modLabel}</kbd> + <kbd>F</kbd>
                </span>
                <span className="settings-shortcut-desc">
                  Suche fokussieren
                </span>
              </div>
              <div className="settings-shortcut-row">
                <span className="settings-shortcut-key">
                  <kbd>Esc</kbd>
                </span>
                <span className="settings-shortcut-desc">
                  Filter zurücksetzen
                </span>
              </div>
            </div>
          </section>

          {/* ---- Sprache (Platzhalter) ---- */}
          <section className="settings-section">
            <h3 className="settings-section-title">Sprache</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span className="settings-label-text">Anzeigesprache</span>
                <span className="settings-label-hint">
                  Internationalisierung (i18n) ist in Planung. Aktuell nur
                  Deutsch verfügbar.
                </span>
              </div>
              <select
                className="settings-select"
                disabled
                aria-label="Sprache"
                defaultValue="de"
              >
                <option value="de">Deutsch</option>
              </select>
            </div>
          </section>

          {/* ---- Developer Mode ---- */}
          <section className="settings-section">
            <h3 className="settings-section-title">Entwickler-Werkzeuge</h3>
            <div className="settings-row">
              <div className="settings-row-label">
                <span className="settings-label-text">Developer Mode</span>
                <span className="settings-label-hint">
                  Aktiviert den PromptVault Action Layer (10 lokale Aktionen).
                  Write-Actions erfordern zusätzliche Bestätigung.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={devMode}
                  onChange={() => {
                    toggleDevMode();
                  }}
                  aria-label="Developer Mode umschalten"
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {devMode && (
              <div className="settings-note settings-note--active">
                <strong>Developer Mode ist AKTIV</strong> — Lesende Aktionen
                sind verfügbar. Schreibende Aktionen (Erstellen, Bearbeiten)
                zeigen vor Ausführung einen Bestätigungsdialog.
              </div>
            )}

            {!devMode && (
              <div className="settings-note settings-note--inactive">
                Developer Mode ist deaktiviert. Keine Aktionen verfügbar.
              </div>
            )}

            <div className="settings-row" style={{ marginTop: "1em" }}>
              <div className="settings-row-label">
                <span className="settings-label-text">Admin Observability</span>
                <span className="settings-label-hint">
                  Echtzeit-Diagnose und Verarbeitungstransparenz. Erfasst
                  Trace-Daten, Spans und Reason Codes. Keine Prompt-Inhalte.
                  Lokal, kein Netzwerk.
                </span>
              </div>
              <label className="toggle-switch">
                <input
                  type="checkbox"
                  checked={obsEnabled}
                  onChange={() => {
                    toggleObservability();
                  }}
                  aria-label="Admin Observability umschalten"
                />
                <span className="toggle-slider" />
              </label>
            </div>

            {obsEnabled && (
              <>
                <div className="settings-note settings-note--active">
                  <strong>ADMIN DIAGNOSTICS ● ACTIVE</strong> — Verarbeitung
                  wird überwacht. Keine Prompt-Volltexte, keine Secrets.
                </div>

                <div className="settings-row" style={{ marginTop: "0.5em" }}>
                  <div className="settings-row-label">
                    <span className="settings-label-text">Deep Diagnostics</span>
                    <span className="settings-label-hint">
                      Erweiterte Diagnose mit Rohdaten. Session-only. Wird bei
                      App-Neustart zurückgesetzt.
                    </span>
                  </div>
                  <label className="toggle-switch">
                    <input
                      type="checkbox"
                      checked={obsDeepEnabled}
                      onChange={() => {
                        toggleDeepDiagnostics();
                      }}
                      aria-label="Deep Diagnostics umschalten"
                    />
                    <span className="toggle-slider" />
                  </label>
                </div>

                {obsDeepEnabled && (
                  <div className="settings-note settings-note--active">
                    <strong>DEEP DIAGNOSTICS ● ACTIVE</strong> — Rohdaten
                    werden erfasst. Sichtbar nur in dieser Session.
                  </div>
                )}
              </>
            )}

            {!obsEnabled && (
              <div className="settings-note settings-note--inactive">
                Admin Observability ist deaktiviert. Keine Trace-Daten werden
                erfasst.
              </div>
            )}
          </section>

          {/* ---- Lokale Embeddings (Issue #199, flag-gegate) ---- */}
          {embStatus?.enabled && (
            <section className="settings-section" data-testid="embeddings-section">
              <h3 className="settings-section-title">
                Lokale Embeddings (experimentell)
              </h3>
              <div className="settings-note settings-note--active">
                <strong>Feature-Flag aktiv</strong> — Provider{" "}
                {embStatus.provider}/{embStatus.model} ({embStatus.dimensions}{" "}
                Dimensionen, synthetisch). Indexiert: {embStatus.indexed_count}{" "}
                Prompts. Hinweis: Die Vektoren sind ein struktureller
                Ähnlichkeits-Proxy — kein semantisches Modell (ADR-004).
              </div>
              <div className="settings-row" style={{ marginTop: "0.5em" }}>
                <div className="settings-row-label">
                  <span className="settings-label-text">Index aktualisieren</span>
                  <span className="settings-label-hint">
                    Explizite Neu-Indexierung. Sensible Prompts (Critical/PII/Secret)
                    werden übersprungen; unveränderte Prompts werden per Hash erkannt.
                  </span>
                </div>
                <button
                  className="btn"
                  disabled={embReindexing}
                  onClick={() => {
                    setEmbReindexing(true);
                    setEmbError(null);
                    reindexEmbeddings()
                      .then((rep) => {
                        setEmbReport(rep);
                        return getEmbeddingsStatus();
                      })
                      .then((st) => {
                        setEmbStatus(st);
                      })
                      .catch((e: unknown) => {
                        setEmbError(e instanceof Error ? e.message : String(e));
                      })
                      .finally(() => {
                        setEmbReindexing(false);
                      });
                  }}
                  aria-label="Embeddings neu indexieren"
                >
                  {embReindexing ? "⏳ Indexiere..." : "🔄 Neu indexieren"}
                </button>
              </div>
              {embReport && (
                <div className="settings-note" data-testid="embeddings-reindex-report">
                  Indexiert: {embReport.indexed} · Sensibel übersprungen:{" "}
                  {embReport.skipped_sensitive} · Unverändert übersprungen:{" "}
                  {embReport.skipped_unchanged} · Fehler: {embReport.failed}
                </div>
              )}
              {embError && (
                <div className="settings-note settings-note--inactive">
                  Fehler: {embError}
                </div>
              )}
              <div className="settings-row" style={{ marginTop: "0.5em" }}>
                <div className="settings-row-label">
                  <span className="settings-label-text">Semantische Suche (Test)</span>
                  <span className="settings-label-hint">
                    Advisory-Ergebnisse mit Titel/Kategorie/Score — nie Prompt-Inhalt.
                  </span>
                </div>
              </div>
              <div style={{ display: "flex", gap: "0.5em", alignItems: "center" }}>
                <input
                  type="text"
                  className="settings-input"
                  value={embQuery}
                  onChange={(e) => {
                    setEmbQuery(e.target.value);
                  }}
                  placeholder="Suchbegriffe…"
                  aria-label="Semantische Suche (Embeddings)"
                  data-testid="embeddings-search-input"
                />
                <button
                  className="btn"
                  disabled={embSearching || embQuery.trim().length === 0}
                  onClick={() => {
                    setEmbSearching(true);
                    semanticSearch(embQuery, 10)
                      .then((hits) => {
                        setEmbResults(hits);
                      })
                      .catch((e: unknown) => {
                        setEmbError(e instanceof Error ? e.message : String(e));
                      })
                      .finally(() => {
                        setEmbSearching(false);
                      });
                  }}
                  aria-label="Semantische Suche ausführen"
                >
                  {embSearching ? "⏳" : "🔍"}
                </button>
              </div>
              {embResults && (
                <ul className="settings-note" data-testid="embeddings-search-results">
                  {embResults.length === 0 && <li>Keine Treffer.</li>}
                  {embResults.map((h) => (
                    <li key={h.prompt_id}>
                      {h.title} ({h.category}) — Score {h.score.toFixed(3)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </div>

        <div className="modal-footer">
          <button
            className="btn"
            onClick={() => {
              resetSettings();
            }}
            aria-label="Alle Einstellungen zurücksetzen"
          >
            Zurücksetzen
          </button>
          <button
            className="btn btn-primary"
            onClick={onClose}
            aria-label="Einstellungen schließen"
          >
            Schließen
          </button>
        </div>
      </div>
    </div>
  );
}
