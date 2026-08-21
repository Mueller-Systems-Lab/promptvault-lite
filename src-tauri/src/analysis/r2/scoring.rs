//! R2 scoring (spec §4/§5) — anchor ladders, 12-dim equal-weight mean.

#![allow(dead_code)] // wired in a later capsule

use super::applicability::{self, Applicability};
use super::contradictions::{conflict_weight, Conflict};
use super::features::{EvidenceStrength, FeatureSet};
use super::type_router::ContentKind;

pub const DIM_GOAL: usize = 0;
pub const DIM_CONTEXT: usize = 1;
pub const DIM_INPUT: usize = 2;
pub const DIM_OUTPUT: usize = 3;
pub const DIM_CONSTRAINT: usize = 4;
pub const DIM_ACTION: usize = 5;
pub const DIM_AMBIGUITY: usize = 6;
pub const DIM_CONSISTENCY: usize = 7;
pub const DIM_COMPLETENESS: usize = 8;
pub const DIM_NOISE: usize = 9;
pub const DIM_SAFETY: usize = 10;
pub const DIM_REUSE: usize = 11;
pub const DIM_NAMES: [&str; 12] = [
    "Goal",
    "Context",
    "Input",
    "Output",
    "Constraint",
    "Actionability",
    "Ambiguity",
    "Consistency",
    "Completeness",
    "Noise",
    "Safety",
    "Reuse",
];

pub struct DimensionScores {
    pub dims: [f64; 12],
    pub applicable: [bool; 12],
    pub na_reasons: [Option<String>; 12],
}
impl DimensionScores {
    pub fn get(&self, name: &str) -> f64 {
        for (i, n) in DIM_NAMES.iter().enumerate() {
            if *n == name {
                return self.dims[i];
            }
        }
        0.0
    }
}

pub struct CriterionEvidence {
    pub applicability: Applicability,
    pub positive_signals: Vec<String>,
    pub negative_signals: Vec<String>,
    pub evidence_strength: EvidenceStrength,
    pub confidence: f64,
    pub raw_score: f64,
    pub final_score: f64,
    pub details: String,
}

pub fn score_dimensions(
    features: &FeatureSet,
    kind: &ContentKind,
    conflicts: &[Conflict],
) -> DimensionScores {
    let mut dims = [0.0f64; 12];
    let mut applicable = [false; 12];
    let mut na_reasons: [Option<String>; 12] = std::array::from_fn(|_| None);

    for (i, name) in DIM_NAMES.iter().enumerate() {
        let app = applicability::decide(name, kind, features);
        applicable[i] = !matches!(app, Applicability::NotApplicable);
        if matches!(app, Applicability::NotApplicable) {
            na_reasons[i] = applicability::na_reason(name, kind);
        }
        dims[i] = score_dim(name, app, features, conflicts, kind);
    }
    DimensionScores {
        dims,
        applicable,
        na_reasons,
    }
}

fn clamp10(v: f64) -> f64 {
    v.clamp(0.0, 10.0)
}

fn optional_or(app: &Applicability, fallback: f64) -> f64 {
    if let Applicability::Optional(n) = app {
        *n as f64
    } else {
        fallback
    }
}

/// Signal-poor gate (FIX E): prompts with no executable instruction, undefined
/// placeholder inputs, heavy repetition/filler, or self-defeating
/// contradictions do not earn the Optional neutral anchors (Constraint 10,
/// Safety 10, Context 10 via self_contained, Reuse 6/8, Actionability 8).
/// Absent content in a signal-poor prompt is scored with the low absent anchor
/// instead — bare/gaming/verbose prompts fall out of the 70-88 band so junk
/// drops below 40 and genuine content additions show >= +15 headroom.
///
/// The contradiction arm fires at weight >= 4 (C2/C4/C5/C7/C8 single conflicts,
/// not only the weight-6 C1/C6): any fired contradiction is a self-defeating
/// instruction and the prompt must not collect neutral anchors. The
/// placeholder arm additionally treats a LARGE slot set with a material share
/// unreferenced (`placeholder_spam`) as junk: a 13-slot single-letter stuffing
/// ("report about {A} with regard to {B} ... {M}") satisfies F4's per-token
/// reference rule for the tokens sitting in the task sentence without
/// anchoring real input.
fn signal_poor(f: &FeatureSet, conflicts: &[Conflict]) -> bool {
    f.task_signal == EvidenceStrength::None
        || f.filler_ratio >= 0.4
        || f.redundancy >= 0.4
        || conflict_weight(conflicts) >= 4
        || (f.placeholder_count > 0 && f.referenced_placeholder_fraction < 0.4)
        || placeholder_spam(f)
}

