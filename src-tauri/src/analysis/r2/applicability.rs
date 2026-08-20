#![allow(dead_code)]
// pub API consumed by Task Capsule B wiring (quality.rs/hygiene.rs migration M2); keep build clean meanwhile

//! R2 criterion applicability (spec §2/§6) — `Applicability` enum,
//! type x dimension matrix (Required/Optional/NotApplicable) and the
//! per-dimension `decide()` including machine-readable NA reasons.
//!
//! Fully offline and deterministic: no LLM, no RNG, no env vars. The base
//! matrix (spec §6) is keyed on [`ContentKind`] / [`PromptType`]; [`decide`]
//! then applies the anti-gaming substance rule (§4/§6) as monotonic
//! promotions: a dimension is NEVER [`Applicability::NotApplicable`] when its
//! content is present — sprinkling keywords makes the dimension applicable and
//! the substance/noise checks punish it.
//!
//! The Safety dimension is the ONE deliberate exception (Change E): for every
//! [`ContentKind`] it is [`Applicability::Required`] iff `safety_relevant`
//! content is present, else [`Applicability::NotApplicable`] (benign domain,
//! Safety excluded from the mean per the reference rubric N/A policy).
//! Boilerplate-only safety content does not promote Safety — per the rubric
//! "when SAFETY/PRIVACY is N/A but the prompt carries irrelevant safety
//! boilerplate, the penalty is absorbed by SIGNAL-TO-NOISE and CONSTRAINT
//! RELEVANCE (no double counting)".

use super::features::{EvidenceStrength, FeatureSet};
use super::type_router::{ContentKind, PromptType};

/// Applicability of one internal R2 dimension for a prompt of a given kind.
///
/// - [`Applicability::Required`]: the criterion always counts; absent content
///   is penalized by the scoring layer.
/// - [`Applicability::Optional(u8)`]: the criterion counts when relevant; the
///   payload is the neutral-absent score — the score to use when the criterion
///   is not needed but applicable (spec §5: rubric-neutral high anchor, e.g.
///   10 for constraint/safety/context, 8 for optional procedure/quality).
/// - [`Applicability::NotApplicable`]: genuine inapplicability (pure
///   ideation, format-open-by-intent, one-off task, benign domain). Never
///   returned by [`decide`] when the corresponding content is present
///   (anti-gaming rule, spec §4/§6) — with one documented exception: Safety
///   stays NotApplicable for boilerplate-only safety content, whose penalty
///   is absorbed by Noise/Constraint instead (see [`decide`]).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Applicability {
    Required,
    Optional(u8),
    NotApplicable,
}

