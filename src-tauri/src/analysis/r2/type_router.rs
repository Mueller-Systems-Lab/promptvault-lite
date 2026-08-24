#![allow(dead_code)]
// pub API consumed by Task Capsule B wiring (quality.rs/hygiene.rs migration M2); keep build clean meanwhile

//! R2 type router (spec §2/§7) — `classify() -> ContentKind`
//! (Guideline|Template|Task(PromptType)), scored guideline/template
//! classification, deterministic language detection, and the shared
//! `is_guideline` / `is_template` sources of truth.
//!
//! Fully offline and deterministic: no LLM, no RNG, no env vars. All compiled
//! regexes use the `cached_regex!` idiom (single `OnceLock` per pattern) to
//! bound per-evaluation overhead on large documents.

use super::lexicons::{
    ACTION_VERBS_DE, ACTION_VERBS_EN, ARTIFACT_NOUNS, COMPOUND_HEADING_SUFFIXES,
    GUIDELINE_HEADINGS, IMPERATIVE_BULLETS_DE, IMPERATIVE_BULLETS_EN, POLICY_TERMS, STOPWORDS_DE,
    STOPWORDS_EN, TEMPLATE_MARKERS,
};
use regex::Regex;

// =============================================================================
// Cached regexes — compiled once via std::sync::OnceLock (MSRV 1.77 compatible;
// idiom mirrored from `analysis::quality.rs`).
// =============================================================================

macro_rules! cached_regex {
    ($fn_name:ident, $pattern:expr) => {
        pub fn $fn_name() -> &'static Regex {
            static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
            RE.get_or_init(|| Regex::new($pattern).unwrap())
        }
    };
}

mod re {
    use super::*;

    /// Alternation over the artifact-noun lexicon, anchored with `\b` and a
    /// trailing `\w*` so stems such as `list` also match "lists"/"listing"
    /// (mirrors the `\w*` fragments in `lexicons.rs`).
    fn artifacts_pattern() -> String {
        format!(r"\b(?:{})\w*", ARTIFACT_NOUNS.join("|"))
    }

    fn template_markers_pattern() -> String {
        TEMPLATE_MARKERS
            .iter()
            .map(|m| m.to_lowercase())
            .collect::<Vec<_>>()
            .join("|")
    }

    fn policy_terms_pattern() -> String {
        POLICY_TERMS
            .iter()
            .map(|t| t.to_lowercase())
            .collect::<Vec<_>>()
            .join("|")
    }

    /// Action-verb stems (DE fragments already carry `\w*`; EN stems get a
    /// uniform `\w*` suffix) for task-imperative sentence detection.
    fn action_verbs_pattern() -> String {
        let stems = ACTION_VERBS_DE
            .iter()
            .chain(ACTION_VERBS_EN.iter())
            .map(|f| format!(r"\b{}", f.trim_end_matches(r"\w*")))
            .collect::<Vec<_>>();
        format!(r"(?:{})\w*", stems.join("|"))
    }

