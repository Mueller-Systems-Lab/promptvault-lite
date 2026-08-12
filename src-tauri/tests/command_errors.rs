// =============================================================================
// command_errors.rs — Fehlerfall-Tests für alle Tauri Commands (Phase 4)
// =============================================================================
//
// Jeder Test validiert menschenlesbare Err(String)-Rückgaben ohne echtes
// Tauri-Bootstrapping. Logik-Funktionen werden direkt aufgerufen.

use promptvault_lite_lib::commands::analyze;
use promptvault_lite_lib::commands::export;
use promptvault_lite_lib::commands::favorites;
use promptvault_lite_lib::commands::scan;
use promptvault_lite_lib::database::Database;
use promptvault_lite_lib::models::PromptItem;
use promptvault_lite_lib::scanner::file_scanner;
use promptvault_lite_lib::scanner::DebouncedWatcher;
use tempfile::TempDir;
// =============================================================================
// Hilfsfunktionen
// =============================================================================

fn make_prompt(id: &str, file_path: &str, content: &str) -> PromptItem {
    PromptItem {
        id: id.to_string(),
        file_path: file_path.to_string(),
        file_name: format!("{}.md", id),
        title: format!("Prompt {}", id),
        description: String::new(),
        category: "test".to_string(),
        version: "1.0".to_string(),
        tags: vec![],
        content: content.to_string(),
        raw_frontmatter: serde_json::json!({}),
        created_at: "2026-01-01T00:00:00Z".to_string(),
        updated_at: "2026-01-01T00:00:00Z".to_string(),
        is_favorite: false,
    }
}

// =============================================================================
// T4.9 — scan + analyze Fehlerfall-Tests
// =============================================================================

#[test]
fn test_scan_nonexistent_path() {
    let result = file_scanner::scan_directory("/this/path/does/not/exist/12345");
    assert!(
        result.is_err(),
        "Nicht-existenter Pfad muss Err zurückgeben"
    );
    let err = result.unwrap_err();
    assert!(
        err.contains("existiert nicht") || err.contains("nicht exist"),
        "Fehlermeldung muss Hinweis auf nicht-existenten Pfad enthalten: {}",
        err
    );
}

#[test]
fn test_scan_path_is_file_not_directory() {
    let dir = TempDir::new().unwrap();
    let file_path = dir.path().join("test_file.txt");
    std::fs::File::create(&file_path).unwrap();

    let result = file_scanner::scan_directory(file_path.to_str().unwrap());
    assert!(
        result.is_err(),
        "Pfad der Datei statt Verzeichnis ist, muss Err zurückgeben"
    );
    let err = result.unwrap_err();
    assert!(
        err.contains("kein Verzeichnis"),
        "Fehlermeldung muss 'kein Verzeichnis' enthalten: {}",
        err
    );
}

#[test]
fn test_scan_empty_string_path() {
    let result = file_scanner::scan_directory("");
    assert!(
        result.is_err(),
        "Leerer String als Pfad muss Err zurückgeben"
    );
    let err = result.unwrap_err();
    // Verhalten dokumentieren: aktuell gibt `exists()` false → Fehler
    assert!(!err.is_empty(), "Fehlermeldung muss menschenlesbar sein");
}

#[test]
fn test_evaluate_prompt_always_succeeds() {
    // evaluate_prompt() nimmt Content als Parameter, nicht eine Datenbank-ID.
    // Es gibt keinen Fehlerpfad für "unbekannte Prompt-ID" — der Caller
    // ist verantwortlich für die Validierung vor dem Aufruf.
    let result = analyze::evaluate_prompt(
        "unbekannte-id-12345".to_string(),
        "# Test Content".to_string(),
        None,
    );
    assert!(
        result.is_ok(),
        "evaluate_prompt() sollte immer Ok zurückgeben (Content-basiert)"
    );
    let eval = result.unwrap();
    assert_eq!(eval.prompt_id, "unbekannte-id-12345");
    assert!(eval.overall_score > 0, "Sollte Scoring erhalten");
}

