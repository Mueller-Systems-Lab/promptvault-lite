use crate::analysis::{hygiene, quality};
use crate::models::{PromptEvaluation, PromptHygiene};
use crate::observability::TraceContext;
use std::time::Instant;

#[tauri::command]
pub fn evaluate_prompt(
    prompt_id: String,
    content: String,
    trace: Option<TraceContext>,
) -> Result<PromptEvaluation, String> {
    let start = Instant::now();
    let mut evaluation = quality::evaluate_prompt(&content, &prompt_id);
    if let Some(ctx) = trace {
        evaluation.backend_span =
            Some(ctx.to_backend_span(Some(start.elapsed().as_secs_f64() * 1000.0)));
    }
    Ok(evaluation)
}

#[tauri::command]
pub fn analyze_hygiene(
    prompt_id: String,
    content: String,
    trace: Option<TraceContext>,
) -> Result<PromptHygiene, String> {
    let start = Instant::now();
    let mut hygiene = hygiene::analyze_hygiene(&content, &prompt_id);
    if let Some(ctx) = trace {
        hygiene.backend_span =
            Some(ctx.to_backend_span(Some(start.elapsed().as_secs_f64() * 1000.0)));
    }
    Ok(hygiene)
}

#[derive(serde::Serialize)]
pub struct AnalysisReport {
    pub evaluations: Vec<PromptEvaluation>,
    pub hygiene: Vec<PromptHygiene>,
    pub total_prompts: usize,
    pub average_score: f64,
}

#[tauri::command]
pub fn analyze_all(prompts: Vec<crate::models::PromptItem>) -> Result<AnalysisReport, String> {
    let total = prompts.len();
    let mut evaluations = Vec::with_capacity(total);
    let mut hygiene = Vec::with_capacity(total);
    let mut total_score: u64 = 0;

    for prompt in &prompts {
        let eval = quality::evaluate_prompt(&prompt.content, &prompt.id);
        if eval.overall_score > 0 {
            total_score += eval.overall_score as u64;
        }
        let hyg = hygiene::analyze_hygiene(&prompt.content, &prompt.id);
        evaluations.push(eval);
        hygiene.push(hyg);
    }

    let average_score = if total > 0 {
        total_score as f64 / total as f64
    } else {
        0.0
    };

    Ok(AnalysisReport {
        evaluations,
        hygiene,
        total_prompts: total,
        average_score,
    })
}
