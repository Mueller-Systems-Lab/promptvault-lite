//! E3 (#115) + Kontext-Form von E4 (#116): Prompt-Lese-/Analyse-Endpunkte.

use axum::extract::{Path, State};
use axum::Json;
use serde::Serialize;

use promptvault_core::models::{PromptEvaluation, PromptHygiene, PromptItem};

use crate::error::{map_core_error, ApiError, ApiResult};
use crate::state::AppState;

fn cached(state: &AppState) -> ApiResult<Vec<PromptItem>> {
    state
        .prompts
        .lock()
        .map(|p| p.clone())
        .map_err(|_| ApiError::internal("Prompt-Cache gesperrt"))
}

/// GET /api/prompts
pub async fn list_prompts(State(state): State<AppState>) -> ApiResult<Json<Vec<PromptItem>>> {
    Ok(Json(cached(&state)?))
}

/// GET /api/prompts/:id
pub async fn get_prompt(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<PromptItem>> {
    let found = cached(&state)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| ApiError::not_found(format!("Prompt {id} nicht gescannt")))?;
    Ok(Json(found))
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct AnalysisResult {
    pub evaluation: PromptEvaluation,
    pub hygiene: PromptHygiene,
}

/// POST /api/prompts/:id/analyze — runs the deterministic core analysis on
/// the CURRENT file content (re-read from disk, not the cache), mirroring
/// the desktop `analyzeSelected` behavior of analyzing fresh content.
pub async fn analyze_prompt(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<AnalysisResult>> {
    let prompt = cached(&state)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| ApiError::not_found(format!("Prompt {id} nicht gescannt")))?;
    // Fresh read from disk (content may have changed since the scan).
    let fresh = promptvault_core::scanner::scan_directory(
        std::path::Path::new(&prompt.file_path)
            .parent()
            .and_then(|p| p.to_str())
            .ok_or_else(|| ApiError::internal("Dateipfad ohne Parent"))?,
    )
    .map_err(|e| map_core_error("re-scan", e))?;
    let content = fresh
        .iter()
        .find(|p| p.file_path == prompt.file_path)
        .map(|p| p.content.clone())
        .unwrap_or(prompt.content);

    let evaluation = promptvault_core::analysis::evaluate_prompt(&content, &id);
    let hygiene = promptvault_core::analysis::analyze_hygiene(&content, &id);
    Ok(Json(AnalysisResult {
        evaluation,
        hygiene,
    }))
}

/// GET /api/prompts/:id/context — E4 context-evaluation projection:
/// derives the structural context signals from the deterministic core
/// evaluation (missing canonical sections + per-criterion scores). The
/// full TS-side `promptContextEvaluation` profile stays a frontend module;
/// this endpoint exposes the server-verifiable subset.
pub async fn prompt_context(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let prompt = cached(&state)?
        .into_iter()
        .find(|p| p.id == id)
        .ok_or_else(|| ApiError::not_found(format!("Prompt {id} nicht gescannt")))?;
    let evaluation = promptvault_core::analysis::evaluate_prompt(&prompt.content, &id);
    Ok(Json(serde_json::json!({
        "prompt_id": id,
        "missing_sections": evaluation.missing_sections,
        "criteria": evaluation.criteria,
        "overall_score": evaluation.overall_score,
    })))
}
