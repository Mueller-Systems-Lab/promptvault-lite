import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  act,
  waitFor,
} from "@testing-library/react";
import {
  DetailsPanel,
  PromptMeta,
  ContaminationWarning,
  BlockingMessage,
  ActionBar,
} from "../DetailsPanel";
import { OptimizationPanel } from "@/components/optimization/OptimizationPanel";
import { BlueprintOptimizationPanel } from "@/components/optimization/BlueprintOptimizationPanel";
import { useAppStore } from "@/stores/appStore";
import type {
  PromptItem,
  BlueprintDetectOutput,
  BlueprintContamination,
  MissingInfoSession,
} from "@/types";

// ---------------------------------------------------------------------------
// Note: Missing-Info-Gate and Direction Profiles are GA since v1.11.0 — no
// feature-flag mocks are needed. The ActionBar always renders both buttons.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Create a minimal PromptItem for tests */
function makePrompt(overrides: Partial<PromptItem> = {}): PromptItem {
  return {
    id: "test-prompt-1",
    file_path: "/test/prompt.md",
    file_name: "prompt.md",
    title: "Test Prompt",
    description: "A test prompt",
    content: "This is the prompt content.",
    category: "general",
    tags: [],
    version: "1.0",
    raw_frontmatter: {},
    created_at: "2024-01-01T00:00:00Z",
    updated_at: "2024-01-02T00:00:00Z",
    is_favorite: false,
    ...overrides,
  };
}

/** Create a BlueprintDetectOutput for tests */
function makeDetection(
  contentClass: BlueprintDetectOutput["content_class"],
  contamination: BlueprintContamination = "CLEAN",
): BlueprintDetectOutput {
  return {
    content_class: contentClass,
    blueprint_type: null,
    contamination_status: contamination,
    confidence: 0.95,
    prompt_signals: [],
    blueprint_signals: [],
    contamination_signals: [],
  };
}

function resetStore() {
  useAppStore.setState({
    prompts: [],
    evaluations: {},
    hygiene: {},
    contextEvaluations: {},
    blueprintDetections: {},
    blueprintEvaluations: {},
    selectedPromptId: null,
    expandedFolders: new Set<string>(),
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
    isLoading: false,
    isAnalyzing: false,
    error: null,
    // Gate-related fields (Batch 6A)
    missingInfoSessions: {},
    enrichedContexts: {},
    isGateOpen: false,
    activeGatePromptId: null,
    gateSkippedItems: {},
  });
}

/**
 * Set up the store with a selected prompt and optional blueprint detection.
 * Returns the prompt ID.
 */
function setupStore(
  prompt: PromptItem,
  detection?: BlueprintDetectOutput,
): string {
  useAppStore.setState({
    prompts: [prompt],
    selectedPromptId: prompt.id,
  });
  if (detection) {
    useAppStore.getState().setBlueprintDetection(prompt.id, detection);
  }
  return prompt.id;
}

// ---------------------------------------------------------------------------
// T4 — PromptMeta ContentClassBadge integration
// ---------------------------------------------------------------------------

describe("PromptMeta — ContentClassBadge", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows ContentClassBadge for BLUEPRINT", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<PromptMeta />);

    expect(screen.getByText("Blueprint")).toBeInTheDocument();
  });

  it("shows ContentClassBadge for PROMPT_BLUEPRINT_HYBRID", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT_BLUEPRINT_HYBRID"));

    render(<PromptMeta />);

    expect(screen.getByText("Hybrid")).toBeInTheDocument();
  });

  it("shows ContentClassBadge for PROMPT (gray badge)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<PromptMeta />);

    expect(screen.getByText("Prompt")).toBeInTheDocument();
  });

  it("shows ContentClassBadge for UNKNOWN_NEEDS_REVIEW", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("UNKNOWN_NEEDS_REVIEW"));

    render(<PromptMeta />);

    expect(screen.getByText("Review")).toBeInTheDocument();
  });

  it("shows no badge when no detection exists", () => {
    const prompt = makePrompt();
    setupStore(prompt); // no detection

    render(<PromptMeta />);

    expect(screen.queryByText("Blueprint")).not.toBeInTheDocument();
    expect(screen.queryByText("Hybrid")).not.toBeInTheDocument();
    expect(screen.queryByText("Prompt")).not.toBeInTheDocument();
    expect(screen.queryByText("Review")).not.toBeInTheDocument();
  });

  it("shows no badge when no prompt is selected", () => {
    resetStore();
    render(<PromptMeta />);
    // component returns null — nothing rendered
    expect(screen.queryByText("Version")).not.toBeInTheDocument();
  });

  it("existing category badge still renders alongside ContentClassBadge", () => {
    const prompt = makePrompt({ category: "architecture" });
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<PromptMeta />);

    // Existing category badge
    expect(screen.getByText("architecture")).toBeInTheDocument();
    // New ContentClass badge
    expect(screen.getByText("Blueprint")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T4 — ContaminationWarning
// ---------------------------------------------------------------------------

describe("ContaminationWarning", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows POSSIBLE_CONTAMINATION warning", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT", "POSSIBLE_CONTAMINATION"));

    render(<ContaminationWarning />);

    expect(
      screen.getByText(/Mögliche Kontamination erkannt/),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("contamination-possible");
  });

  it("shows CONTAMINATED_NEEDS_REVIEW warning", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT", "CONTAMINATED_NEEDS_REVIEW"));

    render(<ContaminationWarning />);

    expect(
      screen.getByText(/Kontaminiert — manuelle Überprüfung/),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("contamination-review");
  });

  it("shows BLOCKING_SENSITIVE_CONTENT warning", () => {
    const prompt = makePrompt();
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ContaminationWarning />);

    expect(
      screen.getByText(
        /Vertraulicher Inhalt — die Anzeige wurde aus Sicherheitsgründen blockiert/,
      ),
    ).toBeInTheDocument();
    const alert = screen.getByRole("alert");
    expect(alert.className).toContain("contamination-blocked");
  });

  it("does NOT show warning for CLEAN status", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    const { container } = render(<ContaminationWarning />);

    expect(container.firstChild).toBeNull();
  });

  it("does NOT show warning when no detection exists", () => {
    const prompt = makePrompt();
    setupStore(prompt); // no detection

    const { container } = render(<ContaminationWarning />);

    expect(container.firstChild).toBeNull();
  });

  it("does NOT show warning when no prompt selected", () => {
    resetStore();
    const { container } = render(<ContaminationWarning />);
    expect(container.firstChild).toBeNull();
  });

  // SECURITY: Warning must never expose secret values
  it("does NOT render contamination_signals in the DOM", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT", "POSSIBLE_CONTAMINATION"));

    render(<ContaminationWarning />);

    // The warning message is generic — it must not contain signal details
    const alert = screen.getByRole("alert");
    expect(alert.textContent).not.toContain("API_KEY");
    expect(alert.textContent).not.toContain("password");
    expect(alert.textContent).not.toContain("secret");
    expect(alert.textContent).not.toContain("token");
  });
});

// ---------------------------------------------------------------------------
// T4 — BlockingMessage (Secret-safe content masking)
// ---------------------------------------------------------------------------

