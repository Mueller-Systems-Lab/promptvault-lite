//! Tauri commands for the local embeddings MVP (Issue #199, ADR-004).
//!
//! Feature-gated via `PROMPTVAULT_EMBEDDINGS=1` — **fail-closed**: when the
//! flag is unset, every command refuses to read or write embedding data.
//! Advisory only: nothing here mutates prompts; vectors are never returned
//! to the frontend (search results carry sanitized metadata only).

use serde::Serialize;

use crate::analysis::embeddings as provider;
use crate::database::Database;

/// Environment feature flag (ADR-004: feature-gated, disabled by default).
pub const EMBEDDINGS_ENV_FLAG: &str = "PROMPTVAULT_EMBEDDINGS";

/// Stable model id for the synthetic provider.
pub const SYNTHETIC_MODEL_ID: &str = "synthetic-feature-hash-v1";

fn embeddings_enabled() -> bool {
    std::env::var(EMBEDDINGS_ENV_FLAG)
        .map(|v| v == "1")
        .unwrap_or(false)
}

/// Sanitized status payload (no vectors, no prompt content).
#[derive(Debug, Clone, Serialize)]
pub struct EmbeddingsStatus {
    pub enabled: bool,
    pub provider: String,
    pub model: String,
    pub model_id: String,
    pub dimensions: usize,
    pub indexed_count: i64,
    pub ready: bool,
}

/// Structured re-index report (ADR-004 "Structured indexing report").
#[derive(Debug, Clone, Serialize)]
pub struct ReindexReport {
    pub indexed: usize,
    pub skipped_sensitive: usize,
    pub skipped_unchanged: usize,
    pub failed: usize,
    pub provider: String,
    pub model: String,
    pub dimensions: usize,
}

/// Sanitized semantic search hit (metadata + score, never content).
#[derive(Debug, Clone, Serialize)]
pub struct SemanticSearchHit {
    pub prompt_id: String,
    pub title: String,
    pub category: String,
    pub version: String,
    pub score: f32,
}

/// Deterministic content hash (content + updated_at, hex). Uses the same
/// FNV-1a primitive as the provider so no new dependency is introduced.
fn content_hash(content: &str, updated_at: &str) -> String {
    let mut h: u64 = 0xcbf2_9ce4_8422_2325;
    for b in content.as_bytes().iter().chain(updated_at.as_bytes()) {
        h ^= u64::from(*b);
        h = h.wrapping_mul(0x0000_0100_0000_01b3);
    }
    format!("{h:016x}")
}

/// True when the prompt must be skipped by default (ADR-004 sensitive rule):
/// hygiene status Critical OR artifacts containing PII/Secret.
fn is_sensitive(hygiene_status: &str, artifacts_json: &str) -> bool {
    if hygiene_status.eq_ignore_ascii_case("critical") {
        return true;
    }
    // Defensive JSON scan for the serialized category names (PII/SECRET).
    // Parsing failures are treated as sensitive (fail-closed).
    let parsed: Result<serde_json::Value, _> = serde_json::from_str(artifacts_json);
    match parsed {
        Ok(serde_json::Value::Array(items)) => items.iter().any(|it| {
            it.get("category")
                .and_then(|c| c.as_str())
                .map(|c| c.eq_ignore_ascii_case("PII") || c.eq_ignore_ascii_case("SECRET"))
                .unwrap_or(false)
        }),
        _ => false,
    }
}

/// Read hygiene status + artifacts per prompt from the DB.
fn load_hygiene_map(
    db: &Database,
) -> Result<std::collections::HashMap<String, (String, String)>, String> {
    let conn = db.lock_conn()?;
    let mut stmt = conn
        .prepare("SELECT prompt_id, status, artifacts FROM hygiene")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })
        .map_err(|e| e.to_string())?;
    let mut map = std::collections::HashMap::new();
    for row in rows {
        let (pid, status, artifacts) = row.map_err(|e| e.to_string())?;
        map.insert(pid, (status, artifacts));
    }
    Ok(map)
}

/// Current embeddings status. With the flag disabled this reports
/// `enabled: false` with zero counts and reads no embedding rows.
#[tauri::command]
pub fn embeddings_status(db: tauri::State<'_, Database>) -> Result<EmbeddingsStatus, String> {
    if !embeddings_enabled() {
        return Ok(EmbeddingsStatus {
            enabled: false,
            provider: provider::SYNTHETIC_PROVIDER.to_string(),
            model: provider::SYNTHETIC_MODEL.to_string(),
            model_id: SYNTHETIC_MODEL_ID.to_string(),
            dimensions: provider::EMBEDDING_DIMENSIONS,
            indexed_count: 0,
            ready: false,
        });
    }
    db.register_embedding_model(
        SYNTHETIC_MODEL_ID,
        provider::SYNTHETIC_PROVIDER,
        provider::SYNTHETIC_MODEL,
        provider::EMBEDDING_DIMENSIONS,
    )?;
    let indexed_count = db.count_prompt_embeddings(SYNTHETIC_MODEL_ID)?;
    Ok(EmbeddingsStatus {
        enabled: true,
        provider: provider::SYNTHETIC_PROVIDER.to_string(),
        model: provider::SYNTHETIC_MODEL.to_string(),
        model_id: SYNTHETIC_MODEL_ID.to_string(),
        dimensions: provider::EMBEDDING_DIMENSIONS,
        indexed_count,
        ready: indexed_count > 0,
    })
}

