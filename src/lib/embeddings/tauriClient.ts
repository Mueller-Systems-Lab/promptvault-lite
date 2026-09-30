// =============================================================================
// PromptVault Lite — Embeddings Tauri Client (Issue #199, ADR-004)
// =============================================================================
// Thin typed wrappers around the flag-gated embedding commands. The Rust side
// fails closed (PROMPTVAULT_EMBEDDINGS=1 required); these wrappers never
// bypass the flag and never return prompt content or vectors.
// =============================================================================

import { invoke } from "@tauri-apps/api/core";

/** Sanitized embeddings status (mirrors commands/embeddings.rs). */
export interface EmbeddingsStatus {
  enabled: boolean;
  provider: string;
  model: string;
  model_id: string;
  dimensions: number;
  indexed_count: number;
  ready: boolean;
}

/** Structured re-index report (mirrors commands/embeddings.rs). */
export interface ReindexReport {
  indexed: number;
  skipped_sensitive: number;
  skipped_unchanged: number;
  failed: number;
  provider: string;
  model: string;
  dimensions: number;
}

/** Sanitized semantic search hit (metadata + score only). */
export interface SemanticSearchHit {
  prompt_id: string;
  title: string;
  category: string;
  version: string;
  score: number;
}

export async function getEmbeddingsStatus(): Promise<EmbeddingsStatus> {
  return invoke<EmbeddingsStatus>("embeddings_status");
}

export async function reindexEmbeddings(): Promise<ReindexReport> {
  return invoke<ReindexReport>("embeddings_reindex");
}

export async function semanticSearch(
  query: string,
  topK?: number,
): Promise<SemanticSearchHit[]> {
  return invoke<SemanticSearchHit[]>("semantic_search", {
    query,
    topK: topK ?? null,
  });
}