describe("BlockingMessage", () => {
  it("renders blocking message text", () => {
    render(<BlockingMessage />);

    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Der Inhalt enthält vertrauliche Daten/),
    ).toBeInTheDocument();
  });

  it("has alert role for accessibility", () => {
    render(<BlockingMessage />);
    const alert = screen.getByRole("alert", { name: undefined });
    expect(alert).toBeInTheDocument();
    expect(alert.getAttribute("aria-live")).toBe("assertive");
  });

  // SECURITY: BlockingMessage must NEVER render secret values
  it("does NOT contain any secret-like strings", () => {
    render(<BlockingMessage />);

    const html = document.body.innerHTML;
    expect(html).not.toContain("API_KEY");
    expect(html).not.toContain("sk-");
    expect(html).not.toContain("password");
    expect(html).not.toContain("secret");
    expect(html).not.toContain("token");
    expect(html).not.toContain("Bearer");
  });
});

// ---------------------------------------------------------------------------
// T4 — ActionBar Blueprint Optimize Button
// ---------------------------------------------------------------------------

describe("ActionBar — Blueprint Optimize Button", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("shows 'BP optimieren' button for BLUEPRINT content", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<ActionBar />);

    expect(screen.getByText("🔷 BP optimieren")).toBeInTheDocument();
  });

  it("shows 'BP optimieren' button for PROMPT_BLUEPRINT_HYBRID", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT_BLUEPRINT_HYBRID"));

    render(<ActionBar />);

    expect(screen.getByText("🔷 BP optimieren")).toBeInTheDocument();
  });

  it("hides 'BP optimieren' button for PROMPT", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar />);

    expect(screen.queryByText("🔷 BP optimieren")).not.toBeInTheDocument();
  });

  it("hides 'BP optimieren' button for UNKNOWN_NEEDS_REVIEW", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("UNKNOWN_NEEDS_REVIEW"));

    render(<ActionBar />);

    expect(screen.queryByText("🔷 BP optimieren")).not.toBeInTheDocument();
  });

  it("hides 'BP optimieren' button when no detection exists", () => {
    const prompt = makePrompt();
    setupStore(prompt);

    render(<ActionBar />);

    expect(screen.queryByText("🔷 BP optimieren")).not.toBeInTheDocument();
  });

  it("disables blueprint button when BLOCKING_SENSITIVE_CONTENT", () => {
    const prompt = makePrompt();
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ActionBar />);

    const btn = screen.getByText("🔷 BP optimieren");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("nicht verfügbar");
  });

  it("blueprint button is disabled when no onBlueprintOptimize callback provided", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<ActionBar />); // no onBlueprintOptimize prop

    const btn = screen.getByText("🔷 BP optimieren");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("Blueprint optimieren");
  });

  it("blueprint button is ENABLED when onBlueprintOptimize callback provided for BLUEPRINT", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<ActionBar onBlueprintOptimize={vi.fn()} />);

    const btn = screen.getByText("🔷 BP optimieren");
    expect(btn).not.toBeDisabled();
    expect(btn.getAttribute("title")).toContain("Blueprint optimieren");
  });

  it("blueprint button is ENABLED when onBlueprintOptimize callback provided for HYBRID", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT_BLUEPRINT_HYBRID", "CLEAN"));

    render(<ActionBar onBlueprintOptimize={vi.fn()} />);

    const btn = screen.getByText("🔷 BP optimieren");
    expect(btn).not.toBeDisabled();
  });

  it("blueprint button remains disabled for BLOCKING_SENSITIVE_CONTENT even with callback", () => {
    const prompt = makePrompt();
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ActionBar onBlueprintOptimize={vi.fn()} />);

    const btn = screen.getByText("🔷 BP optimieren");
    expect(btn).toBeDisabled();
    expect(btn.getAttribute("title")).toContain("nicht verfügbar");
  });

  it("existing 'Optimieren' button still visible", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<ActionBar onOptimize={vi.fn()} />);

    expect(screen.getByText("✨ Optimieren")).toBeInTheDocument();
  });

  it("existing 'Analysieren' button still visible", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<ActionBar />);

    expect(screen.getByText(/Analysieren/)).toBeInTheDocument();
  });

  it("existing 'Kopieren' button still visible", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("BLUEPRINT"));

    render(<ActionBar />);

    expect(screen.getByText("📋 Kopieren")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T4 — DetailsPanel content masking (BLOCKING_SENSITIVE_CONTENT)
// ---------------------------------------------------------------------------

describe("DetailsPanel — BLOCKING_SENSITIVE_CONTENT masking", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("renders PromptContent normally when not blocked", () => {
    const prompt = makePrompt({
      content: "Normal safe content",
    });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    render(<DetailsPanel />);

    expect(screen.getByText("Normal safe content")).toBeInTheDocument();
  });

  it("masks content and shows BlockingMessage for BLOCKING_SENSITIVE_CONTENT", () => {
    const prompt = makePrompt({
      content: "API_KEY=sk-1234567890abcdef SECRET_TOKEN=supersecret",
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    // Blocking message must appear
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
  });

  it("does NOT render raw content when BLOCKING_SENSITIVE_CONTENT", () => {
    const sensitiveContent =
      "API_KEY=sk-1234567890abcdef\nSECRET_TOKEN=supersecret\npassword=hunter2";
    const prompt = makePrompt({
      content: sensitiveContent,
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    // The raw content must NOT appear in the DOM
    expect(
      screen.queryByText("API_KEY=sk-1234567890abcdef"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("supersecret")).not.toBeInTheDocument();
    expect(screen.queryByText("hunter2")).not.toBeInTheDocument();
    expect(screen.queryByText("SECRET_TOKEN")).not.toBeInTheDocument();

    // But the blocking message IS present
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
  });

  it("shows blocking message without exposing any secret-like patterns", () => {
    const prompt = makePrompt({
      content: "sk-proj-abc123xyz token=ghp_fakegithubtoken",
    });
    setupStore(
      prompt,
      makeDetection("PROMPT_BLUEPRINT_HYBRID", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    const html = document.body.innerHTML;

    // No secret-like values in DOM at all
    expect(html).not.toContain("sk-proj-");
    expect(html).not.toContain("ghp_");
    expect(html).not.toContain("abc123xyz");
  });

  it("shows ContaminationWarning + BlockingMessage when BLOCKING_SENSITIVE_CONTENT", () => {
    const prompt = makePrompt({
      content: "sensitive data here",
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    // Both contamination warning and blocking message present
    expect(
      screen.getByText(
        /Vertraulicher Inhalt — die Anzeige wurde aus Sicherheitsgründen blockiert/,
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T4 — DetailsPanel regression: existing prompt functionality
// ---------------------------------------------------------------------------

describe("DetailsPanel — no regression for existing Prompt behavior", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("renders empty state when no prompt selected", () => {
    resetStore();
    render(<DetailsPanel />);

    expect(screen.getByText("Kein Prompt ausgewählt.")).toBeInTheDocument();
  });

  it("renders prompt title in header", () => {
    const prompt = makePrompt({ title: "My Prompt Title" });
    setupStore(prompt);

    render(<DetailsPanel />);

    expect(screen.getByText("My Prompt Title")).toBeInTheDocument();
  });

  it("renders prompt description in header", () => {
    const prompt = makePrompt({ description: "A helpful description" });
    setupStore(prompt);

    render(<DetailsPanel />);

    expect(screen.getByText("A helpful description")).toBeInTheDocument();
  });

  it("renders existing ActionBar buttons without blueprint", () => {
    const prompt = makePrompt();
    setupStore(prompt); // no blueprint detection

    render(<DetailsPanel />);

    // Standard buttons must be visible
    expect(screen.getByText("📋 Kopieren")).toBeInTheDocument();
    expect(screen.getByText("📂 Öffnen")).toBeInTheDocument();
    expect(screen.getByText(/Analysieren/)).toBeInTheDocument();
  });

  it("renders content normally when no blueprint detection", () => {
    const prompt = makePrompt({ content: "Hello World" });
    setupStore(prompt); // no detection

    render(<DetailsPanel />);

    expect(screen.getByText("Hello World")).toBeInTheDocument();
  });

  it("renders tags when present", () => {
    const prompt = makePrompt({ tags: ["react", "typescript"] });
    setupStore(prompt);

    render(<DetailsPanel />);

    expect(screen.getByText("react")).toBeInTheDocument();
    expect(screen.getByText("typescript")).toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// T7 — DetailsPanel BlueprintOptimizationPanel Modal Integration
// ---------------------------------------------------------------------------

describe("DetailsPanel — BlueprintOptimizationPanel Modal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("opens BlueprintOptimizationPanel modal when BP optimieren is clicked", () => {
    const prompt = makePrompt({
      content: "Blueprint content for optimization",
    });
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<DetailsPanel />);

    // Click the BP optimieren button
    const bpBtn = screen.getByText("🔷 BP optimieren");
    expect(bpBtn).not.toBeDisabled();
    fireEvent.click(bpBtn);

    // BlueprintOptimizationPanel modal should be visible
    expect(screen.getByText("🔷 Blueprint-Optimierung")).toBeInTheDocument();
    // Mode selector should be visible
    expect(screen.getByText("Conservative")).toBeInTheDocument();
    expect(screen.getByText("Balanced")).toBeInTheDocument();
    expect(screen.getByText("Aggressive")).toBeInTheDocument();
  });

  it("closes BlueprintOptimizationPanel modal via close button", () => {
    const prompt = makePrompt({ content: "Blueprint content" });
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<DetailsPanel />);

    // Open the modal
    const bpBtn = screen.getByText("🔷 BP optimieren");
    fireEvent.click(bpBtn);

    // Modal should be visible
    expect(screen.getByText("🔷 Blueprint-Optimierung")).toBeInTheDocument();

    // Click the close button (✕)
    const closeBtn = screen.getByLabelText("Schließen");
    fireEvent.click(closeBtn);

    // Modal should be gone
    expect(
      screen.queryByText("🔷 Blueprint-Optimierung"),
    ).not.toBeInTheDocument();
  });

  it("closes BlueprintOptimizationPanel modal via overlay click", () => {
    const prompt = makePrompt({ content: "Blueprint content" });
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<DetailsPanel />);

    // Open the modal
    fireEvent.click(screen.getByText("🔷 BP optimieren"));
    expect(screen.getByText("🔷 Blueprint-Optimierung")).toBeInTheDocument();

    // Click the modal overlay (the outermost div with className "modal-overlay")
    const overlay = document.querySelector(".modal-overlay");
    expect(overlay).not.toBeNull();
    if (overlay) {
      fireEvent.click(overlay);
    }

    // Modal should be gone
    expect(
      screen.queryByText("🔷 Blueprint-Optimierung"),
    ).not.toBeInTheDocument();
  });

  it("does NOT open blueprint optimizer for PROMPT content", () => {
    const prompt = makePrompt({ content: "A regular prompt" });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    render(<DetailsPanel />);

    // BP optimieren button should not exist for PROMPT
    expect(screen.queryByText("🔷 BP optimieren")).not.toBeInTheDocument();
  });

  it("BP optimieren button disabled when BLOCKING_SENSITIVE_CONTENT", () => {
    const prompt = makePrompt({ content: "SENSITIVE DATA" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    const bpBtn = screen.getByText("🔷 BP optimieren");
    expect(bpBtn).toBeDisabled();

    // Clicking should NOT open the modal
    fireEvent.click(bpBtn);
    expect(
      screen.queryByText("🔷 Blueprint-Optimierung"),
    ).not.toBeInTheDocument();
  });
});

// =============================================================================
// Batch 6A — Missing-Info-Gate Trigger Tests (#243)
// =============================================================================

describe("DetailsPanel — Gate Trigger (Batch 6A)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // -------------------------------------------------------------------------
  // ActionBar Gate Button Visibility
  // -------------------------------------------------------------------------

  it("ActionBar always shows the gate button (GA — no feature flag)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOptimize={vi.fn()} onMissingInfoGate={vi.fn()} />);

    expect(screen.getByTestId("gate-actionbar-btn")).toBeTruthy();
  });

  it("gate button is disabled while analysis is running", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));
    useAppStore.setState({ isAnalyzing: true });

    render(<ActionBar onOptimize={vi.fn()} onMissingInfoGate={vi.fn()} />);

    const gateBtn = screen.getByTestId("gate-actionbar-btn");
    expect(gateBtn).toBeDisabled();
    expect(gateBtn.textContent).toContain("Analysiere");
  });

  it("gate button calls onMissingInfoGate on click", () => {
    const onGate = vi.fn();
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOptimize={vi.fn()} onMissingInfoGate={onGate} />);

    const gateBtn = screen.getByTestId("gate-actionbar-btn");
    fireEvent.click(gateBtn);

    expect(onGate).toHaveBeenCalled();
  });

  it("gate button is NOT rendered when onMissingInfoGate prop is absent", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    // NO onMissingInfoGate prop
    render(<ActionBar onOptimize={vi.fn()} />);

    expect(screen.queryByTestId("gate-actionbar-btn")).toBeNull();
  });

  it("existing buttons remain visible when gate button is present", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOptimize={vi.fn()} onMissingInfoGate={vi.fn()} />);

    // All existing buttons should still be visible
    expect(screen.getByText("✨ Optimieren")).toBeTruthy();
    expect(screen.getByText("📋 Kopieren")).toBeTruthy();
    expect(screen.getByText("📂 Öffnen")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // DetailsPanel Gate Rendering
  // -------------------------------------------------------------------------

  it("DetailsPanel does not open the gate modal by default (GA)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // Gate modal is closed by default — it opens on user interaction.
    expect(
      screen.queryByText("❓ Fehlende Informationen"),
    ).not.toBeInTheDocument();
  });

  it("DetailsPanel renders ActionBar with gate button (GA)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    expect(screen.getByTestId("gate-actionbar-btn")).toBeTruthy();
  });

  // -------------------------------------------------------------------------
  // #289 — Null-safe gate session access in optimizer handlers
  // -------------------------------------------------------------------------

  it("handleOpenOptimizer does not crash when gateEnabled but no session exists", () => {
    // Regression test for #289: handleOpenOptimizer used to read session.items
    // without null-check when missingInfoSessions[prompt.id] was undefined.
    const prompt = makePrompt({ id: "no-session-prompt" });
    setupStore(prompt, makeDetection("PROMPT"));
    // Explicitly ensure no missing info session exists for this prompt
    useAppStore.setState({ missingInfoSessions: {} });

    render(<DetailsPanel />);

    // Clicking "✨ Optimieren" must NOT throw TypeError
    const optimizeBtn = screen.getByText("✨ Optimieren");
    expect(() => {
      fireEvent.click(optimizeBtn);
    }).not.toThrow();

    // Optimizer should have opened (gate should NOT have opened)
    expect(screen.getByText("✨ Prompt-Optimierung")).toBeInTheDocument();
  });

  it("handleBlueprintOptimize does not crash when gateEnabled but no session exists", () => {
    const prompt = makePrompt({ id: "no-session-bp" });
    setupStore(prompt, makeDetection("BLUEPRINT"));
    useAppStore.setState({ missingInfoSessions: {} });

    render(<DetailsPanel />);

    // Clicking "🔷 BP optimieren" must NOT throw TypeError
    const bpBtn = screen.getByText("🔷 BP optimieren");
    expect(() => {
      fireEvent.click(bpBtn);
    }).not.toThrow();

    // Blueprint optimizer should have opened
    expect(screen.getByText("🔷 Blueprint-Optimierung")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // #289 — Handler-level: REQUIRED session → Gate opens (regression coverage)
  // -------------------------------------------------------------------------

  it("handleOpenOptimizer opens Gate when REQUIRED session with non-skipped items exists", () => {
    const prompt = makePrompt({ id: "req-session-prompt" });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    // Seed a session with a non-skipped REQUIRED item
    const session: MissingInfoSession = {
      sessionId: "test-session-req-1",
      promptId: prompt.id,
      startedAt: "2024-01-01T00:00:00Z",
      items: [
        {
          id: "REQ_C_001",
          source: "prompt_engineering",
          label: "Zieldefinition",
          question: "Was ist das Ziel des Prompts?",
          rationale: "Ohne Zieldefinition keine zielgerichtete Optimierung.",
          inputType: "free_text",
          tier: "REQUIRED",
          classificationReason: "Critical for optimization",
        },
      ],
      answers: {},
      status: "ACTIVE" as const,
      outcome: null,
      enrichedContent: null,
    };
    useAppStore.setState({
      missingInfoSessions: { [prompt.id]: session },
    });

    render(<DetailsPanel />);

    const optimizeBtn = screen.getByText("✨ Optimieren");
    fireEvent.click(optimizeBtn);

    // Gate must open, NOT the plain optimizer
    expect(screen.getByText("❓ Fehlende Informationen")).toBeInTheDocument();
    expect(screen.queryByText("✨ Prompt-Optimierung")).not.toBeInTheDocument();
  });

  it("handleBlueprintOptimize opens Gate when REQUIRED session with non-skipped items exists", () => {
    const prompt = makePrompt({ id: "req-session-bp" });
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    const session: MissingInfoSession = {
      sessionId: "test-session-bp-req-1",
      promptId: prompt.id,
      startedAt: "2024-01-01T00:00:00Z",
      items: [
        {
          id: "REQ_D_001",
          source: "prompt_engineering",
          label: "Zieldefinition",
          question: "Was ist das Ziel des Prompts?",
          rationale: "Ohne Zieldefinition keine zielgerichtete Optimierung.",
          inputType: "free_text",
          tier: "REQUIRED",
          classificationReason: "Critical for optimization",
        },
      ],
      answers: {},
      status: "ACTIVE" as const,
      outcome: null,
      enrichedContent: null,
    };
    useAppStore.setState({
      missingInfoSessions: { [prompt.id]: session },
    });

    render(<DetailsPanel />);

    const bpBtn = screen.getByText("🔷 BP optimieren");
    fireEvent.click(bpBtn);

    // Gate must open, NOT the blueprint optimizer
    expect(screen.getByText("❓ Fehlende Informationen")).toBeInTheDocument();
    expect(
      screen.queryByText("🔷 Blueprint-Optimierung"),
    ).not.toBeInTheDocument();
  });
});

// =============================================================================
// Batch 6 — Variant Button & VariantPanel Integration Tests (#270, #271)
// =============================================================================

describe("ActionBar — Variant Button (Batch 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("always shows the variant button (GA — no feature flag)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOpenVariantPanel={vi.fn()} />);

    expect(screen.getByTestId("variant-actionbar-btn")).toBeTruthy();
    expect(screen.getByText("🧭 Varianten erzeugen")).toBeTruthy();
  });

  it("variant button is disabled while analysis is running", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));
    useAppStore.setState({ isAnalyzing: true });

    render(<ActionBar onOpenVariantPanel={vi.fn()} />);

    const btn = screen.getByTestId("variant-actionbar-btn");
    expect(btn).toBeDisabled();
    expect(btn.textContent).toContain("Analysiere");
  });

  it("variant button has correct accessibility attributes", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOpenVariantPanel={vi.fn()} />);

    const btn = screen.getByTestId("variant-actionbar-btn");
    expect(btn.getAttribute("aria-label")).toBe("Varianten erzeugen");
    expect(btn.getAttribute("title")).toBe(
      "Varianten mit Richtungsprofilen erzeugen",
    );
  });

  it("variant button is NOT rendered when onOpenVariantPanel prop is absent", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    // NO onOpenVariantPanel prop
    render(<ActionBar onOptimize={vi.fn()} />);

    expect(screen.queryByTestId("variant-actionbar-btn")).toBeNull();
  });

  it("variant button calls onOpenVariantPanel on click", () => {
    const onVariant = vi.fn();
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOpenVariantPanel={onVariant} />);

    const btn = screen.getByTestId("variant-actionbar-btn");
    fireEvent.click(btn);

    expect(onVariant).toHaveBeenCalledTimes(1);
  });

  it("existing buttons remain visible when variant button is present", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<ActionBar onOptimize={vi.fn()} onOpenVariantPanel={vi.fn()} />);

    // All existing standard buttons should still be visible
    expect(screen.getByText("✨ Optimieren")).toBeTruthy();
    expect(screen.getByText("📋 Kopieren")).toBeTruthy();
    expect(screen.getByText("📂 Öffnen")).toBeTruthy();
    expect(screen.getByText(/Analysieren/)).toBeTruthy();
    // And the variant button
    expect(screen.getByText("🧭 Varianten erzeugen")).toBeTruthy();
  });

  it("variant button works alongside gate button (GA)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(
      <ActionBar
        onOptimize={vi.fn()}
        onMissingInfoGate={vi.fn()}
        onOpenVariantPanel={vi.fn()}
      />,
    );

    // Both buttons should be visible
    expect(screen.getByTestId("variant-actionbar-btn")).toBeTruthy();
    expect(screen.getByTestId("gate-actionbar-btn")).toBeTruthy();
    expect(screen.getByText("✨ Optimieren")).toBeTruthy();
  });
});

