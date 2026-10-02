//! E1 (#113): GET /api/health

use axum::extract::State;
use axum::Json;
use serde::Serialize;

use crate::state::AppState;

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct Health {
    pub status: &'static str,
    pub version: &'static str,
    pub read_only: bool,
}

pub async fn health(State(state): State<AppState>) -> Json<Health> {
    Json(Health {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
        read_only: state.config.read_only,
    })
}
