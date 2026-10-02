//! E2 (#114): POST /api/scan — scan a vault directory (security-validated).

use axum::extract::State;
use axum::Json;
use serde::Deserialize;
use std::path::PathBuf;

use promptvault_core::models::PromptItem;

use crate::error::{map_core_error, ApiError, ApiResult};
use crate::state::AppState;

#[derive(Deserialize)]
pub struct ScanRequest {
    pub path: String,
}

/// Validate a scan target before touching the filesystem (basis for the
/// J1 red tests): absolute path, no `..` segments, existing directory.
/// Returns the canonicalized path (symlink-consistent).
pub fn validate_scan_path(raw: &str) -> Result<PathBuf, ApiError> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err(ApiError::bad_request("Pfad leer"));
    }
    let path = PathBuf::from(trimmed);
    if !path.is_absolute() {
        return Err(ApiError::bad_request("Pfad muss absolut sein"));
    }
    if trimmed.split(['/', '\\']).any(|seg| seg == "..") {
        return Err(ApiError::bad_request(
            "Pfad enthält '..'-Segmente (Path Traversal)",
        ));
    }
    let canonical = dunce::canonicalize(&path)
        .map_err(|_| ApiError::bad_request("Pfad existiert nicht oder ist unlesbar"))?;
    if !canonical.is_dir() {
        return Err(ApiError::bad_request("Pfad ist kein Verzeichnis"));
    }
    Ok(canonical)
}

pub async fn scan_vault(
    State(state): State<AppState>,
    Json(req): Json<ScanRequest>,
) -> ApiResult<Json<Vec<PromptItem>>> {
    let dir = validate_scan_path(&req.path)?;
    let prompts =
        promptvault_core::scanner::scan_directory(dir.to_str().ok_or_else(|| {
            ApiError::bad_request("Pfad enthält ungültige Unicode-/Systemzeichen")
        })?)
        .map_err(|e| map_core_error("scan", e))?;

    // Upsert into SQLite (favorites persistence), then hydrate favorite flags.
    {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("Datenbank gesperrt"))?;
        db.save_prompts(&prompts)
            .map_err(|e| map_core_error("db save_prompts", e))?;
    }
    let mut prompts = prompts;
    {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("Datenbank gesperrt"))?;
        if let Ok(persisted) = db.load_prompts() {
            let fav: std::collections::HashMap<&str, bool> = persisted
                .iter()
                .map(|p| (p.file_path.as_str(), p.is_favorite))
                .collect();
            for p in prompts.iter_mut() {
                if let Some(f) = fav.get(p.file_path.as_str()) {
                    p.is_favorite = *f;
                }
            }
        }
    }
    *state
        .prompts
        .lock()
        .map_err(|_| ApiError::internal("Prompt-Cache gesperrt"))? = prompts.clone();
    Ok(Json(prompts))
}
