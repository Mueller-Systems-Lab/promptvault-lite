//! HTTP routes (issues #113–#117 / E1–E5).

pub mod export;
pub mod favorites;
pub mod health;
pub mod prompts;
pub mod scan;

use axum::routing::{get, post};
use axum::Router;

use crate::state::AppState;

/// Build the API router. Mounted under `/api`.
pub fn api_router() -> Router<AppState> {
    Router::new()
        // E1 (#113)
        .route("/health", get(health::health))
        // E2 (#114)
        .route("/scan", post(scan::scan_vault))
        .route("/prompts", get(prompts::list_prompts))
        // E3 (#115)
        .route("/prompts/:id", get(prompts::get_prompt))
        .route("/prompts/:id/analyze", post(prompts::analyze_prompt))
        // E4 (#116)
        .route("/favorites", get(favorites::list_favorites))
        .route("/favorites/:id/toggle", post(favorites::toggle_favorite))
        .route("/prompts/:id/context", get(prompts::prompt_context))
        // E5 (#117)
        .route("/evidence/:id", get(export::read_evidence))
        .route("/export", post(export::export_prompts))
}

/// Write-access guard (issue #111 / D2): fail-closed — every mutating route
/// calls this first and returns 403 unless the server was explicitly started
/// with `PROMPTVAULT_SERVER_READ_ONLY=0` (the default is read-only).
pub mod guard {
    use crate::error::ApiError;
    use crate::state::AppState;

    pub fn require_writable(state: &AppState) -> Result<(), ApiError> {
        if state.config.read_only {
            return Err(ApiError::forbidden(
                "Server läuft im Read-only-Modus (Default). Schreibzugriffe erfordern \
                 PROMPTVAULT_SERVER_READ_ONLY=0 beim Start.",
            ));
        }
        Ok(())
    }
}
