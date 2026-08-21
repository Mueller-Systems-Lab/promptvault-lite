//! R2 recommendations (spec §2/§9) — gated, capped (max 4) WHAT/WHY/CHANGE
//! recommendation generation in DE/EN, containing the PV criterion keyword
//! so users can map each recommendation back to the criterion list
//! (product-contract property).

#![allow(dead_code)] // wired in a later capsule

use super::contradictions::Conflict;
use super::features::{EvidenceStrength, FeatureSet};
use super::scoring::{DimensionScores, DIM_NAMES};
use super::type_router::{ContentKind, Language};

/// Cap on emitted recommendations per prompt (spec §9).
const MAX_RECS: usize = 4;

/// Generate gated, capped recommendations (spec §9).
///
/// Priority order: fired contradictions first (highest), then the Required
/// dimensions that matter (Goal/Input/Output), then the remaining
/// content-gated dimensions. Every emitted text carries the PV criterion
/// keyword so users can map the recommendation to the criterion list.
pub fn generate(
    dims: &DimensionScores,
    kind: &ContentKind,
    features: &FeatureSet,
    conflicts: &[Conflict],
    lang: Language,
) -> Vec<String> {
    // Applicability is already folded into `dims.applicable` by the scoring
    // layer; the content-gated suppression rules (spec §9) branch on `dims`
    // and `features` only, so `kind` is not needed here.
    let _ = kind;
    let de = lang == Language::De;

    let mut out: Vec<String> = Vec::new();

    // 1. Contradiction recs — highest priority (spec §9).
    for c in conflicts {
        out.push(contradiction_rec(c, de));
        if out.len() >= MAX_RECS {
            return out;
        }
    }

    // 2. Required dimensions that matter: Goal / Input / Output.
    for name in ["Goal", "Input", "Output"] {
        if let Some(text) = dim_rec(name, dims, features, de) {
            out.push(text);
            if out.len() >= MAX_RECS {
                return out;
            }
        }
    }

    // 3. Remaining content-gated dimensions.
    for name in [
        "Context",
        "Constraint",
        "Actionability",
        "Ambiguity",
        "Safety",
        "Reuse",
        "Role",
    ] {
        if let Some(text) = dim_rec(name, dims, features, de) {
            out.push(text);
            if out.len() >= MAX_RECS {
                return out;
            }
        }
    }

    out
}

/// Confidence/evidence emission gate (spec §9): the dimension must be
/// applicable AND score < 5 — or < 7 for the Required dimensions
/// Goal/Input/Output that matter.
fn gate_passes(dims: &DimensionScores, name: &str) -> bool {
    let Some(idx) = DIM_NAMES.iter().position(|n| *n == name) else {
        return false;
    };
    if !dims.applicable[idx] {
        return false;
    }
    let score = dims.dims[idx];
    let required_major = matches!(name, "Goal" | "Input" | "Output");
    score < 5.0 || (required_major && score < 7.0)
}

/// One content-gated dimension recommendation (spec §9), or `None` when the
/// dimension does not need a change.
fn dim_rec(name: &str, dims: &DimensionScores, features: &FeatureSet, de: bool) -> Option<String> {
    match name {
        "Goal" => {
            if !gate_passes(dims, name) || dims.get("Goal") >= 5.0 {
                return None;
            }
            Some(if de {
                "Formuliere ein explizites Ziel: Deine Aufgabe ist es, [Ziel] zu erreichen."
                    .to_string()
            } else {
                "State an explicit goal: Your task is to achieve [goal].".to_string()
            })
        }
        "Context" => {
            // Only when external facts are referenced but not supplied.
            if !gate_passes(dims, name) || features.self_contained {
                return None;
            }
            Some(if de {
                "Ergänze den fehlenden Kontext: [Fakt] fehlt, damit die Aufgabe eigenständig ausführbar ist."
                    .to_string()
            } else {
                "Add the missing context: the task references [fact] that is not supplied."
                    .to_string()
            })
        }
        "Input" => {
            // Suppressed when placeholders already exist (spec §9).
            if !gate_passes(dims, name)
                || dims.get("Input") >= 5.0
                || features.placeholder_count > 0
            {
                return None;
            }
            Some(if de {
                "Definiere Eingaben mit Platzhaltern: Erwartete Eingabe: {{INPUT}}.".to_string()
            } else {
                "Define inputs with placeholders: Expected input: {{INPUT}}.".to_string()
            })
        }
        "Output" => {
            // Content-gated suppression (spec §9): only a substantive output
            // contract (Moderate/Strong) suppresses the rec. None (absent) or
            // Weak (transform-verb implication only, score 5.0) still warrants
            // "specify the output format" — e.g. "Summarize the following
            // text:". `dims.get("Output") > 5.0` aligns the score gate
            // with the Weak ladder anchor so Weak (5.0) is not suppressed by
            // the shared `>= 5.0` rec gate.
            if !gate_passes(dims, name)
                || dims.get("Output") > 5.0
                || matches!(
                    features.output_contract_strength,
                    EvidenceStrength::Moderate | EvidenceStrength::Strong
                )
            {
                return None;
            }
            Some(if de {
                "Spezifiziere das Ausgabeformat: Antworte im JSON-Format mit den Feldern [FELD1, FELD2]."
                    .to_string()
            } else {
                "Specify the output format: Answer in JSON with the fields [FIELD1, FIELD2]."
                    .to_string()
            })
        }
        "Constraint" => {
            // Only when no relevant acceptance criteria exist yet.
            if !gate_passes(dims, name)
                || dims.get("Constraint") >= 5.0
                || features.relevant_constraints > 0
            {
                return None;
            }
            Some(if de {
                "Ergänze Prüfkriterien: Das Ergebnis muss folgende Akzeptanzkriterien erfüllen: [KRITERIEN]."
                    .to_string()
            } else {
                "Add acceptance criteria: the result must satisfy the following checks: [CRITERIA]."
                    .to_string()
            })
        }
        "Actionability" => {
            // Suppressed when a single atomic action suffices (spec §9).
            if !gate_passes(dims, name)
                || dims.get("Actionability") >= 5.0
                || features.atomic_action
            {
                return None;
            }
            Some(if de {
                "Strukturiere das Vorgehen: 1. Analysiere... 2. Implementiere... 3. Validiere..."
                    .to_string()
            } else {
                "Structure the procedure: 1. Analyze... 2. Implement... 3. Validate...".to_string()
            })
        }
        "Ambiguity" => {
            if !gate_passes(dims, name) || dims.get("Ambiguity") >= 5.0 {
                return None;
            }
            Some(if de {
                "Verbessere die Lesbarkeit: verwende Überschriften, Absätze und prägnante Formulierungen."
                    .to_string()
            } else {
                "Improve readability: use headings, paragraphs and concise wording.".to_string()
            })
        }
        "Safety" => {
            // NEVER emitted for benign tasks — only for sensitive domains
            // without stated boundaries (spec §9).
            if !gate_passes(dims, name) || !features.safety_relevant || dims.get("Safety") >= 5.0 {
                return None;
            }
            Some(if de {
                "Definiere Grenzen: gib keine personenbezogenen Daten aus und führe keine destruktiven Aktionen aus."
                    .to_string()
            } else {
                "Define boundaries: never output personal data and do not perform destructive actions."
                    .to_string()
            })
        }
        "Reuse" => {
            // Suppressed when placeholders already exist (spec §9).
            if !gate_passes(dims, name)
                || dims.get("Reuse") >= 5.0
                || features.placeholder_count > 0
            {
                return None;
            }
            Some(if de {
                "Mache den Prompt generischer: ersetze konkrete Projekt- und Dateinamen durch Platzhalter."
                    .to_string()
            } else {
                "Make the prompt more generic: replace concrete project and file names with placeholders."
                    .to_string()
            })
        }
        "Role" => {
            // Never "add a role" when absent — only replace a present-but-
            // generic role (spec §9).
            if features.role_present != EvidenceStrength::Weak {
                return None;
            }
            Some(if de {
                "Ersetze die generische Rollenangabe durch eine konkrete Rolle mit Expertise: Du bist ein [Rolle] mit [Expertise]."
                    .to_string()
            } else {
                "Replace the generic role with a concrete one: You are a [role] with [expertise]."
                    .to_string()
            })
        }
        _ => None,
    }
}

