use crate::models::{
    DetectedArtifact, EvaluationCriterion, PromptEvaluation, PromptHygiene, PromptItem,
};
use rusqlite::{params, Connection, Result as SqlResult};
use std::path::Path;
use std::sync::Mutex;

// =============================================================================
// SQLite-Datenbank für PromptVault Lite
// =============================================================================

pub struct Database {
    conn: Mutex<Connection>,
}

impl Database {
    /// Hilfsfunktion: Lockt die Connection für lesende/schreibende Zugriffe.
    fn lock_conn(&self) -> Result<std::sync::MutexGuard<'_, Connection>, String> {
        self.conn
            .lock()
            .map_err(|e| format!("Datenbank-Lock-Fehler: {}", e))
    }

    /// Öffnet oder erstellt die SQLite-Datenbank
    pub fn new(db_path: &str) -> Result<Self, String> {
        let conn = Connection::open(Path::new(db_path))
            .map_err(|e| format!("Konnte Datenbank nicht öffnen: {}", e))?;

        // Performance-Optimierungen
        conn.execute_batch(
            "PRAGMA journal_mode=WAL;
             PRAGMA foreign_keys=ON;
             PRAGMA busy_timeout=5000;",
        )
        .map_err(|e| format!("PRAGMA Fehler: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;

        Ok(db)
    }

    /// In-Memory-Datenbank für Tests
    pub fn new_in_memory() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Konnte In-Memory DB nicht öffnen: {}", e))?;

        let db = Self {
            conn: Mutex::new(conn),
        };
        db.run_migrations()?;

        Ok(db)
    }

    // --- Migrationen ---

    fn run_migrations(&self) -> Result<(), String> {
        self.lock_conn()?
            .execute_batch(
                "CREATE TABLE IF NOT EXISTS prompts (
                    id TEXT PRIMARY KEY,
                    file_path TEXT NOT NULL UNIQUE,
                    file_name TEXT NOT NULL,
                    title TEXT NOT NULL,
                    description TEXT NOT NULL DEFAULT '',
                    category TEXT NOT NULL DEFAULT 'Uncategorized',
                    version TEXT NOT NULL DEFAULT '1.0',
                    tags TEXT NOT NULL DEFAULT '[]',
                    content TEXT NOT NULL DEFAULT '',
                    raw_frontmatter TEXT NOT NULL DEFAULT '{}',
                    created_at TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    is_favorite INTEGER NOT NULL DEFAULT 0
                );

                CREATE TABLE IF NOT EXISTS evaluations (
                    id TEXT PRIMARY KEY,
                    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
                    overall_score INTEGER NOT NULL DEFAULT 0,
                    criteria TEXT NOT NULL DEFAULT '[]',
                    missing_sections TEXT NOT NULL DEFAULT '[]',
                    recommendations TEXT NOT NULL DEFAULT '[]',
                    evaluated_at TEXT NOT NULL
                );

                CREATE TABLE IF NOT EXISTS hygiene (
                    id TEXT PRIMARY KEY,
                    prompt_id TEXT NOT NULL REFERENCES prompts(id) ON DELETE CASCADE,
                    hygiene_score INTEGER NOT NULL DEFAULT 100,
                    status TEXT NOT NULL DEFAULT 'clean',
                    artifacts TEXT NOT NULL DEFAULT '[]',
                    analyzed_at TEXT NOT NULL
                );

                CREATE INDEX IF NOT EXISTS idx_prompts_file_path ON prompts(file_path);
                CREATE INDEX IF NOT EXISTS idx_prompts_category ON prompts(category);
                CREATE INDEX IF NOT EXISTS idx_prompts_favorite ON prompts(is_favorite);
                CREATE INDEX IF NOT EXISTS idx_evaluations_prompt ON evaluations(prompt_id);
                CREATE INDEX IF NOT EXISTS idx_hygiene_prompt ON hygiene(prompt_id);

                -- Full-Text Search
                CREATE VIRTUAL TABLE IF NOT EXISTS prompts_fts USING fts5(
                    title,
                    description,
                    category,
                    tags,
                    content,
                    content='prompts',
                    content_rowid='rowid'
                );

                -- Trigger für FTS-Sync
                CREATE TRIGGER IF NOT EXISTS prompts_ai AFTER INSERT ON prompts BEGIN
                    INSERT INTO prompts_fts(rowid, title, description, category, tags, content)
                    VALUES (new.rowid, new.title, new.description, new.category, new.tags, new.content);
                END;

                CREATE TRIGGER IF NOT EXISTS prompts_ad AFTER DELETE ON prompts BEGIN
                    INSERT INTO prompts_fts(prompts_fts, rowid, title, description, category, tags, content)
                    VALUES ('delete', old.rowid, old.title, old.description, old.category, old.tags, old.content);
                END;

                CREATE TRIGGER IF NOT EXISTS prompts_au AFTER UPDATE ON prompts BEGIN
                    INSERT INTO prompts_fts(prompts_fts, rowid, title, description, category, tags, content)
                    VALUES ('delete', old.rowid, old.title, old.description, old.category, old.tags, old.content);
                    INSERT INTO prompts_fts(rowid, title, description, category, tags, content)
                    VALUES (new.rowid, new.title, new.description, new.category, new.tags, new.content);
                END;",
            )
            .map_err(|e| format!("Migrationsfehler: {}", e))?;

        Ok(())
    }

    // --- Prompts ---

    /// Speichert eine Liste von Prompts (ersetzt existierende mit gleichem file_path)
    pub fn save_prompts(&self, prompts: &[PromptItem]) -> Result<(), String> {
        let conn = self.lock_conn()?;
        let tx = conn
            .unchecked_transaction()
            .map_err(|e| format!("Transaction error: {}", e))?;

        for prompt in prompts {
            let tags_json =
                serde_json::to_string(&prompt.tags).unwrap_or_else(|_| "[]".to_string());
            let frontmatter_json =
                serde_json::to_string(&prompt.raw_frontmatter).unwrap_or_else(|_| "{}".to_string());

            tx.execute(
                "INSERT INTO prompts (id, file_path, file_name, title, description, category, version, tags, content, raw_frontmatter, created_at, updated_at, is_favorite)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
                 ON CONFLICT(file_path) DO UPDATE SET
                    file_name = excluded.file_name,
                    title = excluded.title,
                    description = excluded.description,
                    category = excluded.category,
                    version = excluded.version,
                    tags = excluded.tags,
                    content = excluded.content,
                    raw_frontmatter = excluded.raw_frontmatter,
                    updated_at = excluded.updated_at,
                    is_favorite = COALESCE((SELECT is_favorite FROM prompts WHERE file_path = excluded.file_path), excluded.is_favorite)",
                params![
                    prompt.id,
                    prompt.file_path,
                    prompt.file_name,
                    prompt.title,
                    prompt.description,
                    prompt.category,
                    prompt.version,
                    tags_json,
                    prompt.content,
                    frontmatter_json,
                    prompt.created_at,
                    prompt.updated_at,
                    prompt.is_favorite as i32,
                ],
            )
            .map_err(|e| format!("Fehler beim Speichern von {}: {}", prompt.file_name, e))?;
        }

        tx.commit().map_err(|e| format!("Commit error: {}", e))?;

        Ok(())
    }

    /// Lädt alle Prompts aus der Datenbank
    pub fn load_prompts(&self) -> Result<Vec<PromptItem>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, file_path, file_name, title, description, category, version, tags, content, raw_frontmatter, created_at, updated_at, is_favorite
                 FROM prompts
                 ORDER BY file_path",
            )
            .map_err(|e| format!("Query error: {}", e))?;

        let prompts = stmt
            .query_map([], |row| {
                let tags_str: String = row.get(7)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();

                let fm_str: String = row.get(9)?;
                let raw_frontmatter: serde_json::Value =
                    serde_json::from_str(&fm_str).unwrap_or_default();

                Ok(PromptItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_name: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    category: row.get(5)?,
                    version: row.get(6)?,
                    tags,
                    content: row.get(8)?,
                    raw_frontmatter,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    is_favorite: row.get::<_, i32>(12)? != 0,
                })
            })
            .map_err(|e| format!("Query mapping error: {}", e))?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| format!("Fehler beim Laden: {}", e))?;

        Ok(prompts)
    }

    /// Lädt einen einzelnen Prompt anhand der ID
    pub fn get_prompt(&self, id: &str) -> Result<Option<PromptItem>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, file_path, file_name, title, description, category, version, tags, content, raw_frontmatter, created_at, updated_at, is_favorite
                 FROM prompts WHERE id = ?1",
            )
            .map_err(|e| format!("Query error: {}", e))?;

        let mut rows = stmt
            .query_map(params![id], |row| {
                let tags_str: String = row.get(7)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                let fm_str: String = row.get(9)?;
                let raw_frontmatter: serde_json::Value =
                    serde_json::from_str(&fm_str).unwrap_or_default();

                Ok(PromptItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_name: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    category: row.get(5)?,
                    version: row.get(6)?,
                    tags,
                    content: row.get(8)?,
                    raw_frontmatter,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    is_favorite: row.get::<_, i32>(12)? != 0,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;

        match rows.next() {
            Some(Ok(prompt)) => Ok(Some(prompt)),
            Some(Err(e)) => Err(format!("Fehler beim Lesen: {}", e)),
            None => Ok(None),
        }
    }

    /// Setzt den Favoriten-Status eines Prompts
    pub fn set_favorite(&self, prompt_id: &str, is_favorite: bool) -> Result<(), String> {
        self.lock_conn()?
            .execute(
                "UPDATE prompts SET is_favorite = ?1 WHERE id = ?2",
                params![is_favorite as i32, prompt_id],
            )
            .map_err(|e| format!("Fehler beim Setzen des Favoriten: {}", e))?;
        Ok(())
    }

    /// Löscht alle Prompts (für Re-Scan)
    pub fn clear_prompts(&self) -> Result<(), String> {
        self.lock_conn()?
            .execute_batch(
                "DELETE FROM hygiene;
                 DELETE FROM evaluations;
                 DELETE FROM prompts;",
            )
            .map_err(|e| format!("Fehler beim Löschen: {}", e))?;
        Ok(())
    }

    // --- Evaluations ---

    pub fn save_evaluation(&self, evaluation: &PromptEvaluation) -> Result<(), String> {
        let criteria_json =
            serde_json::to_string(&evaluation.criteria).unwrap_or_else(|_| "[]".to_string());
        let missing_json = serde_json::to_string(&evaluation.missing_sections)
            .unwrap_or_else(|_| "[]".to_string());
        let recs_json =
            serde_json::to_string(&evaluation.recommendations).unwrap_or_else(|_| "[]".to_string());

        self.lock_conn()?
            .execute(
                "INSERT OR REPLACE INTO evaluations (id, prompt_id, overall_score, criteria, missing_sections, recommendations, evaluated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    evaluation.id,
                    evaluation.prompt_id,
                    evaluation.overall_score,
                    criteria_json,
                    missing_json,
                    recs_json,
                    evaluation.evaluated_at,
                ],
            )
            .map_err(|e| format!("Fehler beim Speichern der Evaluation: {}", e))?;
        Ok(())
    }

    pub fn load_evaluation(&self, prompt_id: &str) -> Result<Option<PromptEvaluation>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, prompt_id, overall_score, criteria, missing_sections, recommendations, evaluated_at
                 FROM evaluations WHERE prompt_id = ?1",
            )
            .map_err(|e| format!("Query error: {}", e))?;

        let mut rows = stmt
            .query_map(params![prompt_id], |row| {
                let criteria_str: String = row.get(3)?;
                let criteria: Vec<EvaluationCriterion> =
                    serde_json::from_str(&criteria_str).unwrap_or_default();
                let missing_str: String = row.get(4)?;
                let missing_sections: Vec<String> =
                    serde_json::from_str(&missing_str).unwrap_or_default();
                let recs_str: String = row.get(5)?;
                let recommendations: Vec<String> =
                    serde_json::from_str(&recs_str).unwrap_or_default();

                Ok(PromptEvaluation {
                    id: row.get(0)?,
                    prompt_id: row.get(1)?,
                    overall_score: row.get(2)?,
                    criteria,
                    missing_sections,
                    recommendations,
                    evaluated_at: row.get(6)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;

        match rows.next() {
            Some(Ok(eval)) => Ok(Some(eval)),
            Some(Err(e)) => Err(format!("Fehler: {}", e)),
            None => Ok(None),
        }
    }

    // --- Hygiene ---

    pub fn save_hygiene(&self, hygiene: &PromptHygiene) -> Result<(), String> {
        let artifacts_json =
            serde_json::to_string(&hygiene.artifacts).unwrap_or_else(|_| "[]".to_string());

        self.lock_conn()?
            .execute(
                "INSERT OR REPLACE INTO hygiene (id, prompt_id, hygiene_score, status, artifacts, analyzed_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    hygiene.id,
                    hygiene.prompt_id,
                    hygiene.hygiene_score,
                    hygiene.status.to_string(),
                    artifacts_json,
                    hygiene.analyzed_at,
                ],
            )
            .map_err(|e| format!("Fehler beim Speichern der Hygiene: {}", e))?;
        Ok(())
    }

    pub fn load_hygiene(&self, prompt_id: &str) -> Result<Option<PromptHygiene>, String> {
        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT id, prompt_id, hygiene_score, status, artifacts, analyzed_at
                 FROM hygiene WHERE prompt_id = ?1",
            )
            .map_err(|e| format!("Query error: {}", e))?;

        let mut rows = stmt
            .query_map(params![prompt_id], |row| {
                let artifacts_str: String = row.get(4)?;
                let artifacts: Vec<DetectedArtifact> =
                    serde_json::from_str(&artifacts_str).unwrap_or_default();
                let status_str: String = row.get(3)?;

                let status = match status_str.as_str() {
                    "clean" => crate::models::HygieneStatus::Clean,
                    "warning" => crate::models::HygieneStatus::Warning,
                    "critical" => crate::models::HygieneStatus::Critical,
                    _ => crate::models::HygieneStatus::Clean,
                };

                Ok(PromptHygiene {
                    id: row.get(0)?,
                    prompt_id: row.get(1)?,
                    hygiene_score: row.get(2)?,
                    status,
                    artifacts,
                    analyzed_at: row.get(5)?,
                })
            })
            .map_err(|e| format!("Query error: {}", e))?;

        match rows.next() {
            Some(Ok(h)) => Ok(Some(h)),
            Some(Err(e)) => Err(format!("Fehler: {}", e)),
            None => Ok(None),
        }
    }

    // --- Suche ---

    /// Volltextsuche mit FTS5
    pub fn search_prompts(&self, query: &str) -> Result<Vec<PromptItem>, String> {
        if query.trim().is_empty() {
            return self.load_prompts();
        }

        // FTS5-Such-Query (präfix-basierte Suche)
        let fts_query = query
            .split_whitespace()
            .map(|w| format!("{}*", w))
            .collect::<Vec<_>>()
            .join(" ");

        let conn = self.lock_conn()?;
        let mut stmt = conn
            .prepare(
                "SELECT p.id, p.file_path, p.file_name, p.title, p.description, p.category,
                        p.version, p.tags, p.content, p.raw_frontmatter, p.created_at,
                        p.updated_at, p.is_favorite
                 FROM prompts p
                 INNER JOIN prompts_fts fts ON p.rowid = fts.rowid
                 WHERE prompts_fts MATCH ?1
                 ORDER BY rank
                 LIMIT 500",
            )
            .map_err(|e| format!("Search error: {}", e))?;

        let prompts = stmt
            .query_map(params![fts_query], |row| {
                let tags_str: String = row.get(7)?;
                let tags: Vec<String> = serde_json::from_str(&tags_str).unwrap_or_default();
                let fm_str: String = row.get(9)?;
                let raw_frontmatter: serde_json::Value =
                    serde_json::from_str(&fm_str).unwrap_or_default();

                Ok(PromptItem {
                    id: row.get(0)?,
                    file_path: row.get(1)?,
                    file_name: row.get(2)?,
                    title: row.get(3)?,
                    description: row.get(4)?,
                    category: row.get(5)?,
                    version: row.get(6)?,
                    tags,
                    content: row.get(8)?,
                    raw_frontmatter,
                    created_at: row.get(10)?,
                    updated_at: row.get(11)?,
                    is_favorite: row.get::<_, i32>(12)? != 0,
                })
            })
            .map_err(|e| format!("Search mapping error: {}", e))?
            .collect::<SqlResult<Vec<_>>>()
            .map_err(|e| format!("Fehler bei Suche: {}", e))?;

        Ok(prompts)
    }
}

