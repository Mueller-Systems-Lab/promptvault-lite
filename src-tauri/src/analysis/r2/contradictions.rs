//! R2 contradiction model (spec §2/§8) — mandate extraction, C1..C8 conflict
//! classes, and the capped `conflict_weight`. Deterministic and offline.
//!
//! Pipeline: `extract_mandates` -> same-topic + opposite-polarity pairing ->
//! per-topic conflict classes -> `conflict_weight` (sum, capped at 12).
//!
//! Conservative gates (spec §8):
//! - Only SAME-topic + OPPOSITE-polarity mandate pairs are penalized.
//! - Ambiguous (double-negated) mandates carry polarity `0` and are never
//!   paired (unambiguous-polarity gate).
//! - C8 intent-contrast (`procedure_order`, `budget`) additionally requires
//!   the SAME paragraph; all other topics may fire across paragraphs.
//! - Single-pair-per-topic cap: each topic contributes at most one conflict
//!   (a fired C2 multi-format conflict counts as the `format` topic's one).
//! - Total `conflict_weight` is capped at 12.
//!
//! Two documented internal supplements keep the detector honest on phrasings
//! the closed lexicons do not carry verbatim (the acceptance suite exercises
//! them): imperative-verb supplements ("Output"/"Answer"/"Translate",
//! plus "Veröffentliche"/"Publish" so a secrecy "public" mandate is a
//! mandate), a "none" negator for negative question-scope mandates, and
//! paraphrase triggers for `output_data` / `question_scope`. The `language`
//! topic is resolved FIRST, before the generic TOPIC_TABLE scan, so a
//! sentence that names a language is always a language mandate even when it
//! also carries a TOPIC_TABLE lexeme such as "text" (which would otherwise
//! route it to the format topic). `lexicons.rs` TOPIC_TABLE carries the
//! canonical DE/EN language trigger terms.
//!
//! Same-polarity-different-target conflicts: the C1 language logic — same
//! topic, DIFFERENT demanded values, both mandates possibly +1 — is extended
//! to `secrecy` ("vertraulich" vs "veröffentliche"), `length` ("kurz" vs
//! "ausführlich") and `tone` ("formal" vs "casual") via [`value_of`] /
//! [`first_differing_value`].
//! A single mandate demanding two different values ("Fasse dich kurz, aber
//! gehe ausführlich ... ein") is self-contradictory too (mirror of the C3
//! numeric-bounds check). `format` gets a CONSERVATIVE pairing: it fires
//! only when two explicit format values sit in SEPARATE mandates that each
//! carry an exclusivity marker ("only"/"nur"/"never"/"nie").
//!
//! Internal "content" topic (C7, class 7 weight 4): negation-antonym pairs
//! over content subjects — "Sprich nie über das Wetter." vs "Beginne jede
//! Antwort mit einer Wetterbemerkung." — resolve via the standard
//! opposite-polarity same-topic pairing once the supplement maps "wetter"/
//! "technisch"/"begriffe"/... to `content`. Clause-level mandate splitting
//! ("Verwende keine technischen Begriffe, erkläre aber alle technischen
//! Details.") turns comma-separated independent directives into separate
//! opposite-polarity mandates.

#![allow(dead_code)] // consumed by Task Capsule B wiring; keep build clean meanwhile

use regex::Regex;

use super::lexicons::{NEGATORS_DE, NEGATORS_EN, TOPIC_TABLE};
use super::type_router::Language;

// =============================================================================
// Cached regexes — compiled once via std::sync::OnceLock (MSRV 1.77 compatible;
// idiom mirrored from `analysis::quality.rs` / `r2::type_router.rs`).
// =============================================================================

macro_rules! cached_regex {
    ($fn_name:ident, $pattern:expr) => {
        pub fn $fn_name() -> &'static Regex {
            static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
            RE.get_or_init(|| Regex::new($pattern).unwrap())
        }
    };
}

/// One emitted contradiction. `class` is the C1..C8 class id, `weight` its
/// severity contribution, `first`/`second` the two conflicting mandates (or
/// descriptive labels for whole-content checks), `confident` the emission
/// confidence (always true — only unambiguous conflicts are emitted).
#[derive(Clone, Debug)]
pub struct Conflict {
    pub class: u8,
    pub weight: u8,
    pub topic: String,
    pub first: String,
    pub second: String,
    pub confident: bool,
}

/// A single extracted imperative/constraint mandate (internal).
///
/// - `polarity`: `+1` positive, `-1` negative, `0` ambiguous (double
///   negation) — never paired.
/// - `topic`: canonical TOPIC_TABLE name (or supplement) or `None`.
/// - `paragraph`: index of the source paragraph (C8 paragraph-scope gate).
/// - `value` (private): target value for value-conflict topics, e.g. the
///   demanded output language ("german" vs "english").
pub struct Mandate {
    pub text: String,
    pub polarity: i8,
    pub topic: Option<String>,
    pub paragraph: usize,
    value: Option<String>,
}

