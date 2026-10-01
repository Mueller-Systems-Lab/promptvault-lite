//! E5 (#117): Evidence-Read und Export (Export erzeugt NUR Antwortdaten —
//! keine Datei-Schreibvorgänge; der Server-Default ist read-only).

use axum::extract::{Path, State};
use axum::Json;
use serde::Serialize;
use serde_json::json;

use crate::error::{ApiError, ApiResult};
use crate::routes::guard;
use crate::state::AppState;

/// GET /api/evidence/:id — Hygiene-Befunde (Artefakte) eines Prompts als
/// sanitisierte Evidenzliste (Kategorie/Beschreibung/Schwere, keine Inhalte).
pub async fn read_evidence(
    State(state): State<AppState>,
    Path(id): Path<String>,
) -> ApiResult<Json<serde_json::Value>> {
    let (pid, fpath, content) = {
        let prompts = state
            .prompts
            .lock()
            .map_err(|_| ApiError::internal("Prompt-Cache gesperrt"))?;
        prompts
            .iter()
            .find(|p| p.id == id)
            .map(|p| (p.id.clone(), p.file_path.clone(), p.content.clone()))
            .ok_or_else(|| ApiError::not_found(format!("Prompt {id} nicht gescannt")))?
    };

    let hygiene = promptvault_core::analysis::analyze_hygiene(&id, &content);

    Ok(Json(json!({
        "prompt_id": pid,
        "file_path": fpath,
        "hygiene_score": hygiene.hygiene_score,
        "status": hygiene.status,
        "artifacts": hygiene.artifacts,
    })))
}

#[derive(Serialize)]
#[serde(rename_all = "snake_case")]
pub struct ExportResult {
    pub format: &'static str,
    pub count: usize,
    pub content: String,
}

/// POST /api/export {"format": "json"|"markdown"} — liefert den Export als
/// Antwortinhalt (kein Datei-Write; ein Datei-Export ins Vault wäre ein
/// Schreibzugriff und ist im Read-only-Modus ausgeschlossen).
pub async fn export_prompts(
    State(state): State<AppState>,
    body: Option<Json<serde_json::Value>>,
) -> ApiResult<Json<ExportResult>> {
    guard::require_writable(&state)?;
    let format = body
        .as_ref()
        .and_then(|b| b.0.get("format"))
        .and_then(|f| f.as_str())
        .unwrap_or("json")
        .to_ascii_lowercase();
    let prompts = state
        .prompts
        .lock()
        .map_err(|_| ApiError::internal("Prompt-Cache gesperrt"))?
        .clone();
    match format.as_str() {
        "json" => {
            let content = serde_json::to_string_pretty(&prompts)
                .map_err(|e| ApiError::internal(format!("Serialisierung fehlgeschlagen: {e}")))?;
            Ok(Json(ExportResult {
                format: "json",
                count: prompts.len(),
                content,
            }))
        }
        "markdown" | "md" => {
            let mut md = String::new();
            for p in &prompts {
                md.push_str(&format!(
                    "# {}\n\n- Kategorie: {}\n- Version: {}\n\n---\n\n",
                    p.title, p.category, p.version
                ));
            }
            Ok(Json(ExportResult {
                format: "markdown",
                count: prompts.len(),
                content: md,
            }))
        }
        other => Err(ApiError::bad_request(format!(
            "Unbekanntes Export-Format: {other} (unterstützt: json, markdown)"
        ))),
    }
}
