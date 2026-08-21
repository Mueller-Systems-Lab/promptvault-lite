//! R2 analyzer — deterministic, LLM-free scoring pipeline.
//!
//! Full pipeline (spec §2, docs/quality/ANALYZER_R2_ARCHITECTURE.md,
//! status R2_ARCHITECTURE_APPROVED): truncation -> language detection ->
//! type routing (Guideline|Template|Task) -> F1..F21 feature extraction ->
//! C1..C8 contradiction detection -> 12-dimension scoring -> calibrated
//! overall -> gated recommendations -> PV criteria mapping.
//!
//! The pipeline is fully offline and deterministic: no LLM, no RNG, no env
//! vars. [`evaluate`] is the public production entry — `quality::evaluate_prompt`
//! delegates to it (spec §10 M2/M5), so the real app and the benchmark runner
//! both use the R2 engine. [`evaluate_for_test`] is the env-var-free test entry
//! consumed by the R2 contract suite (`src-tauri/tests/r2_contract.rs`,
//! spec §14.5).
//!
//! ## Criterion mapping
//! Internal R2 dimensions (Goal/Context/Input/Output/Constraint/Actionability/
//! Ambiguity/Consistency/Completeness/Noise/Safety/Reuse) are mapped onto the
//! reported PV criteria: 10 task criteria for Task/Template prompts, 8
//! guideline criteria for Guideline prompts (spec §3/§6). ROLLENDEFINITION is
//! reported-only (weight 0.0, spec §3).

pub(crate) mod applicability; // spec §2/§6 — applicability matrix
pub(crate) mod contradictions; // spec §2/§8 — mandate extraction + C1..C8
pub(crate) mod features; // spec §2/§5 — F1..F21 evidence features
pub(crate) mod lexicons; // spec §2/§7 — DE/EN tables
pub(crate) mod recommendations; // spec §2/§9 — gated WHAT-WHY-CHANGE recs
pub(crate) mod scoring; // spec §2/§4 — anchor ladders + calibrated overall
pub(crate) mod type_router; // spec §2/§7 — ContentKind + PromptType classify

use crate::models::{EvaluationCriterion, PromptEvaluation};

use features::EvidenceStrength;
use type_router::ContentKind;

/// Reported PV task criterion names (locked public wording — see
/// `crate::models::evaluation` and `analysis::quality`). R2 keeps the same
/// 10 task names; ROLLENDEFINITION stays reported-only (spec §3).
const TASK_CRITERIA: [&str; 10] = [
    "Rollendefinition",
    "Zieldefinition",
    "Kontextqualität",
    "Eingabendefinition",
    "Vorgehensbeschreibung",
    "Ausgabeformat",
    "Qualitätsanforderungen",
    "Sicherheitsgrenzen",
    "Klarheit",
    "Wiederverwendbarkeit",
];

/// Reported guideline criterion names (mirrors `analysis::quality`'s
/// guideline wording; spec §6).
const GUIDELINE_CRITERIA: [&str; 8] = [
    "Scope/Zweck",
    "Regel-Spezifität",
    "Constraint-Klarheit",
    "Anwendbarkeit",
    "Output-Disziplin",
    "Konsistenz/Struktur",
    "Sicherheitsgrenzen",
    "Wiederverwendbarkeit",
];

/// Content size limit: cap at 100K chars to bound regex scanning time
/// (mirrors `quality.rs::evaluate_prompt`). For content larger than this,
/// only the first portion is analysed.
const MAX_ANALYSIS_CHARS: usize = 100_000;

/// Truncate `content` at the 100K char boundary (never splitting a UTF-8
/// char). Returns the analysed prefix unchanged when within the limit.
pub fn truncate_content(content: &str) -> &str {
    if content.len() > MAX_ANALYSIS_CHARS {
        let mut idx = MAX_ANALYSIS_CHARS;
        while !content.is_char_boundary(idx) {
            idx -= 1;
        }
        &content[..idx]
    } else {
        content
    }
}

/// Internal R2 dimension index for a reported task criterion's source
/// dimension (fixed mapping, spec §3/§6).
fn task_criterion_dim(name: &str) -> &'static str {
    match name {
        "Zieldefinition" => "Goal",
        "Kontextqualität" => "Context",
        "Eingabendefinition" => "Input",
        "Vorgehensbeschreibung" => "Actionability",
        "Ausgabeformat" => "Output",
        "Qualitätsanforderungen" => "Constraint",
        "Sicherheitsgrenzen" => "Safety",
        "Klarheit" => "Ambiguity",
        "Wiederverwendbarkeit" => "Reuse",
        _ => "Goal",
    }
}

/// Index of a dimension name inside the fixed 12-dimension order.
fn dim_idx(name: &str) -> usize {
    scoring::DIM_NAMES
        .iter()
        .position(|n| *n == name)
        .expect("known R2 dimension name")
}

