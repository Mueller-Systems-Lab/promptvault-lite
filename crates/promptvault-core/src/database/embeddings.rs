//! Embedding storage layer (Issue #199, ADR-004).
//!
//! New tables alongside the existing schema (no changes to existing tables):
//! - `embedding_models` — registered provider/model identity
//! - `prompt_embeddings` — one vector per (prompt, model), JSON-serialised,
//!   with a content hash for hash-based re-index skipping.
//!
//! Storage-only module: no provider logic, no commands (see
//! `commands/embeddings.rs` and `analysis/embeddings.rs`).

use rusqlite::params;
use std::collections::HashMap;

use crate::database::Database;

/// Registered model row (sanitized metadata only).
#[derive(Debug, Clone, serde::Serialize)]
pub struct EmbeddingModelRow {
    pub id: String,
    pub provider: String,
    pub model_name: String,
    pub dimensions: i64,
}

/// Stored vector with its prompt reference.
#[derive(Debug, Clone)]
pub struct StoredEmbedding {
    pub prompt_id: String,
    pub vector: Vec<f32>,
}

impl Database {
    /// Create the embedding tables if they do not exist (idempotent).
    pub fn ensure_embedding_tables(&self) -> Result<(), String> {
        self.lock_conn()?
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS embedding_models (
                    id TEXT PRIMARY KEY,
                    provider TEXT NOT NULL,
                    model_name TEXT NOT NULL,
                    dimensions INTEGER NOT NULL,
                    created_at TEXT NOT NULL,
                    metadata_json TEXT NOT NULL DEFAULT '{}',
                    UNIQUE(provider, model_name)
                );

                CREATE TABLE IF NOT EXISTS prompt_embeddings (
                    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
                    model_id TEXT NOT NULL REFERENCES embedding_models(id) ON DELETE CASCADE,
                    content_hash TEXT NOT NULL,
                    vector_blob TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (prompt_id, model_id)
                );

                CREATE INDEX IF NOT EXISTS idx_embedding_prompt ON prompt_embeddings(prompt_id);
                CREATE INDEX IF NOT EXISTS idx_embedding_model ON prompt_embeddings(model_id);
                CREATE INDEX IF NOT EXISTS idx_embedding_hash ON prompt_embeddings(content_hash);",
            )
            .map_err(|e| e.to_string())
    }

    /// Register (or re-register) a model identity. Idempotent.
    pub fn register_embedding_model(
        &self,
        id: &str,
        provider: &str,
        model_name: &str,
        dimensions: usize,
    ) -> Result<(), String> {
        self.ensure_embedding_tables()?;
        self.lock_conn()?
            .execute(
                "INSERT INTO embedding_models (id, provider, model_name, dimensions, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(id) DO UPDATE SET
                    provider = excluded.provider,
                    model_name = excluded.model_name,
                    dimensions = excluded.dimensions",
                params![id, provider, model_name, dimensions as i64, iso_now()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Load a registered model by id.
    pub fn load_embedding_model(&self, id: &str) -> Result<Option<EmbeddingModelRow>, String> {
        self.ensure_embedding_tables()?;
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, provider, model_name, dimensions FROM embedding_models WHERE id = ?1",
            )
            .map_err(|e| e.to_string())?;
        let mut rows = stmt.query(params![id]).map_err(|e| e.to_string())?;
        if let Some(row) = rows.next().map_err(|e| e.to_string())? {
            return Ok(Some(EmbeddingModelRow {
                id: row.get(0).map_err(|e| e.to_string())?,
                provider: row.get(1).map_err(|e| e.to_string())?,
                model_name: row.get(2).map_err(|e| e.to_string())?,
                dimensions: row.get(3).map_err(|e| e.to_string())?,
            }));
        }
        Ok(None)
    }

    /// Upsert one prompt embedding (vector serialised as JSON).
    pub fn upsert_prompt_embedding(
        &self,
        prompt_id: &str,
        model_id: &str,
        content_hash: &str,
        vector: &[f32],
    ) -> Result<(), String> {
        self.ensure_embedding_tables()?;
        let vector_json = serde_json::to_string(vector).map_err(|e| e.to_string())?;
        self.lock_conn()?
            .execute(
                "INSERT INTO prompt_embeddings (prompt_id, model_id, content_hash, vector_blob, created_at)
                 VALUES (?1, ?2, ?3, ?4, ?5)
                 ON CONFLICT(prompt_id, model_id) DO UPDATE SET
                    content_hash = excluded.content_hash,
                    vector_blob = excluded.vector_blob,
                    created_at = excluded.created_at",
                params![prompt_id, model_id, content_hash, vector_json, iso_now()],
            )
            .map_err(|e| e.to_string())?;
        Ok(())
    }

    /// Content hashes by prompt_id for a model (hash-based skip on re-index).
    pub fn load_embedding_hashes(&self, model_id: &str) -> Result<HashMap<String, String>, String> {
        self.ensure_embedding_tables()?;
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare("SELECT prompt_id, content_hash FROM prompt_embeddings WHERE model_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![model_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut map = HashMap::new();
        for row in rows {
            let (pid, hash) = row.map_err(|e| e.to_string())?;
            map.insert(pid, hash);
        }
        Ok(map)
    }

    /// All stored vectors for a model (prompt_id + parsed vector).
    pub fn load_prompt_embeddings(&self, model_id: &str) -> Result<Vec<StoredEmbedding>, String> {
        self.ensure_embedding_tables()?;
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare("SELECT prompt_id, vector_blob FROM prompt_embeddings WHERE model_id = ?1")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map(params![model_id], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        for row in rows {
            let (pid, blob) = row.map_err(|e| e.to_string())?;
            let vector: Vec<f32> = serde_json::from_str(&blob).map_err(|e| e.to_string())?;
            out.push(StoredEmbedding {
                prompt_id: pid,
                vector,
            });
        }
        Ok(out)
    }

    /// Number of stored vectors for a model.
    pub fn count_prompt_embeddings(&self, model_id: &str) -> Result<i64, String> {
        self.ensure_embedding_tables()?;
        let conn = self.lock_conn()?;
        conn.query_row(
            "SELECT COUNT(*) FROM prompt_embeddings WHERE model_id = ?1",
            params![model_id],
            |row| row.get(0),
        )
        .map_err(|e| e.to_string())
    }
}

/// UTC timestamp in RFC 3339 format (no chrono dependency needed for a
/// second-precision stamp).
fn iso_now() -> String {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
        .to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::models::PromptItem;

    fn db() -> Database {
        Database::new_in_memory().expect("in-memory db")
    }

    fn prompt(id: &str, content: &str, updated: &str) -> PromptItem {
        PromptItem {
            id: id.to_string(),
            file_path: format!("/t/{id}.md"),
            file_name: format!("{id}.md"),
            title: id.to_string(),
            description: String::new(),
            category: "tasks".to_string(),
            version: "1.0".to_string(),
            tags: vec![],
            content: content.to_string(),
            raw_frontmatter: serde_json::json!({}),
            created_at: "2026-01-01T00:00:00Z".to_string(),
            updated_at: updated.to_string(),
            is_favorite: false,
        }
    }

    const MODEL: &str = "synthetic-feature-hash-v1";

    #[test]
    fn tables_are_created_idempotently() {
        let d = db();
        d.ensure_embedding_tables().unwrap();
        d.ensure_embedding_tables().unwrap();
    }

    #[test]
    fn model_registration_is_idempotent() {
        let d = db();
        d.register_embedding_model(MODEL, "synthetic", "feature-hash-v1", 64)
            .unwrap();
        d.register_embedding_model(MODEL, "synthetic", "feature-hash-v1", 64)
            .unwrap();
        let m = d.load_embedding_model(MODEL).unwrap().unwrap();
        assert_eq!(m.provider, "synthetic");
        assert_eq!(m.dimensions, 64);
    }

    #[test]
    fn load_missing_model_returns_none() {
        let d = db();
        assert!(d.load_embedding_model("nope").unwrap().is_none());
    }

    #[test]
    fn upsert_roundtrip_and_hash_skip() {
        let d = db();
        d.save_prompts(&[prompt("p1", "inhalt", "2026-01-01T00:00:00Z")])
            .unwrap();
        d.register_embedding_model(MODEL, "synthetic", "feature-hash-v1", 64)
            .unwrap();
        d.upsert_prompt_embedding("p1", MODEL, "hash-a", &[0.5, 0.5])
            .unwrap();
        // Upsert (same PK) replaces instead of duplicating
        d.upsert_prompt_embedding("p1", MODEL, "hash-b", &[1.0, 0.0])
            .unwrap();
        assert_eq!(d.count_prompt_embeddings(MODEL).unwrap(), 1);
        let hashes = d.load_embedding_hashes(MODEL).unwrap();
        assert_eq!(hashes.get("p1").map(String::as_str), Some("hash-b"));
        let stored = d.load_prompt_embeddings(MODEL).unwrap();
        assert_eq!(stored.len(), 1);
        assert_eq!(stored[0].vector, vec![1.0, 0.0]);
    }
}
