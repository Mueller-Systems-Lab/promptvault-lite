// =============================================================================
// Adapter factory (issue #121 / F4) — single entry point for the UI.
// =============================================================================

import { detectBackendKind } from "./detect";
import { httpAdapter } from "./httpAdapter";
import { tauriAdapter } from "./tauriAdapter";
import type { BackendAdapter } from "./types";

let override: BackendAdapter | null = null;

/**
 * Returns the backend adapter for the current runtime.
 * - Tauri internals present → TauriAdapter (desktop)
 * - otherwise → HttpAdapter (web/LAN mode)
 * A test/override can pin an adapter explicitly (resetBackendOverride).
 */
export function getBackend(): BackendAdapter {
  if (override) return override;
  return detectBackendKind() === "tauri" ? tauriAdapter : httpAdapter;
}

/** Test seam: pin a specific adapter (pass null to reset). */
export function setBackendOverride(adapter: BackendAdapter | null): void {
  override = adapter;
}
