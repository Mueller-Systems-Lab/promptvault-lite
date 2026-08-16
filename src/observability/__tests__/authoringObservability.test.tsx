// =============================================================================
// PromptVault Lite — Authoring Observability Tests (v1.10.0)
// =============================================================================
// Privacy contract: events for prompt.create / prompt.save / prompt.save_failed
// / prompt.cancel / optimizer.apply carry operation + status, and attributes
// contain ONLY allowlisted safe metadata keys — never prompt content/title.
// =============================================================================

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useAppStore } from "@/stores/appStore";
import { OptimizationPanel } from "@/components/optimization/OptimizationPanel";
import {
  setObservabilityEnabled,
  clearAll,
  getEvents,
} from "@/observability/events";
import type { DiagnosticEvent } from "@/observability/contracts";
import type { PromptItem } from "@/types";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------
const { mockCreatePrompt, mockUpdatePrompt } = vi.hoisted(() => ({
  mockCreatePrompt: vi.fn(),
  mockUpdatePrompt: vi.fn(),
}));

vi.mock("@/lib/tauri", () => ({
  createPrompt: mockCreatePrompt,
  updatePrompt: mockUpdatePrompt,
  scanDirectory: vi.fn(() => Promise.resolve([])),
  startFileWatcher: vi.fn(() => Promise.resolve()),
  stopFileWatcher: vi.fn(() => Promise.resolve()),
  toggleFavorite: vi.fn(() => Promise.resolve(false)),
  evaluatePrompt: vi.fn(),
  analyzeHygiene: vi.fn(),
  analyzeAll: vi.fn(),
  exportJson: vi.fn(),
  exportMarkdown: vi.fn(),
  exportZip: vi.fn(),
}));

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(() => Promise.resolve(() => {})),
}));

vi.mock("@/lib/promptOptimizer", () => ({
  optimizePrompt: vi.fn((input: string, mode: string) => ({
    original: input,
    optimized: `[${mode}] ${input}`,
    changes: [{ type: "structure", description: "Applied mode" }],
    warnings: [],
  })),
}));

Object.assign(navigator, {
  clipboard: {
    writeText: vi.fn().mockResolvedValue(undefined),
  },
});

// ---------------------------------------------------------------------------
// Privacy sentinel
// ---------------------------------------------------------------------------
const SAMPLE_CONTENT =
  "PVL_AUTHORING_SAMPLE_CONTENT_7A2C — geheim — darf nie exportiert werden";
const SAMPLE_TITLE = "PVL_AUTHORING_SAMPLE_TITLE_9F31";

// The only attribute keys the authoring/apply events may carry.
const SAFE_AUTHORING_KEYS = new Set([
  "promptvault.authoring.mode",
  "promptvault.authoring.prompt_id",
  "promptvault.authoring.duration_ms",
]);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makePrompt(overrides: Partial<PromptItem> = {}): PromptItem {
  return {
    id: "obs-p1",
    file_path: "/test/obs-p1.md",
    file_name: "obs-p1.md",
    title: overrides.title ?? "Obs Titel",
    description: "",
    category: "general",
    tags: [],
    content: overrides.content ?? "Obs Inhalt",
    version: "1.0",
    raw_frontmatter: {},
    created_at: "2026-01-01T00:00:00Z",
    updated_at: "2026-01-01T00:00:00Z",
    is_favorite: false,
  };
}

function resetStore() {
  useAppStore.setState({
    prompts: [],
    selectedPromptId: null,
    evaluations: {},
    hygiene: {},
    contextEvaluations: {},
    blueprintDetections: {},
    blueprintEvaluations: {},
    isLoading: false,
    isAnalyzing: false,
    error: null,
    filters: {
      search: "",
      category: null,
      minScore: 0,
      maxScore: 100,
      hygieneStatus: null,
      tags: [],
      favoritesOnly: false,
    },
    currentFolderPath: null,
    promptEditor: null,
  });
}

function authoringEvents(): DiagnosticEvent[] {
  return getEvents().filter((e) =>
    [
      "prompt.create",
      "prompt.edit",
      "prompt.save",
      "prompt.save_failed",
      "prompt.cancel",
      "optimizer.apply",
    ].includes(e.operation),
  );
}