/// Mandate-cap inside `detect` (spec §8): at most 60 mandates are paired.
const MAX_MANDATES: usize = 60;

/// Cap for `conflict_weight` (spec §8).
const WEIGHT_CAP: u16 = 12;

/// Internal conflict topics resolved by the supplement (not present in
/// TOPIC_TABLE) that still participate in pairing: the C7 "content" topic
/// (negation-antonym subjects such as weather/technical terms).
const INTERNAL_CONFLICT_TOPICS: &[&str] = &["content"];

/// Conservative negator supplement: "none" turns "Answer none of the
/// questions." into a negative mandate (required by the acceptance suite).
const NEGATORS_EXTRA: &[&str] = &["none"];

/// Imperative verb openers (DE + EN). Mirrors the spec §8 list plus the
/// output verbs exercised by the acceptance suite ("Answer", "Output",
/// "Translate"). Matched as contained word-boundary phrases, so
/// "Also translate ..." is a mandate while "Translation ..." is not.
const IMPERATIVE_VERBS: &[&str] = &[
    // German (spec §8)
    "Verwende",
    "Achte",
    "Vermeide",
    "Halte",
    "Nutze",
    "Stelle sicher",
    "Erledige",
    "Warte",
    "Überschreite",
    "Fasse",
    "Nenne",
    "Kennzeichne",
    "Prüfe",
    "Melde",
    "Beginne",
    "Sprich",
    "Beantworte",
    "Frage",
    "Definiere",
    "Dokumentiere",
    "Erkläre",
    "Antworte",
    "Gib",
    // German supplements: a secrecy "public" mandate and the language pair
    // of a C1 conflict ("Übersetze alle Antworten ins Englische." must be a
    // mandate for the conflict against "Antworte ... auf Deutsch." to fire
    // — EN "Translate" was already present).
    "Veröffentliche",
    "Übersetze",
    // English (spec §8)
    "Use",
    "Avoid",
    "Ensure",
    "Keep",
    "Apply",
    "Do not",
    "Always",
    "Never",
    "Write",
    "Return",
    // English supplements (acceptance suite)
    "Answer",
    "Output",
    "Translate",
    // English supplement (secrecy "public" mandate, DE/EN symmetry)
    "Publish",
];

/// Language-name lexemes for the `language` topic (value-conflict detection).
/// The closed TOPIC_TABLE only carries "deutsch"/"english" triggers; the
/// acceptance suite requires "in German" to map to the language topic too.
const LANGUAGE_NAMES: &[&str] = &[
    "german",
    "deutsch",
    "englisch",
    "english",
    "spanish",
    "spanisch",
    "french",
    "französisch",
    "italian",
    "italienisch",
];

/// Language-topic trigger terms checked BEFORE the generic TOPIC_TABLE scan
/// (FIX D2): a sentence naming a language is a language mandate even when it
/// also carries a TOPIC_TABLE lexeme such as "text" (which would otherwise
/// route it to the format topic). Mirrors the expanded TOPIC_TABLE language
/// rule in `lexicons.rs` (FIX D1).
const LANGUAGE_TOPIC_TERMS: &[&str] = &[
    "deutsch",
    "german",
    "englisch",
    "english",
    "ins deutsche",
    "ins englische",
    "into german",
    "into english",
    "to german",
    "to english",
    "auf deutsch",
    "auf englisch",
];

/// C4 secrecy demanded values ("confidential" vs "public"), canonical group
/// order. Same-polarity mandates demanding different values are a conflict
/// ("vertraulich" vs "veröffentliche"), mirroring the C1 language logic.
const SECRECY_VALUES: &[(&str, &[&str])] = &[
    (
        "confidential",
        &[
            "vertraulich",
            "geheim",
            "confidential",
            "secret",
            "nicht weitergeben",
            "nicht teilen",
        ],
    ),
    (
        "public",
        &["veröffentlich", "publish", "öffentlich", "public"],
    ),
];

/// C3 length demanded values ("short" vs "long"). "Fasse dich kurz, aber
/// gehe ausführlich auf jedes Detail ein." demands both -> self-conflict.
const LENGTH_VALUES: &[(&str, &[&str])] = &[
    ("short", &["kurz", "prägnant", "short", "brief", "knapp"]),
    (
        "long",
        &[
            "ausführlich",
            "detailliert",
            "lang",
            "long",
            "exhaustive",
            "vollständig",
            "in jedem detail",
            "every detail",
        ],
    ),
];

/// C7 tone demanded values ("formal" vs "casual").
const TONE_VALUES: &[(&str, &[&str])] = &[
    ("formal", &["formell", "sachlich", "formal"]),
    (
        "casual",
        &["casual", "informell", "freundlich", "friendly", "locker"],
    ),
];