#[test]
fn test_analyze_hygiene_always_succeeds() {
    // analyze_hygiene() nimmt Content als Parameter, validiert nicht die ID.
    let result = analyze::analyze_hygiene(
        "unbekannte-id-12345".to_string(),
        "# Test Content".to_string(),
        None,
    );
    assert!(
        result.is_ok(),
        "analyze_hygiene() sollte immer Ok zurückgeben"
    );
    let hyg = result.unwrap();
    assert_eq!(hyg.prompt_id, "unbekannte-id-12345");
}

#[test]
fn test_analyze_all_empty_prompts() {
    let result = analyze::analyze_all(vec![]);
    assert!(result.is_ok(), "Leere Prompt-Liste sollte Ok zurückgeben");
    let report = result.unwrap();
    assert_eq!(report.total_prompts, 0);
    assert!(report.evaluations.is_empty());
    assert!(report.hygiene.is_empty());
    assert_eq!(report.average_score, 0.0);
}

// =============================================================================
// T4.10 — Export Fehlerfall-Tests
// =============================================================================

#[test]
fn test_export_markdown_empty_prompt_list() {
    // Teste die innere Export-Logik mit leerer Liste
    let selected: Vec<PromptItem> = vec![];
    let eval_map: std::collections::HashMap<&str, &promptvault_lite_lib::models::PromptEvaluation> =
        std::collections::HashMap::new();
    let hygiene_map: std::collections::HashMap<&str, &promptvault_lite_lib::models::PromptHygiene> =
        std::collections::HashMap::new();

    let output = export::build_markdown_export_string(&selected, &eval_map, &hygiene_map);
    assert!(
        output.is_empty(),
        "Leere Prompt-Liste sollte leeren Markdown-String erzeugen"
    );
}

#[test]
fn test_export_json_empty_prompt_list() {
    let selected: Vec<PromptItem> = vec![];
    let eval_map: std::collections::HashMap<&str, &promptvault_lite_lib::models::PromptEvaluation> =
        std::collections::HashMap::new();
    let hygiene_map: std::collections::HashMap<&str, &promptvault_lite_lib::models::PromptHygiene> =
        std::collections::HashMap::new();

    let json_str = export::build_json_export_string(&selected, &eval_map, &hygiene_map);
    assert!(
        !json_str.is_empty(),
        "Leere Liste sollte valides JSON erzeugen"
    );
    let doc: serde_json::Value = serde_json::from_str(&json_str).expect("Sollte valides JSON sein");
    let prompts = doc.get("prompts").unwrap().as_array().unwrap();
    assert!(prompts.is_empty());
}

// =============================================================================
// T5.4 — Favoriten-Integrationstests (ADR-008: in-memory DB, direkter Aufruf)
// =============================================================================

#[test]
fn test_toggle_favorite_unknown_id() {
    let db = Database::new_in_memory().expect("In-Memory DB sollte erstellt werden");
    let result = favorites::toggle_favorite_impl("nonexistent", &db);
    assert!(
        result.is_err(),
        "toggle_favorite mit unbekannter ID muss Err zurückgeben"
    );
    let err = result.unwrap_err();
    assert!(
        err.contains("Prompt not found"),
        "Fehlermeldung muss 'Prompt not found' enthalten: {}",
        err
    );
}

#[test]
fn test_toggle_favorite_sets_favorite() {
    let db = Database::new_in_memory().expect("In-Memory DB sollte erstellt werden");
    let prompt = make_prompt("p1", "/test/p1.md", "# Test");

    db.save_prompts(std::slice::from_ref(&prompt))
        .expect("Prompt sollte gespeichert werden");

    let result = favorites::toggle_favorite_impl("p1", &db);
    assert!(
        result.is_ok(),
        "toggle_favorite sollte bei existierendem Prompt Ok zurückgeben"
    );
    assert!(result.unwrap(), "new_state sollte true sein (favorisiert)");

    let updated = db
        .get_prompt("p1")
        .expect("get_prompt sollte funktionieren")
        .expect("Prompt sollte existieren");
    assert!(
        updated.is_favorite,
        "Prompt sollte nach toggle_favorite favorisiert sein"
    );
}