/// Observable signal-poor gate for the deep test entry (same rule as the
/// internal scoring gate).
pub(crate) fn signal_poor_for_test(f: &FeatureSet, conflicts: &[Conflict]) -> bool {
    signal_poor(f, conflicts)
}

/// Placeholder spam rubric: a large placeholder set (>= 5 slots) with a
/// material share unreferenced (< 0.8) is slot-stuffing, not defined input.
/// Good placeholder sets (1 slot, 4 labeled fields, fraction 1.0) stay
/// untouched.
fn placeholder_spam(f: &FeatureSet) -> bool {
    f.placeholder_count >= 5 && f.referenced_placeholder_fraction < 0.8
}

/// Dimensions capped at 3.0 for signal-poor prompts. Consistency is excluded
/// on purpose: it reflects the contradiction weight and must keep its own
/// ladder (0/3/5/10). Safety is excluded too — its ladder already handles the
/// benign/boilerplate split without neutral anchors.
fn capped_when_signal_poor(name: &str) -> bool {
    matches!(
        name,
        "Goal"
            | "Context"
            | "Input"
            | "Output"
            | "Constraint"
            | "Actionability"
            | "Ambiguity"
            | "Completeness"
            | "Noise"
            | "Reuse"
    )
}

/// A prompt that is not concrete (vague action / no specific operation / no
/// specific nouns) is "bare": its goal is recognizable but vague, the executor
/// must invent core substance, several decisions stay open, and constraints
/// are needed but absent (the flag mirrors `FeatureSet.concrete_core`).
fn bare(f: &FeatureSet) -> bool {
    !f.concrete_core
}