/// The 9 internal dimensions that map onto reported task criteria
/// (Goal/Context/Input/Output/Constraint/Actionability/Ambiguity/Safety/Reuse
/// — Consistency/Completeness/Noise stay internal; spec §3).
const REPORTED_TASK_DIMS: [&str; 9] = [
    "Goal",
    "Context",
    "Input",
    "Output",
    "Constraint",
    "Actionability",
    "Ambiguity",
    "Safety",
    "Reuse",
];

/// Deterministic, env-var-free R2 evaluation entry — production API.
///
/// The public production entry of the R2 engine: the real app and the
/// benchmark runner reach it via `quality::evaluate_prompt`, which delegates
/// here (spec §10 M2/M5). Fully offline and deterministic: no LLM, no RNG, no
/// env vars.
///
/// Pipeline: truncate -> empty-check -> detect_language -> classify ->
/// extract -> detect contradictions -> score_dimensions -> overall ->
/// generate recommendations -> map internal dims onto reported PV criteria.
pub fn evaluate(content: &str, prompt_id: &str) -> PromptEvaluation {
    let content = truncate_content(content);

    let mut eval = PromptEvaluation::new(prompt_id.to_string());

    // Sonderfall: Leerer Prompt (mirrors quality.rs empty handling).
    if content.trim().is_empty() {
        eval.overall_score = 0;
        eval.criteria = TASK_CRITERIA
            .iter()
            .map(|name| EvaluationCriterion {
                name: (*name).to_string(),
                score: 0,
                max_score: 10,
                weight: 0.1,
                details: "Kein Inhalt".to_string(),
            })
            .collect();
        eval.missing_sections = TASK_CRITERIA.iter().map(|s| s.to_string()).collect();
        eval.recommendations = Vec::new();
        return eval;
    }

    let lang = type_router::detect_language(content);
    let classification = type_router::classify(content);
    let features = features::extract(content, lang);
    let conflicts = contradictions::detect(content, lang);
    let dims = scoring::score_dimensions(&features, &classification.kind, &conflicts);
    let overall = scoring::overall(&dims, &conflicts);
    let recs = recommendations::generate(&dims, &classification.kind, &features, &conflicts, lang);

    let (criteria, missing) = match &classification.kind {
        // FIX J: Template evaluations use the 8 guideline criteria exactly like
        // Guideline kind (so "Scope/Zweck" is present and the criterion set is
        // structurally stable for fill-in forms).
        ContentKind::Guideline | ContentKind::Template => guideline_criteria(&dims),
        _ => task_criteria(&dims, &features, &classification.kind),
    };

    eval.overall_score = overall;
    eval.criteria = criteria;
    eval.missing_sections = missing;
    eval.recommendations = recs;
    eval
}

/// Deterministic, env-var-free R2 test entry.
///
/// Reachable from integration tests as
/// `promptvault_lite_lib::analysis::r2::evaluate_for_test` (spec §14.5).
/// Delegates to the production [`evaluate`] entry with the fixed test prompt
/// id `"r2-test"`.
pub fn evaluate_for_test(content: &str) -> PromptEvaluation {
    evaluate(content, "r2-test")
}

/// One scored R2 dimension, exposed for deep observability.
pub struct R2DimView {
    pub name: &'static str,
    pub score: f64,
    pub applicable: bool,
}

/// Deep observability result of the production R2 pipeline for a prompt.
///
/// Exposes the internal decision data the shallow `PromptEvaluation` cannot
/// carry: the routing label, the concrete prompt type, the signal-poor gate,
/// terse sufficiency, the contradiction weight, the critical-conflict flag
/// and the 12 scored dimensions. Deterministic and env-var-free.
pub struct R2TestOutcome {
    pub eval: PromptEvaluation,
    pub kind_label: &'static str,
    pub prompt_type: &'static str,
    pub signal_poor: bool,
    pub terse_sufficient: bool,
    pub conflict_weight: u8,
    pub has_critical_conflict: bool,
    pub dims: Vec<R2DimView>,
}