/// C2 format demanded values — only explicit format names; the conservative
/// pairing additionally requires an exclusivity marker per mandate.
const FORMAT_VALUES: &[(&str, &[&str])] = &[
    ("json", &["json"]),
    ("csv", &["csv"]),
    ("markdown", &["markdown"]),
    ("plain text", &["plain text"]),
];

/// Supplementary topic triggers (internal, deterministic), consulted only
/// after TOPIC_TABLE misses. Cover paraphrased phrasings the closed table
/// does not carry verbatim but the acceptance suite requires
/// ("Do not output any data", "Answer none of the questions").
const TOPIC_SUPPLEMENT: &[(&str, &[&str])] = &[
    ("language", LANGUAGE_NAMES),
    (
        "output_data",
        &[
            "output any data",
            "do not output",
            "don't output",
            "output no data",
            "keine daten ausgeben",
        ],
    ),
    (
        "question_scope",
        &[
            "answer none",
            "none of the question",
            "do not answer",
            "don't answer",
            "answer no",
            "beantworte keine",
        ],
    ),
    (
        // C7 content subject: negation-antonym pairs such as "Sprich nie
        // über das Wetter." vs "Beginne jede Antwort mit einer
        // Wetterbemerkung." pair via the standard opposite-polarity
        // same-topic mechanism (no values needed).
        "content",
        &[
            "wetter",
            "weather",
            "technisch",
            "technischen",
            "begriffe",
            "terminologie",
            "politik",
            "politics",
            "themen",
            "topics",
            "sport",
        ],
    ),
];

fn negator_pattern() -> String {
    let terms = NEGATORS_DE
        .iter()
        .chain(NEGATORS_EN.iter())
        .chain(NEGATORS_EXTRA.iter())
        .map(|t| regex::escape(t))
        .collect::<Vec<_>>();
    format!(r"(?i)\b(?:{})\b", terms.join("|"))
}

fn imperative_pattern() -> String {
    let terms = IMPERATIVE_VERBS
        .iter()
        .map(|v| regex::escape(v))
        .collect::<Vec<_>>();
    format!(r"(?i)\b(?:{})\b", terms.join("|"))
}

cached_regex!(negator_re, &negator_pattern());
cached_regex!(imperative_re, &imperative_pattern());

// Constraint-signal regex verbatim from spec §8.
cached_regex!(
    constraint_signal_re,
    r"(?i)\b(immer|nie|niemals|sofort|erst|nur|verboten|soll|muss|must|always|never|immediately|only|exactly|at least|at most)\b"
);

// Numeric length-constraint regexes: `exactly 50 words` (Exact),
// `at least 500 words` (Min), `at most 20 words` (Max). Group 1 = label,
// group 2 = value, group 3 = optional unit.
cached_regex!(
    exact_length_re,
    r"(?i)\b(exactly|genau)\s+(\d+)\s*(words?|wörter|worte)?\b"
);
cached_regex!(
    min_length_re,
    r"(?i)\b(at least|mindestens|minimum)\s+(\d+)\s*(words?|wörter|worte)?\b"
);
cached_regex!(
    max_length_re,
    r"(?i)\b(at most|no more than|höchstens|maximum|maximal)\s+(\d+)\s*(words?|wörter|worte)?\b"
);

// Format-exclusivity markers for the conservative C2 per-topic pairing:
// "Return only JSON. Return only CSV." (separate exclusive format mandates)
// is a conflict; "Return JSON and CSV." is left to multi_format_conflict.
cached_regex!(exclusivity_re, r"(?i)\b(?:only|nur|never|nie)\b");

/// Kind of a numeric length constraint.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum LengthKind {
    Exact,
    Min,
    Max,
}

/// Blank-line separated paragraphs (paragraph index = position in this list).
fn paragraphs(content: &str) -> Vec<&str> {
    content
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect()
}

/// Rough sentence split inside a paragraph (on `.`, `!`, `?`, newline).
fn sentences_of(paragraph: &str) -> Vec<&str> {
    paragraph
        .split(['.', '!', '?', '\n'])
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .collect()
}

/// True if the sentence carries an imperative/constraint signal: a negator,
/// a constraint-signal keyword, or an imperative verb (spec §8).
fn is_mandate(lower: &str) -> bool {
    negator_re().is_match(lower)
        || constraint_signal_re().is_match(lower)
        || imperative_re().is_match(lower)
}

/// Polarity from negator count: 0 negators -> +1, 1 -> -1, >= 2 -> 0
/// (ambiguous double negation; never paired — unambiguous-polarity gate).
fn polarity_of(lower: &str) -> i8 {
    match negator_re().find_iter(lower).count() {
        0 => 1,
        1 => -1,
        _ => 0,
    }
}

