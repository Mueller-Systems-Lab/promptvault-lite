// =============================================================================
// Runtime detection (issue #118 / F1).
//
// Desktop (Tauri) injects `window.__TAURI_INTERNALS__`; web mode does not.
// Detection is fail-safe: any probing error resolves to the HTTP adapter so
// the web UI never breaks because of a detection hiccup.
// =============================================================================

export type BackendKind = "tauri" | "http";

export interface TauriInternals {
  invoke: (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;
}

/** Minimal window shape used for detection (test-friendly). */
export interface WindowLike {
  __TAURI_INTERNALS__?: TauriInternals;
}

/** Narrow, side-effect-free probe for the Tauri IPC bridge. */
export function hasTauriInternals(win: WindowLike): boolean {
  // Runtime-Guard bleibt bewusst defensiv (umgebungsabhängige Injects).
  const internals = win.__TAURI_INTERNALS__ as TauriInternals | null | undefined;
  return (
    typeof internals === "object" &&
    internals !== null &&
    typeof internals.invoke === "function"
  );
}

export function detectBackendKind(win: WindowLike = window as unknown as WindowLike): BackendKind {
  try {
    return hasTauriInternals(win) ? "tauri" : "http";
  } catch {
    return "http";
  }
}
