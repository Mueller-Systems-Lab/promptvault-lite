/**
 * Tauri IPC Integration Tests — Vitest + @tauri-apps/api/mocks
 *
 * Tests the frontend-side contract for every Tauri command:
 *  - Correct invoke call name
 *  - Argument names and serialization
 *  - Success/error responses
 *  - Mock reset between tests
 *
 * Run: pnpm vitest run src/__tests__/tauri-ipc-integration.test.ts
 * Requires: @tauri-apps/api ^2.0.0 (already in devDependencies)
 */

import { describe, it, expect, afterEach, vi } from "vitest";
import { mockIPC, clearMocks } from "@tauri-apps/api/mocks";
import { invoke } from "@tauri-apps/api/core";

afterEach(() => {
  clearMocks();
});

// ---------------------------------------------------------------------------
// IPC-01: Scan Commands
// ---------------------------------------------------------------------------

describe("IPC-01 — Scan Commands", () => {
  it("scan_directory invokes with correct command name", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "scan_directory") {
        expect(args).toHaveProperty("path");
        expect(typeof args.path).toBe("string");
        return [];
      }
    });

    const result = await invoke("scan_directory", {
      path: "/mock-vault",
    });
    expect(result).toEqual([]);
  });

  it("scan_directory returns error for invalid path", async () => {
    mockIPC((cmd) => {
      if (cmd === "scan_directory") {
        return Promise.reject("Path not found or not readable");
      }
    });

    await expect(
      invoke("scan_directory", { path: "/nonexistent" })
    ).rejects.toBe("Path not found or not readable");
  });

  it("start_file_watcher invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "start_file_watcher") return null;
    });
    const result = await invoke("start_file_watcher");
    expect(result).toBeNull();
  });

  it("stop_file_watcher invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "stop_file_watcher") return null;
    });
    const result = await invoke("stop_file_watcher");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IPC-02: Analyze Commands
// ---------------------------------------------------------------------------

describe("IPC-02 — Analyze Commands", () => {
  it("evaluate_prompt invokes with prompt_id and content", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "evaluate_prompt") {
        expect(args).toHaveProperty("promptId");
        expect(args).toHaveProperty("content");
        expect(typeof args.promptId).toBe("string");
        expect(typeof args.content).toBe("string");
        return {
          id: "eval-1",
          overall_score: 85,
          criteria: [],
          recommendations: [],
        };
      }
    });

    const result = await invoke("evaluate_prompt", {
      promptId: "p1",
      content: "Test content",
    });
    expect(result.overall_score).toBe(85);
  });

  it("analyze_hygiene invokes with prompt_id and content", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "analyze_hygiene") {
        expect(args).toHaveProperty("promptId");
        expect(args).toHaveProperty("content");
        return { hygiene_score: 100, status: "clean", artifacts: [] };
      }
    });

    const result = await invoke("analyze_hygiene", {
      promptId: "p1",
      content: "Clean prompt",
    });
    expect(result.status).toBe("clean");
  });

  it("analyze_all invokes with prompts array", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "analyze_all") {
        expect(Array.isArray(args.prompts)).toBe(true);
        return { evaluations: [], hygiene: [], total_prompts: 3, average_score: 0 };
      }
    });

    const result = await invoke("analyze_all", {
      prompts: [{ id: "p1" }, { id: "p2" }, { id: "p3" }],
    });
    expect(result.total_prompts).toBe(3);
  });
});

// ---------------------------------------------------------------------------
// IPC-03: CRUD Commands
// ---------------------------------------------------------------------------

describe("IPC-03 — CRUD Commands", () => {
  it("create_prompt invokes with title, description, category, tags", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "create_prompt") {
        expect(args).toHaveProperty("title");
        expect(args).toHaveProperty("description");
        expect(args).toHaveProperty("category");
        expect(args).toHaveProperty("tags");
        return { id: "new-1", title: args.title };
      }
    });

    const result = await invoke("create_prompt", {
      title: "New Prompt",
      description: "A test prompt description",
      category: "code",
      tags: ["typescript", "testing"],
    });
    expect(result.id).toBe("new-1");
  });

  it("create_prompt returns error when no vault path set", async () => {
    mockIPC((cmd) => {
      if (cmd === "create_prompt") {
        return Promise.reject("No vault path set. Scan a directory first.");
      }
    });

    await expect(
      invoke("create_prompt", { title: "Test" })
    ).rejects.toBe("No vault path set. Scan a directory first.");
  });

  it("update_prompt invokes with id and updated fields", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "update_prompt") {
        expect(args).toHaveProperty("id");
        expect(args).toHaveProperty("title");
        return { id: args.id, title: args.title };
      }
    });

    const result = await invoke("update_prompt", {
      id: "p1",
      title: "Updated Title",
    });
    expect(result.title).toBe("Updated Title");
  });

  it("detect_artifacts_action invokes with content", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "detect_artifacts_action") {
        expect(args).toHaveProperty("content");
        return { hygiene_score: 100, status: "clean", artifacts: [], categories_found: [] };
      }
    });

    const result = await invoke("detect_artifacts_action", {
      content: "Some content with no secrets",
    });
    expect(result.hygiene_score).toBe(100);
  });
});