/// Canonical topic of a sentence: first TOPIC_TABLE hit (de/en term,
/// lowercase containment), then the internal supplement, else `None`.
/// The `language` topic is NOT consulted here — callers check it FIRST via
/// [`is_language_topic`] (FIX D2) so language demands win over TOPIC_TABLE
/// lexeme collisions.
fn topic_of(lower: &str) -> Option<String> {
    for rule in TOPIC_TABLE {
        if rule.name == "language" {
            continue;
        }
        let hit = rule
            .de
            .iter()
            .chain(rule.en.iter())
            .any(|term| lower.contains(*term));
        if hit {
            return Some(rule.name.to_string());
        }
    }
    for (topic, terms) in TOPIC_SUPPLEMENT {
        if terms.iter().any(|t| lower.contains(*t)) {
            return Some((*topic).to_string());
        }
    }
    None
}

/// Language-topic gate, checked before the generic TOPIC_TABLE scan
/// (FIX D2): the sentence names a language (DE or EN, case-insensitive
/// containment of the canonical trigger terms).
fn is_language_topic(lower: &str) -> bool {
    LANGUAGE_TOPIC_TERMS.iter().any(|t| lower.contains(t))
}

/// Demanded output language of a language-topic sentence (FIX D3): "german"
/// when the sentence demands German, "english" when it demands English
/// (checked in that order). Other language names (spanish/french/...) fall
/// back to the first [`LANGUAGE_NAMES`] hit so their value conflicts remain
/// detectable.
fn language_value(lower: &str) -> Option<String> {
    const GERMAN_TERMS: &[&str] = &[
        "deutsch",
        "german",
        "ins deutsche",
        "into german",
        "auf deutsch",
    ];
    const ENGLISH_TERMS: &[&str] = &[
        "englisch",
        "english",
        "ins englische",
        "into english",
        "auf englisch",
    ];
    if GERMAN_TERMS.iter().any(|t| lower.contains(t)) {
        Some("german".to_string())
    } else if ENGLISH_TERMS.iter().any(|t| lower.contains(t)) {
        Some("english".to_string())
    } else {
        LANGUAGE_NAMES
            .iter()
            .find(|name| lower.contains(**name))
            .map(|name| name.to_string())
    }
}

/// Distinct demanded-value groups of a value-conflict topic present in
/// `lower`, in canonical group order, each paired with its first matched
/// trigger term (used for readable conflict messages). Topics without values
/// ("content", "media", ...) return an empty vec.
fn value_hits(lower: &str, topic: &str) -> Vec<(&'static str, &'static str)> {
    let groups: &[(&str, &[&str])] = match topic {
        "secrecy" => SECRECY_VALUES,
        "length" => LENGTH_VALUES,
        "tone" => TONE_VALUES,
        "format" => FORMAT_VALUES,
        _ => return Vec::new(),
    };
    groups
        .iter()
        .filter_map(|(label, terms)| {
            terms
                .iter()
                .find(|t| lower.contains(**t))
                .map(|t| (*label, *t))
        })
        .collect()
}

/// Demanded value of a value-conflict topic sentence (first group hit),
/// mirroring [`language_value`]: used for cross-mandate differing-value
/// conflicts via [`first_differing_value`] (secrecy/length/tone/format).
fn value_of(lower: &str, topic: &str) -> Option<String> {
    value_hits(lower, topic)
        .first()
        .map(|(label, _)| label.to_string())
}

/// Independent clause-mandates of a sentence: when EVERY comma-separated
/// clause carries its own imperative/constraint signal, each clause is
/// emitted as its own mandate ("Verwende keine technischen Begriffe, erkläre
/// aber alle technischen Details." -> a -1 content mandate and a +1 content
/// mandate). Otherwise the whole sentence stays one mandate (a comma list
/// such as "Return JSON, Markdown, and CSV" is a single format mandate).
fn mandate_clauses(sentence: &str) -> Vec<&str> {
    let clauses: Vec<&str> = sentence
        .split(',')
        .map(str::trim)
        .filter(|c| !c.is_empty())
        .collect();
    if clauses.len() >= 2 && clauses.iter().all(|c| is_mandate(&c.to_lowercase())) {
        clauses
    } else {
        vec![sentence]
    }
}

/// Extract mandates from the content (spec §8).
///
/// Split into paragraphs (blank-line separated, index tracked), then into
/// sentences; a sentence (or a comma-clause when every clause is an
/// independent mandate) is a mandate when it contains an imperative or
/// constraint signal. Polarity is negator-derived with the double-negation
/// gate. Topic: the LANGUAGE gate is checked FIRST (FIX D2), then the generic
/// TOPIC_TABLE (minus the language rule), then the internal supplement.
pub fn extract_mandates(content: &str) -> Vec<Mandate> {
    let mut out = Vec::new();
    for (paragraph_idx, paragraph) in paragraphs(content).into_iter().enumerate() {
        for sentence in sentences_of(paragraph) {
            for clause in mandate_clauses(sentence) {
                let lower = clause.to_lowercase();
                if !is_mandate(&lower) {
                    continue;
                }
                let topic = if is_language_topic(&lower) {
                    Some("language".to_string())
                } else {
                    topic_of(&lower)
                };
                let value = match topic.as_deref() {
                    Some("language") => language_value(&lower),
                    Some(t) if matches!(t, "secrecy" | "length" | "tone" | "format") => {
                        value_of(&lower, t)
                    }
                    _ => None,
                };
                out.push(Mandate {
                    text: clause.to_string(),
                    polarity: polarity_of(&lower),
                    topic,
                    paragraph: paragraph_idx,
                    value,
                });
            }
        }
    }
    out
}