    cached_regex!(action_verbs, &action_verbs_pattern());
    cached_regex!(artifact_noun, &artifacts_pattern());
    cached_regex!(
        generation_verb,
        r"\b(?:write|create|generate|schreib|erstell|generier)\w*"
    );
    cached_regex!(placeholder, r"\{\w+\}");
    cached_regex!(
        labeled_field,
        r"(?im)^\s*[-*]\s*[A-Za-zÄÖÜäöü0-9 ]+:\s*\{\{?\w+\}?\}\s*$"
    );
    // Explicit fill instructions that mark a labeled-field form as a
    // fill-in template even without the literal "template"/"Vorlage" word.
    cached_regex!(
        fill_instruction,
        r"(?i)(fill (every|each)|fülle jedes|füllen sie|write nothing|schreibe nichts|write unknown|schreibe unbekannt|unbekannt)"
    );
    // Modal/rule verbs that turn prose sentences into rule-like statements
    // ("must/should/never", German "soll*/muss*/immer/nie").
    cached_regex!(
        modal_rule,
        r"(?i)\b(must|should|shall|always|never|soll\w*|muss\w*|immer|nie)\b"
    );
    cached_regex!(template_marker, &template_markers_pattern());
    cached_regex!(policy_terms, &policy_terms_pattern());
    cached_regex!(
        translation,
        r"(?:\bübersetz\w*\b|\btranslate\w*\b|ins deutsche|ins englische|to english|to german|into english)"
    );
    cached_regex!(
        summarization,
        r"(?:\bfass\w* zusammen\b|\bsummar\w*\b|kernaussagen|zusammenfassung|three sentences|3 sätze)"
    );
    cached_regex!(
        extraction,
        r"(?:\bextrahier\w*\b|\bextract\w*\b|\bentnimm\w*\b|pull out|extrahiere|\blist\w*\b|\bidentif\w*\b|\bfind\w*\b|\breturn\w*\b|\benumerat\w*\b|\bcollect\w*\b|\bselect\w*\b|\bretriev\w*\b|\bshow\w*\b|\boutput\w*\b|\bliste\w*\b|\bidentifizier\w*\b|\bfinde\w*\b|\bgib\w*\b|\bnenn\w*\b|\bermittel\w*\b|\bzeig\w*\b)"
    );
    cached_regex!(
        classification,
        r"(?:\bklassifizier\w*\b|\bclassify\w*\b|\bkategorisier\w*\b|\blabel\w*\b|\bkategorisiere\b)"
    );
    cached_regex!(
        transformation,
        r"(?:\bkonvertier\w*\b|\bconvert\w*\b|\brewrit\w*\b|\brefactor\w*\b|\brename\w*\b|\bnormalize\w*\b|\bübertrag\w*\b|\btransform\w*\b)"
    );
    cached_regex!(
        planning,
        r"(?:\bplan\w*\b|roadmap|migration plan|rollback plan|schritte|step-by-step plan)"
    );
    cached_regex!(
        analysis,
        r"(?:\banalys\w*\b|\banalyz\w*\b|\breview\w*\b|\bprüf\w*\b|\buntersuche\w*\b|\binspect\w*\b|\baudit\w*\b)"
    );
    cached_regex!(
        coding,
        r"(?:\bcode\w*\b|\bfunction\w*\b|\bscript\w*\b|\bimplement\w*\b|\bprogramm\w*\b|\bpython\b|\brust\b|\btypescript\b|\bjavascript\b|\bfunktion\w*\b|write a function)"
    );
    cached_regex!(
        agentworkflow,
        r"(?:\bagent\w*\b|\bautomate\w*\b|\bworkflow\w*\b|\bautonom\w*\b|\bschleife\w*\b|\bloop\w*\b|execute sequentially|multi-step)"
    );
}

/// High-level prompt category resolved by [`classify`].
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum PromptType {
    Translation,
    Summarization,
    Extraction,
    Classification,
    Transformation,
    Generation,
    Planning,
    Analysis,
    Coding,
    AgentWorkflow,
    GeneralTask,
}

impl PromptType {
    /// Human-readable label (e.g. for UI / evidence output).
    pub fn label(&self) -> &'static str {
        match self {
            PromptType::Translation => "Translation",
            PromptType::Summarization => "Summarization",
            PromptType::Extraction => "Extraction",
            PromptType::Classification => "Classification",
            PromptType::Transformation => "Transformation",
            PromptType::Generation => "Generation",
            PromptType::Planning => "Planning",
            PromptType::Analysis => "Analysis",
            PromptType::Coding => "Coding",
            PromptType::AgentWorkflow => "Agent Workflow",
            PromptType::GeneralTask => "General Task",
        }
    }
}

/// What the prompt content is: a constraint block, a fill-in form, or a task.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ContentKind {
    Guideline,
    Template,
    Task(PromptType),
}

/// Detected language of the prompt content.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Language {
    De,
    En,
    Mixed,
}

