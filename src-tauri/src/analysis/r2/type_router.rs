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
        r"(?i)^\s*[-*]\s*[A-Za-zÄÖÜäöü0-9 ]+:\s*\{\w+\}\s*$"
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
        r"(?:\bextrahier\w*\b|\bextract\w*\b|\bentnimm\w*\b|pull out|extrahiere)"
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
        let first_word = h.split_whitespace().next().unwrap_or("").to_lowercase();
        if GUIDELINE_HEADINGS
            .iter()
            .any(|g| g.to_lowercase() == first_word)
        {
            guideline_score += 1.0;
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
        + (labeled_field_lines >= 2) as u8;

    if template_score >= 2 && guideline_score < 2.0 {
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
        let content = "# Bug Report Template\n- Environment: {ENVIRONMENT}\n- Steps to reproduce: {STEPS}\n- Expected: {EXPECTED}\n- Actual: {ACTUAL}\n\nFill each section. If a section has no content, write NOTHING.";
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
}