/// C1..C8 class + weight per topic (spec §8). `None` for unknown topics.
fn class_and_weight(topic: &str) -> Option<(u8, u8)> {
    match topic {
        "language" => Some((1, 6)),
        "output_data" => Some((6, 6)),
        "format" => Some((2, 4)),
        "secrecy" => Some((4, 4)),
        "question_scope" => Some((5, 4)),
        "length" => Some((3, 3)),
        "media" | "tone" | "quality" | "content" => Some((7, 4)),
        "procedure_order" | "budget" => Some((8, 4)),
        _ => None,
    }
}

fn make_conflict(class: u8, weight: u8, topic: &str, first: &str, second: &str) -> Conflict {
    Conflict {
        class,
        weight,
        topic: topic.to_string(),
        first: first.to_string(),
        second: second.to_string(),
        confident: true,
    }
}

fn make_pair_conflict(class: u8, weight: u8, topic: &str, a: &Mandate, b: &Mandate) -> Conflict {
    make_conflict(class, weight, topic, &a.text, &b.text)
}

/// First same-topic mandate pair (i < j) with opposite polarity. When
/// `same_paragraph` is set (C8), both mandates must share the paragraph.
fn first_opposite_pair<'a>(
    mandates: &[&'a Mandate],
    same_paragraph: bool,
) -> Option<(&'a Mandate, &'a Mandate)> {
    for i in 0..mandates.len() {
        for j in (i + 1)..mandates.len() {
            let same_scope = !same_paragraph || mandates[i].paragraph == mandates[j].paragraph;
            if same_scope && mandates[i].polarity != mandates[j].polarity {
                return Some((mandates[i], mandates[j]));
            }
        }
    }
    None
}

/// First pair of language mandates demanding DIFFERENT target languages
/// (e.g. "Write ... in German" vs "translate ... to English").
fn first_differing_value<'a>(mandates: &[&'a Mandate]) -> Option<(&'a Mandate, &'a Mandate)> {
    for i in 0..mandates.len() {
        for j in (i + 1)..mandates.len() {
            if let (Some(va), Some(vb)) =
                (mandates[i].value.as_deref(), mandates[j].value.as_deref())
            {
                if va != vb {
                    return Some((mandates[i], mandates[j]));
                }
            }
        }
    }
    None
}

/// Order a differing-value language pair so the German-demanding mandate is
/// always `first` and the English-demanding one `second` (FIX D3: "first =
/// the German sentence, second = the English sentence"). Pairs without a
/// German/English value keep their appearance order.
fn german_first<'a>(a: &'a Mandate, b: &'a Mandate) -> (&'a Mandate, &'a Mandate) {
    let a_de = a.value.as_deref() == Some("german");
    let b_de = b.value.as_deref() == Some("german");
    if b_de && !a_de {
        (b, a)
    } else {
        (a, b)
    }
}

/// Numeric length constraints of a sentence in appearance order:
/// `(start, kind, value, matched_phrase)`.
fn length_constraints(text: &str) -> Vec<(usize, LengthKind, u64, String)> {
    let mut out = Vec::new();
    for (re, kind) in [
        (exact_length_re(), LengthKind::Exact),
        (min_length_re(), LengthKind::Min),
        (max_length_re(), LengthKind::Max),
    ] {
        for caps in re.captures_iter(text) {
            let m = caps.get(0).expect("full match");
            let value = caps
                .get(2)
                .and_then(|g| g.as_str().parse::<u64>().ok())
                .unwrap_or(0);
            out.push((m.start(), kind, value, m.as_str().to_string()));
        }
    }
    out.sort_by_key(|(start, ..)| *start);
    out
}

/// "exactly N words" vs "at least/at most M words" contradiction within one
/// sentence: Exact(N) paired with Min(M>N), Max(M<N), or Min > Max. Returns
/// the two constraint phrases in appearance order.
fn conflicting_length_bounds(text: &str) -> Option<(String, String)> {
    let cs = length_constraints(text);
    for i in 0..cs.len() {
        for j in (i + 1)..cs.len() {
            let (_, ki, vi, si) = &cs[i];
            let (_, kj, vj, sj) = &cs[j];
            let contradiction = match (ki, kj) {
                (LengthKind::Exact, LengthKind::Min) => vj > vi,
                (LengthKind::Min, LengthKind::Exact) => vi > vj,
                (LengthKind::Exact, LengthKind::Max) => vj < vi,
                (LengthKind::Max, LengthKind::Exact) => vi < vj,
                (LengthKind::Min, LengthKind::Max) => vi > vj,
                (LengthKind::Max, LengthKind::Min) => vj > vi,
                _ => false,
            };
            if contradiction {
                return Some((si.clone(), sj.clone()));
            }
        }
    }
    None
}