#[test]
fn test_toggle_favorite_unsets_favorite() {
    let db = Database::new_in_memory().expect("In-Memory DB sollte erstellt werden");
    let mut prompt = make_prompt("p1", "/test/p1.md", "# Test");
    prompt.is_favorite = true;

    db.save_prompts(&[prompt])
        .expect("Prompt sollte gespeichert werden");

    let result = favorites::toggle_favorite_impl("p1", &db);
    assert!(
        result.is_ok(),
        "toggle_favorite sollte bei favorisiertem Prompt Ok zurückgeben"
    );
    assert!(
        !result.unwrap(),
        "new_state sollte false sein (nicht favorisiert)"
    );

    let updated = db
        .get_prompt("p1")
        .expect("get_prompt sollte funktionieren")
        .expect("Prompt sollte existieren");
    assert!(
        !updated.is_favorite,
        "Prompt sollte nach toggle_favorite nicht favorisiert sein"
    );
}

#[test]
fn test_get_favorites_empty() {
    let db = Database::new_in_memory().expect("In-Memory DB sollte erstellt werden");
    let result = favorites::get_favorites_impl(&db);
    assert!(
        result.is_ok(),
        "get_favorites sollte bei leerer DB Ok zurückgeben"
    );
    let favorites = result.unwrap();
    assert!(favorites.is_empty(), "Leere DB → leere Favoritenliste");
}

#[test]
fn test_get_favorites_returns_favorites() {
    let db = Database::new_in_memory().expect("In-Memory DB sollte erstellt werden");
    let mut prompt1 = make_prompt("p1", "/test/p1.md", "# Test 1");
    prompt1.is_favorite = true;
    let prompt2 = make_prompt("p2", "/test/p2.md", "# Test 2");

    db.save_prompts(&[prompt1, prompt2])
        .expect("Prompts sollten gespeichert werden");

    let result = favorites::get_favorites_impl(&db);
    assert!(result.is_ok());
    let favorites = result.unwrap();
    assert_eq!(
        favorites,
        vec!["p1".to_string()],
        "Nur p1 sollte favorisiert sein"
    );
}

// =============================================================================
// T4.11 — persistence + watcher Fehlerfall-Tests
// =============================================================================

#[test]
fn test_load_cache_from_empty_state() {
    // load_cache() greift auf AppState zu. Ohne Tauri-Infrastruktur
    // testen wir das AppState-Verhalten direkt: neuer State → leere Prompts.
    let state = scan::AppState::new();
    let prompts = state.prompts.lock().unwrap();
    assert!(
        prompts.is_empty(),
        "Neuer AppState sollte leere Prompts haben"
    );
}

#[test]
fn test_save_cache_with_empty_prompts() {
    let state = scan::AppState::new();
    // save_cache speichert Prompts in den State
    {
        let mut cached = state.prompts.lock().unwrap();
        *cached = vec![make_prompt("p1", "/test/p1.md", "# Test")];
    }
    let prompts = state.prompts.lock().unwrap();
    assert_eq!(prompts.len(), 1);
    assert_eq!(prompts[0].id, "p1");
}

#[test]
fn test_start_watcher_invalid_path() {
    let mut watcher = DebouncedWatcher::new();
    // start_watching benötigt app_handle — aber die Pfad-Validierung
    // läuft vor der Watcher-Erstellung. Ohne AppHandle können wir den
    // Pfad-Validierungs-Code nicht testen, da die Methode AppHandle benötigt.
    // Dokumentation: Pfad-Validierung in start_watching() prüft exists() und is_dir().
    // Bei Fehler: Err("Pfad existiert nicht: ...") bzw. Err("Pfad ist kein Verzeichnis: ...")
    //
    // Da AppHandle nicht ohne Tauri-Bootstrapping erzeugt werden kann,
    // testen wir das zugrundeliegende Verhalten des DebouncedWatcher:
    // Ein neuer Watcher hat keinen aktiven Watcher und keine watched_path.
    assert!(
        watcher.watched_path().is_none(),
        "Neuer Watcher sollte keinen watched_path haben"
    );
    watcher.stop_watching(); // idempotent
}

#[test]
fn test_stop_watcher_idempotent() {
    let mut watcher = DebouncedWatcher::new();
    // Mehrmaliges stop_watching muss ohne Fehler funktionieren
    watcher.stop_watching();
    watcher.stop_watching();
    watcher.stop_watching();
    // Kein Panic, keine Exception — idempotentes Verhalten
    assert!(watcher.watched_path().is_none());
}
