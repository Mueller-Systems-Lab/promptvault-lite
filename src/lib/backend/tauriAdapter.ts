// =============================================================================
// TauriAdapter (issue #120 / F3) — desktop shell backend.
// Thin delegation to the existing typed tauri.ts wrappers (no logic change);
// file watcher supported; native dialog/clipboard available.
// =============================================================================

import type { PromptEvaluation, PromptHygiene, PromptItem } from "@/types";
import {
  analyzeHygiene as tauriAnalyzeHygiene,
  evaluatePrompt as tauriEvaluatePrompt,
  getFavorites as tauriGetFavorites,
  scanDirectory as tauriScanDirectory,
  startFileWatcher as tauriStartFileWatcher,
  stopFileWatcher as tauriStopFileWatcher,
  toggleFavorite as tauriToggleFavorite,
} from "@/lib/tauri";
import type { BackendAdapter, BackendCapabilities } from "./types";

const capabilities: BackendCapabilities = {
  nativeFolderDialog: true,
  fileWatcher: true,
  nativeClipboard: true,
};

export const tauriAdapter: BackendAdapter = {
  kind: "tauri",
  capabilities,
  async scanDirectory(path: string): Promise<PromptItem[]> {
    return tauriScanDirectory(path);
  },
  async evaluatePrompt(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptEvaluation> {
    return tauriEvaluatePrompt(promptId, content, opts as never);
  },
  async analyzeHygiene(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptHygiene> {
    return tauriAnalyzeHygiene(promptId, content, opts as never);
  },
  async toggleFavorite(promptId: string): Promise<boolean> {
    return tauriToggleFavorite(promptId);
  },
  async getFavorites(): Promise<string[]> {
    return tauriGetFavorites();
  },
  async startFileWatcher(path: string): Promise<void> {
    return tauriStartFileWatcher(path);
  },
  async stopFileWatcher(): Promise<void> {
    return tauriStopFileWatcher();
  },
};
