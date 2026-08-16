// =============================================================================
// PromptVault Lite — PromptEditor Modal (v1.10.0 — AUTHORING_LIFECYCLE)
// =============================================================================
// Modal for creating and editing prompts (title + content).
// Follows the app modal design system (modal-overlay / modal-container /
// modal-header / modal-close-btn, cf. VariantPanel.tsx).
//
// Data flow: reads/writes editor state via the Zustand store directly.
//   - open:       store.openCreatePrompt() / openEditPrompt(promptId)
//   - typing:     store.updateEditorField("title" | "content", value)
//   - save:       store.savePromptEditor()   (async, canonical storage layer)
//   - cancel:     store.closePromptEditor()
//
// Privacy: this component NEVER writes title/content into observability
// events — the store owns all event emission and only uses safe metadata.
// =============================================================================

import React, { useCallback, useEffect } from "react";
import { useAppStore } from "@/stores/appStore";
import { useFocusTrap } from "@/hooks/useFocusTrap";

export const PromptEditor: React.FC = () => {
  const editor = useAppStore((s) => s.promptEditor);
  const updateEditorField = useAppStore((s) => s.updateEditorField);
  const savePromptEditor = useAppStore((s) => s.savePromptEditor);
  const closePromptEditor = useAppStore((s) => s.closePromptEditor);

  const dialogRef = useFocusTrap(true);

  // Keyboard: Escape cancels (when not saving), Ctrl+S / Strg+S saves.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.isComposing || e.key === "Dead" || e.key === "Process") return;
      const current = useAppStore.getState().promptEditor;
      if (!current || current.isSaving) return;

      if (e.key === "Escape") {
        e.preventDefault();
        useAppStore.getState().closePromptEditor();
        return;
      }

      const isMac = navigator.platform.toUpperCase().includes("MAC");
      const modKey = isMac ? e.metaKey : e.ctrlKey;
      if (modKey && (e.key === "s" || e.key === "S")) {
        e.preventDefault();
        void useAppStore.getState().savePromptEditor();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  const handleTitleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      updateEditorField("title", e.target.value);
    },
    [updateEditorField],
  );

  const handleContentChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      updateEditorField("content", e.target.value);
    },
    [updateEditorField],
  );

  const handleSave = useCallback(() => {
    void savePromptEditor();
  }, [savePromptEditor]);

  const handleCancel = useCallback(() => {
    closePromptEditor();
  }, [closePromptEditor]);

  if (!editor) return null;

  const titleEmpty = editor.title.trim().length === 0;
  const contentEmpty = editor.content.trim().length === 0;
  const fieldsValid = !titleEmpty && !contentEmpty;

  // Create mode can save immediately when non-empty; edit mode requires
  // actual changes (isDirty) before the save button unlocks.
  const createModeReady = editor.mode === "create" && fieldsValid;
  const editModeReady = editor.mode === "edit" && fieldsValid && editor.isDirty;
  const canSave = !editor.isSaving && (createModeReady || editModeReady);

  const isEdit = editor.mode === "edit";

  return (
    <div className="modal-overlay">
      <div
        className="modal-container modal-dialog prompt-editor"
        role="dialog"
        aria-modal="true"
        aria-label={isEdit ? "Prompt bearbeiten" : "Neuen Prompt erstellen"}
        ref={dialogRef}
      >
        <div className="modal-header">
          <h2>{isEdit ? "✏️ Prompt bearbeiten" : "✏️ Neuer Prompt"}</h2>
          <button
            type="button"
            className="modal-close-btn btn btn-icon"
            onClick={handleCancel}
            aria-label="Editor schließen"
            disabled={editor.isSaving}
          >
            ✕
          </button>
        </div>

        <div className="modal-body">
          {editor.isDirty && (
            <div className="editor-dirty-indicator" aria-live="polite">
              <span aria-hidden="true">●</span> Ungespeicherte Änderungen
            </div>
          )}

          <div className="editor-field">
            <label htmlFor="prompt-editor-title">Titel</label>
            <input
              id="prompt-editor-title"
              type="text"
              value={editor.title}
              onChange={handleTitleChange}
              placeholder="Titel des Prompts"
              disabled={editor.isSaving}
            />
          </div>

          <div className="editor-field">
            <label htmlFor="prompt-editor-content">Inhalt</label>
            <textarea
              id="prompt-editor-content"
              value={editor.content}
              onChange={handleContentChange}
              placeholder="Prompt-Inhalt"
              rows={12}
              disabled={editor.isSaving}
            />
          </div>

          {editor.saveError && (
            <div
              id="prompt-editor-save-error"
              className="editor-save-error"
              role="alert"
            >
              ⚠️ {editor.saveError}
            </div>
          )}
        </div>

        <div className="modal-footer">
          <button
            type="button"
            className="btn"
            onClick={handleCancel}
            disabled={editor.isSaving}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleSave}
            disabled={!canSave}
            aria-describedby={
              editor.saveError ? "prompt-editor-save-error" : undefined
            }
          >
            {editor.isSaving ? "Speichern…" : "Speichern"}
          </button>
        </div>
      </div>
    </div>
  );
};
