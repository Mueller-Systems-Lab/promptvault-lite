//! E4 (#116): Favoriten-Endpunkte (Schreibzugriffe: read-only-Guard).

use axum::extract::{Path, State};
use axum::Json;
use serde_json::json;

use promptvault_core::models::PromptItem;

use crate::error::{map_core_error, ApiError, ApiResult};
use crate::routes::guard;
use crate::state::AppState;

fn favorite_items(state: &AppState) -> ApiResult<Vec<PromptItem>> {
    let prompts = state
        .prompts
        .lock()
        .map(|p| p.clone())
        .map_err(|_| ApiError::internal("Prompt-Cache gesperrt"))?;
    let favorites: Vec<String> = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("Datenbank gesperrt"))?;
        db.get_favorites()
            .map_err(|e| map_core_error("get_favorites", e))?
    };
    Ok(prompts
        .into_iter()
        .filter(|p| favorites.contains(&p.id))
        .collect())
}

/// GET /api/favorites — favorisierte Prompts aus dem letzten Scan.
pub async fn list_favorites(State(state): State<AppState>) -> ApiResult<Json<Vec<PromptItem>>> {
    Ok(Json(favorite_items(&state)?))
}

/// POST /api/favorites/:id/toggle — Schreibzugriff (read-only-Guard).
pub async fn toggle_favorite(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    guard::require_writable(&state)?;
    let new_state = {
        let db = state
            .db
            .lock()
            .map_err(|_| ApiError::internal("Datenbank gesperrt"))?;
        db.toggle_favorite(&id)
            .map_err(|e| map_core_error("toggle_favorite", e))?
    };
    Ok(Json(json!({ "prompt_id": id, "is_favorite": new_state })))
}