// =============================================================================
// Unit Tests
// =============================================================================

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_prompt(id: &str, title: &str, category: &str) -> PromptItem {
        PromptItem {
            id: id.to_string(),
            file_path: format!("/test/{}.md", id),
            file_name: format!("{}.md", id),
            title: title.to_string(),
            description: format!("Description for {}", title),
            category: category.to_string(),
            version: "1.0".to_string(),
            tags: vec!["test".to_string()],
            content: format!("# {}\n\nContent for {}", title, title),
            raw_frontmatter: serde_json::json!({"title": title}),
            created_at: "2026-06-03T00:00:00Z".to_string(),
            updated_at: "2026-06-03T00:00:00Z".to_string(),
            is_favorite: false,
        }
    }

    #[test]
    fn test_create_database() {
        let db = Database::new_in_memory();
        assert!(db.is_ok());
    }

    #[test]
    fn test_save_and_load_prompts() {
        let db = Database::new_in_memory().unwrap();
        let prompts = vec![
            create_test_prompt("1", "Test Prompt 1", "coding"),
            create_test_prompt("2", "Test Prompt 2", "research"),
        ];

        db.save_prompts(&prompts).unwrap();
        let loaded = db.load_prompts().unwrap();

        assert_eq!(loaded.len(), 2);
        assert_eq!(loaded[0].title, "Test Prompt 1");
        assert_eq!(loaded[1].category, "research");
    }

    #[test]
    fn test_save_updates_existing() {
        let db = Database::new_in_memory().unwrap();
        let mut prompt = create_test_prompt("1", "Original", "coding");
        db.save_prompts(&[prompt.clone()]).unwrap();

        // Update
        prompt.title = "Updated".to_string();
        db.save_prompts(&[prompt]).unwrap();

        let loaded = db.load_prompts().unwrap();
        assert_eq!(loaded.len(), 1);
        assert_eq!(loaded[0].title, "Updated");
    }

    #[test]
    fn test_get_prompt_by_id() {
        let db = Database::new_in_memory().unwrap();
        let prompt = create_test_prompt("abc", "My Prompt", "coding");
        db.save_prompts(&[prompt]).unwrap();

        let found = db.get_prompt("abc").unwrap();
        assert!(found.is_some());
        assert_eq!(found.unwrap().title, "My Prompt");

        // Nicht vorhandener Prompt → None
        let missing = db.get_prompt("nope").unwrap();
        assert!(missing.is_none());
    }

    /// Regression: gescannte Prompts müssen in der DB liegen, damit
    /// toggle_favorite (E19-Native-Reise) nicht mit "Prompt not found" fehlschlägt.
    #[test]
    fn test_scanned_prompts_support_favorites() {
        let db = Database::new_in_memory().unwrap();
        let prompt = create_test_prompt("scan-1", "Scanned Prompt", "general");
        db.save_prompts(&[prompt]).unwrap();

        // toggle_favorite_impl äquivalent: get + set_favorite
        let loaded = db
            .get_prompt("scan-1")
            .unwrap()
            .expect("Prompt muss in DB sein");
        db.set_favorite(&loaded.id, true).unwrap();

        let favs: Vec<String> = db
            .load_prompts()
            .unwrap()
            .into_iter()
            .filter(|p| p.is_favorite)
            .map(|p| p.id)
            .collect();
        assert_eq!(favs, vec!["scan-1".to_string()]);
    }

    #[test]
    fn test_get_nonexistent_prompt() {
        let db = Database::new_in_memory().unwrap();
        let found = db.get_prompt("nonexistent").unwrap();
        assert!(found.is_none());
    }

    #[test]
    fn test_favorites() {
        let db = Database::new_in_memory().unwrap();
        let prompt = create_test_prompt("1", "Favorite", "coding");
        db.save_prompts(&[prompt]).unwrap();

        db.set_favorite("1", true).unwrap();
        let loaded = db.get_prompt("1").unwrap().unwrap();
        assert!(loaded.is_favorite);

        db.set_favorite("1", false).unwrap();
        let loaded = db.get_prompt("1").unwrap().unwrap();
        assert!(!loaded.is_favorite);
    }

    #[test]
    fn test_save_and_load_evaluation() {
        let db = Database::new_in_memory().unwrap();
        let prompt = create_test_prompt("1", "Test", "coding");
        db.save_prompts(&[prompt]).unwrap();

        let eval = PromptEvaluation {
            id: "eval-1".to_string(),
            prompt_id: "1".to_string(),
            overall_score: 85,
            criteria: vec![EvaluationCriterion {
                name: "Klarheit".to_string(),
                score: 8,
                max_score: 10,
                weight: 0.5,
                details: "Good".to_string(),
            }],
            missing_sections: vec![],
            recommendations: vec!["Add more context".to_string()],
            evaluated_at: "2026-06-03T00:00:00Z".to_string(),
        };

        db.save_evaluation(&eval).unwrap();
        let loaded = db.load_evaluation("1").unwrap().unwrap();

        assert_eq!(loaded.overall_score, 85);
        assert_eq!(loaded.recommendations.len(), 1);
    }

    #[test]
    fn test_save_and_load_hygiene() {
        let db = Database::new_in_memory().unwrap();
        let prompt = create_test_prompt("1", "Test", "coding");
        db.save_prompts(&[prompt]).unwrap();

        let hygiene = PromptHygiene {
            id: "hyg-1".to_string(),
            prompt_id: "1".to_string(),
            hygiene_score: 90,
            status: crate::models::HygieneStatus::Clean,
            artifacts: vec![],
            analyzed_at: "2026-06-03T00:00:00Z".to_string(),
        };

        db.save_hygiene(&hygiene).unwrap();
        let loaded = db.load_hygiene("1").unwrap().unwrap();

        assert_eq!(loaded.hygiene_score, 90);
        assert_eq!(loaded.status, crate::models::HygieneStatus::Clean);
    }

    #[test]
    fn test_search_prompts() {
        let db = Database::new_in_memory().unwrap();
        let prompts = vec![
            create_test_prompt("1", "Rust Programming Guide", "coding"),
            create_test_prompt("2", "Python Data Science", "research"),
            create_test_prompt("3", "Rust Web Server", "coding"),
        ];
        db.save_prompts(&prompts).unwrap();

        let results = db.search_prompts("Rust").unwrap();
        assert_eq!(results.len(), 2);
    }

    #[test]
    fn test_clear_prompts() {
        let db = Database::new_in_memory().unwrap();
        let prompts = vec![create_test_prompt("1", "Test", "coding")];
        db.save_prompts(&prompts).unwrap();

        db.clear_prompts().unwrap();
        let loaded = db.load_prompts().unwrap();
        assert_eq!(loaded.len(), 0);
    }
}
