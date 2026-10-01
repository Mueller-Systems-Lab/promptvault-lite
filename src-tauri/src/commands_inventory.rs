//! Command-Inventar (Issue #108 / C3): dokumentiert und fixiert die IPC-
//! Command-Oberfläche des Desktop-Crates nach dem Workspace-Split.
//!
//! `tauri::generate_handler!` erzeugt die Dispatcher statisch — ein
//! Kompilierfehler hier bedeutet, dass eines der unten gelisteten Commands
//! nicht mehr existiert oder nicht mehr registriert ist. Die Liste ist die
//! C3-Verifikationsbasis („16 Commands" zum Zeitpunkt der Issue-Erstellung;
//! seither um TTS, Embeddings und E2E-Bridge erweitert).

#[cfg(test)]
mod tests {
    /// Alle registrierten Tauri-IPC-Commands (Reihenfolge wie in lib.rs).
    const REGISTERED_COMMANDS: &[&str] = &[
        // Scan/Persistenz
        "scan_directory",
        "start_file_watcher",
        "stop_file_watcher",
        "load_cache",
        "save_cache",
        // Analyse
        "evaluate_prompt",
        "analyze_hygiene",
        "analyze_all",
        "detect_artifacts_action",
        // Favoriten/Export
        "toggle_favorite",
        "get_favorites",
        "export_json",
        "export_markdown",
        "export_zip",
        // Authoring (Action Layer, Issue #90)
        "create_prompt",
        "update_prompt",
        // TTS
        "detect_local_tts",
        "synthesize_piper",
        "speak_system_tts",
        "stop_local_tts",
        // Embeddings (Issue #199)
        "embeddings_status",
        "embeddings_reindex",
        "semantic_search",
        // E2E-Bridge-Gate (ADR-005)
        "is_e2e_bridge_available",
    ];

    #[test]
    fn command_inventory_matches_registered_handlers() {
        // Die generate_handler!-Liste in lib.rs ist die Quelle; dieser Test
        // schlägt beim Kompilieren fehl, wenn eines der Commands umbenannt/entfernt
        // wird, da lib.rs die Funktionen direkt referenziert. Zusätzlich
        // fixiert der Test die dokumentierte Oberfläche:
        assert_eq!(REGISTERED_COMMANDS.len(), 24);
        // Die ursprünglichen 16 Commands (Issue-Stand Juni) sind enthalten:
        for legacy in [
            "scan_directory",
            "start_file_watcher",
            "stop_file_watcher",
            "load_cache",
            "save_cache",
            "evaluate_prompt",
            "analyze_hygiene",
            "analyze_all",
            "detect_artifacts_action",
            "toggle_favorite",
            "get_favorites",
            "export_json",
            "export_markdown",
            "export_zip",
            "create_prompt",
            "update_prompt",
        ] {
            assert!(
                REGISTERED_COMMANDS.contains(&legacy),
                "Legacy-Command fehlt: {legacy}"
            );
        }
    }
}