function assertSafeMetadataOnly(events: DiagnosticEvent[]) {
  for (const event of events) {
    for (const key of Object.keys(event.attributes ?? {})) {
      expect(
        SAFE_AUTHORING_KEYS.has(key),
        `unsafe attribute key "${key}" in ${event.operation}`,
      ).toBe(true);
    }
  }
  const serialized = JSON.stringify(events);
  expect(serialized).not.toContain(SAMPLE_CONTENT);
  expect(serialized).not.toContain(SAMPLE_TITLE);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("Authoring observability — safe metadata only", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    clearAll();
    setObservabilityEnabled(true);
    resetStore();
  });

  afterEach(() => {
    setObservabilityEnabled(false);
  });

  it("prompt.create carries operation + status, safe attributes, no content", async () => {
    mockCreatePrompt.mockResolvedValue(makePrompt({ id: "new-obs-1" }));

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", SAMPLE_TITLE);
    useAppStore.getState().updateEditorField("content", SAMPLE_CONTENT);
    await useAppStore.getState().savePromptEditor();

    const created = authoringEvents().filter(
      (e) => e.operation === "prompt.create",
    );
    expect(created.length).toBeGreaterThan(0);
    expect(created[0].status).toBe("succeeded");
    expect(created[0].attributes?.["promptvault.authoring.mode"]).toBe(
      "create",
    );
    assertSafeMetadataOnly(created);
  });

  it("prompt.edit emits when the editor opens in edit mode", () => {
    useAppStore.setState({ prompts: [makePrompt()] });
    useAppStore.getState().openEditPrompt("obs-p1");

    const edited = authoringEvents().filter(
      (e) => e.operation === "prompt.edit",
    );
    expect(edited.length).toBeGreaterThan(0);
    expect(edited[0].status).toBe("succeeded");
    expect(edited[0].attributes?.["promptvault.authoring.prompt_id"]).toBe(
      "obs-p1",
    );
    assertSafeMetadataOnly(edited);
  });

  it("prompt.save carries operation + status with safe attributes only", async () => {
    useAppStore.setState({ prompts: [makePrompt()] });
    mockUpdatePrompt.mockResolvedValue(
      makePrompt({ content: "Obs Inhalt v2" }),
    );

    useAppStore.getState().openEditPrompt("obs-p1");
    useAppStore.getState().updateEditorField("content", SAMPLE_CONTENT);
    await useAppStore.getState().savePromptEditor();

    const saved = authoringEvents().filter((e) => e.operation === "prompt.save");
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[0].status).toBe("succeeded");
    expect(saved[0].attributes?.["promptvault.authoring.mode"]).toBe("edit");
    assertSafeMetadataOnly(saved);
  });

  it("prompt.save_failed carries failed status + AUTHORING_SAVE_FAILED", async () => {
    mockCreatePrompt.mockRejectedValue(new Error("IPC boom"));

    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", SAMPLE_TITLE);
    useAppStore.getState().updateEditorField("content", SAMPLE_CONTENT);
    await useAppStore.getState().savePromptEditor();

    const failed = authoringEvents().filter(
      (e) => e.operation === "prompt.save_failed",
    );
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0].status).toBe("failed");
    expect(failed[0].reasonCode).toBe("AUTHORING_SAVE_FAILED");
    assertSafeMetadataOnly(failed);
  });

  it("prompt.cancel carries operation + status with safe metadata only", () => {
    useAppStore.getState().openCreatePrompt();
    useAppStore.getState().updateEditorField("title", SAMPLE_TITLE);
    useAppStore.getState().updateEditorField("content", SAMPLE_CONTENT);
    useAppStore.getState().closePromptEditor();

    const cancelled = authoringEvents().filter(
      (e) => e.operation === "prompt.cancel",
    );
    expect(cancelled.length).toBeGreaterThan(0);
    expect(cancelled[0].status).toBe("succeeded");
    assertSafeMetadataOnly(cancelled);
  });

  it("optimizer.apply carries operation + status with safe metadata only", () => {
    const prompt = makePrompt();
    useAppStore.setState({
      prompts: [prompt],
      selectedPromptId: prompt.id,
    });

    render(
      <OptimizationPanel
        promptContent={prompt.content}
        onClose={() => {}}
      />,
    );

    // select a mode to produce a result
    const option = screen.getByText("Conservative", { selector: "span" });
    const radio = option.closest("label")?.querySelector("input");
    if (radio) fireEvent.click(radio);

    fireEvent.click(screen.getByRole("button", { name: /übernehmen/i }));

    const applied = authoringEvents().filter(
      (e) => e.operation === "optimizer.apply",
    );
    expect(applied.length).toBeGreaterThan(0);
    expect(applied[0].status).toBe("succeeded");
    expect(applied[0].attributes?.["promptvault.authoring.prompt_id"]).toBe(
      "obs-p1",
    );
    assertSafeMetadataOnly(applied);
  });
});
