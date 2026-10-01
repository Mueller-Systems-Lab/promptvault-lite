// =============================================================================
// Backend adapter contract (issues #118/#120/#119 — F1/F3/F2, epic #97)
// =============================================================================
// The UI consumes core functionality through this interface instead of
// calling Tauri IPC directly. Two implementations exist:
//   - TauriAdapter   — desktop shell (window.__TAURI_INTERNALS__ present)
//   - HttpAdapter    — Web/LAN mode (talks to promptvault-server)
// The factory (factory.ts) picks one at runtime (issue #121 / F4).
// =============================================================================

import type { PromptEvaluation, PromptHygiene, PromptItem } from "@/types";

/** Capabilities a backend can advertise (drives UI adjustments, G2). */
export interface BackendCapabilities {
  /** Native folder dialog available (Tauri only). */
  nativeFolderDialog: boolean;
  /** File watcher supported (Tauri only — the server scans on demand). */
  fileWatcher: boolean;
  /** Clipboard via Tauri plugin (web falls back to navigator.clipboard). */
  nativeClipboard: boolean;
}

export interface BackendAdapter {
  readonly kind: "tauri" | "http";
  readonly capabilities: BackendCapabilities;
  scanDirectory(path: string): Promise<PromptItem[]>;
  /** `opts` ist backend-spezifisch (Tauri: Observability-Trace-Optionen). */
  evaluatePrompt(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptEvaluation>;
  analyzeHygiene(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptHygiene>;
  toggleFavorite(promptId: string): Promise<boolean>;
  getFavorites(): Promise<string[]>;
  /** Start/stop the file watcher; HTTP adapter resolves as a no-op. */
  startFileWatcher(path: string): Promise<void>;
  stopFileWatcher(): Promise<void>;
}
