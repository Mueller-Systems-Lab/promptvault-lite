// =============================================================================
// HttpAdapter (issue #119 / F2) — Web/LAN backend against promptvault-server.
// Base URL: `VITE_API_BASE` (build/dev-time, default same-origin `/api` —
// the vite dev proxy forwards to the server; in production the server hosts
// the built UI itself, keeping everything same-origin).
// =============================================================================

import type { PromptEvaluation, PromptHygiene, PromptItem } from "@/types";
import type { BackendAdapter, BackendCapabilities } from "./types";

const envBase = (import.meta.env as { VITE_API_BASE?: string }).VITE_API_BASE;
export const API_BASE: string = envBase ? envBase.replace(/\/$/, "") : "/api";

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { "content-type": "application/json" },
    ...init,
  });
  const body: unknown = await res.json().catch(() => null);
  if (!res.ok) {
    const message =
      (body as { error?: { message?: string } } | null)?.error?.message ??
      `HTTP ${res.status}`;
    throw new Error(message);
  }
  return body as T;
}

const capabilities: BackendCapabilities = {
  nativeFolderDialog: false,
  fileWatcher: false, // server scans on demand; no tauri watcher in web mode
  nativeClipboard: false,
};

export const httpAdapter: BackendAdapter = {
  kind: "http",
  capabilities,
  async scanDirectory(path: string): Promise<PromptItem[]> {
    return apiFetch<PromptItem[]>("/scan", {
      method: "POST",
      body: JSON.stringify({ path }),
    });
  },
  async evaluatePrompt(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptEvaluation> {
    // The server analyses the CURRENT file content server-side; content and
    // trace opts are accepted for interface parity (observability spans are
    // emitted server-side in web mode).
    void content;
    void opts;
    const res = await apiFetch<{ evaluation: PromptEvaluation }>(
      `/prompts/${encodeURIComponent(promptId)}/analyze`,
      { method: "POST" },
    );
    return res.evaluation;
  },
  async analyzeHygiene(
    promptId: string,
    content: string,
    opts?: { trace?: unknown; parentSpanId?: string },
  ): Promise<PromptHygiene> {
    void content;
    void opts;
    const res = await apiFetch<{ hygiene: PromptHygiene }>(
      `/prompts/${encodeURIComponent(promptId)}/analyze`,
      { method: "POST" },
    );
    return res.hygiene;
  },
  async toggleFavorite(promptId: string): Promise<boolean> {
    const res = await apiFetch<{ is_favorite: boolean }>(
      `/favorites/${encodeURIComponent(promptId)}/toggle`,
      { method: "POST" },
    );
    return res.is_favorite;
  },
  async getFavorites(): Promise<string[]> {
    const items = await apiFetch<PromptItem[]>("/favorites");
    return items.map((i) => i.id);
  },
  async startFileWatcher(): Promise<void> {
    /* no watcher in web mode (capability-flagged) */
  },
  async stopFileWatcher(): Promise<void> {
    /* no watcher in web mode (capability-flagged) */
  },
};