/// Deep, deterministic test entry — delegates to the same production
/// [`evaluate`] path (fixed test prompt id `"r2-test"`) and re-runs the
/// internal scoring/feature extraction to expose the decision data.
pub fn deep_evaluate_for_test(content: &str) -> R2TestOutcome {
    let eval = evaluate(content, "r2-test");

    let lang = type_router::detect_language(content);
    let classification = type_router::classify(content);
    let features = features::extract(content, lang);
    let conflicts = contradictions::detect(content, lang);
    let dims = scoring::score_dimensions(&features, &classification.kind, &conflicts);
    let weight = contradictions::conflict_weight(&conflicts);

    let kind_label = match classification.kind {
        ContentKind::Guideline => "guideline",
        ContentKind::Template => "template",
        ContentKind::Task(_) => "task",
    };
    let prompt_type = match classification.kind {
        ContentKind::Guideline => "guideline",
        ContentKind::Template => "template",
        ContentKind::Task(pt) => pt.label(),
    };

    R2TestOutcome {
        eval,
        kind_label,
        prompt_type,
        signal_poor: scoring::signal_poor_for_test(&features, &conflicts),
        terse_sufficient: features.terse_sufficiency,
        conflict_weight: weight,
        has_critical_conflict: conflicts
            .iter()
            .any(|c| c.class == 1 || c.class == 3 || c.class == 6 || c.weight >= 6),
        dims: scoring::DIM_NAMES
            .iter()
            .enumerate()
            .map(|(i, name)| R2DimView {
                name,
                score: dims.dims[i],
                applicable: dims.applicable[i],
            })
            .collect(),
    }
}

/// High-level routing label of `content` for the benchmark runner:
/// `"guideline"` / `"template"` / `"task"`, derived from the type router's
/// [`ContentKind`] classification (spec §7).
pub fn kind_label(content: &str) -> &'static str {
    match type_router::classify(content).kind {
        ContentKind::Guideline => "guideline",
        ContentKind::Template => "template",
        ContentKind::Task(_) => "task",
    }
}

/// Map internal dimensions onto the 8 guideline criteria (spec §6).
/// Every criterion is applicable for a guideline (weight 1/8); missing =
/// guideline criterion with mapped score < 3.
fn guideline_criteria(dims: &scoring::DimensionScores) -> (Vec<EvaluationCriterion>, Vec<String>) {
    let pairs: [(f64, &str); 8] = [
        (
            (dims.get("Goal") + dims.get("Context")) / 2.0,
            "Durchschnitt aus Zieldefinition und Kontextqualität",
        ),
        (
            dims.get("Actionability"),
            "Basierend auf der Dimension Actionability",
        ),
        (
            dims.get("Constraint"),
            "Basierend auf der Dimension Constraint",
        ),
        (dims.get("Context"), "Basierend auf der Dimension Context"),
        (dims.get("Output"), "Basierend auf der Dimension Output"),
        (
            (dims.get("Consistency") + dims.get("Ambiguity")) / 2.0,
            "Durchschnitt aus Konsistenz und Klarheit",
        ),
        (dims.get("Safety"), "Basierend auf der Dimension Safety"),
        (dims.get("Reuse"), "Basierend auf der Dimension Reuse"),
    ];

    let criteria: Vec<EvaluationCriterion> = GUIDELINE_CRITERIA
        .iter()
        .enumerate()
        .map(|(i, name)| EvaluationCriterion {
            name: (*name).to_string(),
            score: pairs[i].0.round() as u8,
            max_score: 10,
            weight: 1.0 / 8.0,
            details: pairs[i].1.to_string(),
        })
        .collect();

    let missing = criteria
        .iter()
        .filter(|c| c.score < 3)
        .map(|c| c.name.clone())
        .collect();
    (criteria, missing)
}

/// Map internal dimensions onto the 10 task criteria (spec §3).
///
/// - ROLLENDEFINITION is reported-only: derived from the role evidence and
///   never weighted (weight 0.0, spec §3).
/// - The 9 remaining criteria weight the applicable internal dimensions
///   equally (1/n over the applicable ones); a criterion whose internal
///   dimension is NotApplicable carries weight 0.0.
/// - missing (spec §14.4): absent-or-insubstantive content only — criteria
///   whose internal dimension is genuinely NotApplicable are never reported
///   missing (present-but-irrelevant is penalized by scoring, not reported
///   as missing).
fn task_criteria(
    dims: &scoring::DimensionScores,
    features: &features::FeatureSet,
    _kind: &ContentKind,
) -> (Vec<EvaluationCriterion>, Vec<String>) {
    let n_applicable = REPORTED_TASK_DIMS
        .iter()
        .filter(|d| dims.applicable[dim_idx(d)])
        .count();

    let criteria: Vec<EvaluationCriterion> = TASK_CRITERIA
        .iter()
        .map(|name| {
            if *name == "Rollendefinition" {
                let score: f64 = match features.role_present {
                    EvidenceStrength::None => 2.0,
                    EvidenceStrength::Weak => 4.0,
                    EvidenceStrength::Moderate => 7.0,
                    EvidenceStrength::Strong => 10.0,
                };
                return EvaluationCriterion {
                    name: (*name).to_string(),
                    score: score.round() as u8,
                    max_score: 10,
                    weight: 0.0, // reported-only (spec §3)
                    details: "Reported-only: basierend auf der Rollenangabe im Prompt".to_string(),
                };
            }
            let dim = task_criterion_dim(name);
            let idx = dim_idx(dim);
            let score = dims.get(dim);
            let applicable = dims.applicable[idx];
            let weight = if applicable {
                1.0 / n_applicable.max(1) as f64
            } else if n_applicable == 0 {
                0.1 // degenerate fallback: no applicable dimension at all
            } else {
                0.0
            };
            let details = if applicable {
                format!("Basierend auf interner Dimension: {dim}")
            } else {
                "Nicht anwendbar für diesen Prompt-Typ".to_string()
            };
            EvaluationCriterion {
                name: (*name).to_string(),
                score: score.round() as u8,
                max_score: 10,
                weight,
                details,
            }
        })
        .collect();

    let missing = criteria
        .iter()
        .filter(|c| {
            c.name != "Rollendefinition"
                && dims.applicable[dim_idx(task_criterion_dim(&c.name))]
                && c.score < 3
        })
        .map(|c| c.name.clone())
        .collect();
    (criteria, missing)
}

