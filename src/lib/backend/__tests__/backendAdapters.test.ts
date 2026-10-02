// =============================================================================
// Backend-Adapter-Vertragstests (issues #118–#122, epic #97)
// =============================================================================
// - Runtime detection: tauri internals → tauri, otherwise http (fail-safe)
// - Factory: returns the detected adapter; override seam works
// - Isolation (#134/J3-basis): without __TAURI_INTERNALS__ NO tauri invoke
//   happens — the http adapter talks fetch only
// =============================================================================

import { describe, it, expect, afterEach, vi } from "vitest";
import { detectBackendKind, hasTauriInternals } from "@/lib/backend/detect";
import { getBackend, setBackendOverride } from "@/lib/backend/factory";
import { httpAdapter } from "@/lib/backend/httpAdapter";
import type { PromptItem } from "@/types";

describe("runtime detection (#118 / F1)", () => {
  it("detects tauri when __TAURI_INTERNALS__ with invoke is present", () => {
    expect(
      hasTauriInternals({ __TAURI_INTERNALS__: { invoke: () => Promise.resolve(null) } }),
    ).toBe(true);
    expect(
      detectBackendKind({ __TAURI_INTERNALS__: { invoke: () => Promise.resolve(null) } }),
    ).toBe("tauri");
  });

  it("detects http when internals are absent or malformed (fail-safe)", () => {
    expect(hasTauriInternals({})).toBe(false);
    expect(hasTauriInternals({ __TAURI_INTERNALS__: {} as never })).toBe(false);
    expect(detectBackendKind({})).toBe("http");
    expect(detectBackendKind({ __TAURI_INTERNALS__: { invoke: 42 as never } })).toBe("http");
  });
});

describe("adapter factory (#121 / F4)", () => {
  afterEach(() => {
    setBackendOverride(null);
  });

  it("returns httpAdapter when no tauri internals exist (web mode)", () => {
    // vitest environment has no __TAURI_INTERNALS__
    expect(detectBackendKind()).toBe("http");
    expect(getBackend().kind).toBe("http");
  });

  it("returns tauriAdapter when internals exist (desktop)", () => {
    vi.stubGlobal("__TAURI_INTERNALS__", {
      invoke: () => Promise.resolve(null),
    });
    expect(getBackend().kind).toBe("tauri");
    vi.unstubAllGlobals();
  });

  it("override seam pins an adapter (test seam)", () => {
    setBackendOverride(httpAdapter);
    expect(getBackend().kind).toBe("http");
  });
});

describe("http adapter (#119 / F2)", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  function stubFetch(respond: (path: string, init?: RequestInit) => unknown): void {
    const stub = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : String(input);
      const path = url.replace(/^https?:\/\/[^/]+/, "");
      const body = respond(path, init);
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(body),
      } as Response);
    });
    globalThis.fetch = stub as unknown as typeof fetch;
  }

  it("scans via POST /api/scan and returns prompt list", async () => {
    const prompts: PromptItem[] = [
      {
        id: "p1",
        file_path: "/v/p1.md",
        file_name: "p1.md",
        title: "P1",
        description: "",
        category: "tasks",
        version: "1.0",
        tags: [],
        content: "# x",
        raw_frontmatter: {},
        created_at: "2026-01-01T00:00:00Z",
        updated_at: "2026-01-01T00:00:00Z",
        is_favorite: false,
      },
    ];
    stubFetch((path) => (path === "/api/scan" ? prompts : []));
    const res = await httpAdapter.scanDirectory("/vault");
    expect(res).toHaveLength(1);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it("analyze returns evaluation and hygiene from the combined endpoint", async () => {
    stubFetch((path) =>
      path === "/api/prompts/p1/analyze"
        ? {
            evaluation: { id: "e", prompt_id: "p1", overall_score: 70, criteria: [], missing_sections: [], recommendations: [], evaluated_at: "t" },
            hygiene: { id: "h", prompt_id: "p1", hygiene_score: 90, status: "clean", artifacts: [], analyzed_at: "t" },
          }
        : {},
    );
    const evaluation = await httpAdapter.evaluatePrompt("p1", "content");
    const hygiene = await httpAdapter.analyzeHygiene("p1", "content");
    expect(evaluation.overall_score).toBe(70);
    expect(hygiene.hygiene_score).toBe(90);
  });

  it("throws the server's error message on API failure", async () => {
    const stub = vi.fn(() =>
      Promise.resolve({
        ok: false,
        status: 403,
        json: () =>
          Promise.resolve({ error: { code: "forbidden", message: "read-only server" } }),
      } as Response),
    );
    globalThis.fetch = stub as unknown as typeof fetch;
    await expect(httpAdapter.toggleFavorite("p1")).rejects.toThrow("read-only server");
  });

  it("web capabilities flag no native dialog/watcher (G2 contract)", () => {
    expect(httpAdapter.capabilities.nativeFolderDialog).toBe(false);
    expect(httpAdapter.capabilities.fileWatcher).toBe(false);
  });

  it("J3 isolation: http adapter performs NO tauri invoke even if internals appear later", async () => {
    const invoke = vi.fn(() => Promise.resolve(null));
    vi.stubGlobal("__TAURI_INTERNALS__", { invoke });
    stubFetch((path) => (path === "/api/scan" ? [] : {}));
    try {
      const prompts = await httpAdapter.scanDirectory("/vault");
      expect(prompts).toEqual([]);
      expect(invoke).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