fn score_dim(
    name: &str,
    app: Applicability,
    f: &FeatureSet,
    conflicts: &[Conflict],
    kind: &ContentKind,
) -> f64 {
    let poor = signal_poor(f, conflicts);
    let s = match name {
        "Goal" => {
            // A structured template (labeled placeholders + section headings /
            // fill instruction) implies a clear purpose from its title and
            // fill instruction even without an imperative goal sentence.
            // Rubric anchor: templates with labeled placeholders + fill
            // instructions are GOOD/EXCELLENT. Applied ONLY for
            // ContentKind::Template and ONLY when the F2 ladder would
            // under-credit (goal below Moderate — the common case for a
            // form-shaped template with no goal clause).
            if matches!(kind, ContentKind::Template)
                && f.placeholder_count >= 2
                && f.goal_statement < EvidenceStrength::Moderate
            {
                8.0
            } else {
                match f.goal_statement {
                    // Goal ladder aligned with the F2 feature: Strong encodes
                    // transform+input, goal clause/heading, purpose or
                    // deliverable+context -> full 10. Moderate/Weak/None map down.
                    EvidenceStrength::Strong => 10.0,
                    EvidenceStrength::Moderate => 8.0,
                    EvidenceStrength::Weak => 6.0,
                    EvidenceStrength::None => 1.0,
                }
            }
        }
        "Context" => {
            // NOTE: no early `return` — the signal-poor cap below must also
            // apply to the self_contained neutral anchor (10.0 -> 3.0).
            if !poor && f.self_contained {
                10.0
            } else {
                match f.context_substance {
                    // Strong (>= 2 relevant facts, <= 1 filler) fully supplies
                    // the referenced context -> 10. Moderate (a single
                    // needed-fact sentence, often just the task sentence
                    // itself) does NOT establish missing external facts for a
                    // non-self-contained prompt -> 3.0 (rubric: adding
                    // the missing facts to a bare external-subject prompt must
                    // be worth a full ladder step, not a rounding sliver).
                    EvidenceStrength::Strong => 10.0,
                    EvidenceStrength::Moderate | EvidenceStrength::Weak => 3.0,
                    EvidenceStrength::None => {
                        // Signal-poor prompts never get the neutral Context
                        // anchor: fall through to the low anchor (1.0) instead.
                        if poor {
                            1.0
                        } else {
                            optional_or(&app, 1.0)
                        }
                    }
                }
            }
        }
        "Input" => {
            // Template input credit: the labeled placeholders ARE the input
            // definition for a structured template — each field names the
            // data the user must supply. Rubric anchor: templates with
            // labeled placeholders + fill instructions are GOOD/EXCELLENT.
            // Applied ONLY for ContentKind::Template and ONLY when the F3
            // ladder would under-credit (input below Moderate).
            if matches!(kind, ContentKind::Template)
                && f.placeholder_count >= 3
                && f.input_present < EvidenceStrength::Moderate
            {
                8.0
            } else if f.placeholder_count > 0 && f.referenced_placeholder_fraction < 0.4 {
                3.0 // placeholder spam cap
            } else {
                match f.input_present {
                    EvidenceStrength::Strong => {
                        10.0 - if f.referenced_placeholder_fraction < 0.5 {
                            1.0
                        } else {
                            0.0
                        }
                    }
                    EvidenceStrength::Moderate => 7.0,
                    // Weak input (unanchored "the data"-style reference)
                    // anchors at the canonical EvidenceStrength Weak score (5).
                    EvidenceStrength::Weak => 5.0,
                    EvidenceStrength::None => {
                        if poor {
                            1.0
                        } else {
                            optional_or(&app, 1.0)
                        }
                    }
                }
            }
        }
        "Output" => {
            // Template output credit: a structured template defines its
            // output by its section/field structure — the filled form IS the
            // deliverable, even without an explicit artifact/format contract
            // (section headings alone are not recognized as output structure
            // by the F5 ladder, leaving Output at 1.0). Rubric anchor:
            // templates with labeled placeholders + fill instructions are
            // GOOD/EXCELLENT. Applied ONLY for ContentKind::Template and
            // ONLY when the F5 ladder would under-credit (contract below
            // Moderate — the common case for a form-shaped template with no
            // output clause).
            if matches!(kind, ContentKind::Template)
                && f.placeholder_count >= 3
                && f.output_contract_strength < EvidenceStrength::Moderate
            {
                8.0
            } else {
                match f.output_contract_strength {
                    EvidenceStrength::Strong => {
                        // -1 penalty only for a strong mismatch (output_matches_task
                        // < 0.2). A summarize->bullets task is a valid type-pair
                        // that the F6 artifact-pair table cannot express (no
                        // "summary" artifact noun in the prompt) — it must not
                        // lose the point.
                        10.0 - if f.output_matches_task < 0.2 {
                            1.0
                        } else {
                            0.0
                        }
                    }
                    EvidenceStrength::Moderate => 7.0,
                    // Weak output (bare artifact mention or transform-verb
                    // implication only) anchors below the explicit Moderate 7 — 4.0
                    // keeps the Weak band visibly weak across the equal-weight mean.
                    EvidenceStrength::Weak => 4.0,
                    EvidenceStrength::None => {
                        if poor {
                            1.0
                        } else {
                            optional_or(&app, 1.0)
                        }
                    }
                }
            }
        }
        "Constraint" => {
            if f.relevant_constraints + f.boilerplate_constraints == 0 {
                if poor {
                    2.0 // signal-poor prompts never get the Optional(10) neutral
                } else {
                    optional_or(&app, 2.0)
                }
            } else if f.relevant_constraints >= 2 {
                9.0
            } else if f.relevant_constraints == 1 {
                7.0
            } else {
                4.0 // present but irrelevant / boilerplate
            }
        }
        "Actionability" => {
            if f.procedure_steps == EvidenceStrength::Strong {
                9.0
            } else if f.procedure_steps == EvidenceStrength::Moderate {
                7.0
            } else if f.procedure_steps == EvidenceStrength::Weak {
                3.0
            } else if f.atomic_action {
                8.0
            } else if poor {
                2.0 // no neutral Actionability anchor for signal-poor prompts
            } else {
                optional_or(&app, 2.0)
            }
        }
        "Ambiguity" => {
            // Repetition/stuffing at >= 0.4 redundancy is never clear (3.0);
            // >= 0.25 shows visible duplication (5.0). Atomic single-shots
            // (<= 6 sentences) are clearest (9.0); short multi-step prompts
            // (<= 6 sentences) are still clear (8.0); longer prompts default
            // to 7.0.
            if f.redundancy >= 0.4 {
                3.0
            } else if f.redundancy >= 0.25 {
                5.0
            } else if f.atomic_action && f.sentence_count <= 6 {
                9.0
            } else if f.sentence_count <= 6 {
                8.0
            } else {
                7.0
            }
        }
        "Consistency" => {
            let w = conflict_weight(conflicts);
            if w == 0 {
                10.0
            } else if w <= 3 {
                5.0
            } else if w <= 5 {
                3.0
            } else {
                0.0
            }
        }
        "Completeness" => {
            // Ladder (rubric order): placeholder spam is incomplete (3.0);
            // external facts referenced but not supplied — and context not
            // fully established (below Strong) — is incomplete (3.0);
            // terse-sufficient tasks are complete (10.0); a strong output
            // contract earns 9.0; fully supplied context (Strong) earns 10.0;
            // a goal + any output contract earns 8.0; otherwise 4.0.
            if (f.placeholder_count > 0 && f.referenced_placeholder_fraction < 0.5)
                || (!f.self_contained && f.context_substance != EvidenceStrength::Strong)
            {
                3.0
            } else if f.terse_sufficiency {
                10.0
            } else if f.output_contract_strength == EvidenceStrength::Strong {
                9.0
            } else if f.context_substance == EvidenceStrength::Strong {
                10.0
            } else if f.goal_statement != EvidenceStrength::None
                && f.output_contract_strength != EvidenceStrength::None
            {
                8.0
            } else {
                4.0
            }
        }
        "Noise" => {
            let mut n: f64 =
                if f.signal_to_noise >= 0.8 && f.redundancy < 0.2 && f.filler_ratio < 0.2 {
                    10.0
                } else if f.signal_to_noise >= 0.6 {
                    7.0
                } else if f.signal_to_noise >= 0.4 {
                    5.0
                } else if f.signal_to_noise >= 0.2 {
                    3.0
                } else {
                    1.0
                };
            if f.safety_boilerplate_severity >= 2 {
                n -= 2.0;
            } else if f.safety_boilerplate_severity == 1 {
                n -= 1.0;
            }
            if f.redundancy >= 0.4 {
                n -= 3.0; // FIX H: stuffing visibly hurts noise
            }
            // Repetitive prompts (high max-token-frequency) are redundant;
            // the rubric penalizes repetition under SIGNAL-TO-NOISE 3 =
            // "mostly filler; task buried". The >= 0.4 redundancy penalty
            // misses the borderline band (~0.3..0.4 where signal_poor does
            // not fire); any material repetition (>= 0.3) caps Noise at 3.0.
            if f.redundancy >= 0.3 {
                n = n.min(3.0);
            }
            n
        }
        "Safety" => {
            if f.safety_relevant {
                // Sensitive domain with stated relevant constraints and no
                // boilerplate severity: a bounded Safety contract (9.0). The
                // 8.0 anchor under-credited the stated boundary relative to
                // the Output/Context Strong anchors.
                if f.relevant_constraints > 0 && f.safety_boilerplate_severity == 0 {
                    9.0
                } else {
                    3.0
                }
            } else if f.safety_boilerplate_severity > 0 {
                4.0
            } else if poor {
                2.0 // no neutral Safety anchor for signal-poor prompts
            } else {
                optional_or(&app, 2.0)
            }
        }
        "Reuse" => {
            // FIX G: placeholder spam is never reusable (3.0), regardless of
            // kind. The earned-quality ladder (9/7) stays for referenced,
            // non-spam placeholder sets.
            if f.placeholder_count > 0 && f.placeholder_quality < 0.5 {
                3.0
            } else if f.placeholder_quality >= 0.8 {
                9.0
            } else if f.placeholder_quality >= 0.5 {
                7.0
            } else if matches!(kind, ContentKind::Template) {
                3.0
            } else if poor {
                2.0 // no neutral Reuse anchor for signal-poor prompts
            } else {
                optional_or(&app, 6.0)
            }
        }
        _ => 5.0,
    };
    // Signal-poor cap (FIX E): a junk prompt never keeps a high ladder score
    // on the substance dimensions — the cap applies AFTER the ladder so the
    // ladder semantics stay intact. Consistency is NOT capped (it reflects
    // contradiction weight); Safety is not capped either (its ladder already
    // implements the benign/boilerplate N/A policy without neutral anchors).
    let mut capped = if poor && capped_when_signal_poor(name) {
        s.min(3.0)
    } else {
        s
    };
    // Bare-task caps: a Task-kind prompt whose core is NOT concrete — bare:
    // vague action, no specific operation, no specific nouns — must not
    // collect the neutral high anchors on the substance dimensions even when
    // it is not signal-poor. A bare prompt has a recognizable-but-vague goal;
    // the rubric POOR band requires the executor to invent core substance.
    // Reference rubric anchors: GOAL 5-6 (goal recognizable but vague), CONTEXT
    // 3-5 (a bare prompt without supplied context is context-missing — the
    // self_contained neutral anchor must not give it Context 10), ACTION 2-4
    // (executor must invent core substance), AMBIG 1-4 (several decisions
    // stay open), CONSTRAINT 0-2 (constraints needed but absent — capped only
    // when none are stated), COMPLETENESS (several required components
    // missing). Output/Input/Noise/Safety/Consistency are NOT capped: their
    // ladders already reflect the state (Output via the output ladder, Noise
    // via s2n). Guidelines and templates are excluded (kind gate). A fully
    // supplied context (context_substance == Strong) closes the substance gap
    // that makes a prompt bare, so the caps do not apply there — an improved
    // prompt ("Write a product description for the new gadget." + full gadget
    // spec) keeps its earned ladder, while the bare base is capped. These
    // caps are ADDITIONAL to the signal-poor path, never stacked on top of it
    // (`!poor` gate): no double-capping.
    if !poor
        && bare(f)
        && f.context_substance != EvidenceStrength::Strong
        && matches!(kind, ContentKind::Task(_))
    {
        capped = match name {
            "Goal" => capped.min(6.0),
            // A bare prompt without supplied context is context-missing
            // (reference NECESSARY_CONTEXT 3-5), even when it names no
            // explicit external subject — the subject is implicitly missing,
            // not explicitly referenced.
            "Context" => capped.min(3.0),
            "Actionability" => capped.min(3.0),
            "Ambiguity" => capped.min(5.0),
            "Constraint" if f.relevant_constraints + f.boilerplate_constraints == 0 => {
                capped.min(2.0)
            }
            "Completeness" => capped.min(3.0),
            _ => capped,
        };
    }
    clamp10(capped)
}