/// Conservative C2 per-topic format pairing: two SEPARATE mandates that each
/// demand a concrete format AND carry an exclusivity marker ("only"/"nur"/
/// "never"/"nie") with DIFFERENT values ("Return only JSON. Return only
/// CSV."). Anything less explicit is left to [`multi_format_conflict`].
fn format_exclusive_pair<'a>(ms: &[&'a Mandate]) -> Option<(&'a Mandate, &'a Mandate)> {
    let marked: Vec<&'a Mandate> = ms
        .iter()
        .copied()
        .filter(|m| m.value.is_some() && exclusivity_re().is_match(&m.text))
        .collect();
    for i in 0..marked.len() {
        for j in (i + 1)..marked.len() {
            if marked[i].value != marked[j].value {
                return Some((marked[i], marked[j]));
            }
        }
    }
    None
}

/// At most ONE conflict per topic: first the topic's value/numeric special
/// checks, then the opposite-polarity pair (C8 requires the same paragraph).
fn conflict_for_topic(topic: &str, mandates: &[Mandate]) -> Option<Conflict> {
    let (class, weight) = class_and_weight(topic)?;
    let ms: Vec<&Mandate> = mandates
        .iter()
        .filter(|m| m.topic.as_deref() == Some(topic) && m.polarity != 0)
        .collect();
    if ms.is_empty() {
        return None;
    }

    // C1 language: different target languages are contradictory even without
    // an explicit negator ("Write in German." vs "translate to English.") —
    // both mandates may be +1 polarity with different demanded languages.
    // The German-demanding mandate is presented first (FIX D3).
    if topic == "language" {
        if let Some((a, b)) = first_differing_value(&ms) {
            let (a, b) = german_first(a, b);
            return Some(make_pair_conflict(class, weight, topic, a, b));
        }
    }

    // C3/C4/C7 value topics (length/secrecy/tone): same-topic mandates that
    // demand DIFFERENT values contradict even when both carry the same
    // polarity ("vertraulich" vs "veröffentliche" are two +1 demands),
    // mirroring the C1 language logic. A SINGLE mandate demanding two
    // different values ("Fasse dich kurz, aber gehe ausführlich ... ein.")
    // is self-contradictory — the numeric-bounds twin of the C3 check.
    if matches!(topic, "length" | "secrecy" | "tone") {
        for m in &ms {
            let hits = value_hits(&m.text.to_lowercase(), topic);
            if hits.len() >= 2 {
                return Some(make_conflict(class, weight, topic, hits[0].1, hits[1].1));
            }
        }
        if let Some((a, b)) = first_differing_value(&ms) {
            return Some(make_pair_conflict(class, weight, topic, a, b));
        }
    }

    // C2 format: conservative exclusivity pairing (separate mandates with an
    // exclusivity marker each); all other format demands stay with the
    // whole-content multi-format check.
    if topic == "format" {
        if let Some((a, b)) = format_exclusive_pair(&ms) {
            return Some(make_pair_conflict(class, weight, topic, a, b));
        }
    }

    // C3 length: a single sentence demanding "exactly N words" AND
    // "at least/at most M words" (M excluding N) is self-contradictory.
    if topic == "length" {
        for m in &ms {
            if let Some((first, second)) = conflicting_length_bounds(&m.text) {
                return Some(make_conflict(class, weight, topic, &first, &second));
            }
        }
    }

    let same_paragraph = matches!(topic, "procedure_order" | "budget");
    if let Some((a, b)) = first_opposite_pair(&ms, same_paragraph) {
        return Some(make_pair_conflict(class, weight, topic, a, b));
    }
    None
}

/// C2 format-exclusivity check over the whole content (spec §8): json AND csv
/// AND markdown demanded in the same paragraph is a standalone class-2
/// weight-4 conflict.
pub fn multi_format_conflict(content: &str) -> Option<Conflict> {
    let lower = content.to_lowercase();
    for paragraph in paragraphs(&lower) {
        if paragraph.contains("json") && paragraph.contains("csv") && paragraph.contains("markdown")
        {
            return Some(make_conflict(
                2,
                4,
                "format",
                "json+csv+markdown",
                "single format expected",
            ));
        }
    }
    None
}

