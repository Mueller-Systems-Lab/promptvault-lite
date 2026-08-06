// src/lib/e2eBridge.ts
//
// E2E-Bridge-Gate (ADR-005, Variante B — Owner-Freigabe 2026-08-05).
//
// `window.__pvlLoadArchive` ist ein Test-Einstieg für den nativen E2E-Lauf
// (E19): Er ruft den ECHTEN scanFolder()-Store-Pfad auf (→ echter
// scan_directory-Invoke → echtes Rust → echtes Dateisystem), ersetzt also
// den OS-Dateidialog, der unter CI-Xvfb nicht automatisierbar ist.
//
// SICHERHEITSVERTRAG:
//   - Bridge wird NUR exponiert, wenn is_e2e_bridge_available() true
//     liefert (Rust-Command mit cfg!(debug_assertions)) — Produktions-Build
//     liefert false → window.__pvlLoadArchive bleibt undefined.
//   - invoke-Fehler → fail-closed (keine Exposition).
//   - Die Bridge ersetzt scanFolder NICHT; der Pfad durchläuft weiterhin
//     die reale Produktvalidierung (scan_directory canonicalisiert Pfade).
//
// Die Gate-Entscheidung ist als pure Funktion exportiert, damit die
// Negativtests ohne Desktop/Tauri laufen.

export type ScanFolderFn = (path: string) => Promise<void>;

/** Pure Gate-Entscheidung: Bridge nur exponiert, wenn isTauri UND Gate true. */
export function shouldExposeE2EBridge(
  isTauri: boolean,
  bridgeAvailable: boolean,
): boolean {
  if (!isTauri) return false;
  return bridgeAvailable;
}

/**
 * Installiert window.__pvlLoadArchive, falls autorisiert.
 * Returns true, wenn die Bridge exponiert wurde.
 */
export async function installE2EBridgeIfAuthorized(
  scanFolder: ScanFolderFn,
): Promise<boolean> {
  const isTauri =
    typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  if (!isTauri) return false;

  let bridgeAvailable = false;
  try {
    const { invoke } = await import("@tauri-apps/api/core");
    bridgeAvailable = await invoke<boolean>("is_e2e_bridge_available");
  } catch {
    // fail-closed: kein invoke verfügbar → keine Exposition
    return false;
  }

  if (!shouldExposeE2EBridge(isTauri, bridgeAvailable)) {
    return false;
  }

  (window as unknown as Record<string, unknown>).__pvlLoadArchive = (
    path: string,
  ) => {
    void scanFolder(path);
  };
  return true;
}

/** Entfernt die Bridge (Test-Cleanup). */
export function removeE2EBridge(): void {
  if (typeof window !== "undefined") {
    delete (window as unknown as Record<string, unknown>).__pvlLoadArchive;
  }
}