pub fn overall(dims: &DimensionScores, conflicts: &[Conflict]) -> u8 {
    let mut sum = 0.0;
    let mut n = 0usize;
    for i in 0..12 {
        if dims.applicable[i] {
            sum += dims.dims[i];
            n += 1;
        }
    }
    if n == 0 {
        return 0;
    }
    let mut o = ((sum / n as f64) * 10.0).round().clamp(0.0, 100.0) as u8;
    if conflict_weight(conflicts) >= 6 {
        o = o.min(45);
    }
    o
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::r2::{contradictions, features, type_router};

    #[test]
    fn terse_translation_scores_high() {
        let content = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
        let features = features::extract(content, type_router::Language::En);
        let kind = type_router::ContentKind::Task(type_router::PromptType::Translation);
        let conflicts = contradictions::detect(content, type_router::Language::En);
        let dims = score_dimensions(&features, &kind, &conflicts);
        let o = overall(&dims, &conflicts);
        assert!(o >= 80, "terse translation overall = {o}, expected >= 80");
    }

    #[test]
    fn keyword_stuffed_low() {
        // Keyword-stuffed buzzword prompt. The content is deliberately built so
        // the F1..F21 extractor actually fires the penalizing signals: no goal
        // clause (Goal 1), an external "the codebase" reference with filler-only
        // context (Context 3), boilerplate-only constraints (Constraint 4), zero
        // task sentences + filler ratio (Noise 0), privacy-policy boilerplate
        // (Safety 4) and a C2 json+csv+markdown conflict (Consistency 3).
        let content = "You are an expert. You are a senior expert. Provide expert-level expertise with high quality and professional standards. Avoid filler words. Never use jargon. It is essential to achieve excellence and quality. Use best practices, agentic workflows, zero-shot reasoning, chain-of-thought, and advanced methodologies. The codebase expects expert-level output. This output complies with the privacy policy. Return JSON, Markdown, and CSV.";
        let features = features::extract(content, type_router::Language::En);
        let kind = type_router::ContentKind::Task(type_router::PromptType::GeneralTask);
        let conflicts = contradictions::detect(content, type_router::Language::En);
        let dims = score_dimensions(&features, &kind, &conflicts);
        let o = overall(&dims, &conflicts);
        assert!(o < 45, "keyword-stuffed overall = {o}, expected < 45");
    }

    #[test]
    fn contradiction_drops() {
        // The added "translate back into German" instruction must surface as a
        // C1 language conflict (weight 6) against the "into English" mandate,
        // which drops Consistency to 0 and caps overall at 45. The extra clause
        // is placed in its own paragraph: inside the placeholder paragraph it
        // would be tokenized as "{{text}} Also translate ..." and the "text"
        // lexeme would route the mandate to the format topic instead of the
        // language topic (TOPIC_TABLE is consulted before the language
        // supplement), so the contradiction would never fire.
        let clean =
            "Translate the following text into English. Return only the translation:\n\n{{text}}";
        let contradictory = format!(
            "{clean}\n\nAlso translate the result back into German and return both versions."
        );
        let lang = type_router::Language::En;

        let clean_features = features::extract(clean, lang);
        let kind = type_router::ContentKind::Task(type_router::PromptType::Translation);
        let clean_conflicts = contradictions::detect(clean, lang);
        let clean_dims = score_dimensions(&clean_features, &kind, &clean_conflicts);
        let clean_o = overall(&clean_dims, &clean_conflicts);

        let bad_features = features::extract(&contradictory, lang);
        let bad_conflicts = contradictions::detect(&contradictory, lang);
        let bad_dims = score_dimensions(&bad_features, &kind, &bad_conflicts);
        let bad_o = overall(&bad_dims, &bad_conflicts);

        assert!(
            bad_o <= clean_o - 5,
            "contradictory overall = {bad_o}, clean overall = {clean_o}, expected drop >= 5"
        );
    }

    #[test]
    fn range_invariant() {
        let prompts = [
            (
                "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}",
                type_router::ContentKind::Task(type_router::PromptType::Translation),
            ),
            (
                "You are an expert. You are a senior expert. Provide expert-level expertise with high quality and professional standards. Avoid filler words. Never use jargon. It is essential to achieve excellence and quality. Use best practices, agentic workflows, zero-shot reasoning, chain-of-thought, and advanced methodologies. The codebase expects expert-level output. This output complies with the privacy policy. Return JSON, Markdown, and CSV.",
                type_router::ContentKind::Task(type_router::PromptType::GeneralTask),
            ),
            (
                "# Schreibstil\n- Verwende aktive Formulierungen.\n- Vermeide Füllwörter.",
                type_router::ContentKind::Guideline,
            ),
        ];
        for (content, kind) in prompts {
            let features = features::extract(content, type_router::Language::En);
            let conflicts = contradictions::detect(content, type_router::Language::En);
            let dims = score_dimensions(&features, &kind, &conflicts);
            let o = overall(&dims, &conflicts);
            assert!(
                (0..=100).contains(&o),
                "overall out of range [0,100]: {o} for prompt: {content}"
            );
        }
    }

    /// Bare-task false-high: a bare Task prompt — vague action, no specific
    /// operation, no specific nouns (concrete_core=false), NOT signal-poor —
    /// must not collect the neutral high anchors. Reference anchors: GOAL 5-6,
    /// ACTION 2-4, AMBIG 1-4, CONSTRAINT 0-2, COMPLETENESS (several required
    /// components missing). "Schreibe einen Werbetext für unsere neue App."
    /// (reference POOR) previously scored too high; the bare caps pull it
    /// down. An improved prompt carries the bare flag but supplies the full
    /// context (context_substance Strong) — the substance gap is closed, so
    /// the bare caps do NOT apply and its earned ladder stays (context
    /// addition must improve the overall score by >= +15).
    #[test]
    fn bare_task_capped() {
        let bare_de = "Schreibe einen Werbetext für unsere neue App.";
        let f = features::extract(bare_de, type_router::Language::De);
        let kind = type_router::ContentKind::Task(type_router::PromptType::GeneralTask);
        let conflicts = contradictions::detect(bare_de, type_router::Language::De);
        assert!(
            !f.concrete_core,
            "bare prompt must have concrete_core=false"
        );
        let dims = score_dimensions(&f, &kind, &conflicts);
        assert_eq!(dims.get("Goal"), 6.0, "bare Goal cap 6.0");
        assert_eq!(dims.get("Actionability"), 3.0, "bare Actionability cap 3.0");
        assert_eq!(dims.get("Ambiguity"), 5.0, "bare Ambiguity cap 5.0");
        assert_eq!(
            dims.get("Constraint"),
            2.0,
            "bare Constraint cap 2.0 (none stated)"
        );
        assert_eq!(dims.get("Completeness"), 3.0, "bare Completeness cap 3.0");
        let o = overall(&dims, &conflicts);
        assert!(
            (45..=55).contains(&o),
            "bare DE overall = {o}, expected 45-55"
        );

        let improved = "Write a product description for the new gadget. The gadget is a compact portable speaker with a long battery life. It is durable and plays for 20 hours.";
        let f2 = features::extract(improved, type_router::Language::En);
        let kind2 = type_router::ContentKind::Task(type_router::PromptType::GeneralTask);
        let c2 = contradictions::detect(improved, type_router::Language::En);
        let dims2 = score_dimensions(&f2, &kind2, &c2);
        assert_eq!(f2.context_substance, EvidenceStrength::Strong);
        assert_eq!(
            dims2.get("Goal"),
            10.0,
            "Strong-context bare prompt keeps Goal ladder"
        );
        let io = overall(&dims2, &c2);
        let base_f = features::extract(
            "Write a product description for the new gadget.",
            type_router::Language::En,
        );
        let base_dims = score_dimensions(&base_f, &kind2, &c2);
        let bo = overall(&base_dims, &c2);
        assert!(
            io as i32 >= bo as i32 + 15,
            "context addition must improve >= +15, base {bo}, improved {io}"
        );
    }

    /// A bare Task prompt WITHOUT an explicit external subject still gets
    /// Context 10 via the self_contained neutral anchor — the subject is
    /// implicitly missing, not explicitly referenced, so the bare treatment
    /// must cap Context at 3.0 too (reference NECESSARY_CONTEXT 3-5).
    #[test]
    fn bare_self_contained_context_capped() {
        for content in [
            "Write a brief report.",
            "Write a short report.",
            "Schreibe einen Projektbericht.",
        ] {
            let lang = type_router::detect_language(content);
            let f = features::extract(content, lang);
            let kind = type_router::ContentKind::Task(type_router::PromptType::GeneralTask);
            let conflicts = contradictions::detect(content, lang);
            assert!(
                !f.concrete_core,
                "bare prompt must have concrete_core=false: {content}"
            );
            assert!(
                f.self_contained,
                "no explicit external subject -> self_contained: {content}"
            );
            let dims = score_dimensions(&f, &kind, &conflicts);
            assert_eq!(
                dims.get("Context"),
                3.0,
                "bare Context cap 3.0 (self_contained neutral anchor): {content}"
            );
            let o = overall(&dims, &conflicts);
            assert!(
                o < 70,
                "bare self-contained prompt must not be false-high (>= 70): {content} scored {o}"
            );
        }
    }

    /// Structured templates — labeled placeholders + section headings + fill
    /// instruction ("# Team Sync", "## Agenda/## Agreements/## Owner
    /// Commitments", "Fill every section") — define their goal/output via
    /// their structure alone. The template credit (kind-gated,
    /// placeholder-count keyed) must lift Goal and Output to 8.0 and keep
    /// Input credited; the credit must NOT leak to Task-kind prompts with
    /// placeholders.
    #[test]
    fn structured_template_credit() {
        let content = "# Team Sync\n\n- Session name: {{session_name}}\n- Date: {{sync_date}}\n- Facilitator: {{facilitator}}\n\n## Agenda\n{{agenda_entries}}\n\n## Agreements\n{{agreements}}\n\n## Owner Commitments\n{{owner_commitments}} (owner, due date)\n\n## Risky Items\n{{risky_items}}\n\nFill every section. If a section has no content, write NOTHING instead of leaving it empty.";
        let lang = type_router::detect_language(content);
        let f = features::extract(content, lang);
        let kind = type_router::classify(content).kind;
        let conflicts = contradictions::detect(content, lang);
        assert!(
            matches!(kind, ContentKind::Template),
            "structured form must route as Template"
        );
        assert!(
            f.placeholder_count >= 3,
            "template must carry >= 3 labeled placeholders, got {}",
            f.placeholder_count
        );
        let dims = score_dimensions(&f, &kind, &conflicts);
        // The fill instruction + title imply the purpose even without an
        // imperative goal sentence (Goal 8.0 credit).
        assert_eq!(dims.get("Goal"), 8.0, "template Goal credit 8.0");
        // The section/field structure IS the output contract (Output 8.0
        // credit) — without it Output would sit at 1.0.
        assert_eq!(dims.get("Output"), 8.0, "template Output credit 8.0");
        // The labeled placeholders define the input (ladder already Strong,
        // so the credit is a no-op floor at >= 8.0).
        assert!(
            dims.get("Input") >= 8.0,
            "template Input must be >= 8.0, got {}",
            dims.get("Input")
        );
        let o = overall(&dims, &conflicts);
        assert!(o >= 80, "structured template must be GOOD+, got {o}");

        // Negative control: a Task-kind prompt with 3 placeholders must NOT
        // receive the template Output/Goal credit — the kind gate is binding.
        let task_content = "Create a report. Use {A}, {B} and {C}.";
        let f2 = features::extract(task_content, type_router::Language::En);
        let kind2 = type_router::ContentKind::Task(type_router::PromptType::GeneralTask);
        let c2 = contradictions::detect(task_content, type_router::Language::En);
        let dims2 = score_dimensions(&f2, &kind2, &c2);
        assert!(
            f2.placeholder_count >= 3,
            "negative control needs >= 3 placeholders"
        );
        assert_ne!(
            dims2.get("Output"),
            8.0,
            "Task-kind prompt must not get the template Output credit"
        );
    }

    /// A heavily repetitive prompt (role statement x4 + instruction x4) is
    /// mostly filler with a buried task — rubric SIGNAL_TO_NOISE 3 ("mostly
    /// filler; task buried"). Its redundancy lands in the borderline band
    /// (~0.3..0.4) where the signal-poor gate does not fire; the Noise ladder
    /// must cap at 3.0 regardless so the repetitive prompt drops.
    #[test]
    fn repetition_caps_noise() {
        let content = "You are a product marketing lead. You are a senior product marketing lead. You are a brilliant product marketing lead. You are an award-winning product marketing lead. Draft a slogan for our new coffee brand. Draft a slogan for our new coffee brand. Draft a slogan for our new coffee brand. Remember: draft a slogan for our new coffee brand.";
        let lang = type_router::detect_language(content);
        let f = features::extract(content, lang);
        let kind = type_router::classify(content).kind;
        let conflicts = contradictions::detect(content, lang);
        assert!(
            f.redundancy >= 0.3 && f.redundancy < 0.4,
            "repetitive prompt must sit in the borderline redundancy band, got {}",
            f.redundancy
        );
        let dims = score_dimensions(&f, &kind, &conflicts);
        assert_eq!(
            dims.get("Noise"),
            3.0,
            "repetition >= 0.3 must cap Noise at 3.0"
        );
        let o = overall(&dims, &conflicts);
        assert!(
            o < 79,
            "repetitive prompt must drop below the pre-fix 79, got {o}"
        );
    }
}
