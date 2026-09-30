// =============================================================================
// SettingsPanel — Lokale Embeddings Section Tests (Issue #199)
// =============================================================================
// Verifies the flag-gated settings section: hidden when disabled/unavailable,
// visible with status when enabled, reindex + search interactions wired to
// the typed tauri client.
// =============================================================================

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { SettingsPanel } from "@/components/settings/SettingsPanel";
import * as embClient from "@/lib/embeddings/tauriClient";

vi.mock("@/lib/embeddings/tauriClient", () => ({
  getEmbeddingsStatus: vi.fn(),
  reindexEmbeddings: vi.fn(),
  semanticSearch: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

const baseStatus: embClient.EmbeddingsStatus = {
  enabled: true,
  provider: "synthetic",
  model: "feature-hash-v1",
  model_id: "synthetic-feature-hash-v1",
  dimensions: 64,
  indexed_count: 3,
  ready: true,
};

describe("SettingsPanel — Embeddings-Sektion (#199)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(embClient.getEmbeddingsStatus).mockResolvedValue(baseStatus);
  });

  it("renders the section only when the feature flag is enabled", async () => {
    vi.mocked(embClient.getEmbeddingsStatus).mockResolvedValue({
      ...baseStatus,
      enabled: false,
    });
    render(<SettingsPanel onClose={() => {}} />);
    await waitFor(() =>
      expect(vi.mocked(embClient.getEmbeddingsStatus)).toHaveBeenCalled(),
    );
    expect(
      screen.queryByTestId("embeddings-section"),
    ).not.toBeInTheDocument();
  });

  it("shows provider/model/dimensions and indexed count when enabled", async () => {
    render(<SettingsPanel onClose={() => {}} />);
    expect(
      await screen.findByTestId("embeddings-section"),
    ).toBeInTheDocument();
    expect(screen.getByText(/synthetic\/feature-hash-v1/)).toBeInTheDocument();
    expect(screen.getByText(/64/)).toBeInTheDocument();
    expect(screen.getByText(/Indexiert: 3/)).toBeInTheDocument();
  });

  it("runs a reindex and shows the structured report", async () => {
    vi.mocked(embClient.reindexEmbeddings).mockResolvedValue({
      indexed: 2,
      skipped_sensitive: 1,
      skipped_unchanged: 0,
      failed: 0,
      provider: "synthetic",
      model: "feature-hash-v1",
      dimensions: 64,
    });
    render(<SettingsPanel onClose={() => {}} />);
    await screen.findByTestId("embeddings-section");
    fireEvent.click(screen.getByRole("button", { name: /Embeddings neu indexieren/i }));
    expect(
      await screen.findByTestId("embeddings-reindex-report"),
    ).toHaveTextContent("Indexiert: 2");
    expect(screen.getByTestId("embeddings-reindex-report")).toHaveTextContent(
      "Sensibel übersprungen: 1",
    );
  });

  it("search is disabled without input and returns sanitized hits", async () => {
    vi.mocked(embClient.semanticSearch).mockResolvedValue([
      {
        prompt_id: "p1",
        title: "Suche implementieren",
        category: "tasks",
        version: "1.0",
        score: 0.812,
      },
    ]);
    render(<SettingsPanel onClose={() => {}} />);
    await screen.findByTestId("embeddings-section");
    const searchBtn = screen.getByRole("button", {
      name: /Semantische Suche ausführen/,
    });
    expect(searchBtn).toBeDisabled();
    fireEvent.change(screen.getByTestId("embeddings-search-input"), {
      target: { value: "suche" },
    });
    expect(searchBtn).not.toBeDisabled();
    fireEvent.click(searchBtn);
    const results = await screen.findByTestId("embeddings-search-results");
    expect(results).toHaveTextContent("Suche implementieren");
    expect(results).toHaveTextContent("0.812");
    // Sanitized: kein Prompt-Inhalt, nur Metadaten
    expect(vi.mocked(embClient.semanticSearch)).toHaveBeenCalledWith(
      "suche",
      10,
    );
  });
});
