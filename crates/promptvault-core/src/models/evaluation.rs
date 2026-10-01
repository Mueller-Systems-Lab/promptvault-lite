use serde::{Deserialize, Serialize};

use crate::observability::BackendSpan;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PromptEvaluation {
    pub id: String,
    pub prompt_id: String,
    pub overall_score: u8,
    pub criteria: Vec<EvaluationCriterion>,
    pub missing_sections: Vec<String>,
    pub recommendations: Vec<String>,
    pub evaluated_at: String,
    /// Optional backend-origin trace span. Only present when the caller
    /// passed a TraceContext into the command. The frontend MUST NOT treat
    /// the absence/presence of this field as a product result difference.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub backend_span: Option<BackendSpan>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EvaluationCriterion {
    pub name: String,
    pub score: u8,
    pub max_score: u8,
    pub weight: f64,
    pub details: String,
}

impl PromptEvaluation {
    pub fn new(prompt_id: String) -> Self {
        Self {
            id: uuid::Uuid::new_v4().to_string(),
            prompt_id,
            overall_score: 0,
            criteria: Vec::new(),
            missing_sections: Vec::new(),
            recommendations: Vec::new(),
            evaluated_at: chrono::Utc::now().to_rfc3339(),
            backend_span: None,
        }
    }
}

impl Default for EvaluationCriterion {
    fn default() -> Self {
        Self {
            name: String::new(),
            score: 0,
            max_score: 10,
            weight: 0.1,
            details: String::new(),
        }
    }
}