describe("DetailsPanel — VariantPanel Integration (Batch 6)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  it("does NOT open VariantPanel by default (GA — closed until user clicks)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // Panel is closed by default; the ActionBar button is always rendered (GA).
    expect(screen.queryByTestId("variant-panel-overlay")).toBeNull();
    expect(screen.getByTestId("variant-actionbar-btn")).toBeTruthy();
  });

  it("renders ActionBar with variant button (GA)", () => {
    const prompt = makePrompt();
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    expect(screen.getByTestId("variant-actionbar-btn")).toBeTruthy();
  });

  it("clicking variant button opens VariantPanel modal", () => {
    const prompt = makePrompt({ content: "Test prompt content" });
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // Click the variant button
    const variantBtn = screen.getByTestId("variant-actionbar-btn");
    fireEvent.click(variantBtn);

    // VariantPanel modal should be visible
    expect(screen.getByTestId("variant-panel-overlay")).toBeTruthy();
    expect(screen.getByTestId("variant-panel")).toBeTruthy();
    expect(
      screen.getByText(/🧭 Varianten erzeugen — Richtungsprofile/),
    ).toBeTruthy();
  });

  it("DetailsPanel calls openVariantPanel with correct prompt ID", () => {
    const prompt = makePrompt({
      id: "direction-test-prompt-123",
      content: "Test",
    });
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // Click the variant button
    const variantBtn = screen.getByTestId("variant-actionbar-btn");
    fireEvent.click(variantBtn);

    // Check store state: activeVariantPromptId should be set
    const store = useAppStore.getState();
    expect(store.showVariantPanel).toBe(true);
    expect(store.activeVariantPromptId).toBe("direction-test-prompt-123");
  });

  it("uses enrichedContent as variant source when available", () => {
    const prompt = makePrompt({
      id: "enriched-prompt-1",
      content: "Original prompt content",
    });
    setupStore(prompt, makeDetection("PROMPT"));

    // Set up enriched content in store
    useAppStore.setState({
      enrichedContexts: {
        "enriched-prompt-1": {
          originalContent: "Original prompt content",
          enrichedContent: "Enriched content with extra info",
          answers: [],
          gateOutcome: "COMPLETED",
          sessionId: "session-1",
          enrichedAt: "2024-01-01T00:00:00Z",
        },
      },
    });

    render(<DetailsPanel />);

    // Click the variant button
    fireEvent.click(screen.getByTestId("variant-actionbar-btn"));

    // The source info banner should show enrichedContent
    expect(screen.getByTestId("variant-source-info")).toBeTruthy();
    expect(screen.getByText(/enrichedContent/)).toBeTruthy();
  });

  it("falls back to original prompt when no enriched content", () => {
    const prompt = makePrompt({
      id: "plain-prompt-1",
      content: "Plain original content",
    });
    setupStore(prompt, makeDetection("PROMPT"));

    // No enriched content
    useAppStore.setState({ enrichedContexts: {} });

    render(<DetailsPanel />);

    // Click the variant button
    fireEvent.click(screen.getByTestId("variant-actionbar-btn"));

    // The source info banner should show "Original-Prompt"
    const sourceInfo = screen.getByTestId("variant-source-info");
    expect(sourceInfo.textContent).toContain("Original-Prompt");
  });

  it("does NOT modify MissingInfoGate state when opening variant panel", () => {
    const prompt = makePrompt({
      id: "gate-prompt-1",
      content: "Content for gate test",
    });
    setupStore(prompt, makeDetection("PROMPT"));

    // Set up initial gate state
    useAppStore.setState({
      isGateOpen: false,
      activeGatePromptId: null,
      missingInfoSessions: {},
      enrichedContexts: {},
    });

    render(<DetailsPanel />);

    // Click the variant button
    fireEvent.click(screen.getByTestId("variant-actionbar-btn"));

    // Gate state should be untouched
    const store = useAppStore.getState();
    expect(store.isGateOpen).toBe(false);
    expect(store.activeGatePromptId).toBeNull();
    expect(store.missingInfoSessions).toEqual({});
    expect(store.enrichedContexts).toEqual({});
  });

  it("closing VariantPanel via onClose cleans up local state", () => {
    const prompt = makePrompt({ content: "Test" });
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // Open the panel
    fireEvent.click(screen.getByTestId("variant-actionbar-btn"));
    expect(screen.getByTestId("variant-panel-overlay")).toBeTruthy();

    // Close via the X icon in the Panel header
    const closeIcon = screen.getByTestId("variant-panel-close-icon");
    fireEvent.click(closeIcon);

    // Panel should be gone
    expect(screen.queryByTestId("variant-panel-overlay")).toBeNull();
  });

  it("no compare/save buttons are present in ActionBar or VariantPanel", () => {
    const prompt = makePrompt({ content: "Test" });
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // ActionBar must not have Compare or Save buttons
    expect(screen.queryByText(/Vergleichen/i)).toBeNull();
    expect(screen.queryByText(/Speichern/i)).toBeNull();

    // Open variant panel
    fireEvent.click(screen.getByTestId("variant-actionbar-btn"));

    // VariantPanel must not have Compare or Save buttons
    const panel = screen.getByTestId("variant-panel");
    expect(panel.textContent).not.toContain("Vergleichen");
    expect(panel.textContent).not.toContain("Speichern");
  });

  it("optimizer and gate flow remain regression-free with variant button present", () => {
    const prompt = makePrompt({
      content: "Test content for regression",
    });
    setupStore(prompt, makeDetection("PROMPT"));

    render(<DetailsPanel />);

    // All standard buttons must still be visible
    expect(screen.getByText("✨ Optimieren")).toBeTruthy();
    expect(screen.getByText("📋 Kopieren")).toBeTruthy();
    expect(screen.getByText("📂 Öffnen")).toBeTruthy();
    expect(screen.getByText(/Analysieren/)).toBeTruthy();
    // Variant button visible
    expect(screen.getByTestId("variant-actionbar-btn")).toBeTruthy();

    // Gate button is always visible (GA — no feature flag)
    expect(screen.getByTestId("gate-actionbar-btn")).toBeTruthy();
  });
});