/// Result of [`classify`]: kind, detected language and a deterministic
/// confidence in `[0.0, 1.0]`.
#[derive(Debug, Clone, PartialEq)]
pub struct Classification {
    pub kind: ContentKind,
    pub language: Language,
    pub confidence: f64,
}

/// Detect the dominant language via stopword presence (mirrors the
/// `is_german` detection block in `quality.rs`; each stopword counts at most
/// once). Ties resolve to [`Language::Mixed`].
pub fn detect_language(content: &str) -> Language {
    let lower = content.to_lowercase();
    let de_count = STOPWORDS_DE.iter().filter(|w| lower.contains(**w)).count();
    let en_count = STOPWORDS_EN.iter().filter(|w| lower.contains(**w)).count();
    if de_count > en_count {
        Language::De
    } else if en_count > de_count {
        Language::En
    } else {
        Language::Mixed
    }
}

/// Split content into rough sentences (periods, sentence-end punctuation,
/// semicolons and newlines). Used for the negative control and for the
/// generation "verb + artifact noun in same sentence" rule.
fn sentences(content: &str) -> Vec<&str> {
    content
        .split(['.', '!', '?', ';', '\n'])
        .map(|s| s.trim())
        .filter(|s| !s.is_empty())
        .collect()
}

/// Split a line into an optional list marker ("- ", "* ", "1. ") and the
/// remainder. Marker-only lines yield `None` so they are never imperative.
fn split_list_marker(line: &str) -> Option<(&str, &str)> {
    for marker in ["- ", "* "] {
        if let Some(rest) = line.strip_prefix(marker) {
            return Some((marker, rest));
        }
    }
    let bytes = line.as_bytes();
    let mut i = 0;
    while i < bytes.len() && bytes[i].is_ascii_digit() {
        i += 1;
    }
    if i == 0 || i >= bytes.len() {
        return None;
    }
    if bytes[i] == b'.' || bytes[i] == b')' {
        let mut j = i + 1;
        while j < bytes.len() && bytes[j] == b' ' {
            j += 1;
        }
        let rest = &line[j..];
        if rest.is_empty() {
            return None;
        }
        return Some((&line[..j], rest));
    }
    None
}

/// True if `lower_text` starts with `opener` (case-insensitive) at a word
/// boundary. Multi-word openers such as "Stelle sicher" / "Do not" are matched
/// whole, so "Stelle sicherstellen" does NOT match "Stelle sicher".
fn imperative_opener_match(lower_text: &str, opener: &str) -> bool {
    let o = opener.to_lowercase();
    if !lower_text.starts_with(&o) {
        return false;
    }
    let after = &lower_text[o.len()..];
    after.is_empty()
        || !after
            .chars()
            .next()
            .expect("non-empty after slice")
            .is_alphanumeric()
}

/// True if a (trimmed) line begins with an imperative bullet opener.
fn is_imperative_start(text: &str) -> bool {
    let lower = text.to_lowercase();
    IMPERATIVE_BULLETS_DE
        .iter()
        .chain(IMPERATIVE_BULLETS_EN.iter())
        .any(|opener| imperative_opener_match(&lower, opener))
}

/// True if a heading (already stripped of `#`) ends with one of the compound
/// heading suffixes, e.g. "Schreibstil", "Arbeitsrichtlinie", "Antwort-Stil",
/// "Naming Rules", "Code Style".
fn is_compound_heading(heading: &str) -> bool {
    let h = heading.to_lowercase();
    COMPOUND_HEADING_SUFFIXES.iter().any(|suffix| {
        let s = suffix.trim_start_matches('-').to_lowercase();
        h.ends_with(&s)
    })
}

