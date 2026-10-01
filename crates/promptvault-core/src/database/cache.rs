use crate::models::{PromptEvaluation, PromptHygiene, PromptItem};
use std::fs;
use std::path::PathBuf;

// =============================================================================
// JSON-Cache als Fallback für SQLite
// =============================================================================

/// Typ-Alias für den Rückgabetyp von `JsonCache::load()`
pub type CacheData = (Vec<PromptItem>, Vec<PromptEvaluation>, Vec<PromptHygiene>);

const PROMPTS_FILE: &str = "prompts.json";
const EVALUATIONS_FILE: &str = "evaluations.json";
const HYGIENE_FILE: &str = "hygiene.json";

pub struct JsonCache {
    cache_dir: PathBuf,
}

impl JsonCache {
    /// Erstellt einen neuen JSON-Cache im angegebenen Verzeichnis
    pub fn new(cache_dir: PathBuf) -> Self {
        Self { cache_dir }
    }

    /// Stellt sicher, dass das Cache-Verzeichnis existiert
    fn ensure_dir(&self) -> Result<(), String> {
        fs::create_dir_all(&self.cache_dir)
            .map_err(|e| format!("Konnte Cache-Verzeichnis nicht erstellen: {}", e))
    }

    /// Speichert alle Daten als JSON-Dateien
    pub fn save(
        &self,
        prompts: &[PromptItem],
        evaluations: &[PromptEvaluation],
        hygiene: &[PromptHygiene],
    ) -> Result<(), String> {
        self.ensure_dir()?;

        let prompts_json = serde_json::to_string_pretty(prompts)
            .map_err(|e| format!("Serialisierungsfehler prompts: {}", e))?;
        let evals_json = serde_json::to_string_pretty(evaluations)
            .map_err(|e| format!("Serialisierungsfehler evaluations: {}", e))?;
        let hygiene_json = serde_json::to_string_pretty(hygiene)
            .map_err(|e| format!("Serialisierungsfehler hygiene: {}", e))?;

        fs::write(self.cache_dir.join(PROMPTS_FILE), prompts_json)
            .map_err(|e| format!("Schreibfehler: {}", e))?;
        fs::write(self.cache_dir.join(EVALUATIONS_FILE), evals_json)
            .map_err(|e| format!("Schreibfehler: {}", e))?;
        fs::write(self.cache_dir.join(HYGIENE_FILE), hygiene_json)
            .map_err(|e| format!("Schreibfehler: {}", e))?;

        Ok(())
    }

    /// Lädt alle Daten aus den JSON-Dateien
    pub fn load(&self) -> Result<CacheData, String> {
        let prompts = self
            .read_json_file(PROMPTS_FILE)
            .unwrap_or_else(|_| Vec::new());
        let evaluations = self
            .read_json_file(EVALUATIONS_FILE)
            .unwrap_or_else(|_| Vec::new());
        let hygiene = self
            .read_json_file(HYGIENE_FILE)
            .unwrap_or_else(|_| Vec::new());

        Ok((prompts, evaluations, hygiene))
    }

    /// Liest eine JSON-Datei und deserialisiert sie
    fn read_json_file<T: serde::de::DeserializeOwned>(&self, filename: &str) -> Result<T, String> {
        let path = self.cache_dir.join(filename);
        if !path.exists() {
            return Err("Datei nicht gefunden".into());
        }

        let content =
            fs::read_to_string(&path).map_err(|e| format!("Lesefehler {}: {}", filename, e))?;

        serde_json::from_str(&content)
            .map_err(|e| format!("Deserialisierungsfehler {}: {}", filename, e))
    }

    /// Löscht alle Cache-Dateien
    pub fn clear(&self) -> Result<(), String> {
        for file in &[PROMPTS_FILE, EVALUATIONS_FILE, HYGIENE_FILE] {
            let path = self.cache_dir.join(file);
            if path.exists() {
                fs::remove_file(&path).map_err(|e| format!("Löschfehler {}: {}", file, e))?;
            }
        }
        Ok(())
    }

    /// Prüft ob Cache-Dateien existieren
    pub fn exists(&self) -> bool {
        self.cache_dir.join(PROMPTS_FILE).exists()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    fn create_test_data() -> (Vec<PromptItem>, Vec<PromptEvaluation>, Vec<PromptHygiene>) {
        let prompt = PromptItem {
            id: "test-1".to_string(),
            file_path: "/test/prompt.md".to_string(),
            file_name: "prompt.md".to_string(),
            title: "Test Prompt".to_string(),
            description: "A test".to_string(),
            category: "testing".to_string(),
            version: "1.0".to_string(),
            tags: vec!["test".to_string()],
            content: "# Test".to_string(),
            raw_frontmatter: serde_json::json!({"title": "Test"}),
            created_at: "2026-06-03T00:00:00Z".to_string(),
            updated_at: "2026-06-03T00:00:00Z".to_string(),
            is_favorite: false,
        };

        let evaluation = PromptEvaluation {
            id: "eval-1".to_string(),
            prompt_id: "test-1".to_string(),
            overall_score: 75,
            criteria: vec![],
            missing_sections: vec![],
            recommendations: vec![],
            evaluated_at: "2026-06-03T00:00:00Z".to_string(),
            backend_span: None,
        };

        let hygiene = PromptHygiene {
            id: "hyg-1".to_string(),
            prompt_id: "test-1".to_string(),
            hygiene_score: 100,
            status: crate::models::HygieneStatus::Clean,
            artifacts: vec![],
            analyzed_at: "2026-06-03T00:00:00Z".to_string(),
            backend_span: None,
        };

        (vec![prompt], vec![evaluation], vec![hygiene])
    }

    #[test]
    fn test_save_and_load() {
        let dir = TempDir::new().unwrap();
        let cache = JsonCache::new(dir.path().to_path_buf());
        let (prompts, evaluations, hygiene) = create_test_data();

        cache.save(&prompts, &evaluations, &hygiene).unwrap();
        let (loaded_prompts, loaded_evals, loaded_hygiene) = cache.load().unwrap();

        assert_eq!(loaded_prompts.len(), 1);
        assert_eq!(loaded_prompts[0].title, "Test Prompt");
        assert_eq!(loaded_evals.len(), 1);
        assert_eq!(loaded_hygiene.len(), 1);
    }

    #[test]
    fn test_cache_clear() {
        let dir = TempDir::new().unwrap();
        let cache = JsonCache::new(dir.path().to_path_buf());
        let (prompts, evaluations, hygiene) = create_test_data();

        cache.save(&prompts, &evaluations, &hygiene).unwrap();
        assert!(cache.exists());

        cache.clear().unwrap();
        assert!(!cache.exists());
    }

    #[test]
    fn test_load_empty_cache() {
        let dir = TempDir::new().unwrap();
        let cache = JsonCache::new(dir.path().to_path_buf());
        let result = cache.load();
        assert!(result.is_ok());
        let (p, e, h) = result.unwrap();
        assert!(p.is_empty());
        assert!(e.is_empty());
        assert!(h.is_empty());
    }
}
