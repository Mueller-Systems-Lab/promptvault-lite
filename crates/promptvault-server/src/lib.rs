//! Library surface of the server crate — testable without spawning the
//! binary. The binary (`main.rs`) wires configuration, database and router.

pub mod config;
pub mod error;
pub mod routes;
pub mod state;

use axum::Router;

pub use config::{load_config, ServerConfig};
pub use state::AppState;

/// Full application router: `/api/*` plus optional static UI serving
/// (`PROMPTVAULT_SERVER_STATIC` → built web UI; text fallback otherwise).
pub fn build_router(state: AppState) -> Router {
    let api = routes::api_router();
    let static_dir = std::env::var("PROMPTVAULT_SERVER_STATIC")
        .ok()
        .filter(|s| !s.is_empty());
    match static_dir {
        Some(dir) => Router::new()
            .nest("/api", api)
            .fallback_service(
                tower_http::services::ServeDir::new(dir)
                    .fallback(axum::routing::get(static_fallback)),
            )
            .with_state(state),
        None => Router::new()
            .nest("/api", api)
            .fallback(axum::routing::get(static_fallback))
            .with_state(state),
    }
}

async fn static_fallback(uri: axum::http::Uri) -> axum::response::Response {
    use axum::http::StatusCode;
    use axum::response::IntoResponse;
    // Unbekannte API-Routen sind echte 404s — niemals die UI-Antwort.
    if uri.path().starts_with("/api/") {
        return (StatusCode::NOT_FOUND, "not found").into_response();
    }
    (
        StatusCode::OK,
        "PromptVault Server (kein statisches UI konfiguriert)",
    )
        .into_response()
}