/// The 12 internal dimension names, in fixed matrix-column order.
const DIMENSIONS: [&str; 12] = [
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

/// Base applicability matrix (spec §6) keyed on [`ContentKind`], in
/// `DIMENSIONS` column order:
/// `[Goal, Context, Input, Output, Constraint, Actionability, Ambiguity,
///  Consistency, Completeness, Noise, Safety, Reuse]`.
///
/// Note on "R-if-data" cells (Guideline/GeneralTask Input): the base decision
/// is [`Applicability::NotApplicable`] (pure ideation); [`decide`] promotes it
/// the moment data is referenced (anti-gaming rule).
fn base_matrix(dim: &str, kind: &ContentKind) -> Applicability {
    use Applicability::{NotApplicable, Optional, Required};
    use ContentKind::{Guideline, Task, Template};
    use PromptType::{
        AgentWorkflow, Analysis, Classification, Coding, Extraction, GeneralTask, Generation,
        Planning, Summarization, Transformation, Translation,
    };
    let row: [Applicability; 12] = match kind {
        Guideline => [
            Required,
            Required,
            NotApplicable,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Required,
        ],
        Template => [
            Required,
            Optional(10),
            Required,
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Required,
        ],
        Task(Translation | Summarization | Extraction | Transformation) => [
            Required,
            Optional(10),
            Required,
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Optional(8),
        ],
        Task(Classification) => [
            Required,
            Optional(10),
            Required,
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Optional(8),
        ],
        Task(Generation) => [
            Required,
            Required,
            Optional(8),
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Optional(8),
        ],
        Task(Planning) => [
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            NotApplicable,
        ],
        Task(Analysis) => [
            Required,
            Required,
            Required,
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            NotApplicable,
        ],
        Task(Coding) => [
            Required,
            Required,
            Required,
            Required,
            Required,
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Optional(8),
        ],
        Task(AgentWorkflow) => [
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            Optional(8),
        ],
        Task(GeneralTask) => [
            Required,
            Required,
            NotApplicable,
            Required,
            Optional(10),
            Optional(8),
            Required,
            Required,
            Required,
            Required,
            NotApplicable,
            NotApplicable,
        ],
    };
    DIMENSIONS
        .iter()
        .position(|d| *d == dim)
        .map(|i| row[i])
        .unwrap_or(NotApplicable)
}

/// Decide the final applicability of one internal dimension.
///
/// Starts from the spec §6 base matrix, then applies the anti-gaming substance
/// rule (spec §4/§6) as monotonic promotions — a dimension is never
/// [`Applicability::NotApplicable`] when its content is present:
///
/// - input content (`input_present` / `placeholder_count`) -> Input at least
///   [`Applicability::Optional`], `Required` once placeholders exist;
/// - any constraint statement -> Constraint `Required`;
/// - safety-relevant content -> Safety `Required`;
/// - an output contract -> Output `Required`;
/// - context substance -> Context `Required`;
/// - procedure steps -> Actionability `Required`;
/// - a goal statement -> Goal `Required`.
///
/// Safety is the ONE deliberate anti-gaming exception and is fully
/// feature-driven for every [`ContentKind`] (Change E): it is
/// [`Applicability::Required`] only when `features.safety_relevant` is set
/// (sensitive domain present) and [`Applicability::NotApplicable`] otherwise.
/// Irrelevant safety *boilerplate* (`safety_boilerplate_severity > 0`) does
/// NOT promote Safety — per the reference rubric, when SAFETY is N/A but the
/// prompt carries irrelevant safety boilerplate, the penalty is absorbed by
/// SIGNAL-TO-NOISE and CONSTRAINT RELEVANCE (no double counting), so Safety
/// stays N/A and is excluded from the mean entirely.
///
/// Unknown dimension names resolve to `NotApplicable` (the closed set of 12
/// names in [`DIMENSIONS`] is the only valid input).
pub fn decide(dim: &str, kind: &ContentKind, features: &FeatureSet) -> Applicability {
    let mut app = base_matrix(dim, kind);
    match dim {
        "Input" => {
            if features.placeholder_count > 0 {
                // Present placeholders must be scored.
                app = Applicability::Required;
            } else if features.input_present != EvidenceStrength::None
                && matches!(app, Applicability::NotApplicable)
            {
                // Data referenced without placeholder anchors: at least
                // Optional, never NotApplicable. Neutral-absent anchor 8
                // matches the GENERATION Input cell of the spec §6 matrix.
                app = Applicability::Optional(8);
            }
        }
        "Constraint" if features.relevant_constraints + features.boilerplate_constraints > 0 => {
            // Present constraint content must be scored.
            app = Applicability::Required;
        }
        "Safety" => {
            if features.safety_relevant {
                // Sensitive domain present: the criterion must be scored.
                app = Applicability::Required;
            } else {
                // Benign domain — Safety is excluded from the mean entirely
                // (reference rubric N/A policy). Boilerplate-only safety
                // content does NOT promote Safety: the penalty is absorbed by
                // SIGNAL-TO-NOISE and CONSTRAINT RELEVANCE (no double
                // counting), so Safety stays NotApplicable. Holds for every
                // ContentKind (Change E).
                app = Applicability::NotApplicable;
            }
        }
        "Output" if features.output_contract_strength != EvidenceStrength::None => {
            app = Applicability::Required;
        }
        "Context" if features.context_substance != EvidenceStrength::None => {
            app = Applicability::Required;
        }
        "Actionability" if features.procedure_steps != EvidenceStrength::None => {
            app = Applicability::Required;
        }
        "Goal" if features.goal_statement != EvidenceStrength::None => {
            app = Applicability::Required;
        }
        _ => {}
    }
    app
}

/// Machine-readable justification for a [`Applicability::NotApplicable`]
/// decision (spec §6: every NA decision carries a reason string).
///
/// Returns `Some` only for `(dimension, kind)` pairs the base matrix marks
/// `NotApplicable` — the rationale stays stable and never justifies an
/// anti-gaming-promoted decision. Unknown dimensions / non-NA cells return
/// `None`.
pub fn na_reason(dim: &str, kind: &ContentKind) -> Option<String> {
    use Applicability::NotApplicable;
    let reason: &str = match (dim, kind) {
        // Pure-ideation prompts (guidelines / generic tasks) reference no data.
        ("Input", ContentKind::Guideline)
        | ("Input", ContentKind::Task(PromptType::GeneralTask)) => {
            "INPUT: pure ideation, no data referenced"
        }
        // Format-open-by-intent outputs: the format is deliberately left to
        // the model (reserved rationale — no current §6 matrix cell marks
        // Output NA; documented for the format-open-by-intent case).
        ("Output", _) => "OUTPUT: format open by intent",
        // One-off tasks: reusability is deliberately not a quality criterion.
        (
            "Reuse",
            ContentKind::Task(
                PromptType::Planning | PromptType::Analysis | PromptType::GeneralTask,
            ),
        ) => "REUSE: one-off task",
        // Benign domains: Safety is N/A for every kind unless the
        // anti-gaming rule promotes it (safety_relevant content present).
        // Boilerplate-only safety content does NOT promote Safety (its
        // penalty is absorbed by SIGNAL-TO-NOISE / CONSTRAINT RELEVANCE).
        ("Safety", _) => "SAFETY: benign domain, no boundaries stated",
        _ => return None,
    };
    if matches!(base_matrix(dim, kind), NotApplicable) {
        Some(reason.to_string())
    } else {
        None
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translation_matrix() {
        let kind = ContentKind::Task(PromptType::Translation);
        let features = FeatureSet::empty(); // benign: no safety/constraint content
        assert_eq!(decide("Input", &kind, &features), Applicability::Required);
        assert_eq!(
            decide("Actionability", &kind, &features),
            Applicability::Optional(8)
        );
        assert_eq!(
            decide("Safety", &kind, &features),
            Applicability::NotApplicable
        );
        assert_eq!(
            decide("Reuse", &kind, &features),
            Applicability::Optional(8)
        );
    }

    #[test]
    fn gaming_no_na_with_present_content() {
        // Sprinkled keywords (constraint + safety content, placeholders) must
        // make the dimensions applicable and scored — never NotApplicable.
        let kind = ContentKind::Task(PromptType::GeneralTask);
        let mut features = FeatureSet::empty();
        features.relevant_constraints = 1;
        features.safety_relevant = true;
        features.placeholder_count = 1;
        assert_eq!(
            decide("Constraint", &kind, &features),
            Applicability::Required
        );
        assert_eq!(decide("Safety", &kind, &features), Applicability::Required);
        assert_eq!(decide("Input", &kind, &features), Applicability::Required);
    }

    #[test]
    fn agent_workflow_matrix() {
        let kind = ContentKind::Task(PromptType::AgentWorkflow);
        let features = FeatureSet::empty();
        // Change E (updated expectation): the reference rubric's N/A policy
        // excludes Safety from the mean for benign prompts of EVERY kind —
        // a benign agent-workflow prompt with no safety-relevant content is
        // NotApplicable, not Required. Safety becomes Required only when
        // features.safety_relevant is set (see safety_feature_driven_for_all_kinds).
        assert_eq!(
            decide("Safety", &kind, &features),
            Applicability::NotApplicable
        );
        assert_eq!(
            decide("Actionability", &kind, &features),
            Applicability::Required
        );
    }

    #[test]
    fn benign_guideline() {
        let kind = ContentKind::Guideline;
        let features = FeatureSet::empty();
        assert_eq!(decide("Goal", &kind, &features), Applicability::Required);
        assert_eq!(decide("Reuse", &kind, &features), Applicability::Required);
    }

    #[test]
    fn na_reason_stable_and_gated() {
        // Stable machine-readable reasons for base-NA cells.
        assert_eq!(
            na_reason("Safety", &ContentKind::Task(PromptType::Translation)),
            Some("SAFETY: benign domain, no boundaries stated".to_string())
        );
        assert_eq!(
            na_reason("Reuse", &ContentKind::Task(PromptType::Planning)),
            Some("REUSE: one-off task".to_string())
        );
        assert_eq!(
            na_reason("Input", &ContentKind::Guideline),
            Some("INPUT: pure ideation, no data referenced".to_string())
        );
        // Non-NA cells never carry a reason.
        // Change E (updated expectation): the Safety base cell is now
        // NotApplicable for EVERY kind (benign default, rubric N/A policy),
        // so Classification — like all kinds — carries the benign-domain
        // Safety reason here instead of None.
        assert_eq!(
            na_reason("Safety", &ContentKind::Task(PromptType::Classification)),
            Some("SAFETY: benign domain, no boundaries stated".to_string())
        );
        assert_eq!(
            na_reason("Reuse", &ContentKind::Task(PromptType::Coding)),
            None
        );
        assert_eq!(
            na_reason("Input", &ContentKind::Task(PromptType::Translation)),
            None
        );
    }

    #[test]
    fn na_reason_iff_base_na() {
        let kinds = [
            ContentKind::Guideline,
            ContentKind::Template,
            ContentKind::Task(PromptType::Translation),
            ContentKind::Task(PromptType::Summarization),
            ContentKind::Task(PromptType::Extraction),
            ContentKind::Task(PromptType::Classification),
            ContentKind::Task(PromptType::Transformation),
            ContentKind::Task(PromptType::Generation),
            ContentKind::Task(PromptType::Planning),
            ContentKind::Task(PromptType::Analysis),
            ContentKind::Task(PromptType::Coding),
            ContentKind::Task(PromptType::AgentWorkflow),
            ContentKind::Task(PromptType::GeneralTask),
        ];
        for kind in kinds {
            for dim in DIMENSIONS {
                assert_eq!(
                    na_reason(dim, &kind).is_some(),
                    matches!(base_matrix(dim, &kind), Applicability::NotApplicable),
                    "na_reason({dim}) mismatch for kind {:?}",
                    kind
                );
            }
        }
    }

    #[test]
    fn safety_feature_driven_for_all_kinds() {
        // Change E: Safety applicability is fully feature-driven for every
        // ContentKind — Required only when safety_relevant content is present
        // (sensitive domain); benign prompts with no safety content, and
        // benign prompts carrying only irrelevant safety boilerplate, stay
        // NotApplicable (reference rubric N/A policy: the boilerplate penalty
        // is absorbed by SIGNAL-TO-NOISE / CONSTRAINT RELEVANCE — no double
        // counting — so Safety stays excluded from the mean).
        let kinds = [
            ContentKind::Guideline,
            ContentKind::Template,
            ContentKind::Task(PromptType::Translation),
            ContentKind::Task(PromptType::Summarization),
            ContentKind::Task(PromptType::Extraction),
            ContentKind::Task(PromptType::Classification),
            ContentKind::Task(PromptType::Transformation),
            ContentKind::Task(PromptType::Generation),
            ContentKind::Task(PromptType::Planning),
            ContentKind::Task(PromptType::Analysis),
            ContentKind::Task(PromptType::Coding),
            ContentKind::Task(PromptType::AgentWorkflow),
            ContentKind::Task(PromptType::GeneralTask),
        ];
        for kind in kinds {
            let mut benign = FeatureSet::empty();
            assert_eq!(
                decide("Safety", &kind, &benign),
                Applicability::NotApplicable,
                "benign Safety must be N/A for kind {:?}",
                kind
            );
            // Irrelevant boilerplate alone must NOT promote Safety.
            benign.safety_boilerplate_severity = 2;
            assert_eq!(
                decide("Safety", &kind, &benign),
                Applicability::NotApplicable,
                "boilerplate-only Safety must stay N/A for kind {:?}",
                kind
            );
            // Sensitive domain content promotes Safety to Required.
            let mut sensitive = FeatureSet::empty();
            sensitive.safety_relevant = true;
            assert_eq!(
                decide("Safety", &kind, &sensitive),
                Applicability::Required,
                "safety_relevant must promote Safety for kind {:?}",
                kind
            );
        }
    }
}
