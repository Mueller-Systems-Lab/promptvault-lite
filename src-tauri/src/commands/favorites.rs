use crate::database::Database;

// --- Innere Logik — testbar ohne Tauri-Kontext (ADR-008) ---

// Seit dem Workspace-Split (#105) leben die Favoriten-Operationen in
// promptvault-core (Database::toggle_favorite / ::get_favorites) und werden
// von Desktop- und Server-Frontend gleichermaßen genutzt.
pub fn toggle_favorite_impl(prompt_id: &str, db: &Database) -> Result<bool, String> {
    db.toggle_favorite(prompt_id)
}

pub fn get_favorites_impl(db: &Database) -> Result<Vec<String>, String> {
    db.get_favorites()
}

// --- Tauri Commands — dünne Wrapper ---

#[tauri::command]
pub fn toggle_favorite(prompt_id: String, db: tauri::State<'_, Database>) -> Result<bool, String> {
    toggle_favorite_impl(&prompt_id, db.inner())
}

#[tauri::command]
pub fn get_favorites(db: tauri::State<'_, Database>) -> Result<Vec<String>, String> {
    get_favorites_impl(db.inner())
}
