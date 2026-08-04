import React from "react";
import type { ExportFormat } from "@/types";
import { useExport } from "@/hooks/useExport";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ExportDialogProps {
  onClose: () => void;
}

const FORMAT_OPTIONS: {
  value: ExportFormat;
  label: string;
  description: string;
}[] = [
  {
    value: "json",
    label: "JSON",
    description:
      "Vollständige Metadaten + Analyseergebnisse in einer JSON-Datei",
  },
  {
    value: "markdown",
    label: "Markdown",
    description: "Prompts in einer Markdown-Datei mit YAML-Frontmatter",
  },
  {
    value: "zip",
    label: "ZIP",
    description: "Original-Dateien mit Verzeichnisstruktur + metadata.json",
  },
];

export const ExportDialog: React.FC<ExportDialogProps> = ({ onClose }) => {
  const {
    isExporting,
    progress,
    error,
    exportFormat,
    setExportFormat,
    startExport,
  } = useExport();

  const [favoritesOnly, setFavoritesOnly] = React.useState(false);
  const dialogRef = useFocusTrap(true);

  const handleExport = () => {
    void startExport(favoritesOnly);
  };

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !isExporting) {
      onClose();
    }
  };

  // Escape key to close dialog
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isExporting) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => { document.removeEventListener("keydown", handleKeyDown); };
  }, [isExporting, onClose]);

  return (
    <div
      className="modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-dialog-title"
      onClick={handleOverlayClick}
    >
      <div className="modal-dialog export-dialog" ref={dialogRef}>
        <div className="modal-header">
          <h2 id="export-dialog-title">Exportieren</h2>
          <button
            type="button"
            className="btn btn-icon modal-close"
            onClick={onClose}
            disabled={isExporting}
            aria-label="Schließen"
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {/* Format selection */}
          <fieldset className="export-format-group" disabled={isExporting}>
            <legend>Format</legend>
            {FORMAT_OPTIONS.map((opt) => (
              <label
                key={opt.value}
                className={`export-format-option ${exportFormat === opt.value ? "export-format-active" : ""}`}
              >
                <input
                  type="radio"
                  name="exportFormat"
                  value={opt.value}
                  checked={exportFormat === opt.value}
                  onChange={() => { setExportFormat(opt.value); }}
                />
                <div className="export-format-info">
                  <span className="export-format-label">{opt.label}</span>
                  <span className="export-format-desc">{opt.description}</span>
                </div>
              </label>
            ))}
          </fieldset>

          {/* Favorites checkbox */}
          <div className="export-favorites-group">
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={favoritesOnly}
                onChange={(e) => { setFavoritesOnly(e.target.checked); }}
                disabled={isExporting}
              />
              Nur Favoriten exportieren
            </label>
          </div>

          {/* Progress bar */}
          {isExporting && (
            <div className="export-progress">
              <div className="export-progress-bar">
                <div
                  className="export-progress-fill"
                  style={{ width: `${progress}%` }}
                />
              </div>
              <span className="export-progress-text">
                Exportiere... {progress}%
              </span>
            </div>
          )}

          {/* Error message */}
          {error && (
            <div className="export-error">
              <p>{error}</p>
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={onClose}
            disabled={isExporting}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleExport}
            disabled={isExporting}
          >
            {isExporting ? "⏳ Exportiere..." : "📦 Exportieren"}
          </button>
        </div>
      </div>
    </div>
  );
};
