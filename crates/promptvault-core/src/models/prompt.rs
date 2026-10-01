use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptItem {
    pub id: String,
    pub file_path: String,
    pub file_name: String,
    pub title: String,
    pub description: String,
    pub category: String,
    pub version: String,
    pub tags: Vec<String>,
    pub content: String,
    pub raw_frontmatter: serde_json::Value,
    pub created_at: String,
    pub updated_at: String,
    pub is_favorite: bool,
}