// =============================================================================
// #291 — Normal Optimizer Blocking for Sensitive Content
// =============================================================================

// These tests reproduce the asymmetric guard gap between the normal
// "✨ Optimieren" button/handler and the blueprint "🔷 BP optimieren"
// button/handler when contamination_status === BLOCKING_SENSITIVE_CONTENT.
//
// Expected: All #291 tests FAIL before the fix (confirming the gap),
// and PASS after the symmetric UI + handler guards are applied.
//
// Protection tests D/E/F must PASS both before and after the fix.

describe("#291 — Normal Optimizer Blocking (Red Tests)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    resetStore();
  });

  // -------------------------------------------------------------------------
  // Reproduktion A — Button State
  // -------------------------------------------------------------------------

  it("RED-A: normal optimizer button is NOT disabled for BLOCKING_SENSITIVE_CONTENT", () => {
    // REPRODUCTION: The current ActionBar does NOT pass isBlocked to the
    // normal "✨ Optimieren" button. It should be disabled like the BP button.
    const prompt = makePrompt({ content: "SENSITIVE_TEST_MARKER_291" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ActionBar onOptimize={vi.fn()} />);

    const normalBtn = screen.getByText("✨ Optimieren");
    // RED: The button is currently NOT disabled — the test asserts it IS.
    expect(normalBtn).toBeDisabled();
  });

  it("RED-A2: normal optimizer button title should indicate blocked content", () => {
    const prompt = makePrompt({ content: "SENSITIVE_TEST_MARKER_291" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ActionBar onOptimize={vi.fn()} />);

    const normalBtn = screen.getByText("✨ Optimieren");
    // The title should indicate the reason for blocking
    expect(normalBtn.getAttribute("title")).toContain("nicht verfügbar");
  });

  // -------------------------------------------------------------------------
  // Reproduktion B — Modal Opening via DetailsPanel
  // -------------------------------------------------------------------------

  it("RED-B: clicking normal optimizer does NOT open optimization modal for blocked content", () => {
    // REPRODUCTION: handleOpenOptimizer lacks an early return for isBlocked.
    // When clicked, setShowOptimizer(true) executes despite blocked content.
    const prompt = makePrompt({ content: "SENSITIVE_TEST_MARKER_291" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    // BlockingMessage is shown (content display is masked)
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();

    // Try clicking the normal optimizer button
    const normalBtn = screen.getByText("✨ Optimieren");
    fireEvent.click(normalBtn);

    // RED: The optimizer modal should NOT have opened
    expect(screen.queryByText("✨ Prompt-Optimierung")).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Reproduktion C — Content NOT passed to optimizer
  // -------------------------------------------------------------------------

  it("RED-C: blocked content marker does NOT appear in optimization panel", () => {
    // REPRODUCTION: optimizerContent is derived from prompt.content without
    // an isBlocked guard. If the modal opens, the marker is passed as prop.
    const prompt = makePrompt({
      content: "SENSITIVE_TEST_MARKER_291 secret data here",
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    // Click the normal optimizer button
    const normalBtn = screen.getByText("✨ Optimieren");
    fireEvent.click(normalBtn);

    // RED: No OptimizationPanel should be rendered — therefore
    // SENSITIVE_TEST_MARKER_291 must NOT appear anywhere in the DOM
    const html = document.body.innerHTML;
    expect(html).not.toContain("SENSITIVE_TEST_MARKER_291");
  });

  it("RED-C2: blocked content is never passed as promptContent prop to OptimizationPanel", () => {
    // When content is blocked, no OptimizationPanel should render at all.
    // Uses accessible role-based query instead of an invalid CSS class selector.
    const prompt = makePrompt({
      content: "SENSITIVE_TEST_MARKER_291 extra secret content",
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    fireEvent.click(screen.getByText("✨ Optimieren"));

    // OptimizationPanel must not be in the DOM.
    // Uses role="dialog" with aria-label="Prompt-Optimierung" as rendered
    // by the real OptimizationPanel component.
    expect(
      screen.queryByRole("dialog", { name: "Prompt-Optimierung" }),
    ).not.toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Protection Test D — CLEAN prompt: no regression
  // -------------------------------------------------------------------------

  it("PROTECTION-D: CLEAN prompt — normal optimizer button remains enabled", () => {
    const prompt = makePrompt({ content: "Clean, safe content." });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    render(<ActionBar onOptimize={vi.fn()} />);

    const normalBtn = screen.getByText("✨ Optimieren");
    expect(normalBtn).not.toBeDisabled();
  });

  it("PROTECTION-D2: CLEAN prompt — normal optimizer opens as before", () => {
    const prompt = makePrompt({ content: "Clean, safe content." });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    render(<DetailsPanel />);

    const normalBtn = screen.getByText("✨ Optimieren");
    fireEvent.click(normalBtn);

    // Optimizer modal should open normally
    expect(screen.getByText("✨ Prompt-Optimierung")).toBeInTheDocument();
  });

  it("PROTECTION-D3: CLEAN prompt — content is processed normally", () => {
    const prompt = makePrompt({ content: "This is clean content." });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    render(<DetailsPanel />);

    fireEvent.click(screen.getByText("✨ Optimieren"));

    // The clean prompt content should appear in the DOM
    const html = document.body.innerHTML;
    expect(html).toContain("This is clean content.");
  });

  // -------------------------------------------------------------------------
  // Protection Test E — Blueprint remains unchanged
  // -------------------------------------------------------------------------

  it("PROTECTION-E: BP button remains disabled for BLOCKING_SENSITIVE_CONTENT", () => {
    const prompt = makePrompt({ content: "SENSITIVE_TEST_MARKER_291" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<ActionBar onBlueprintOptimize={vi.fn()} />);

    const bpBtn = screen.getByText("🔷 BP optimieren");
    expect(bpBtn).toBeDisabled();
    expect(bpBtn.getAttribute("title")).toContain("nicht verfügbar");
  });

  it("PROTECTION-E2: BP handler does NOT open modal for blocked content", () => {
    const prompt = makePrompt({ content: "SENSITIVE_TEST_MARKER_291" });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    render(<DetailsPanel />);

    const bpBtn = screen.getByText("🔷 BP optimieren");
    fireEvent.click(bpBtn);

    // BP optimizer should NOT open
    expect(
      screen.queryByText("🔷 Blueprint-Optimierung"),
    ).not.toBeInTheDocument();
  });

  it("PROTECTION-E3: BP button works normally for CLEAN content", () => {
    const prompt = makePrompt({ content: "Clean blueprint content." });
    setupStore(prompt, makeDetection("BLUEPRINT", "CLEAN"));

    render(<DetailsPanel />);

    const bpBtn = screen.getByText("🔷 BP optimieren");
    expect(bpBtn).not.toBeDisabled();

    fireEvent.click(bpBtn);
    expect(screen.getByText("🔷 Blueprint-Optimierung")).toBeInTheDocument();
  });

  // -------------------------------------------------------------------------
  // Protection Test F — Gate Regression (#289)
  // -------------------------------------------------------------------------

  it("PROTECTION-F: REQUIRED gate still opens for CLEAN content when session has non-skipped items", () => {
    const prompt = makePrompt({
      id: "regression-gate-test",
      content: "Gate regression test content",
    });
    setupStore(prompt, makeDetection("PROMPT", "CLEAN"));

    const session = {
      sessionId: "gate-regression-1",
      promptId: prompt.id,
      startedAt: "2024-01-01T00:00:00Z",
      items: [
        {
          id: "REQ_F_001",
          source: "prompt_engineering" as const,
          label: "Zieldefinition",
          question: "Was ist das Ziel?",
          rationale: "Erforderlich für Optimierung.",
          inputType: "free_text" as const,
          tier: "REQUIRED" as const,
          classificationReason: "Critical",
        },
      ],
      answers: {},
      status: "ACTIVE" as const,
      outcome: null,
      enrichedContent: null,
    };
    useAppStore.setState({
      missingInfoSessions: { [prompt.id]: session },
    });

    render(<DetailsPanel />);

    fireEvent.click(screen.getByText("✨ Optimieren"));

    // Gate must open, NOT optimizer
    expect(screen.getByText("❓ Fehlende Informationen")).toBeInTheDocument();
    expect(screen.queryByText("✨ Prompt-Optimierung")).not.toBeInTheDocument();
  });

  it("PROTECTION-F2: blocked content opens neither gate nor optimizer", () => {
    const prompt = makePrompt({
      id: "blocked-gate-test",
      content: "SENSITIVE_TEST_MARKER_291",
    });
    setupStore(
      prompt,
      makeDetection("BLUEPRINT", "BLOCKING_SENSITIVE_CONTENT"),
    );

    // Even with a REQUIRED session present, blocked content should prevent both
    const session = {
      sessionId: "blocked-gate-1",
      promptId: prompt.id,
      startedAt: "2024-01-01T00:00:00Z",
      items: [
        {
          id: "REQ_G_001",
          source: "prompt_engineering" as const,
          label: "Zieldefinition",
          question: "Was ist das Ziel?",
          rationale: "Erforderlich.",
          inputType: "free_text" as const,
          tier: "REQUIRED" as const,
          classificationReason: "Critical",
        },
      ],
      answers: {},
      status: "ACTIVE" as const,
      outcome: null,
      enrichedContent: null,
    };
    useAppStore.setState({
      missingInfoSessions: { [prompt.id]: session },
    });

    render(<DetailsPanel />);

    fireEvent.click(screen.getByText("✨ Optimieren"));

    // Neither gate nor optimizer should open
    expect(
      screen.queryByText("❓ Fehlende Informationen"),
    ).not.toBeInTheDocument();
    expect(screen.queryByText("✨ Prompt-Optimierung")).not.toBeInTheDocument();
  });

  // ===========================================================================
  // State Transition G — Normal Optimizer: Clean→Blocked
  // ===========================================================================

  it("STATE-G: normal optimizer dialog closes when prompt switches to BLOCKING_SENSITIVE_CONTENT", () => {
    // REPRODUCTION: If the optimizer was opened for a CLEAN prompt and the
    // user then selects a blocked prompt, the open dialog must NOT persist
    // and render blocked content via the optimizerContent prop.
    const cleanPrompt = makePrompt({
      id: "clean-state-g",
      content: "CLEAN_MARKER_291 — safe content for testing",
    });
    const blockedPrompt = makePrompt({
      id: "blocked-state-g",
      content: "BLOCKED_SWITCH_MARKER_291 — MUST NEVER APPEAR",
    });

    // Start with clean prompt
    setupStore(cleanPrompt, makeDetection("PROMPT", "CLEAN"));

    const { rerender } = render(<DetailsPanel />);

    // Open normal optimizer
    fireEvent.click(screen.getByText("✨ Optimieren"));

    // Dialog must be open
    expect(
      screen.getByRole("dialog", { name: "Prompt-Optimierung" }),
    ).toBeInTheDocument();

    // Select Conservative mode to trigger content display path
    const conservativeRadio = screen.getByRole("radio", {
      name: /Conservative/,
    });
    fireEvent.click(conservativeRadio);

    // Clean content is visible in the "Vorher" diff pane.
    // Use getAllByText since the content appears in both PromptContent
    // and the OptimizationPanel's "Vorher" diff pane.
    const matches = screen.getAllByText(
      "CLEAN_MARKER_291 — safe content for testing",
    );
    expect(matches.length).toBeGreaterThanOrEqual(1);

    // Now switch store to blocked prompt in a single synchronous update.
    const blockedDetect = makeDetection(
      "BLUEPRINT",
      "BLOCKING_SENSITIVE_CONTENT",
    );
    useAppStore.setState({
      prompts: [cleanPrompt, blockedPrompt],
      selectedPromptId: blockedPrompt.id,
      blueprintDetections: {
        ...useAppStore.getState().blueprintDetections,
        [blockedPrompt.id]: blockedDetect,
      },
    });

    // Force React re-render: Zustand selectors return function references
    // which don't trigger re-renders on store changes. rerender() forces
    // the component to execute again, picking up the new store values.
    rerender(<DetailsPanel />);

    // Dialog "Prompt-Optimierung" must NO longer be rendered.
    // The render guard {showOptimizer && !isBlocked && ...} blocks it.
    expect(
      screen.queryByRole("dialog", { name: "Prompt-Optimierung" }),
    ).not.toBeInTheDocument();

    // Blocked marker must NOT appear anywhere in DOM
    expect(document.body.innerHTML).not.toContain("BLOCKED_SWITCH_MARKER_291");

    // BlockingMessage must be shown instead
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
  });

  // ===========================================================================
  // State Transition H — Blueprint Optimizer: Clean→Blocked
  // ===========================================================================

  it("STATE-H: blueprint optimizer dialog closes when prompt switches to BLOCKING_SENSITIVE_CONTENT", () => {
    const cleanBlueprint = makePrompt({
      id: "clean-state-h",
      content: "CLEAN_BLUEPRINT_MARKER_291 — safe blueprint for testing",
    });
    const blockedPrompt = makePrompt({
      id: "blocked-state-h",
      content: "BLOCKED_BP_SWITCH_MARKER_291 — MUST NEVER APPEAR",
    });

    setupStore(cleanBlueprint, makeDetection("BLUEPRINT", "CLEAN"));

    const { rerender } = render(<DetailsPanel />);

    // Open blueprint optimizer
    fireEvent.click(screen.getByText("🔷 BP optimieren"));

    // Dialog must be open
    expect(
      screen.getByRole("dialog", { name: "Blueprint-Optimierung" }),
    ).toBeInTheDocument();

    // Blueprint optimizer defaults to "conservative" mode.
    // Click "🔷 Blueprint optimieren" button to trigger rendering of content.
    fireEvent.click(screen.getByText("🔷 Blueprint optimieren"));

    // Content is now rendered in the "Vorher" diff pane
    expect(
      screen.getByText(
        "CLEAN_BLUEPRINT_MARKER_291 — safe blueprint for testing",
      ),
    ).toBeInTheDocument();

    // Switch store to blocked prompt — single synchronous update.
    const blockedDetect = makeDetection(
      "BLUEPRINT",
      "BLOCKING_SENSITIVE_CONTENT",
    );
    useAppStore.setState({
      prompts: [cleanBlueprint, blockedPrompt],
      selectedPromptId: blockedPrompt.id,
      blueprintDetections: {
        ...useAppStore.getState().blueprintDetections,
        [blockedPrompt.id]: blockedDetect,
      },
    });

    // Force React re-render to pick up new store values.
    rerender(<DetailsPanel />);

    // Blueprint optimizer dialog must NO longer be rendered.
    // The render guard {showBlueprintOptimizer && !isBlocked && ...} blocks it.
    expect(
      screen.queryByRole("dialog", { name: "Blueprint-Optimierung" }),
    ).not.toBeInTheDocument();

    // Blocked marker must NOT appear anywhere
    expect(document.body.innerHTML).not.toContain(
      "BLOCKED_BP_SWITCH_MARKER_291",
    );

    // BlockingMessage must be shown
    expect(
      screen.getByText(
        /Dieser Inhalt kann aus Sicherheitsgründen nicht angezeigt werden/,
      ),
    ).toBeInTheDocument();
  });

  // ===========================================================================
  // Test I — Gate→Blocked→Complete (Documented NOT_REPRODUCED)
  // ===========================================================================

  it("STATE-I-DOC: Gate→Blocked→Complete path is NOT reproducible via real UI", () => {
    // DOCUMENTATION: After switching the store to a blocked prompt while
    // the gate is open, the MissingInfoGate re-renders with the new
    // (blocked) promptId. The blocked prompt has no session → gate shows
    // "Keine Analyse-Daten vorhanden" with only a "Schließen" button
    // that calls onClose (NOT onComplete). handleGateComplete is never
    // invoked → setShowOptimizer(true) is never called.
    //
    // Classification: NOT_REPRODUCED_DOCUMENTED
    //
    // Defense-in-depth: handleGateComplete will include an isBlocked guard
    // so that even if completion were somehow triggered for a blocked
    // prompt, the optimizer would not open.
    //
    // This test verifies: blocked prompt + open gate = gate shows empty
    // state with no completion path, and blocked content is never exposed.

    const cleanPrompt = makePrompt({
      id: "state-i-clean",
      content: "Gate→Blocked clean content",
    });
    const blockedPrompt = makePrompt({
      id: "state-i-blocked",
      content: "GATE_BLOCKED_MARKER_291 — MUST NEVER APPEAR",
    });

    // Pre-load both prompts in the store but select clean first
    setupStore(cleanPrompt, makeDetection("PROMPT", "CLEAN"));

    // Set up REQUIRED session on the CLEAN prompt
    useAppStore.setState({
      missingInfoSessions: {
        [cleanPrompt.id]: {
          sessionId: "state-i-gate",
          promptId: cleanPrompt.id,
          startedAt: "2024-01-01T00:00:00Z",
          items: [
            {
              id: "REQ_I_001",
              source: "prompt_engineering" as const,
              label: "Zieldefinition",
              question: "Was ist das Ziel?",
              rationale: "Erforderlich.",
              inputType: "free_text" as const,
              tier: "REQUIRED" as const,
              classificationReason: "Critical",
            },
          ],
          answers: {},
          status: "ACTIVE" as const,
          outcome: null,
          enrichedContent: null,
        },
      },
    });

    render(<DetailsPanel />);

    // Click optimizer → gate opens (REQUIRED items present)
    fireEvent.click(screen.getByText("✨ Optimieren"));
    expect(screen.getByText("❓ Fehlende Informationen")).toBeInTheDocument();

    // Switch to blocked prompt WHILE gate is open.
    // Add blocked prompt to store AND its detection BEFORE switching.
    const blockedDetection = makeDetection(
      "BLUEPRINT",
      "BLOCKING_SENSITIVE_CONTENT",
    );
    act(() => {
      const state = useAppStore.getState();
      // First register the blocked prompt and its detection
      state.setBlueprintDetection(blockedPrompt.id, blockedDetection);
      // Then switch selection (single setState for synchronous update)
      useAppStore.setState({
        prompts: [cleanPrompt, blockedPrompt],
        selectedPromptId: blockedPrompt.id,
      });
    });

    // After the store switch, verify safety:
    // 1. Blocked content marker is NOT in the DOM
    expect(document.body.innerHTML).not.toContain("GATE_BLOCKED_MARKER_291");

    // 2. Optimizer dialog is NOT open
    expect(
      screen.queryByRole("dialog", { name: "Prompt-Optimierung" }),
    ).not.toBeInTheDocument();
  });

  // ===========================================================================
  // Content Exposure Classification — Component-Level (Phase 4)
  // ===========================================================================
  // These tests render OptimizationPanel / BlueprintOptimizationPanel
  // directly with blocked marker content to document what happens when
  // blocked content REACHES the component prop (bypassing DetailsPanel
  // guards). This establishes: the defense MUST be at the orchestration
  // level (DetailsPanel render gate), not inside the optimizer components.
  // ===========================================================================

  it("F04-EXPOSURE: OptimizationPanel displays blocked marker content when passed as prop and mode selected", () => {
    // Renders OptimizationPanel directly — simulating a scenario where
    // DetailsPanel's render gate has been bypassed.
    const blockedContent = "SENSITIVE_TEST_MARKER_291 — leaked via prop";

    render(
      <OptimizationPanel promptContent={blockedContent} onClose={vi.fn()} />,
    );

    // Dialog is open
    expect(
      screen.getByRole("dialog", { name: "Prompt-Optimierung" }),
    ).toBeInTheDocument();

    // BEFORE mode selection: content is NOT displayed in the DOM
    // (OptimizationPanel only renders content after result computation)
    expect(document.body.innerHTML).not.toContain("SENSITIVE_TEST_MARKER_291");

    // Select Conservative mode → triggers optimizePrompt(promptContent, mode)
    const conservativeRadio = screen.getByRole("radio", {
      name: /Conservative/,
    });
    fireEvent.click(conservativeRadio);

    // AFTER mode selection: blocked content IS displayed in the "Vorher" pane
    //
    // Classification: CONFIRMED_COMPONENT_PROP_EXPOSURE
    //   CONTENT_PASSED_AS_PROP:       true  (promptContent = blockedContent)
    //   MODE_SELECTED:                true  (Conservative radio clicked)
    //   OPTIMIZER_EXECUTED:           true  (optimizePrompt called)
    //   MARKER_PRESENT_IN_DOM:        true  (rendered in "Vorher" diff pane)
    //   MARKER_PRESENT_IN_RESULT:     true  (result.original = blockedContent)
    expect(document.body.innerHTML).toContain("SENSITIVE_TEST_MARKER_291");
  });

  it("F04-BP-EXPOSURE: BlueprintOptimizationPanel displays blocked marker content when passed as prop and optimization triggered", async () => {
    // Same as F04-EXPOSURE but for the blueprint optimizer component.
    // Uses async waitFor because BlueprintOptimizationPanel has a 30ms
    // setTimeout delay in handleOptimize.
    const blockedContent =
      "SENSITIVE_BP_MARKER_291 — leaked via blueprint prop";

    render(
      <BlueprintOptimizationPanel content={blockedContent} onClose={vi.fn()} />,
    );

    // Dialog is open
    expect(
      screen.getByRole("dialog", { name: "Blueprint-Optimierung" }),
    ).toBeInTheDocument();

    // BEFORE optimization: content is NOT visible in DOM
    expect(document.body.innerHTML).not.toContain("SENSITIVE_BP_MARKER_291");

    // Click "🔷 Blueprint optimieren" to trigger content processing
    fireEvent.click(screen.getByText("🔷 Blueprint optimieren"));

    // Wait for async optimization to complete and result to render
    await waitFor(() => {
      expect(document.body.innerHTML).toContain("SENSITIVE_BP_MARKER_291");
    });

    // Classification: CONFIRMED_COMPONENT_PROP_EXPOSURE
    //   CONTENT_PASSED_AS_PROP:       true
    //   MODE_SELECTED:                true  (default: conservative)
    //   OPTIMIZER_EXECUTED:           true  (optimizeBlueprint called)
    //   MARKER_PRESENT_IN_DOM:        true
    //   MARKER_PRESENT_IN_RESULT:     true  (result.original = blockedContent)
  });
});