/// One recommendation per fired conflict, quoting both mandates (spec §9).
fn contradiction_rec(c: &Conflict, de: bool) -> String {
    if de {
        format!(
            "Löse den Widerspruch zwischen »{}« und »{}«: entscheide dich für eine Vorgabe.",
            c.first, c.second
        )
    } else {
        format!(
            "Resolve the contradiction between \"{}\" and \"{}\": choose one mandate.",
            c.first, c.second
        )
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::analysis::r2::{contradictions, features, scoring, type_router};

    #[test]
    fn terse_good_few_recs() {
        let content = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
        let lang = type_router::Language::En;
        let features = features::extract(content, lang);
        let kind = type_router::ContentKind::Task(type_router::PromptType::Translation);
        let conflicts = contradictions::detect(content, lang);
        let dims = scoring::score_dimensions(&features, &kind, &conflicts);
        let recs = generate(&dims, &kind, &features, &conflicts, lang);
        assert!(
            recs.len() <= 2,
            "terse translation emitted {} recommendations: {recs:?}",
            recs.len()
        );
    }

    #[test]
    fn benign_no_safety_rec() {
        let content = "Write a short recipe for apple cake.";
        let lang = type_router::Language::En;
        let features = features::extract(content, lang);
        let kind = type_router::classify(content).kind;
        let conflicts = contradictions::detect(content, lang);
        let dims = scoring::score_dimensions(&features, &kind, &conflicts);
        let recs = generate(&dims, &kind, &features, &conflicts, lang);
        assert!(
            !recs
                .iter()
                .any(|r| r.contains("Grenzen") || r.contains("boundaries")),
            "benign recipe produced a safety recommendation: {recs:?}"
        );
    }

    #[test]
    fn weak_output_gets_rec() {
        let content = "Summarize the document.";
        let lang = type_router::Language::En;
        let features = features::extract(content, lang);
        let kind = type_router::classify(content).kind;
        let conflicts = contradictions::detect(content, lang);
        let dims = scoring::score_dimensions(&features, &kind, &conflicts);
        let recs = generate(&dims, &kind, &features, &conflicts, lang);
        assert!(
            recs.iter()
                .any(|r| r.contains("Ausgabeformat") || r.contains("output format")),
            "weak output produced no output-format recommendation: {recs:?}"
        );
    }

    #[test]
    fn contradiction_rec_emitted() {
        let content = "Write the response in German. Also translate the response to English.";
        let lang = type_router::Language::En;
        let features = features::extract(content, lang);
        let kind = type_router::classify(content).kind;
        let conflicts = contradictions::detect(content, lang);
        let dims = scoring::score_dimensions(&features, &kind, &conflicts);
        let recs = generate(&dims, &kind, &features, &conflicts, lang);
        assert!(
            recs.iter()
                .any(|r| r.contains("Widerspruch") || r.contains("contradiction")),
            "language conflict produced no contradiction recommendation: {recs:?}"
        );
    }
}