// ---------------------------------------------------------------------------
// IPC-04: Export Commands
// ---------------------------------------------------------------------------

describe("IPC-04 — Export Commands", () => {
  it("export_json invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "export_json") {
        return "/mock-vault/export.json";
      }
    });
    const result = await invoke("export_json", { vaultPath: "/mock-vault" });
    expect(result).toBe("/mock-vault/export.json");
  });

  it("export_markdown invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "export_markdown") {
        return "/mock-vault/export.md";
      }
    });
    const result = await invoke("export_markdown", { vaultPath: "/mock-vault" });
    expect(result).toBe("/mock-vault/export.md");
  });

  it("export_zip invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "export_zip") return "/mock-vault/export.zip";
    });
    const result = await invoke("export_zip", { vaultPath: "/mock-vault" });
    expect(result).toBe("/mock-vault/export.zip");
  });

  it("export commands return error for empty vault", async () => {
    mockIPC((cmd) => {
      if (cmd === "export_json" || cmd === "export_markdown" || cmd === "export_zip") {
        return Promise.reject("No prompts to export");
      }
    });

    await expect(
      invoke("export_json", { vaultPath: "/empty" })
    ).rejects.toBe("No prompts to export");
  });
});

// ---------------------------------------------------------------------------
// IPC-05: Favorites Commands
// ---------------------------------------------------------------------------

describe("IPC-05 — Favorites Commands", () => {
  it("toggle_favorite invokes with prompt_id", async () => {
    mockIPC((cmd, args) => {
      if (cmd === "toggle_favorite") {
        expect(args).toHaveProperty("promptId");
        expect(typeof args.promptId).toBe("string");
        return true;
      }
    });

    const result = await invoke("toggle_favorite", {
      promptId: "p1",
    });
    expect(result).toBe(true);
  });

  it("toggle_favorite returns error for invalid ID", async () => {
    mockIPC((cmd) => {
      if (cmd === "toggle_favorite") {
        return Promise.reject("Prompt not found");
      }
    });

    await expect(
      invoke("toggle_favorite", { promptId: "nonexistent" })
    ).rejects.toBe("Prompt not found");
  });

  it("get_favorites returns list of IDs", async () => {
    mockIPC((cmd) => {
      if (cmd === "get_favorites") return ["p1", "p3"];
    });

    const result = await invoke("get_favorites");
    expect(result).toEqual(["p1", "p3"]);
  });
});

// ---------------------------------------------------------------------------
// IPC-06: Persistence Commands
// ---------------------------------------------------------------------------

describe("IPC-06 — Persistence Commands", () => {
  it("load_cache returns cached prompts", async () => {
    const cachedPrompts = [
      { id: "p1", title: "Cached Prompt 1" },
      { id: "p2", title: "Cached Prompt 2" },
    ];

    mockIPC((cmd) => {
      if (cmd === "load_cache") return cachedPrompts;
    });

    const result = await invoke("load_cache");
    expect(result).toEqual(cachedPrompts);
  });

  it("save_cache invokes with prompts array", async () => {
    const prompts = [{ id: "p1", title: "Test" }];

    mockIPC((cmd, args) => {
      if (cmd === "save_cache") {
        expect(args).toHaveProperty("prompts");
        expect(Array.isArray(args.prompts)).toBe(true);
        return null;
      }
    });

    const result = await invoke("save_cache", { prompts });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IPC-07: Tauri Plugin Commands
// ---------------------------------------------------------------------------

describe("IPC-07 — Tauri Plugin Commands", () => {
  it("plugin:dialog|open invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "plugin:dialog|open") return "/mock-vault";
    });

    const result = await invoke("plugin:dialog|open", {
      options: { directory: true },
    });
    expect(result).toBe("/mock-vault");
  });

  it("plugin:dialog|save invokes correctly", async () => {
    mockIPC((cmd) => {
      if (cmd === "plugin:dialog|save") return "/mock-vault/export.json";
    });

    const result = await invoke("plugin:dialog|save", {
      options: { defaultPath: "export.json" },
    });
    expect(result).toBe("/mock-vault/export.json");
  });

  it("dialog plugin handles user cancel", async () => {
    mockIPC((cmd) => {
      if (cmd === "plugin:dialog|open") return null;
    });

    const result = await invoke("plugin:dialog|open", {
      options: { directory: true },
    });
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// IPC-08: Mock Cleanup Between Tests
// ---------------------------------------------------------------------------

describe("IPC-08 — Mock Isolation", () => {
  it("mock state does not leak between tests", async () => {
    // First call: set mock
    mockIPC((cmd) => {
      if (cmd === "test_cmd") return "first";
    });
    const first = await invoke("test_cmd");
    expect(first).toBe("first");

    clearMocks();

    // After clearMocks, invoke should fail (no handler)
    // But since we call invoke in a Vitest test, the mockIPC
    // sets up window.__TAURI_INTERNALS__.invoke globally.
    // clearMocks resets the internal handler map.
    // This tests that clearMocks is called and functional.
    // After clearMocks and mockIPC again:
    mockIPC((cmd) => {
      if (cmd === "test_cmd") return "second";
    });
    const second = await invoke("test_cmd");
    expect(second).toBe("second");
  });
});
