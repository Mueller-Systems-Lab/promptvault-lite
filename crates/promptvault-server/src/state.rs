//! Application state (issue #110 / D1) — configuration, SQLite favorites /
//! persistence database and the prompt cache filled by `POST /api/scan`.

use std::path::PathBuf;
use std::sync::{Arc, Mutex};

use promptvault_core::database::Database;
use promptvault_core::models::PromptItem;

use crate::config::ServerConfig;

#[derive(Clone)]
pub struct AppState {
    pub config: ServerConfig,
    pub db: Arc<Mutex<Database>>,
    /// Cache of the last scanned vault (filled by POST /api/scan).
    pub prompts: Arc<Mutex<Vec<PromptItem>>>,
}

impl AppState {
    /// Default SQLite location: `$HOME/.local/share/promptvault-server/`
    /// (fallback: system temp dir when HOME is unset). The database NEVER
    /// lives inside the vault — a read-only NAS mount must not receive writes.
    pub fn default_db_path() -> PathBuf {
        let base = std::env::var("HOME")
            .map(|h| PathBuf::from(h).join(".local/share/promptvault-server"))
            .unwrap_or_else(|_| std::env::temp_dir().join("promptvault-server"));
        std::fs::create_dir_all(&base).ok();
        base.join("promptvault.db")
    }

    pub fn new(config: ServerConfig, db: Database) -> Self {
        Self {
            config,
            db: Arc::new(Mutex::new(db)),
            prompts: Arc::new(Mutex::new(Vec::new())),
        }
    }
}