/// True if `h` (heading text with the first `#` stripped, trimmed) is a
/// canonical guideline heading:
/// - first word in `GUIDELINE_HEADINGS` (existing rule, e.g. "# Rules"), or
/// - for a genuine H1 heading, last word in `GUIDELINE_HEADINGS` — this is
///   what catches single-heading policies such as "# Commit Message Policy"
///   whose term appears at the END of the heading ("… Policy").
fn heading_guideline_match(h: &str, is_h1: bool) -> bool {
    let lower = h.to_lowercase();
    let mut words = lower.split_whitespace();
    if let Some(first) = words.next() {
        if GUIDELINE_HEADINGS.iter().any(|g| g.to_lowercase() == first) {
            return true;
        }
    }
    is_h1
        && lower
            .split_whitespace()
            .last()
            .map(|last| GUIDELINE_HEADINGS.iter().any(|g| g.to_lowercase() == last))
            .unwrap_or(false)
}

/// Score the Generation type: count sentences that contain a generation verb
/// AND an artifact noun (spec §2/§7).
fn generation_score(content: &str) -> usize {
    sentences(content)
        .iter()
        .filter(|s| re::generation_verb().is_match(s) && re::artifact_noun().is_match(s))
        .count()
}

/// Deterministic, LLM-free router. See module docs and spec §2/§7 for the
/// scoring rules (guideline score, template score, task-type argmax).
pub fn classify(content: &str) -> Classification {
    let language = detect_language(content);
    let lower = content.to_lowercase();

    // --- Guideline scoring -------------------------------------------------
    let mut guideline_score = 0.0f64;
    let mut heading_count = 0usize;
    let mut imperative_bullet_lines = 0usize;
    let mut has_guideline_heading = false;

    for line in content.lines() {
        let t = line.trim();
        let Some(heading) = t.strip_prefix('#') else {
            continue;
        };
        let h = heading.trim();
        if h.is_empty() {
            continue;
        }
        heading_count += 1;
        // Genuine H1 heading: exactly one leading '#' followed by a space
        // (e.g. "# Commit Message Policy"). "## …" sections keep the legacy
        // first-word-only semantics.
        let is_h1 = t.starts_with("# ") && !t.starts_with("## ");
        if heading_guideline_match(h, is_h1) {
            guideline_score += 1.0;
            has_guideline_heading = true;
        }
        if is_compound_heading(h) {
            guideline_score += 0.8;
        }
    }

    for line in content.lines() {
        let t = line.trim();
        if t.is_empty() {
            continue;
        }
        if let Some((_marker, rest)) = split_list_marker(t) {
            if is_imperative_start(rest) {
                guideline_score += 0.6;
                imperative_bullet_lines += 1;
            }
        } else if is_imperative_start(t) {
            // Plain sentence start (non-bullet) with an imperative opener
            // followed by more text, e.g. "Antworte höflich."
            let first = t.split_whitespace().next().unwrap_or("");
            if !first.is_empty() && t.len() > first.len() {
                guideline_score += 0.6;
            }
        }
    }

    let policy_count = re::policy_terms().find_iter(&lower).count();
    guideline_score += (policy_count as f64 * 0.5).min(1.0);

    // --- Modal-rule sentence detector (single-heading policies) ------------
    // Rule-like prose under a canonical guideline heading ("# X Policy",
    // "# Rules", …) contributes like an imperative bullet. Gated on the
    // presence of a guideline heading so structured task specs
    // ("## Goal / ## Procedure / ## Quality requirements", as in the
    // security-audit and migration-plan cases) are NOT promoted to
    // guidelines by incidental "must"/"should" language. The negative
    // control ("Verwende aktive Formulierungen, …") has no modal verbs and
    // no heading, so it never contributes here.
    if has_guideline_heading {
        let modal_rule_sentences = sentences(content)
            .iter()
            .filter(|s| re::modal_rule().is_match(s))
            .count();
        guideline_score += modal_rule_sentences as f64 * 0.6;
    }

    // --- Natural-language guideline fallback (R2.2) -----------------------
    // 3+ imperative bullets without a heading and without placeholders
    // imply a guideline even when no canonical heading was detected —
    // covers "Leitfaden für E-Mail-Kommunikation" etc. Without headings
    // the base score is 3*0.6=1.8, so add 1.5 to cross the 2.0 threshold.
    // Keep the dominated check below.
    {
        let placeholder_present =
            re::placeholder().is_match(content) || lower.contains('{') || lower.contains("{{");
        if guideline_score < 2.0
            && imperative_bullet_lines >= 3
            && heading_count == 0
            && !placeholder_present
        {
            guideline_score += 1.5;
        }
    }

    // --- Negative control (dominance check) --------------------------------
    // "Verwende aktive Formulierungen, wenn du den Bericht schreibst." must
    // NOT route as a guideline even though it looks imperative.
    let task_imperative_sentences = sentences(content)
        .iter()
        .filter(|s| re::action_verbs().is_match(s))
        .count();
    let dominated = guideline_score >= 2.0
        && task_imperative_sentences == 1
        && heading_count == 0
        && imperative_bullet_lines <= 1;

    if guideline_score >= 2.0 && !dominated {
        return Classification {
            kind: ContentKind::Guideline,
            language,
            confidence: (guideline_score / 4.0).min(1.0),
        };
    }

    // --- Template detection -------------------------------------------------
    let placeholder_count = re::placeholder().find_iter(content).count();
    let non_empty_lines = content.lines().filter(|l| !l.trim().is_empty()).count();
    let placeholder_density = placeholder_count as f64 / non_empty_lines.max(1) as f64;
    let labeled_field_lines = re::labeled_field().find_iter(content).count();
    let template_marker_hit = re::template_marker().is_match(&lower);

    let template_score = (placeholder_density >= 0.3) as u8
        + template_marker_hit as u8
        + (labeled_field_lines >= 3) as u8;

    // Labeled fill-in form (>= 2 labeled lines with placeholders) plus an
    // explicit fill instruction is a Template even without the literal
    // "template"/"Vorlage" marker — covers German/English field templates.
    //
    // NOTE: the density-based `template_score` requires >= 3 labeled fields
    // (not 2). A thin 2-field form with neither a fill instruction nor a
    // template marker stays a Task; genuine templates carry >= 3 fields, a
    // marker, or a fill instruction, and the fill-form rule above (>= 2
    // fields) covers the spec'd labeled-field template signal.
    let fill_instruction_hit = re::fill_instruction().is_match(&lower);
    let template_by_fill_form = labeled_field_lines >= 2 && fill_instruction_hit;

    if (template_score >= 2 || template_by_fill_form) && guideline_score < 2.0 {
        return Classification {
            kind: ContentKind::Template,
            language,
            confidence: (template_score as f64 / 3.0).min(1.0),
        };
    }

    // --- Task type scoring --------------------------------------------------
    let scores: Vec<(PromptType, usize)> = vec![
        (
            PromptType::Translation,
            re::translation().find_iter(&lower).count(),
        ),
        (
            PromptType::Summarization,
            re::summarization().find_iter(&lower).count(),
        ),
        (
            PromptType::Extraction,
            re::extraction().find_iter(&lower).count(),
        ),
        (
            PromptType::Classification,
            re::classification().find_iter(&lower).count(),
        ),
        (
            PromptType::Transformation,
            re::transformation().find_iter(&lower).count(),
        ),
        (PromptType::Generation, generation_score(content)),
        (
            PromptType::Planning,
            re::planning().find_iter(&lower).count(),
        ),
        (
            PromptType::Analysis,
            re::analysis().find_iter(&lower).count(),
        ),
        (PromptType::Coding, re::coding().find_iter(&lower).count()),
        (
            PromptType::AgentWorkflow,
            re::agentworkflow().find_iter(&lower).count(),
        ),
    ];

    let mut vals: Vec<usize> = scores.iter().map(|(_, s)| *s).collect();
    vals.sort_unstable_by(|a, b| b.cmp(a));
    let top = vals[0];
    let second = *vals.get(1).unwrap_or(&0);

    let unique_max = scores.iter().filter(|(_, s)| *s == top).count();
    let kind = if top > 0 && unique_max == 1 {
        scores
            .iter()
            .find(|(_, s)| *s == top)
            .map(|(t, _)| *t)
            .unwrap_or(PromptType::GeneralTask)
    } else {
        PromptType::GeneralTask
    };

    let confidence = if top > 0 {
        (0.5 + (top - second) as f64 / (top as f64).max(1.0)).min(1.0)
    } else {
        0.3
    };

    Classification {
        kind: ContentKind::Task(kind),
        language,
        confidence,
    }
}