/// Detect contradictions (spec §8). Mandates are capped at 60; each topic
/// contributes at most one conflict; all emitted conflicts are unambiguous.
pub fn detect(content: &str, _lang: Language) -> Vec<Conflict> {
    let mut mandates = extract_mandates(content);
    mandates.truncate(MAX_MANDATES);

    let mut conflicts: Vec<Conflict> = Vec::new();

    // C2 format exclusivity — separate whole-content check (spec §8).
    if let Some(c) = multi_format_conflict(content) {
        conflicts.push(c);
    }

    for rule in TOPIC_TABLE {
        let topic = rule.name;
        // Single-conflict-per-topic cap: a fired multi-format conflict already
        // accounts for the format topic.
        if topic == "format" && conflicts.iter().any(|c| c.topic == "format") {
            continue;
        }
        if let Some(c) = conflict_for_topic(topic, &mandates) {
            conflicts.push(c);
        }
    }

    // Internal supplement topics (C7 "content") that are not TOPIC_TABLE
    // rules still pair through the same single-conflict-per-topic path.
    for topic in INTERNAL_CONFLICT_TOPICS {
        if let Some(c) = conflict_for_topic(topic, &mandates) {
            conflicts.push(c);
        }
    }

    conflicts
}

/// Total conflict weight, capped at 12 (spec §8).
pub fn conflict_weight(conflicts: &[Conflict]) -> u8 {
    let total: u16 = conflicts.iter().map(|c| u16::from(c.weight)).sum();
    total.min(WEIGHT_CAP) as u8
}

#[cfg(test)]
mod tests {
    use super::*;

    const EN: Language = Language::En;

    #[test]
    fn language_conflict() {
        let conflicts = detect(
            "Write the response in German. Also translate the response to English.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 1 && c.weight == 6 && c.topic == "language"),
            "expected C1 language conflict, got {conflicts:?}"
        );
        assert!(conflict_weight(&conflicts) >= 4);
    }

    #[test]
    fn length_conflict() {
        let conflicts = detect(
            "The response must be exactly 50 words long and at least 500 words long.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 3 && c.weight == 3 && c.topic == "length"),
            "expected C3 length conflict, got {conflicts:?}"
        );
        assert!(conflict_weight(&conflicts) >= 3);
    }

