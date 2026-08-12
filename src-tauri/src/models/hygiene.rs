use serde::{Deserialize, Serialize};

use super::artifact::DetectedArtifact;
use crate::observability::BackendSpan;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum HygieneStatus {
    Clean,
    Warning,
    Critical,
}

impl std::fmt::Display for HygieneStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Clean => write!(f, "clean"),
            Self::Warning => write!(f, "warning"),
            Self::Critical => write!(f, "critical"),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptHygiene {
    pub id: String,
    pub prompt_id: String,
    pub hygiene_score: u8,
    pub status: HygieneStatus,
    pub artifacts: Vec<DetectedArtifact>,
    pub analyzed_at: String,
    /// Optional backend-origin trace span (see PromptEvaluation).
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend_span: Option<BackendSpan>,
}

impl PromptHygiene {
    pub fn new(prompt_id: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            prompt_id,
            hygiene_score: 100,
            status: HygieneStatus::Clean,
            artifacts: Vec::new(),
            analyzed_at: chrono::Utc::now().to_rfc3339(),
            backend_span: None,
        }
    }

    pub fn determine_status(score: u8) -> HygieneStatus {
        match score {
            80..=100 => HygieneStatus::Clean,
            50..=79 => HygieneStatus::Warning,
            _ => HygieneStatus::Critical,
        }
    }
}