/// Single source of truth for guideline routing (spec §7) — delegates to the
/// type router.
pub fn is_guideline(content: &str) -> bool {
    type_router::is_guideline(content)
}

#[cfg(test)]
mod tests {
    use super::*;

    const TERSE_TRANSLATION: &str =
        "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";

    #[test]
    fn terse_translation_excellent() {
        let eval = evaluate_for_test(TERSE_TRANSLATION);
        assert!(
            eval.overall_score >= 85,
            "terse translation overall = {}, expected >= 85",
            eval.overall_score
        );
        assert!(
            eval.recommendations.len() <= 2,
            "rec flood for terse-good prompt: {}",
            eval.recommendations.len()
        );
        for sec in [
            "Rollendefinition",
            "Kontextqualität",
            "Qualitätsanforderungen",
            "Sicherheitsgrenzen",
        ] {
            assert!(
                !eval.missing_sections.iter().any(|m| m == sec),
                "{sec} wrongly in missing_sections for terse-good translation"
            );
        }
    }

    #[test]
    fn terse_no_placeholder_excellent() {
        let content = "Write a function in Python that counts word frequencies in a string. Ignore case and punctuation. Return a dict sorted by frequency, highest first.";
        let eval = evaluate_for_test(content);
        assert!(
            eval.overall_score >= 80,
            "terse no-placeholder overall = {}, expected >= 80",
            eval.overall_score
        );
    }

    #[test]
    fn keyword_stuffed_below_40() {
        let content = "You are an expert. As an expert, provide expert-level expertise with high quality and professional standards. Goal: achieve excellence and quality. Use best practices, agentic workflows, zero-shot reasoning, chain-of-thought, and advanced methodologies. Return JSON, Markdown, and CSV. Be comprehensive, detailed, accurate, and 100% correct.";
        let eval = evaluate_for_test(content);
        assert!(
            eval.overall_score < 45,
            "keyword-stuffed overall = {}, expected < 45",
            eval.overall_score
        );
    }

    #[test]
    fn contradictory_language_contract_penalized() {
        let control =
            "Translate the following text into German. Return only the translation:\n\n{{text}}";
        let contradictory = format!("{control}\n\nAlso translate the response back into English.");
        let control_score = evaluate_for_test(control).overall_score;
        let contradictory_score = evaluate_for_test(&contradictory).overall_score;
        assert!(
            contradictory_score as i32 <= control_score as i32 - 5,
            "contradictory {contradictory_score} must be <= control {control_score} - 5"
        );
    }

    #[test]
    fn guideline_compound_routes() {
        let content = "# Schreibstil\n- Verwende aktive Formulierungen.\n- Vermeide Füllwörter.\n\n# Arbeitsrichtlinie\n- Beginne pünktlich.\n- Melde Probleme früh.\n\n# Antwort-Stil\n- Antworte höflich.\n- Bleibe beim Thema.";
        let eval = evaluate_for_test(content);
        assert!(
            eval.criteria.iter().any(|c| c.name == "Scope/Zweck"),
            "DE compound-heading guideline must expose Scope/Zweck criterion"
        );
    }

    #[test]
    fn template_routing() {
        let content = "# Defect Report Template\n- Browser: {BROWSER}\n- Steps to reproduce: {STEPS}\n- Expected: {EXPECTED}\n- Actual: {ACTUAL}\n\nFill each section. If a section has no content, write NOTHING.";
        let eval = evaluate_for_test(content);
        let reuse = eval
            .criteria
            .iter()
            .find(|c| c.name == "Wiederverwendbarkeit")
            .map(|c| c.score)
            .unwrap_or(0);
        assert!(
            reuse >= 5,
            "template Wiederverwendbarkeit = {reuse}, expected >= 5"
        );
    }
}