    #[test]
    fn output_data_conflict() {
        let conflicts = detect("Output all the data. Do not output any data.", EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 6 && c.weight == 6 && c.topic == "output_data"),
            "expected C6 output-data conflict, got {conflicts:?}"
        );
        assert!(conflict_weight(&conflicts) >= 4);
    }

    #[test]
    fn answer_scope_conflict() {
        let conflicts = detect("Answer all questions. Answer none of the questions.", EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 5 && c.weight == 4 && c.topic == "question_scope"),
            "expected C5 answer-scope conflict, got {conflicts:?}"
        );
        assert!(conflict_weight(&conflicts) >= 4);
    }

    #[test]
    fn format_exclusivity() {
        let conflicts = detect("Return JSON, Markdown, and CSV.", EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 2 && c.weight == 4 && c.topic == "format"),
            "expected C2 multi-format conflict, got {conflicts:?}"
        );
        assert!(conflict_weight(&conflicts) >= 4);
    }

    #[test]
    fn no_false_positive_same_direction() {
        let conflicts = detect("Keep it short. Be concise.", EN);
        assert_eq!(conflict_weight(&conflicts), 0);
    }

    #[test]
    fn different_topics_no_conflict() {
        let conflicts = detect("Answer in German. Keep it short.", EN);
        assert_eq!(conflict_weight(&conflicts), 0);
    }

    #[test]
    fn weight_cap() {
        let content = "Write the response in German. Also translate the response to English. \
                       Output all the data. Do not output any data. \
                       Return JSON, Markdown, and CSV. \
                       Answer all questions. Answer none of the questions. \
                       The response must be exactly 50 words long and at least 500 words long.";
        let conflicts = detect(content, EN);
        assert!(
            conflict_weight(&conflicts) <= 12,
            "weight must be capped at 12, got {:?}",
            conflicts
        );
        assert_eq!(conflict_weight(&conflicts), 12);
    }

    // ---- additional regression coverage ---------------------------------

    #[test]
    fn format_pair_same_topic_opposite_polarity() {
        let conflicts = detect("Return JSON. Do not return JSON.", EN);
        assert!(conflicts.iter().any(|c| c.class == 2 && c.weight == 4));
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn secrecy_conflict() {
        let conflicts = detect("Keep it public. Do not keep it public.", EN);
        assert!(conflicts.iter().any(|c| c.class == 4 && c.weight == 4));
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn tone_conflict() {
        let conflicts = detect("Write formally. Do not write formally.", EN);
        assert!(conflicts.iter().any(|c| c.class == 7 && c.weight == 4));
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn c8_same_paragraph_only() {
        let conflicts = detect("Execute immediately. Do not execute immediately.", EN);
        assert!(conflicts.iter().any(|c| c.class == 8 && c.weight == 4));
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn c8_cross_paragraph_not_paired() {
        let conflicts = detect("Execute immediately.\n\nDo not execute immediately.", EN);
        assert_eq!(conflict_weight(&conflicts), 0);
    }

    #[test]
    fn double_negation_is_ambiguous() {
        let conflicts = detect("Do not output no data.", EN);
        assert_eq!(conflict_weight(&conflicts), 0);
    }

    // ---- same-polarity different-value conflicts -------------------------

    #[test]
    fn secrecy_differing_values_conflict() {
        // Both mandates are +1 polarity but demand different secrecy values.
        let conflicts = detect(
            "Der Bericht muss vertraulich sein. Veröffentliche den Bericht auf der Website.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 4 && c.weight == 4 && c.topic == "secrecy"),
            "expected C4 secrecy value conflict, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn length_differing_values_single_sentence() {
        // One mandate demanding short AND long is self-contradictory.
        let conflicts = detect(
            "Fasse dich kurz, aber gehe ausführlich auf jedes Detail ein.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 3 && c.weight == 3 && c.topic == "length"),
            "expected C3 length value conflict, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 3);
    }

    #[test]
    fn tone_differing_values_single_sentence() {
        let conflicts = detect("Use a formal tone and a casual tone.", EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 7 && c.weight == 4 && c.topic == "tone"),
            "expected C7 tone value conflict, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn content_weather_negation_antonym() {
        // Never mention weather vs begin with a weather remark — opposite
        // polarity, same internal "content" topic.
        let conflicts = detect(
            "Sprich nie über das Wetter. Beginne jede Antwort mit einer Wetterbemerkung.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 7 && c.weight == 4 && c.topic == "content"),
            "expected C7 content conflict, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn content_clause_split_opposite_polarity() {
        // Comma-separated independent directives become separate mandates:
        // "keine technischen Begriffe" (-1) vs "erkläre ... Zusammenhänge" (+1).
        let conflicts = detect(
            "Verwende keine technischen Begriffe, erkläre aber alle technischen Zusammenhänge.",
            EN,
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 7 && c.weight == 4 && c.topic == "content"),
            "expected C7 content conflict from clause split, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn format_exclusive_pair_only() {
        let conflicts = detect("Return only JSON. Return only CSV.", EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 2 && c.weight == 4 && c.topic == "format"),
            "expected C2 exclusive-format conflict, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 4);
    }

    #[test]
    fn format_without_exclusivity_marker_not_paired() {
        // Conservative gate: no "only/nur/never/nie" marker -> multi-format
        // check only; two separate formats stay unpaired.
        let conflicts = detect("Return JSON. Return CSV.", EN);
        assert!(
            !conflicts.iter().any(|c| c.topic == "format"),
            "unmarked format pair must not fire, got {conflicts:?}"
        );
        assert_eq!(conflict_weight(&conflicts), 0);
    }

    #[test]
    fn contradictory_instruction_regression() {
        // A contradictory procedural instruction: secrecy (vertraulich vs
        // veröffentliche) + length (kurz vs ausführlich) must fire so
        // signal_poor (weight >= 4) triggers.
        let content = "Erstelle eine Projektzusammenfassung. Die Zusammenfassung muss vertraulich \
                       sein und nicht weitergegeben werden dürfen. Veröffentliche die Zusammenfassung \
                       außerdem auf der öffentlichen Website. Fasse dich kurz, aber gehe ausführlich auf \
                       jedes Detail ein. Verwende keine technischen Begriffe, erkläre aber alle \
                       technischen Details. Nenne keine Namen, zitiere aber die beteiligten \
                       Personen.";
        let conflicts = detect(content, EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.topic == "secrecy" && c.class == 4),
            "expected C4 secrecy conflict, got {conflicts:?}"
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.topic == "length" && c.class == 3),
            "expected C3 length conflict, got {conflicts:?}"
        );
        assert!(
            conflict_weight(&conflicts) >= 4,
            "conflict_weight must reach signal_poor threshold, got {}",
            conflict_weight(&conflicts)
        );
    }

    #[test]
    fn conflicting_guideline_rules() {
        // Conflicting guideline rules: language (German vs English) plus
        // content (never weather vs begin with weather remark).
        let content = "# Antwortregeln\n\n## Regeln\n1. Antworte immer auf Deutsch.\n2. \
                       Übersetze alle Antworten ins Englische.\n3. Sprich nie über das Wetter.\n4. \
                       Beginne jede Antwort mit einer Wetterbemerkung.\n5. Halte Antworten unter \
                       10 Wörtern.\n6. Beantworte jede Frage vollständig.";
        let conflicts = detect(content, EN);
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 1 && c.topic == "language"),
            "expected C1 language conflict, got {conflicts:?}"
        );
        assert!(
            conflicts
                .iter()
                .any(|c| c.class == 7 && c.topic == "content"),
            "expected C7 content conflict, got {conflicts:?}"
        );
        assert!(
            conflict_weight(&conflicts) >= 4,
            "conflict_weight must reach signal_poor threshold, got {}",
            conflict_weight(&conflicts)
        );
    }
}