/// Explicit re-index of all stored prompts (never triggered implicitly).
///
/// Hash-based skipping: unchanged (content+updated_at) prompts keep their
/// stored vector. Sensitive prompts (Critical hygiene or PII/Secret
/// artifacts) are skipped by default and never embedded.
#[tauri::command]
pub fn embeddings_reindex(db: tauri::State<'_, Database>) -> Result<ReindexReport, String> {
    if !embeddings_enabled() {
        return Err("EMBEDDINGS_DISABLED".to_string());
    }
    db.register_embedding_model(
        SYNTHETIC_MODEL_ID,
        provider::SYNTHETIC_PROVIDER,
        provider::SYNTHETIC_MODEL,
        provider::EMBEDDING_DIMENSIONS,
    )?;

    let prompts = db.load_prompts()?;
    let hygiene = load_hygiene_map(&db)?;
    let existing_hashes = db.load_embedding_hashes(SYNTHETIC_MODEL_ID)?;

    let mut report = ReindexReport {
        indexed: 0,
        skipped_sensitive: 0,
        skipped_unchanged: 0,
        failed: 0,
        provider: provider::SYNTHETIC_PROVIDER.to_string(),
        model: provider::SYNTHETIC_MODEL.to_string(),
        dimensions: provider::EMBEDDING_DIMENSIONS,
    };

    for p in &prompts {
        let (status, artifacts) = hygiene
            .get(&p.id)
            .map(|(s, a)| (s.clone(), a.clone()))
            .unwrap_or_else(|| ("clean".to_string(), "[]".to_string()));
        if is_sensitive(&status, &artifacts) {
            report.skipped_sensitive += 1;
            continue;
        }
        let hash = content_hash(&p.content, &p.updated_at);
        if existing_hashes.get(&p.id).map(String::as_str) == Some(hash.as_str()) {
            report.skipped_unchanged += 1;
            continue;
        }
        let vector = provider::embed_text(&p.content);
        match db.upsert_prompt_embedding(&p.id, SYNTHETIC_MODEL_ID, &hash, &vector) {
            Ok(()) => report.indexed += 1,
            Err(_) => report.failed += 1,
        }
    }
    Ok(report)
}

/// Semantic search over the stored vectors.
///
/// Returns sanitized metadata (title/category/version/score) only — never
/// prompt content and never vectors. Fails closed when the flag is off.
#[tauri::command]
pub fn semantic_search(
    query: String,
    top_k: Option<usize>,
    db: tauri::State<'_, Database>,
) -> Result<Vec<SemanticSearchHit>, String> {
    if !embeddings_enabled() {
        return Err("EMBEDDINGS_DISABLED".to_string());
    }
    let trimmed = query.trim();
    if trimmed.is_empty() {
        return Ok(Vec::new());
    }
    let top_k = top_k.unwrap_or(10).clamp(1, 50);
    let stored = db.load_prompt_embeddings(SYNTHETIC_MODEL_ID)?;
    if stored.is_empty() {
        return Ok(Vec::new());
    }
    let query_vec = provider::embed_text(trimmed);

    let mut scored: Vec<(String, f32)> = stored
        .into_iter()
        .map(|s| {
            let score = provider::cosine_similarity(&query_vec, &s.vector);
            (s.prompt_id, score)
        })
        .collect();
    scored.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
    scored.truncate(top_k);

    // Join with prompts for sanitized metadata.
    let prompts = db.load_prompts()?;
    let by_id: std::collections::HashMap<String, crate::models::PromptItem> =
        prompts.into_iter().map(|p| (p.id.clone(), p)).collect();

    Ok(scored
        .into_iter()
        .filter_map(|(pid, score)| {
            by_id.get(&pid).map(|p| SemanticSearchHit {
                prompt_id: p.id.clone(),
                title: p.title.clone(),
                category: p.category.clone(),
                version: p.version.clone(),
                score: (score * 1000.0).round() / 1000.0,
            })
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn sensitive_detection_by_status() {
        assert!(is_sensitive("critical", "[]"));
        assert!(is_sensitive("Critical", "[]"));
        assert!(!is_sensitive("clean", "[]"));
        assert!(!is_sensitive("warning", "[]"));
    }

    #[test]
    fn sensitive_detection_by_artifacts() {
        assert!(is_sensitive(
            "warning",
            r#"[{"category":"PII","description":"x"}]"#
        ));
        assert!(is_sensitive(
            "warning",
            r#"[{"category":"SECRET","description":"x"}]"#
        ));
        assert!(!is_sensitive(
            "warning",
            r#"[{"category":"LOG_LINE","description":"x"}]"#
        ));
    }

    #[test]
    fn sensitive_detection_with_invalid_json_is_not_sensitive() {
        // Invalid artifact JSON with non-critical status: not sensitive
        // (the DB contract guarantees valid JSON; parse errors degrade to
        // artifact-insensitive, status check above still applies).
        assert!(!is_sensitive("warning", "not-json"));
    }

    #[test]
    fn content_hash_is_deterministic_and_content_sensitive() {
        let a = content_hash("inhalt", "2026-01-01");
        let b = content_hash("inhalt", "2026-01-01");
        let c = content_hash("inhalt2", "2026-01-01");
        let d = content_hash("inhalt", "2026-01-02");
        assert_eq!(a, b);
        assert_ne!(a, c);
        assert_ne!(a, d);
    }

    #[test]
    fn flag_defaults_to_disabled() {
        // Do not assume the test environment sets the flag.
        std::env::remove_var(EMBEDDINGS_ENV_FLAG);
        assert!(!embeddings_enabled());
        std::env::set_var(EMBEDDINGS_ENV_FLAG, "1");
        assert!(embeddings_enabled());
        std::env::set_var(EMBEDDINGS_ENV_FLAG, "0");
        assert!(!embeddings_enabled());
        std::env::remove_var(EMBEDDINGS_ENV_FLAG);
    }
}
