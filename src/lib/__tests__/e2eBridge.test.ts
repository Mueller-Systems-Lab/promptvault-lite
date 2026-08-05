// src/lib/__tests__/e2eBridge.test.ts
//
// Security-Vertrag für window.__pvlLoadArchive (ADR-005, Variante B):
//   - production mode does not expose bridge
//   - missing E2E enable flag does not expose bridge
//   - invoke-Fehler → fail-closed (keine Exposition)
//   - bridge does not replace or mock scanFolder (ruft echten Pfad)
//   - Nicht-Tauri-Kontext → keine Exposition
//   - malformed path / non-directory / traversal: wird durch die reale
//     scan_directory-Validierung abgefangen (Rust-Seite, hier Contract-Check)

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { shouldExposeE2EBridge, removeE2EBridge } from "../e2eBridge";

describe("E2E-Bridge Security-Vertrag (ADR-005)", () => {
  beforeEach(() => {
    removeE2EBridge();
    vi.resetModules();
  });

  afterEach(() => {
    removeE2EBridge();
    vi.restoreAllMocks();
  });

  function fakeTauriWindow() {
    // @ts-expect-error Test-Fake: __TAURI_INTERNALS__ Marker
    globalThis.window = { __TAURI_INTERNALS__: {} };
  }

  it("shouldExposeE2EBridge: Nicht-Tauri → false (production browser)", () => {
    expect(shouldExposeE2EBridge(false, true)).toBe(false);
    expect(shouldExposeE2EBridge(false, false)).toBe(false);
  });

  it("shouldExposeE2EBridge: E2E-Gate false → false (production build)", () => {
    // Produktions-Build: is_e2e_bridge_available() → false
    expect(shouldExposeE2EBridge(true, false)).toBe(false);
  });

  it("shouldExposeE2EBridge: E2E-Gate true + Tauri → true (debug build)", () => {
    expect(shouldExposeE2EBridge(true, true)).toBe(true);
  });

  it("production mode does not expose bridge (install: gate false)", async () => {
    fakeTauriWindow();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn().mockResolvedValue(false), // Produktions-Build
    }));
    const { installE2EBridgeIfAuthorized: install } = await import("../e2eBridge");
    const scanFolder = vi.fn().mockResolvedValue(undefined);
    const exposed = await install(scanFolder);
    expect(exposed).toBe(false);
    // @ts-expect-error window-Fake
    expect(globalThis.window.__pvlLoadArchive).toBeUndefined();
  });

  it("missing E2E flag (invoke throws) → fail-closed, bridge not exposed", async () => {
    fakeTauriWindow();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn().mockRejectedValue(new Error("Command not found")),
    }));
    const { installE2EBridgeIfAuthorized: install } = await import("../e2eBridge");
    const scanFolder = vi.fn().mockResolvedValue(undefined);
    const exposed = await install(scanFolder);
    expect(exposed).toBe(false);
    // @ts-expect-error window-Fake
    expect(globalThis.window.__pvlLoadArchive).toBeUndefined();
  });

  it("bridge does not replace or mock scanFolder — calls the real fn", async () => {
    fakeTauriWindow();
    vi.doMock("@tauri-apps/api/core", () => ({
      invoke: vi.fn().mockResolvedValue(true), // Debug-Build
    }));
    const { installE2EBridgeIfAuthorized: install } = await import("../e2eBridge");
    const scanFolder = vi.fn().mockResolvedValue(undefined);
    const exposed = await install(scanFolder);
    expect(exposed).toBe(true);

    // @ts-expect-error window-Fake
    const bridge = globalThis.window.__pvlLoadArchive as (p: string) => void;
    expect(typeof bridge).toBe("function");
    bridge("/tmp/pvl-archive");
    expect(scanFolder).toHaveBeenCalledWith("/tmp/pvl-archive");
    expect(scanFolder).toHaveBeenCalledTimes(1);
  });

  it("non-Tauri browser context → never exposed", async () => {
    // globalThis.window bleibt das echte jsdom-Fenster ohne __TAURI_INTERNALS__
    const { installE2EBridgeIfAuthorized: install } = await import("../e2eBridge");
    const scanFolder = vi.fn().mockResolvedValue(undefined);
    const exposed = await install(scanFolder);
    expect(exposed).toBe(false);
    expect(
      (globalThis.window as unknown as Record<string, unknown>).__pvlLoadArchive,
    ).toBeUndefined();
  });
});