/// Single source of truth for guideline routing (spec §7).
pub fn is_guideline(content: &str) -> bool {
    matches!(classify(content).kind, ContentKind::Guideline)
}

/// Single source of truth for template routing.
pub fn is_template(content: &str) -> bool {
    matches!(classify(content).kind, ContentKind::Template)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn de_compound_headings_route() {
        let content = "# Schreibstil\n- Verwende aktive Formulierungen.\n- Vermeide Füllwörter.";
        assert!(is_guideline(content));
    }

    #[test]
    fn de_arbeitsrichtlinie_routes() {
        let content = "# Arbeitsrichtlinie\n- Beginne pünktlich.\n- Melde Probleme früh.\n\n# Antwort-Stil\n- Antworte höflich.\n- Bleibe beim Thema.";
        assert!(is_guideline(content));
    }

    #[test]
    fn en_guidelines_route() {
        let content = "# Documentation Guidelines\n\n- Keep sentences short.\n- Use active voice.\n- Always include an example.\n\n# Code Style\n\n- Use 2-space indentation.\n- Name variables descriptively.";
        assert!(is_guideline(content));
    }

    #[test]
    fn single_task_imperative_not_guideline() {
        let content = "Verwende aktive Formulierungen, wenn du den Bericht schreibst.";
        assert!(!is_guideline(content));
    }

    #[test]
    fn template_with_labeled_fields() {
        let content = "# Defect Report Template\n- Browser: {BROWSER}\n- Steps to reproduce: {STEPS}\n- Expected: {EXPECTED}\n- Actual: {ACTUAL}\n\nFill each section. If a section has no content, write NOTHING.";
        assert!(is_template(content));
    }

    #[test]
    fn plain_translation_task() {
        let content = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
        match classify(content).kind {
            ContentKind::Task(PromptType::Translation) => {}
            other => panic!("expected Task(Translation), got {:?}", other),
        }
    }

    #[test]
    fn language_detection() {
        let de = "Das ist ein Beispiel für einen Bericht. Du sollst den Bericht schreiben und du sollst die Regeln beachten.";
        let en = "The document describes the task. Please translate it and provide a summary of the key points.";
        assert_eq!(detect_language(de), Language::De);
        assert_eq!(detect_language(en), Language::En);
    }

    #[test]
    fn de_template_with_fill_instruction_routes() {
        // Labeled fields (double braces) + German fill instruction, no
        // literal "template"/"Vorlage" word.
        let content = "# Statusbericht\n\n- Woche: {{woche}}\n- Projekt: {{projekt}}\n- Fortschritt: {{fortschritt}}\n- Probleme: {{probleme}}\n\nFülle jedes Feld. Falls ein Feld leer ist, schreibe NICHTS.";
        assert!(is_template(content));
    }

    #[test]
    fn de_template_with_fill_instruction_variants_route() {
        // Retrospektive (Fülle jeden … + schreibe NICHTS) and
        // Kunden-Onboarding (Ergänze alle Abschnitte … mit NICHTS) shapes.
        let retro = "# Retrospektive\n\n- Sprint: {{sprint_name}}\n- Datum: {{retro_datum}}\n- Moderator: {{moderator}}\n\n## Was gut lief\n{{gut_gelaufen}}\n\n## Was wir ändern wollen\n{{aenderungen}}\n\nFülle jeden Abschnitt. Hat ein Abschnitt keinen Inhalt, schreibe NICHTS.";
        assert!(is_template(retro));
        let onboarding = "# Kunden-Onboarding\n\n- Kunde: {{kundenname}}\n- Ansprechpartner: {{ansprechpartner}}\n- Startdatum: {{startdatum}}\n\n## Offene Punkte\n{{offene_punkte}}\n\nErgänze alle Abschnitte. Leere Felder füllst du mit NICHTS aus.";
        assert!(is_template(onboarding));
    }

    #[test]
    fn en_template_with_double_brace_fields_routes() {
        // A labeled-field template with double-brace fields + a "Complete
        // each block. Unfilled blocks are marked with NOTHING." instruction
        // routes Template without the literal "template" word.
        let content = "# Feature Kickoff\n\n- Feature: {{feature_title}}\n- Product lead: {{product_lead}}\n- Target release: {{release_version}}\n\n## Problem Statement\n{{problem_statement}}\n\n## Success Criteria\n{{success_criteria}}\n\n## Scope\nIn scope: {{in_scope}}\nOut of scope: {{out_of_scope}}\n\n## Unknowns\n{{unknowns}}\n\nComplete each block. Unfilled blocks are marked with NOTHING.";
        assert!(is_template(content));
    }

    #[test]
    fn double_brace_labeled_fields_are_counted() {
        let fields = "- Woche: {{woche}}\n- Projekt: {{projekt}}\n- Fortschritt: {{fortschritt}}\n- Probleme: {{probleme}}";
        assert_eq!(re::labeled_field().find_iter(fields).count(), 4);
        // Single-brace legacy form must keep counting too.
        let single = "- Environment: {ENVIRONMENT}\n- Steps to reproduce: {STEPS}";
        assert_eq!(re::labeled_field().find_iter(single).count(), 2);
    }

    #[test]
    fn thin_two_field_form_without_fill_instruction_stays_task() {
        // A thin two-field form without a fill instruction is a Task, not a
        // Template: only 2 labeled fields, no fill instruction, no template
        // marker.
        let content = "# Monatsbericht\n\nSchreibe einen Monatsbericht über die Fortschritte. Erwähne die wichtigsten Punkte und Probleme. Der Bericht ist für das Team.\n\n- Woche: {{woche}}\n- Projekt: {{projekt}}";
        assert!(!is_template(content));
    }

    #[test]
    fn single_heading_policy_with_modal_rules_routes() {
        // "# Commit Message Policy" (canonical H1 heading, "Policy" last
        // word) + three modal-rule sentences: 1.0 + 3 * 0.6 = 2.8.
        let content = "# Commit Message Policy\n\nCommit messages must describe what changed and why. Each commit message should be atomic. Never mix unrelated changes.";
        assert!(is_guideline(content));
    }

    #[test]
    fn single_heading_policy_modal_prose_routes() {
        // Policy-heading + modal rule sentences: heading + two modal
        // sentences (must / Never) plus imperative bullets -> guideline.
        let content = "# Incident Response Policy\n\nEvery incident must be classified by impact and severity. Each response step has an owner and a deadline. Reference the ticket number in every update. Do not post unverified details to shared channels. Never destroy forensic evidence before sign-off. Mark any incomplete follow-up in the footer. Combine related changes before merging.";
        assert!(is_guideline(content));
    }

    #[test]
    fn structured_task_spec_with_modals_stays_task() {
        // Regression guard: a structured task spec with "## Goal/Procedure/
        // Quality requirements" headings and incidental modal language must
        // NOT be promoted to a guideline by the modal-rule detector.
        let content = "## Goal\nDesign a rollback-safe migration plan for moving {TABLE_NAME} from the legacy schema to the new one.\n\n## Input\n- Table: {TABLE_NAME}\n- Target schema: {MIGRATION_SPEC}\n\n## Procedure\n1. Compare old and new columns.\n2. Specify the rollback procedure.\n\n## Quality requirements\n- Every transformation must be reversible.\n\n## Constraints\n- Do not generate DDL that drops data before validation.";
        assert!(!is_guideline(content));
        assert!(!is_template(content));
    }
}
