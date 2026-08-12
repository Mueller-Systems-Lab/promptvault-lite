pub mod analysis;
pub mod commands;
pub mod database;
pub mod models;
pub mod observability;
pub mod parser;
pub mod scanner;

use crate::database::Database;
use commands::AppState;
use tauri::Manager;

/// E2E-Bridge-Gate (ADR-005, Variante B — Owner-Freigabe 2026-08-05).
///
/// `window.__pvlLoadArchive` (siehe src/App.tsx) darf NUR in Debug-Builds
/// exponiert sein. Dieser Command liefert `true` ausschließlich unter
/// `cfg(debug_assertions)`; im Produktions-Build gibt er `false` zurück,
/// das Frontend exponiert die Bridge dann NICHT (fail-closed). Der
/// Test-Einstieg wird damit nie in Release-Artefakten aktiv.
#[tauri::command]
fn is_e2e_bridge_available() -> bool {
    cfg!(debug_assertions)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::new())
        .setup(|app| {
            log::info!("PromptVault Lite gestartet");

            // ADR-006: Database als separates tauri::State registrieren
            let db_path = app
                .path()
                .app_data_dir()
                .map_err(|e| format!("App-Datenverzeichnis nicht verfügbar: {}", e))?
                .join("promptvault.db");

            // Stelle sicher, dass das übergeordnete Verzeichnis existiert,
            // bevor die SQLite-Datenbank geöffnet/erstellt wird.
            // Fix für: Windows-Installer-Startup-Crash (BEX64 / panic=abort)
            // Root Cause: app_data_dir() liefert Pfad, der nicht existiert,
            // und rusqlite::Connection::open() kann die Datei nicht erstellen.
            if let Some(parent) = db_path.parent() {
                std::fs::create_dir_all(parent)
                    .map_err(|e| format!("Konnte Datenbank-Verzeichnis nicht erstellen: {}", e))?;
            }

            let database = Database::new(
                db_path
                    .to_str()
                    .ok_or_else(|| "Ungültiger Pfad für Datenbank".to_string())?,
            )
            .map_err(|e| format!("Datenbank konnte nicht initialisiert werden: {}", e))?;
            app.manage(database);

            #[cfg(debug_assertions)]
            {
                let window = app.get_webview_window("main").unwrap();
                window.open_devtools();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::scan::scan_directory,
            commands::scan::start_file_watcher,
            commands::scan::stop_file_watcher,
            commands::analyze::evaluate_prompt,
            commands::analyze::analyze_hygiene,
            commands::analyze::analyze_all,
            commands::favorites::toggle_favorite,
            commands::favorites::get_favorites,
            commands::export::export_json,
            commands::export::export_markdown,
            commands::export::export_zip,
            commands::persistence::load_cache,
            commands::persistence::save_cache,
            // Action Layer Commands (Issue #90)
            commands::actions::detect_artifacts_action,
            commands::actions::create_prompt,
            commands::actions::update_prompt,
            // E2E-Bridge-Gate (ADR-005): existiert NUR im Debug-Build.
            // Produktions-Build: Command nicht registriert → invoke wirft →
            // Frontend exponiert window.__pvlLoadArchive NICHT (fail-closed).
            is_e2e_bridge_available,
        ])
        .run(tauri::generate_context!())
        .expect("Fehler beim Starten der Tauri-Anwendung");
}
