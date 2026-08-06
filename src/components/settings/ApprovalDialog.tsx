// =============================================================================
// ApprovalDialog — User confirmation for write actions
// =============================================================================
// Shown when a write action (prompts.create, prompts.update) is dispatched.
// User must explicitly approve or cancel. Escape cancels.

import { useEffect } from "react";
import type { ApprovalRequest } from "@/actions";
import { useAppStore } from "@/stores/appStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";

interface ApprovalDialogProps {
  request: ApprovalRequest;
  onApprove: () => void;
  onCancel: () => void;
}

const RISK_LABELS: Record<string, string> = {
  low: "Niedrig",
  medium: "Mittel",
  high: "Hoch",
  critical: "Kritisch",
};

const RISK_CSS: Record<string, string> = {
  low: "risk-pill-low",
  medium: "risk-pill-medium",
  high: "risk-pill-high",
  critical: "risk-pill-critical",
};

export function ApprovalDialog({
  request,
  onApprove,
  onCancel,
}: ApprovalDialogProps) {
  // Suppress unused variable warning — theme is required for CSS custom properties
  void useAppStore((s) => s.theme);

  // Escape key cancels the dialog
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onCancel]);

  return (
    <div
      className="modal-overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
    >
      <div
        className="modal-dialog approval-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Write-Action-Bestätigung"
        ref={useFocusTrap(true)}
      >
        <div className="modal-header">
          <h2>
            <span role="img" aria-label="Warnung">
              ⚠️
            </span>{" "}
            Schreibaktion bestätigen
          </h2>
        </div>

        <div className="modal-body">
          <p className="approval-description">
            Die folgende Aktion verändert Daten im Vault. Bitte bestätige, dass
            du diese Aktion ausführen möchtest.
          </p>

          <div className="approval-details">
            <div className="approval-detail-row">
              <span className="approval-detail-label">Aktion:</span>
              <code className="approval-detail-value">
                {request.actionName}
              </code>
            </div>
            <div className="approval-detail-row">
              <span className="approval-detail-label">Beschreibung:</span>
              <span className="approval-detail-value">
                {request.description}
              </span>
            </div>
            <div className="approval-detail-row">
              <span className="approval-detail-label">Risiko:</span>
              <span
                className={`risk-pill ${RISK_CSS[request.risk] || "risk-pill-low"}`}
              >
                {RISK_LABELS[request.risk] || request.risk}
              </span>
            </div>
          </div>
        </div>

        <div className="modal-footer approval-footer">
          <button
            className="btn btn-danger"
            onClick={onCancel}
            aria-label="Abbrechen — Aktion nicht ausführen"
            autoFocus
          >
            Abbrechen
          </button>
          <button
            className="btn btn-primary"
            onClick={onApprove}
            aria-label="Bestätigen — Aktion ausführen"
          >
            Bestätigen
          </button>
        </div>
      </div>
    </div>
  );
}
