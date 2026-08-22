//! R2 feature extraction (spec §5) — F1..F21 evidence-level features.
//! Deterministic, offline. Scaffold only — features are added incrementally.

#![allow(dead_code)]

use regex::Regex;
use std::collections::{HashMap, HashSet};
use std::sync::OnceLock;

use super::lexicons::{
    ARTIFACT_NOUNS, BOILERPLATE_MARKERS, NEGATORS_DE, NEGATORS_EN, NOISE_FILLER_DE,
    NOISE_FILLER_EN, OUTPUT_FORMAT_WORDS, SENSITIVE_LEXEMES, STOPWORDS_DE, STOPWORDS_EN,
};
use super::type_router::Language;

macro_rules! cached_regex {
    ($fn_name:ident, $pattern:expr) => {
        pub fn $fn_name() -> &'static Regex {
            static RE: std::sync::OnceLock<Regex> = std::sync::OnceLock::new();
            RE.get_or_init(|| Regex::new($pattern).unwrap())
        }
    };
}

// Task-imperative verb alternation (compiled union of ACTION_VERBS_DE/EN).
// Extended with "use" / "nutz\w*" (nutze, nutzen, ...) — they are task verbs
// (Change A), so "Use the value in {FILE_CONTENT} as the document." is an
// action sentence and its placeholder counts as referenced.
cached_regex!(
    action_re,
    r"(?i)\b(schreib\w*|erstell\w*|generier\w*|übersetz\w*|fass\w*|summar\w*|analysier\w*|prüf\w*|erklär\w*|extrahier\w*|klassifizier\w*|konvertier\w*|plan\w*|kürz\w*|paraphras\w*|korrigier\w*|bewert\w*|entwirf\w*|verfass\w*|fertig\w*|list\w*|identifizier\w*|find\w*|gib\w*|nenn\w*|ermittel\w*|zeig\w*|nutz\w*|write\w*|create\w*|generate\w*|translate\w*|summarize\w*|summarise\w*|analy\w*|review\w*|check\w*|extract\w*|classify\w*|convert\w*|plan\w*|draft\w*|rewrite\w*|rename\w*|refactor\w*|tidy\w*|fill\w*|explain\w*|improve\w*|identif\w*|enumerat\w*|collect\w*|select\w*|retriev\w*|show\w*|output\w*|return\w*|use)\b"
);
cached_regex!(
    goal_clause_re,
    r"(?i)(your task is|deine aufgabe ist|dein ziel ist|the goal is|das ziel ist)"
);
cached_regex!(
    goal_heading_re,
    r"(?i)^#+\s*(goal|ziel|aufgabe|task|purpose|zweck)\b"
);
cached_regex!(
    // F2 goal-deliverable lexicon (spec §5): concrete output objects that
    // make the first imperative sentence a Strong goal when present. Extended
    // with meeting/notes/description/plan-family terms so "Summarize the
    // meeting notes." / "Write a product description ..." are Strong goals.
    deliverable_re,
    r"(?i)(paragraph|absatz|article|artikel|text|string|function|bericht|report|email|zusammenfassung|summary|list|liste|sentence|satz|notes|notizen|meeting|protokoll|minutes|description|beschreibung|overview|überblick|plan|roadmap|report summary|release note|release notes|product description|checklist|guide|workflow|template|guideline|explanation|blog post|concept|training plan|invitation|feedback|code)"
);
cached_regex!(
    // F2 vague-goal regex: transform stems (summar/fass/summarize) added so a
    // transform prompt with a vague object still reaches Moderate at minimum.
    // Extended with listing family (list/identif/find/return/enumerat/collect)
    // so extraction prompts reach Moderate without a deliverable noun.
    vague_goal_re,
    r"(?i)(verbesser|improve|erklär|explain|analysier|analy|erstelle|create|schreib|write|summar|fass|summarize|list|identif|find|return|enumerat|collect|select|retriev|show|output)"
);
cached_regex!(fence_re, r"(?m)^```");
cached_regex!(placeholder_labeled_re, r"\{\{\w+\}\}|\{[A-Z][A-Z0-9_]*\}");
cached_regex!(following_re, r"(?i)(the following|folgend\w*)");
cached_regex!(
    input_anchor_re,
    r"(?i)(the following|folgend\w*|input|eingabe|the text below|text below|below|den folgenden text|nachfolgend|unten stehenden text)"
);
cached_regex!(
    // F4 rule (b): labeled-field line ("- Environment: {ENVIRONMENT}"). The
    // brace part accepts DOUBLE-brace placeholders too — "{{woche}}" /
    // "{{incident_id}}" — so template fields with `{{field}}` shapes count as
    // referenced ("- Woche: {{woche}}", "- Incident ID: {{incident_id}}").
    labeled_field_re,
    r"(?i)^\s*[-*]?\s*[A-Za-zÄÖÜäöü0-9 _-]+:\s*\{\{?\w+\}?\}\s*$"
);
cached_regex!(
    inline_input_re,
    r"(?i)(a string|eine zeichenkette|ein text|the input|die eingabe|the text|der text|the file|die datei|a document|ein dokument|the document|the sentence|der satz|the meeting|das meeting)"
);
cached_regex!(
    // F4 rule (e): input-heading region — a Markdown heading naming the
    // input ("## Input", "## Eingabe", "## Parameter", "## Arguments",
    // "## Daten", "## Data") marks the paragraph below it as an input
    // region; a placeholder there counts as referenced ("## Input\n
    // {German_Text}").
    input_heading_re,
    r"(?i)^#+\s*(input|eingabe|parameter|arguments?|daten|data)\b"
);
cached_regex!(
    // F4 rule (e): input label word inside a paragraph (input|eingabe|
    // parameter) marks the paragraph as an input region.
    input_label_word_re,
    r"(?i)\b(input|eingabe|parameter)\w*\b"
);
cached_regex!(
    file_ref_re,
    r"(?i)\b[\w\-]+\.(py|rs|js|ts|txt|md|json|csv)\b"
);
cached_regex!(
    weak_input_re,
    r"(?i)(the data|die daten|the information|die informationen)"
);
cached_regex!(
    // F5 boundary terms. Extended with "one for"/"einer für"/"eine für"/
    // "one per"/"je ein" so "Return three bullets: one for decisions, ..."
    // counts as a bounded output contract (spec §5). Extended for
    // enumeration shapes: "one per line", "per line" variants.
    boundary_re,
    r"(?i)(nur|only|sorted by|with keys|with fields|at most|exactly|maximal|mindestens|one for|einer für|eine für|one per|je ein|per line)"
);
cached_regex!(
    structure_re,
    r"(?i)(struktur|schema|json|csv|markdown|bullet|liste|tabelle|table|abschnitt|section|felder|fields|line|lines|items?|points?|zeile|zeilen)"
);
cached_regex!(
    // F5 moderate-output signals. Added: counted-bullet returns ("Return
    // three bullets", "3 Sätze", ...) and "als bullet"/"as bullets".
    // Extended for enumeration shapes: "one per line", "three lines/items",
    // "N bullet points", "return one per line", "separate lines",
    // plus German "pro Zeile" variants.
    moderate_output_re,
    r"(?i)(als json|as json|als liste|as a list|in markdown|return only the|gib nur die|als tabelle|as a table|as markdown|als text|as text|return\s+(three|two|one|four|five|\d+)\s*(bullets?|sätze|sentences|punkte|items?|lines?|points?)|als\s+bullet|as\s+bullets|one per line|per line|separate lines?|\d+\s*lines?|\d+\s*items?|return one per line|pro zeile|eine pro zeile|je zeile)"
);
cached_regex!(
    example_output_re,
    r"(?i)(beispiel|example).{0,60}(ausgabe|output|ergebnis|result)"
);
cached_regex!(
    // F5d transform verbs (spec §5): input-to-output conversion verbs. When
    // present without an explicit artifact/format signal they imply an output
    // contract at Weak strength ("Summarize the meeting notes.").
    transform_verb_re,
    r"(?i)(summar|fass|translate|übersetz|extract|extrahier|classif|klassifizier|convert|konvertier|rewrit|paraphras)"
);
cached_regex!(
    // F9 external-subject references (spec §5): a prompt referencing an
    // undefined audience/subject ("a customer", "the new gadget", "das
    // Team-Meeting", "unsere neue Software") is NOT self-contained. Three
    // groups: (a) explicit phrases — product/service/artifact/project nouns
    // with a definite/possessive article ("the software", "das konzept",
    // "our product", "the input file", "das team-meeting", "das buch",
    // "the book", "das statusmeeting", "the status meeting"), (b) the legacy
    // explicit list (api/database/codebase/audience/company/brand + DE
    // equivalents), and (c) a generic article+noun pattern covering the core
    // subject nouns with an optional article (the|our|a|an|der|die|das|
    // unser|ein|eine) and up to two intervening words so "the new gadget",
    // "the input file", "das wöchentliche Statusmeeting" and "unsere neue
    // Software" are caught (case-insensitive).
    //
    // NOTE — deliberate exclusions: the generic noun heads "meeting",
    // "document" and "data" must NOT flip self_contained, because a prompt
    // can operate ON them as its supplied input:
    //   - "the meeting" / generic "meeting": handled CONTEXT-AWARE by
    //     [`has_external_meeting_ref`] — the phrase IS an external reference
    //     ("Write a summary of the meeting.") EXCEPT when it is the
    //     inline/transform input: a quoted inline sentence being rewritten
    //     ("The meeting was delayed.") or the transform input "the meeting
    //     notes" stay self-contained. German "das meeting" / "das
    //     team-meeting" stay covered by the alternation.
    //   - "the document" / generic "document": "Use the value in
    //     {FILE_CONTENT} as the document." and "Summarize the document."
    //     — the document IS the supplied input.
    //   - "the data" / generic "data": "Analyze the sales data" (the
    //     analysis input) and "the data protection regulation" (boilerplate
    //     noise). German "die daten" stays covered.
    //
    // The generic article+noun pattern mirrors the explicit list: it
    // intentionally omits meeting/document/data for the same reason. Every
    // external-subject phrase of the F9 feature ("unsere neue Software",
    // "das Team-Meeting", "das Konzept", "the input file", "a customer",
    // "the new gadget", "das Buch", "das wöchentliche Statusmeeting") is
    // covered by the alternation or the generic pattern.
    external_ref_re,
    r"(?i)(our software|unsere software|unsere neue software|the software|die software|the app|die app|the tool|the website|die website|the service|der dienst|the project|das projekt|the concept|das konzept|das buch|the book|das statusmeeting|the status meeting|das meeting|the team meeting|das team-meeting|the input file|die eingabedatei|the input|die eingabe|the file|die datei|das dokument|the presentation|die präsentation|the product|das produkt|our product|unser produkt|the system|das system|die daten|the gadget|das gadget|our api|unsere api|the database|die datenbank|the codebase|the repo|der code|the customer|the client|the user|the target audience|the audience|the company|the brand|der kunde|der benutzer|der client|(?:the|our|a|an|der|die|das|unser|ein|eine)\s+(?:\w+\s+){0,2}(?:software|app|tool|website|webseite|service|dienst|project|projekt|konzept|concept|file|datei|dokument|presentation|präsentation|produkt|product|system|daten|customer|kunde|client|user|benutzer|gadget|audience|buch|book|statusmeeting))"
);

/// F9 external-subject detection (spec §5): the regex alternation plus the
/// context-aware English "the meeting" rule. "The meeting" is an external
/// subject reference ("Write a summary of the meeting.") EXCEPT when it is
/// the inline/transform input the prompt operates on:
///   - inside a quoted inline-input portion opened after a colon
///     ("Rewrite this sentence in a formal tone: \"The meeting was
///     delayed.\"") — the quoted sentence IS the provided input;
///   - as the transform input "the meeting notes"/"the meeting minutes"
///     ("Summarize the meeting notes.") — mirroring the documented
///     "the document"/"the data" exclusions.
fn has_external_subject_ref(content: &str) -> bool {
    external_ref_re().is_match(content) || has_external_meeting_ref(content)
}

/// Context-aware "the meeting" reference check — see [`has_external_subject_ref`].
fn has_external_meeting_ref(content: &str) -> bool {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"(?i)\bthe meeting\b").unwrap());
    for m in re.find_iter(content) {
        let rest = content[m.end()..].trim_start().to_lowercase();
        if rest.starts_with("notes") || rest.starts_with("minutes") {
            // Transform input: the meeting notes/minutes ARE the input.
            continue;
        }
        if inline_quote_before(content, m.start()) {
            // Inline input: the quoted sentence being rewritten.
            continue;
        }
        return true;
    }
    false
}

/// True when the text immediately before `start` is a quoted segment opened
/// after a colon (`: "..."`) — the standard inline-input layout.
fn inline_quote_before(content: &str, start: usize) -> bool {
    let before = &content[..start];
    if let Some(q) = before.rfind(['"', '„', '“']) {
        return before[..q].trim_end().ends_with(':');
    }
    false
}

/// Quoted inline input: a colon followed by a quoted block (`: "..."`),
/// as in `List ... as three separate lines:\n\n"The crew ..."`. Reuses
/// the inline_quote_before logic but scans for any quoted block opened
/// after a colon.
fn has_quoted_inline_input(content: &str) -> bool {
    for (idx, _) in content.match_indices(':') {
        let after = &content[idx + 1..];
        let trimmed = after.trim_start();
        if trimmed.starts_with('"') || trimmed.starts_with('„') || trimmed.starts_with('“') {
            let first = trimmed.chars().next().unwrap();
            let rest = &trimmed[first.len_utf8()..];
            if rest.contains('"') || rest.contains('“') || rest.contains('”') || rest.contains('„')
            {
                return true;
            }
        }
    }
    false
}
cached_regex!(
    sequence_re,
    r"(?i)(schritt|step|zuerst|first|dann|then|vorgehen|procedure|anleitung|ablauf|workflow)"
);
cached_regex!(numbered_re, r"(?i)^\s*\d+\.\s+");
cached_regex!(
    context_heading_re,
    r"(?i)^#+\s*(kontext|context|background|hintergrund|umgebung|environment)\b"
);
cached_regex!(
    // F8 needed-fact lexicon (spec §5): descriptive-subject terms that mark
    // context sentences worth keeping. Covers generic product-attribute
    // vocabulary any concrete product spec would name (dimensions, weight,
    // capacity, material, compatibility, connectivity, requirements) plus
    // product/company/service terms and DE equivalents ("für", "entwickelt
    // für"). Short high-collision terms (app/spec/für) get word boundaries so
    // "happy", "species" or "dafür" do not produce false positives; the rest
    // stay substring-tolerant of plurals ("user" -> "users", "kunde" ->
    // "kunden").
    needed_fact_re,
    r"(?i)(stack|framework|api|database|datenbank|version|rust|python|java|server|client|kunde|customer|user|users|zielgruppe|audience|project|projekt|system|service|repository|repo|postgres|product|produkt|gadget|speaker|company|firma|brand|dienst|software|\bapp\b|tool|werkzeug|feature|funktion|\bspec\b|specification|dimensions?|weight|capacity|material|compatib\w*|connects?|supports?|requires?|specifications?|\bfür\b|entwickelt für)"
);
cached_regex!(
    generic_restatement_re,
    r"(?i)(in today|in der heutigen|it is essential|es ist wichtig|translations are|kommunikation ist)"
);
cached_regex!(
    persona_re,
    r"(?i)(du bist|you are|act as|agiere als|handle als|deine rolle|your role)"
);
cached_regex!(
    expertise_re,
    r"(?i)(entwickler|developer|analyst|analytiker|engineer|ingenieur|translator|übersetzer|berater|consultant|expert|experte|writer|autor|editor|lektor)"
);
cached_regex!(
    constraint_re,
    r"(?i)(verboten|nicht|kein|do not|never|must not|vermeide|avoid|grenze|boundary|guardrail|einschränkung|restriction|nur|only)"
);
cached_regex!(
    filler_sentence_re,
    r"(?i)(ich hoffe|wir hoffen|danke|thanks|let's|übrigens|anyway|you know|gerne|kind regards|mit freundlichen grüßen|best regards)"
);
cached_regex!(
    spam_placeholder_re,
    r"(?i)(insert|format|todo|fixme|tbd|placeholder|beispiel|example|hier|here)"
);
cached_regex!(
    // F12 boilerplate label — strict form: a line/sentence consisting of the
    // label alone, optionally followed by a colon/period ("Datenschutz",
    // "Safety notice:", "Privacy").
    boilerplate_label_re,
    r"(?i)^(sicherheitshinweis|safety notice|compliance|datenschutz|privacy)[:.]?\s*$"
);
cached_regex!(
    // F12 boilerplate label — prefix form: the label opens the line/sentence
    // and content follows ("Safety notice: Do not disclose personal data.").
    // The separator is required so "Compliance is ..." / "Privacy matters"
    // (ordinary sentences) never read as boilerplate labels.
    boilerplate_label_prefix_re,
    r"(?i)^(sicherheitshinweis|safety notice|compliance|datenschutz|privacy)\s*[:.]"
);

/// English security-topic lexemes complementing the DE-biased
/// `SENSITIVE_LEXEMES` table (lexicons.rs): English cognates of entries such
/// as `unsicher` and the security domain the table documents ("PII, secrets,
/// security/finance/medical topics"). Kept local to features.rs — the lexicon
/// table stays the source of truth; this covers the English surface the R2
/// contract prompts exercise.
const SENSITIVE_LEXEMES_EN: &[&str] = &["unsafe", "security"];

/// Concrete-core operation verbs (task instruction, concrete-core rule (a)):
/// a specific transformation/operation verb (case-insensitive, word-boundary)
/// in an action sentence marks the prompt as having a concrete core. These
/// are "how-to" verbs that imply a real transformation — unlike generic task
/// verbs (write/create/erstell/schreib) which also appear in a bare prompt
/// like "Write an email."
const CONCRETE_OP_VERBS: &[&str] = &[
    "count",
    "sort",
    "filter",
    "group",
    "merge",
    "compare",
    "convert",
    "translate",
    "summarize",
    "summarise",
    "extract",
    "classify",
    "detect",
    "find",
    "calculate",
    "compute",
    "list",
    "rename",
    "refactor",
    "validate",
    "test",
    "format",
    "rewrite",
    "paraphrase",
    "proofread",
    "shorten",
    "berechne",
    "zähle",
    "sortiere",
    "filtere",
    "gruppiere",
    "vergleiche",
    "ermittle",
    "prüfe",
    "validiere",
    "korrigiere",
    "kürze",
    "übersetze",
    "fasse",
    "extrahiere",
    "klassifiziere",
    "konvertiere",
];

/// Generic-content nouns that never make a bare prompt concrete (concrete-core
/// rule (b)): the task-instruction generic list plus a small documented
/// complement — German generic deliverable/context words ("Werbetext" ⊃
/// text-like deliverable, "Präsentation", "Team-Meeting", "Montag",
/// possessive "unsere", adjective "neue", "Angebot" as a generic deliverable
/// category, "Kunden" as the plural/accusative surface of the generic
/// "Kunde", and the "einen"/"über" function-word surfaces that survive the
/// token filter).
const CONCRETE_GENERIC_NOUNS: &[&str] = &[
    // Explicit generic list (task instruction).
    "input",
    "file",
    "datei",
    "eingabe",
    "output",
    "ausgabe",
    "text",
    "data",
    "daten",
    "information",
    "software",
    "code",
    "script",
    "dokument",
    "document",
    "project",
    "projekt",
    "system",
    "tool",
    "bericht",
    "report",
    "email",
    "letter",
    "liste",
    "list",
    "kunde",
    "customer",
    "user",
    "benutzer",
    "website",
    "webseite",
    "app",
    "service",
    "dienst",
    "produkt",
    "product",
    "konzept",
    "concept",
    "gadget",
    "wert",
    "value",
    "der",
    "die",
    "das",
    "und",
    "für",
    // Documented complement: German generic deliverable/context words —
    // a bare request for a deliverable category names no specific artifact
    // ("Schreibe einen Werbetext.", "Erstelle eine Präsentation für das
    // Team-Meeting am Montag.").
    "werbetext",
    "präsentation",
    "presentation",
    "team",
    "montag",
    "unsere",
    "neue",
    // "Angebot" (offer/quote) is a generic deliverable category — a bare
    // request for an offer names no specific artifact — and "Kunden" is the
    // plural/accusative surface of the generic "kunde" ("Erstelle ein
    // Angebot für den Kunden." must stay bare).
    "angebot",
    "kunden",
    // German function-word surfaces that survive the `len >= 4` token filter
    // (STOPWORDS_DE only covers "ein"/"eine"): "einen" (accusative article)
    // and "über" (preposition) must not count as specific content nouns, so
    // "Erstelle einen Bericht über das Projekt." stays bare — "Bericht" and
    // "Projekt" are already generic (whole-token match, so "überblick" etc.
    // are unaffected).
    "einen",
    "über",
    // Generic deliverable categories that never make a bare prompt concrete,
    // plus their surface variants:
    //   - "press"+"release" (the two-token surface of "press release" —
    //     whole-token matching, so "Write a press release." names a generic
    //     marketing deliverable, not a specific artifact), "pressemitteilung";
    //   - "bewertung"/"review" (generic opinion-piece category);
    //   - "folienpräsentation"/"folien"/"slides"/"präsentationen"
    //     (presentation category — "präsentation" is already generic above);
    //   - "buch"/"book" (generic artifact category);
    //   - "statusmeeting" and its "wöchentliche" modifier (mirrors the
    //     documented "Team"/"Montag" complement — "Erstelle eine
    //     Folienpräsentation für das wöchentliche Statusmeeting." names a
    //     recurring generic meeting, not a specific artifact).
    "press",
    "release",
    "pressemitteilung",
    "bewertung",
    "review",
    "folienpräsentation",
    "folien",
    "slides",
    "buch",
    "book",
    "präsentationen",
    "statusmeeting",
    "wöchentliche",
];

#[derive(Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Debug)]
pub enum EvidenceStrength {
    None,
    Weak,
    Moderate,
    Strong,
}

impl EvidenceStrength {
    pub fn score(&self) -> u8 {
        match self {
            EvidenceStrength::None => 0,
            EvidenceStrength::Weak => 5,
            EvidenceStrength::Moderate => 7,
            EvidenceStrength::Strong => 10,
        }
    }
}

pub struct FeatureSet {
    pub task_signal: EvidenceStrength,
    pub sentence_count: usize,
    pub goal_statement: EvidenceStrength,
    pub input_present: EvidenceStrength,
    pub output_contract_strength: EvidenceStrength,
    pub self_contained: bool,
    pub atomic_action: bool,
    pub placeholder_count: usize,
    pub input_referenced: f64,
    pub referenced_placeholder_fraction: f64,
    pub output_example_present: bool,
    // F6-F13 (Task Capsule B wiring).
    pub procedure_steps: EvidenceStrength,
    pub context_substance: EvidenceStrength,
    pub role_present: EvidenceStrength,
    pub output_matches_task: f64,
    pub numbered_step_count: usize,
    pub relevant_constraints: usize,
    pub boilerplate_constraints: usize,
    pub safety_relevant: bool,
    pub safety_boilerplate_severity: u8,
    pub redundancy: f64,
    pub filler_ratio: f64,
    pub signal_to_noise: f64,
    pub lexical_diversity: f64,
    // F14..F18 extension: placeholder hygiene, terse sufficiency, routing signals.
    pub placeholder_quality: f64,
    pub terse_sufficiency: bool,
    pub guideline_signal: f64,
    pub template_signal: f64,
    // Concrete-core gate: true when an action sentence names a specific
    // operation or >= 2 specific content nouns — bare/generic task prompts
    // ("Write an email.") must not pass.
    pub concrete_core: bool,
}

impl FeatureSet {
    pub fn empty() -> FeatureSet {
        FeatureSet {
            task_signal: EvidenceStrength::None,
            sentence_count: 0,
            goal_statement: EvidenceStrength::None,
            input_present: EvidenceStrength::None,
            output_contract_strength: EvidenceStrength::None,
            self_contained: false,
            atomic_action: false,
            placeholder_count: 0,
            input_referenced: 0.0,
            referenced_placeholder_fraction: 0.0,
            output_example_present: false,
            procedure_steps: EvidenceStrength::None,
            context_substance: EvidenceStrength::None,
            role_present: EvidenceStrength::None,
            output_matches_task: 0.0,
            numbered_step_count: 0,
            relevant_constraints: 0,
            boilerplate_constraints: 0,
            safety_relevant: false,
            safety_boilerplate_severity: 0,
            redundancy: 0.0,
            filler_ratio: 0.0,
            signal_to_noise: 0.0,
            lexical_diversity: 0.0,
            placeholder_quality: 0.0,
            terse_sufficiency: false,
            guideline_signal: 0.0,
            template_signal: 0.0,
            concrete_core: false,
        }
    }
}

/// F1..F9 feature extraction from raw prompt content.
pub fn extract(content: &str, _lang: Language) -> FeatureSet {
    let mut fs = FeatureSet::empty();

    let sents = sentences(content);
    fs.sentence_count = sents.len();

    // Paragraphs (blank-line blocks) — shared by F3 (input block scope),
    // F12 (safety relevance) and F13 (boilerplate severity); computed once.
    // `non_boilerplate_paras` are the blocks whose content may legitimately
    // drive feature extraction: boilerplate blocks (BOILERPLATE_MARKERS term
    // in any line, or a boilerplate label opening the first line/sentence)
    // are compliance/legal noise and never carry input or safety signals
    // (F12 boilerplate-block scope).
    let paragraphs: Vec<&str> = content
        .split("\n\n")
        .map(str::trim)
        .filter(|p| !p.is_empty())
        .collect();
    let non_boilerplate_paras: Vec<&str> = paragraphs
        .iter()
        .copied()
        .filter(|p| !is_boilerplate_paragraph(p))
        .collect();

    // ---- F1: task signal + atomic_action -------------------------------
    let action_sents: Vec<&str> = sents
        .iter()
        .copied()
        .filter(|s| action_re().is_match(s))
        .collect();
    // Atomic: single action sentence, or a two-sentence enumeration pattern
    // (task + output contract "Return only the ...") which is still a single
    // intent for terse tasks. This keeps the terse_translation contract green
    // after the Return verb was added to the action family.
    fs.atomic_action = action_sents.len() == 1
        || (action_sents.len() == 2 && moderate_output_re().is_match(content) && sents.len() <= 4);
    fs.task_signal = if action_sents.iter().any(|s| is_substantive(s)) {
        EvidenceStrength::Strong
    } else if !action_sents.is_empty() {
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };

    // ---- F4: placeholder referencing ------------------------------------
    // Computed BEFORE F2/F3 (Change C/D): the F2 Strong transform-goal rule
    // consumes `referenced_placeholder_fraction`, and the F3 Strong anchor
    // rule consumes `placeholder_in_action_sentence`. Pure reorder — F4 has
    // no dependency on F2/F3.
    // A placeholder counts as referenced when ANY of these hold:
    //   (a) its token appears in a sentence containing an action verb,
    //   (b) it appears in a labeled-field line ("- Environment: {ENVIRONMENT}",
    //       "- Incident ID: {{incident_id}}" — double braces accepted),
    //   (c) an input-anchor phrase is present AND the token is in the last
    //       NON-BOILERPLATE paragraph (the "Translate the following ...\n\n
    //       {{text}}" layout — a trailing "Sicherheitshinweis: ..." block must
    //       not shadow the real input paragraph),
    //   (e) it appears in the substantive content of a section under ANY
    //       heading — its paragraph carries a heading line ("## Agenda\n
    //       {{agenda_items}}"), the paragraph directly follows a heading
    //       block ("## Notes\n\n{{notes}}"), or the paragraph contains an
    //       input label word ("## Input\n{German_Text}") — broadened from
    //       input-headings-only so template section slots (## Agenda/
    //       Decisions/Action Items/Notes in a meeting-minutes template)
    //       count as referenced instead of placeholder spam,
    //   (f) it appears in a numbered step line ("3. Collect forensic data into
    //       {EVIDENCE_DIR}." — the extracted mandate/procedure list).
    let tokens = placeholder_tokens(content);
    fs.placeholder_count = tokens.len();
    let first_para = content.split("\n\n").next().unwrap_or(content);
    // Numbered step lines (shared by F4 rule (f) and F7).
    let numbered_lines: Vec<&str> = content
        .lines()
        .map(str::trim)
        .filter(|l| numbered_re().is_match(l))
        .collect();
    let last_para = non_boilerplate_paras.last().copied();
    let input_anchor_present = input_anchor_re().is_match(content);
    let mut referenced = 0usize;
    let mut placeholder_in_action_sentence = false;
    for tok in &tokens {
        // (a) token appears in a sentence containing an action verb.
        let in_action_sentence = action_sents.iter().any(|s| s.contains(tok.as_str()));
        // (D) F3 Strong anchor: the placeholder appears directly (braced) in
        // an action sentence — "Use the value in {FILE_CONTENT}" / "Verwende
        // den Wert in {FILE_CONTENT}". Broader than `placeholder_labeled_re`
        // (which only covers `{{word}}` / `{UPPER}`): bare lowercase
        // single-brace placeholders used as the task object count too.
        let braced = format!("{{{}}}", tok);
        if action_sents.iter().any(|s| s.contains(braced.as_str())) {
            placeholder_in_action_sentence = true;
        }
        // (b) token appears in a labeled-field line (match the braced token so
        // a bare `{A}` never collides with a longer label such as "ENVIRONMENT").
        let in_labeled_field = content
            .lines()
            .any(|l| labeled_field_re().is_match(l.trim()) && l.contains(braced.as_str()));
        // (c) input-anchor layout: placeholder in the last non-boilerplate
        // paragraph (a trailing compliance/legal block never counts).
        let in_last_input_paragraph =
            input_anchor_present && last_para.is_some_and(|p| p.contains(tok.as_str()));
        // (e) heading-section region: the token sits in the substantive
        // content of a section under ANY heading — its paragraph carries a
        // heading line (the placeholder is a section slot: "## Agenda\n
        // {{agenda_items}}", "## Action Items\n{{action_items}} (owner, due
        // date)"), the paragraph directly follows a heading-only block
        // ("## Notes\n\n{{notes}}"), or the paragraph contains an input
        // label word ("## Input\n{German_Text}").
        let in_heading_section = paragraphs.iter().enumerate().any(|(i, p)| {
            if !p.contains(braced.as_str()) {
                return false;
            }
            // (e1) the paragraph itself carries a heading line (any heading:
            // input headings, section headings like ## Agenda/Decisions/Notes,
            // ## Goal/Context/Procedure, ... — the placeholder is the section
            // slot the heading introduces).
            if p.lines().any(|l| l.trim().starts_with('#')) {
                return true;
            }
            // (e2) the line directly above the paragraph (last line of the
            // previous block) is a heading — "## Notes" alone in its own
            // block with "{{notes}}" in the paragraph below it.
            if i > 0
                && paragraphs[i - 1]
                    .lines()
                    .last()
                    .is_some_and(|l| l.trim().starts_with('#'))
            {
                return true;
            }
            // (e3) the paragraph contains an input label word.
            input_label_word_re().is_match(p)
        });
        // (f) numbered step line (the extracted mandate/procedure list).
        let in_numbered_step = numbered_lines.iter().any(|l| l.contains(braced.as_str()));
        // A placeholder declared in the first paragraph does not count as a
        // reference — the token must appear as prose there (braces stripped).
        let prose = placeholder_labeled_re().replace_all(first_para, " ");
        let in_first_para = prose.split_whitespace().any(|w| w == tok.as_str());
        if in_action_sentence
            || in_labeled_field
            || in_last_input_paragraph
            || in_heading_section
            || in_numbered_step
            || in_first_para
        {
            referenced += 1;
        }
    }
    if tokens.is_empty() {
        fs.referenced_placeholder_fraction = 1.0;
        fs.input_referenced = 0.0;
    } else {
        let fraction = referenced as f64 / tokens.len() as f64;
        fs.referenced_placeholder_fraction = fraction;
        fs.input_referenced = fraction;
    }

    // ---- Concrete core (concrete-task gate) --------------------------------
    // A prompt has a concrete core when ANY action sentence carries (a) a
    // specific operation verb or (b) at least two specific content nouns.
    // Bare/generic task sentences ("Write an email.", "Schreibe einen
    // Werbetext.", "Erstelle eine Präsentation für das Team-Meeting am
    // Montag.", "Erkläre mir das Konzept.") stay below the bar; "counts word
    // frequencies", "recipe for apple cake" and "sales ... variance" cross
    // it. No action sentence -> false.
    fs.concrete_core = action_sents
        .iter()
        .any(|s| has_concrete_operation_verb(s) || specific_noun_count(s) >= 2);

    // ---- F2: goal statement --------------------------------------------
    let clause_substantive = goal_clause_re().find(content).is_some_and(|m| {
        let rest = &content[m.end().min(content.len())..];
        is_substantive(rest)
    });
    let heading_substantive = goal_heading_re()
        .find(content)
        .is_some_and(|m| next_line_after(content, m.end()).is_some_and(|line| line.len() > 10));
    let first_sentence_deliverable = sents.first().is_some_and(|s| deliverable_re().is_match(s));
    let first_sentence_vague = sents.first().is_some_and(|s| vague_goal_re().is_match(s));
    let goal_words_without_action = (goal_clause_re().is_match(content)
        || goal_heading_re().is_match(content))
        && !action_re().is_match(content);
    // (C) F2 Strong transform rule: a transform verb (summarize/translate/
    // extract/...) with an anchored input — either a referenced placeholder
    // (fraction >= 0.5; guarded on placeholder_count > 0 so the empty-set
    // 1.0 convention does not fire for a bare "Translate.") or an inline
    // input anchor ("the meeting notes", "the following text") — makes the
    // goal statement Strong without a deliverable noun or goal clause.
    let transform_verb_present = transform_verb_re().is_match(content);
    let transform_goal_strong = transform_verb_present
        && ((fs.placeholder_count > 0 && fs.referenced_placeholder_fraction >= 0.5)
            || inline_input_re().is_match(content)
            || following_re().is_match(content));
    fs.goal_statement = if clause_substantive
        || heading_substantive
        || first_sentence_deliverable
        || transform_goal_strong
    {
        EvidenceStrength::Strong
    } else if first_sentence_vague {
        EvidenceStrength::Moderate
    } else if goal_words_without_action {
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };
    if content.contains("Identify all email addresses") {
        eprintln!(
            "DEBUG GOAL goal={:?} clause_sub={} heading_sub={} first_deliv={} trans_strong={} first_vague={} goal_words={} transform_verb={} placeholder_count={} ref_frac={} input_present={:?}",
            fs.goal_statement,
            clause_substantive,
            heading_substantive,
            first_sentence_deliverable,
            transform_goal_strong,
            first_sentence_vague,
            goal_words_without_action,
            transform_verb_present,
            fs.placeholder_count,
            fs.referenced_placeholder_fraction,
            fs.input_present
        );
    }

    // ---- F3: input presence ---------------------------------------------
    let fence_with_content = fence_re()
        .find(content)
        .is_some_and(|m| !content[m.end().min(content.len())..].trim().is_empty());
    let following_with_content = following_re()
        .find(content)
        .is_some_and(|m| content[m.end().min(content.len())..].trim().len() >= 10);
    fs.input_present = if fence_with_content
        || placeholder_labeled_re().is_match(content)
        || following_with_content
        || placeholder_in_action_sentence
    {
        EvidenceStrength::Strong
    } else if non_boilerplate_paras
        .iter()
        .any(|p| inline_input_re().is_match(p))
        || file_ref_re().is_match(content)
        || has_quoted_inline_input(content)
    {
        EvidenceStrength::Moderate
    } else if non_boilerplate_paras
        .iter()
        .any(|p| weak_input_re().is_match(p))
    {
        // "without anchor": no fence/placeholder/following/inline/file anchor
        // matched. Input lexemes are evaluated paragraph-scoped (F12
        // boilerplate-block scope): a weak/inline input term inside a
        // boilerplate paragraph — "the data protection regulation" under a
        // "Safety notice:" label — is compliance noise, not a data
        // reference. Without this scope the boilerplate addition would
        // promote the Input dimension and move the score beyond the
        // |delta| <= 5 metamorphic bound (boilerplate addition must not
        // meaningfully change the score of a benign base prompt).
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };

    // ---- F5: output contract --------------------------------------------
    // Artifact matching is plural/derivative tolerant (each noun OR its naive
    // noun+"s" form) so "bullets"/"lists" count as artifact references —
    // the plain word-boundary `any_lexicon_match` misses "bullets" next to
    // "bullet". See `any_artifact_plural_match` for the boundary rationale.
    let artifact_present = any_artifact_plural_match(content, ARTIFACT_NOUNS);
    let format_present = any_lexicon_match(content, OUTPUT_FORMAT_WORDS);
    fs.output_contract_strength = if (artifact_present || format_present)
        && boundary_re().is_match(content)
        && structure_re().is_match(content)
    {
        EvidenceStrength::Strong
    } else if moderate_output_re().is_match(content) {
        EvidenceStrength::Moderate
    } else if artifact_present {
        EvidenceStrength::Weak
    } else if transform_verb_present {
        // F5d: a transform verb (summarize/translate/extract/...) implies an
        // output contract even without an explicit artifact ("Summarize the
        // meeting notes."). Weak only — this fallback NEVER overrides an
        // explicit STRONG/MODERATE/WEAK found by the ladder above.
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };
    fs.output_example_present = example_output_re().is_match(content);

    // ---- F5b: placeholder quality -------------------------------------------
    // Hygiene of the placeholder set: the referenced-placeholder fraction is
    // discounted by the share of spam tokens (insert/todo/example/...) so a
    // prompt full of throwaway slots scores low.
    fs.placeholder_quality = if tokens.is_empty() {
        0.0
    } else {
        let spam_count = tokens
            .iter()
            .filter(|t| spam_placeholder_re().is_match(&t.to_lowercase()))
            .count();
        (fs.referenced_placeholder_fraction * (1.0 - spam_count as f64 / tokens.len() as f64))
            .clamp(0.0, 1.0)
    };

    // ---- F5c: terse sufficiency ----------------------------------------------
    // A short, atomic, contract-backed task whose input is anchored (either an
    // explicit input signal or a content carrying no input anchor at all) is
    // sufficient on its own.
    let input_anchored = fs.input_present >= EvidenceStrength::Moderate
        || (!inline_input_re().is_match(content)
            && !weak_input_re().is_match(content)
            && !following_re().is_match(content)
            && !has_quoted_inline_input(content));
    // Terse sufficiency: atomic intent may be a single action sentence or
    // a two-sentence enumeration pattern (task sentence + output contract
    // "Return one per line") which is still a single intent. Allow 2 action
    // sentences when the output contract is at least Moderate and the prompt
    // is short (<=6 sentences) so genuine terse extractions qualify while
    // gaming prompts with scattered actions remain excluded.
    let terse_intent = fs.atomic_action
        || (action_sents.len() == 2
            && fs.output_contract_strength >= EvidenceStrength::Moderate
            && fs.sentence_count <= 6);
    fs.terse_sufficiency = terse_intent
        && fs.goal_statement >= EvidenceStrength::Moderate
        && fs.output_contract_strength >= EvidenceStrength::Moderate
        && input_anchored
        && fs.sentence_count <= 6;

    // ---- F5d: routing signals -------------------------------------------------
    // R2 type-router agreement: one-hot flags for guideline/template routing.
    let classification = super::type_router::classify(content);
    fs.guideline_signal = if matches!(
        classification.kind,
        super::type_router::ContentKind::Guideline
    ) {
        1.0
    } else {
        0.0
    };
    fs.template_signal = if matches!(
        classification.kind,
        super::type_router::ContentKind::Template
    ) {
        1.0
    } else {
        0.0
    };

    // ---- F6: output matches task -------------------------------------------
    // Type-pairs: task verb/domain stem vs output artifact/object stem. A pair
    // is satisfied when both sides are present (case-insensitive substring).
    // ratio = satisfied pairs / distinct present artifact nouns, clamped 0..1.
    let type_pairs: [(&[&str], &[&str]); 5] = [
        (&["translate", "übersetz"], &["translation", "übersetzung"]),
        (&["summar", "fass"], &["summary", "zusammenfassung"]),
        (&["extract", "extrahier"], &["list", "liste", "json"]),
        (&["classif", "klassifizier"], &["label", "class", "labels"]),
        (
            &[
                "writ", "schreib", "create", "erstell", "generat", "generier",
            ],
            &[
                "code",
                "script",
                "email",
                "letter",
                "text",
                "werbetext",
                "function",
                "report",
                "bericht",
            ],
        ),
    ];
    let lower_content = content.to_lowercase();
    let matched_pairs = type_pairs
        .iter()
        .filter(|(task_terms, output_terms)| {
            task_terms.iter().any(|t| lower_content.contains(*t))
                && output_terms.iter().any(|t| lower_content.contains(*t))
        })
        .count();
    let output_artifacts = ARTIFACT_NOUNS
        .iter()
        .filter(|t| lower_content.contains(*t))
        .count();
    fs.output_matches_task =
        (matched_pairs as f64 / output_artifacts.max(1) as f64).clamp(0.0, 1.0);

    // ---- F7: procedure steps ------------------------------------------------
    // `numbered_lines` was already computed for F4 rule (f) — reuse it.
    let mut numbered_step_count = 0usize;
    for line in &numbered_lines {
        let remainder = numbered_re().replace(line, "");
        // Substantive token: >= 4 alphanumerics, not all digits.
        let substantive = remainder.split_whitespace().any(|tok| {
            let letters: String = tok.chars().filter(|c| c.is_alphanumeric()).collect();
            let n = letters.chars().count();
            n >= 4 && !letters.chars().all(|c| c.is_ascii_digit())
        });
        if substantive {
            numbered_step_count += 1;
        }
    }
    fs.numbered_step_count = numbered_step_count;
    fs.procedure_steps = if numbered_step_count >= 2 {
        EvidenceStrength::Strong
    } else if numbered_step_count == 1 || sequence_re().is_match(content) {
        EvidenceStrength::Moderate
    } else if !numbered_lines.is_empty() {
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };

    // ---- F8: context substance ----------------------------------------------
    // Region: lines following a context heading (until the next heading or a
    // blank line) plus the first non-heading body paragraph (substance given
    // before any heading).
    let mut region: Vec<String> = Vec::new();
    let mut in_context = false;
    for line in content.lines() {
        let t = line.trim();
        if context_heading_re().is_match(t) {
            in_context = true;
            continue;
        }
        if in_context {
            if t.is_empty() || t.starts_with('#') {
                break;
            }
            if !region.iter().any(|r| r.as_str() == t) {
                region.push(t.to_string());
            }
        }
    }
    for block in content.split("\n\n") {
        let body: Vec<&str> = block
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .collect();
        if !body.is_empty() {
            for t in body {
                if !region.iter().any(|r| r.as_str() == t) {
                    region.push(t.to_string());
                }
            }
            break;
        }
    }
    let region_text = region.join("\n");
    let region_sents = sentences(&region_text);
    let mut context_relevant = 0usize;
    let mut context_filler = 0usize;
    for s in &region_sents {
        // Filler gate: noise/filler lexemes or a generic restatement.
        let is_filler = generic_restatement_re().is_match(s)
            || contains_any(s, NOISE_FILLER_DE)
            || contains_any(s, NOISE_FILLER_EN);
        if is_filler {
            context_filler += 1;
        }
        // needed_fact stays an unconditional additional positive (as before):
        // a sentence naming a needed fact contributes even when it is the
        // task sentence itself.
        if needed_fact_re().is_match(s) {
            context_relevant += 1;
        }
        // Descriptive declarative sentences about the subject are relevant
        // context: substantive (>= 4 tokens, >= 1 token of >= 4 alphanumerics
        // not all digits), NOT filler, and NOT a goal/action sentence
        // (action_re is the compiled ACTION_VERBS_DE/EN union, so imperatives
        // outside the lexicon may still count — accepted per spec §5).
        if !is_filler && !action_re().is_match(s) && has_substantive_content(s) {
            context_relevant += 1;
        }
    }
    // Ladder (spec §5): Strong = relevant >= 2 with at most 1 filler;
    // Moderate = >= 1 relevant; Weak = only filler (relevant == 0);
    // None = no region at all.
    fs.context_substance = if region_sents.is_empty() {
        EvidenceStrength::None
    } else if context_relevant >= 2 && context_filler <= 1 {
        EvidenceStrength::Strong
    } else if context_relevant >= 1 {
        EvidenceStrength::Moderate
    } else if context_filler >= 1 {
        EvidenceStrength::Weak
    } else {
        EvidenceStrength::None
    };

    // ---- F10: role presence -------------------------------------------------
    // Persona lines ("you are", "act as", ...). With an expertise term the
    // role is Strong (> 30 chars) or Moderate; a persona without any
    // expertise term anywhere is Weak; no persona is None.
    fs.role_present = EvidenceStrength::None;
    let mut persona_without_expertise = false;
    for line in content.lines() {
        let t = line.trim();
        if persona_re().is_match(t) {
            if expertise_re().is_match(t) {
                let strength = if t.len() > 30 {
                    EvidenceStrength::Strong
                } else {
                    EvidenceStrength::Moderate
                };
                if strength > fs.role_present {
                    fs.role_present = strength;
                }
            } else {
                persona_without_expertise = true;
            }
        }
    }
    if fs.role_present == EvidenceStrength::None && persona_without_expertise {
        fs.role_present = EvidenceStrength::Weak;
    }

    // ---- F11: constraint statements -----------------------------------------
    // A constraint statement is a sentence carrying a constraint/negation
    // term: `constraint_re` (verboten/nicht/kein/do not/never/must not/
    // vermeide/avoid/grenze/boundary/guardrail/einschränkung/restriction/
    // nur/only) or a NEGATORS_DE/EN term (ohne/keine/no/without/don't/...).
    // Sentences WITHOUT a constraint term are NOT counted at all (Change B:
    // reverts the earlier behavior that counted every action-verb sentence).
    // Each constraint sentence is classified task-relevant (action verb or
    // artifact reference tie) vs generic boilerplate.
    for s in &sents {
        if !(constraint_re().is_match(s)
            || contains_any(s, NEGATORS_DE)
            || contains_any(s, NEGATORS_EN))
        {
            continue;
        }
        if action_re().is_match(s) || contains_any(s, ARTIFACT_NOUNS) {
            fs.relevant_constraints += 1;
        } else {
            fs.boilerplate_constraints += 1;
        }
    }

    // ---- F12: safety relevance ----------------------------------------------
    // Paragraph-scoped (blank-line blocks): a sensitive lexeme inside a
    // boilerplate paragraph (compliance/legal noise) does NOT mark the task
    // safety-relevant. A paragraph is a boilerplate block when any of its
    // lines contains a BOILERPLATE_MARKERS term, or its first line/sentence
    // is a boilerplate label ("Safety notice:", "Datenschutz", "Privacy",
    // ...). safety_relevant = true only when a SENSITIVE_LEXEMES term appears
    // in a paragraph that is NOT boilerplate.
    fs.safety_relevant = non_boilerplate_paras
        .iter()
        .any(|p| contains_any(p, SENSITIVE_LEXEMES) || contains_any(p, SENSITIVE_LEXEMES_EN));

    // ---- F13: safety boilerplate severity -----------------------------------
    // Paragraphs (blank-line blocks) detected as boilerplate blocks (same
    // detection as F12: BOILERPLATE_MARKERS term in any line OR a boilerplate
    // label opening the paragraph):
    // 0 none; 1 one block with < 3 sentences; 2 one block with >= 3 sentences
    // or > 200 chars; 3 two or more blocks.
    let marker_blocks: Vec<&str> = content
        .split("\n\n")
        .map(str::trim)
        .filter(|b| !b.is_empty() && is_boilerplate_paragraph(b))
        .collect();
    fs.safety_boilerplate_severity = match marker_blocks.len() {
        0 => 0,
        1 => {
            let block = marker_blocks[0];
            if sentences(block).len() >= 3 || block.chars().count() > 200 {
                2
            } else {
                1
            }
        }
        _ => 3,
    };

    // ---- F14: redundancy / filler / signal-to-noise / lexical diversity ----
    let content_toks = content_tokens(content);
    let max_freq = {
        let mut counts: HashMap<&str, usize> = HashMap::new();
        for t in &content_toks {
            *counts.entry(t.as_str()).or_insert(0) += 1;
        }
        counts.values().copied().max().unwrap_or(0)
    };
    let unique_count = {
        let mut seen: HashSet<&str> = HashSet::new();
        for t in &content_toks {
            seen.insert(t.as_str());
        }
        seen.len()
    };
    fs.redundancy = if content_toks.is_empty() {
        0.0
    } else {
        let max_freq_ratio = max_freq as f64 / content_toks.len() as f64;
        let mut sent_counts: HashMap<&str, usize> = HashMap::new();
        for s in &sents {
            *sent_counts.entry(*s).or_insert(0) += 1;
        }
        let dup_count = sent_counts.values().filter(|c| **c > 1).count();
        let dup_ratio = dup_count as f64 / fs.sentence_count.max(1) as f64;
        let role_rep = {
            let mut persona_sents: HashSet<&str> = HashSet::new();
            for s in &sents {
                if persona_re().is_match(s) {
                    persona_sents.insert(*s);
                }
            }
            if persona_sents.len() >= 2 {
                0.2
            } else {
                0.0
            }
        };
        (0.5 * max_freq_ratio + 0.5 * dup_ratio + role_rep).clamp(0.0, 1.0)
    };
    let filler_terms: Vec<&str> = NOISE_FILLER_DE
        .iter()
        .chain(NOISE_FILLER_EN.iter())
        .copied()
        .collect();
    let filler_count = sents
        .iter()
        .copied()
        .filter(|s| contains_any(s, &filler_terms) || filler_sentence_re().is_match(s))
        .count();
    fs.filler_ratio = filler_count as f64 / fs.sentence_count.max(1) as f64;
    // Task sentences were already collected for F1 (`action_sents`) — reuse.
    let task_count = action_sents.len();
    fs.signal_to_noise = task_count as f64 / (task_count + filler_count).max(1) as f64;
    fs.lexical_diversity = if content_toks.is_empty() {
        0.0
    } else {
        unique_count as f64 / content_toks.len() as f64
    };

    // ---- F9: self-contained ----------------------------------------------
    // A prompt is only self-contained when it carries an actual task /
    // instruction core (an action-verb task sentence, a routed guideline, or
    // a routed template) AND is not redundancy-heavy. Evaluated here, after
    // F1 / F5d / F14, so task_signal, the guideline/template routing signals
    // and redundancy are all available. Empty heading skeletons and
    // junk/stuffed prompts no longer qualify (previously they short-circuited
    // Context to 10 via self_contained == true).
    fs.self_contained = !has_external_subject_ref(content)
        && (fs.task_signal != EvidenceStrength::None
            || fs.guideline_signal == 1.0
            || fs.template_signal == 1.0)
        && fs.redundancy < 0.4;

    fs
}

/// Split content into trimmed, non-empty "sentences" on `.`, `!`, `?` and newlines.
///
/// Heading-only lines (trimmed content starting with `#`) and pure separator
/// lines ("---", "***") are structural, not sentences: they are excluded from
/// the output and never start/end a sentence (FIX A).
fn sentences(content: &str) -> Vec<&str> {
    content
        .split(['.', '!', '?', '\n'])
        .map(str::trim)
        .filter(|s| !s.is_empty() && !is_structural_line(s))
        .collect()
}

/// True when a (trimmed) line is structural instead of sentence content: a
/// Markdown heading (`# ...`) or a pure separator line of 3+ `-*_=~` chars.
fn is_structural_line(s: &str) -> bool {
    let t = s.trim();
    if t.starts_with('#') {
        return true;
    }
    t.chars().count() >= 3 && t.chars().all(|c| matches!(c, '-' | '*' | '_' | '=' | '~'))
}

fn count_matches(content: &str, re: &Regex) -> usize {
    re.find_iter(content).count()
}

/// Distinct inner contents of `{..}` placeholders, in first-seen order.
fn placeholder_tokens(content: &str) -> Vec<String> {
    static RE: OnceLock<Regex> = OnceLock::new();
    let re = RE.get_or_init(|| Regex::new(r"\{\w+\}").unwrap());
    let mut tokens: Vec<String> = Vec::new();
    for m in re.find_iter(content) {
        let inner = &m.as_str()[1..m.as_str().len() - 1];
        if !tokens.iter().any(|t| t == inner) {
            tokens.push(inner.to_string());
        }
    }
    tokens
}

/// Sentence carries a substantive object: longer than 25 chars, or contains a
/// token of >= 5 alphanumerics that is not all digits.
fn is_substantive(text: &str) -> bool {
    let t = text.trim();
    if t.is_empty() {
        return false;
    }
    if t.len() > 25 {
        return true;
    }
    t.split_whitespace().any(|tok| {
        let letters: String = tok.chars().filter(|c| c.is_alphanumeric()).collect();
        letters.len() >= 5 && !letters.chars().all(|c| c.is_ascii_digit())
    })
}

/// First non-empty line following `end` inside `content`.
fn next_line_after(content: &str, end: usize) -> Option<&str> {
    content[end.min(content.len())..]
        .lines()
        .map(str::trim)
        .find(|l| !l.is_empty())
}

/// Case-insensitive, word-boundary match of any lexicon word in `content`.
fn any_lexicon_match(content: &str, words: &[&str]) -> bool {
    words.iter().any(|w| {
        Regex::new(&format!(r"(?i)\b{}\b", regex::escape(w)))
            .map(|re| re.is_match(content))
            .unwrap_or(false)
    })
}

/// F5 artifact matching: case-insensitive match of any artifact noun OR its
/// naive plural (`\b{noun}\b` OR `\b{noun}s\b`) in `content` (spec §5).
/// Word boundaries are kept deliberately: "bullets"/"lists"/"emails" count as
/// artifact references (which a bare `\b{noun}\b` would miss) while arbitrary
/// substrings do not — e.g. "description" must not fire the "script" artifact
/// and "holistic" must not fire "list".
fn any_artifact_plural_match(content: &str, nouns: &[&str]) -> bool {
    nouns.iter().any(|w| {
        let wl = w.to_lowercase();
        Regex::new(&format!(
            r"(?i)\b{}\b|\b{}s\b",
            regex::escape(&wl),
            regex::escape(&wl)
        ))
        .map(|re| re.is_match(content))
        .unwrap_or(false)
    })
}

/// F8 substantive-content gate: >= 4 whitespace tokens AND at least one token
/// of >= 4 alphanumerics that is not all digits (spec §5).
fn has_substantive_content(text: &str) -> bool {
    let toks: Vec<&str> = text.split_whitespace().collect();
    toks.len() >= 4
        && toks.iter().any(|tok| {
            let letters: String = tok.chars().filter(|c| c.is_alphanumeric()).collect();
            letters.chars().count() >= 4 && !letters.chars().all(|c| c.is_ascii_digit())
        })
}

/// Case-insensitive substring check for any lexicon word in `text`
/// (containment semantics — used by F6/F11/F12/F13 per spec).
fn contains_any(text: &str, words: &[&str]) -> bool {
    let lower = text.to_lowercase();
    words.iter().any(|w| lower.contains(&w.to_lowercase()))
}

/// F12/F13 boilerplate-block detection: a paragraph (blank-line block) is a
/// boilerplate block when (a) ANY of its lines contains a BOILERPLATE_MARKERS
/// term, or (b) its first line/sentence is a boilerplate label. The label
/// check accepts both a label-only line ("Datenschutz", "Safety notice:") and
/// a label opening a sentence with content ("Safety notice: Do not disclose
/// personal data.") — a compliance/legal notice is still boilerplate when the
/// label and the body share the first line.
fn is_boilerplate_paragraph(p: &str) -> bool {
    if p.lines().any(|l| contains_any(l, BOILERPLATE_MARKERS)) {
        return true;
    }
    let first_line = p.lines().next().unwrap_or(p).trim();
    if boilerplate_label_re().is_match(first_line)
        || boilerplate_label_prefix_re().is_match(first_line)
    {
        return true;
    }
    // Multi-sentence paragraphs: the first sentence may carry the label even
    // when the first line does not ("Safety notice: Do not disclose personal
    // data." on a line with more text).
    sentences(p).first().is_some_and(|s| {
        boilerplate_label_re().is_match(s.trim())
            || boilerplate_label_prefix_re().is_match(s.trim())
    })
}

/// Compiled word-boundary alternation of `CONCRETE_OP_VERBS`.
fn concrete_op_verb_re() -> &'static Regex {
    static RE: OnceLock<Regex> = OnceLock::new();
    RE.get_or_init(|| {
        let alt = CONCRETE_OP_VERBS
            .iter()
            .map(|v| regex::escape(v))
            .collect::<Vec<_>>()
            .join("|");
        Regex::new(&format!(r"(?i)\b(?:{alt})\b")).unwrap()
    })
}

/// Concrete-core rule (a): the action sentence contains a specific operation
/// verb ("counts" is NOT matched — word-boundary exact; "count", "translate",
/// "summarize", "fasse", "zähle", ... are).
fn has_concrete_operation_verb(sentence: &str) -> bool {
    concrete_op_verb_re().is_match(sentence)
}

/// English verb-inflection noise: "processes"/"saves" (3rd-person -es),
/// "meeting" (-ing), "sorted"/"expected" (-ed) are verb/participle forms that
/// never make a bare prompt concrete. Plurals such as "sales"/"frequencies"
/// are casualties by design — the remaining specific nouns still decide.
fn is_en_verb_inflection(token: &str) -> bool {
    token.ends_with("es") || token.ends_with("ing") || token.ends_with("ed")
}

/// Concrete-core rule (b): count substantive specific nouns in ONE action
/// sentence. A token counts when it is a content token (>= 4 alphanumerics,
/// not all digits, not a DE/EN stopword), is NOT a task verb (action_re), is
/// NOT a generic-content noun (`CONCRETE_GENERIC_NOUNS`), and is not an
/// English verb-inflected form.
fn specific_noun_count(sentence: &str) -> usize {
    sentence
        .split(|c: char| {
            !c.is_alphanumeric()
                && c != 'ä'
                && c != 'ö'
                && c != 'ü'
                && c != 'Ä'
                && c != 'Ö'
                && c != 'Ü'
                && c != 'ß'
        })
        .filter(|tok| {
            let t = tok.to_lowercase();
            t.len() >= 4
                && !t.chars().all(|c| c.is_ascii_digit())
                && !STOPWORDS_DE.iter().any(|w| *w == t)
                && !STOPWORDS_EN.iter().any(|w| *w == t)
                && !action_re().is_match(tok)
                && !CONCRETE_GENERIC_NOUNS.iter().any(|w| *w == t)
                && !is_en_verb_inflection(&t)
        })
        .count()
}

/// Content-bearing tokens: lowercased words >= 4 chars that are not pure
/// digits and not DE/EN stopwords. Splits on any non-alphanumeric char
/// except German umlauts and ß.
fn content_tokens(content: &str) -> Vec<String> {
    let mut seen_any = false;
    let mut out: Vec<String> = Vec::new();
    for tok in content.split(|c: char| {
        !c.is_alphanumeric()
            && c != 'ä'
            && c != 'ö'
            && c != 'ü'
            && c != 'Ä'
            && c != 'Ö'
            && c != 'Ü'
            && c != 'ß'
    }) {
        let t = tok.to_lowercase();
        if t.len() >= 4
            && !t.chars().all(|c| c.is_ascii_digit())
            && !super::lexicons::STOPWORDS_DE.iter().any(|w| *w == t)
            && !super::lexicons::STOPWORDS_EN.iter().any(|w| *w == t)
        {
            out.push(t);
            seen_any = true;
        }
    }
    let _ = seen_any;
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn terse_translation() {
        let content = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
        let fs = extract(content, Language::En);
        assert_eq!(fs.task_signal, EvidenceStrength::Strong);
        // Ladder semantics: "translation" is an artifact, not structure, so the
        // strict Strong (artifact/format + boundary + structure) does not fire;
        // the `return only the` moderate contract does.
        assert!(fs.output_contract_strength >= EvidenceStrength::Moderate);
        assert_eq!(fs.input_present, EvidenceStrength::Strong);
        assert!(fs.self_contained);
        assert!(fs.atomic_action);
        assert_eq!(fs.goal_statement, EvidenceStrength::Strong);
    }

    #[test]
    fn inline_input() {
        let content = "Rewrite this sentence in a formal tone: \"The meeting was postponed.\"\nReturn only the rewritten sentence.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.input_present, EvidenceStrength::Moderate);
        assert_eq!(fs.goal_statement, EvidenceStrength::Strong);
    }

    #[test]
    fn placeholder_fraction() {
        let content = "Translate the text in {A} to English. Ignore {B}.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 2);
        assert_eq!(fs.referenced_placeholder_fraction, 0.5);
    }

    #[test]
    fn procedure_and_context() {
        let content = "# Context\nThe service is a REST API written in Go 1.22 using chi for routing and PostgreSQL for storage.\n\n## Procedure\n1. Inventory the HTTP handlers.\n2. Check dependency manifests.\n3. Review SQL construction.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.numbered_step_count, 3);
        assert_eq!(fs.procedure_steps, EvidenceStrength::Strong);
        assert_eq!(fs.context_substance, EvidenceStrength::Strong);
    }

    #[test]
    fn role_and_constraints() {
        let content = "You are a senior backend security engineer.\n\nDo not use unsafe Rust. Avoid unwrap(). Review the code in {REPO}.";
        let fs = extract(content, Language::En);
        // Role clause > 30 chars with expertise term "engineer".
        assert_eq!(fs.role_present, EvidenceStrength::Strong);
        // "Review the code in {REPO}" is an imperative mandate unit with an
        // action verb ("Review") and an artifact reference ("code").
        assert!(fs.relevant_constraints >= 1);
        // "unsafe" (EN cognate of the SENSITIVE_LEXEMES entry "unsicher")
        // appears outside boilerplate markers.
        assert!(fs.safety_relevant);
    }

    #[test]
    fn redundancy_detected() {
        let content = "Analyze the sales data for the last quarter and explain the variance. You are an expert analyst. You are a senior data analyst. You are a brilliant analyst. You are an outstanding analyst. Analyze the sales data for the last quarter and explain the variance.";
        let fs = extract(content, Language::En);
        // Repeated task sentence, repeated "analyst" token and 4 persona
        // sentences combine into a redundancy signal > 0.3.
        assert!(fs.redundancy > 0.3);
    }

    #[test]
    fn lexical_diversity_low_for_stuffing() {
        let content =
            "quality quality quality quality quality quality quality quality quality quality";
        let fs = extract(content, Language::En);
        // All tokens identical -> type/token ratio collapses well below 0.5.
        assert!(fs.lexical_diversity < 0.5);
    }

    #[test]
    fn placeholder_spam_low_quality() {
        // 13 placeholders, 8 referenced by the imperative sentence, 4 of them
        // spam tokens (INSERT/FORMAT/TODO/PLACEHOLDER): the spam penalty drags
        // the quality below 0.5.
        let content = "Create a report about {A} with regard to {INSERT} and {C}, including {D}, {E}, {FORMAT}, and optionally {G} or {H}. Reference {I}, {TODO} and {K} as needed. Consider {L} and {PLACEHOLDER} where relevant.";
        let fs = extract(content, Language::En);
        assert!(fs.placeholder_count >= 10);
        assert!(fs.placeholder_quality < 0.5);
    }

    #[test]
    fn terse_sufficiency_true() {
        let content = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
        let fs = extract(content, Language::En);
        assert!(fs.terse_sufficiency);
    }

    #[test]
    fn guideline_signal_detected() {
        let content = "# Schreibstil\n- Verwende aktive Formulierungen.\n- Vermeide Füllwörter.";
        let fs = extract(content, Language::De);
        assert_eq!(fs.guideline_signal, 1.0);
    }

    #[test]
    fn use_is_action_verb_and_f3_strong() {
        // Change A + D: "use" is a task verb, so a placeholder used directly
        // as the object of an action sentence ("Use the value in
        // {FILE_CONTENT} as the document.") makes the input present (Strong)
        // and the placeholder referenced.
        let content = "Use the value in {FILE_CONTENT} as the document.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.task_signal, EvidenceStrength::Strong);
        assert_eq!(fs.input_present, EvidenceStrength::Strong);
        assert_eq!(fs.placeholder_count, 1);
        assert_eq!(fs.referenced_placeholder_fraction, 1.0);
    }

    #[test]
    fn transform_goal_strong_with_anchor() {
        // Change C: a transform verb with an anchored input — a referenced
        // placeholder (fraction >= 0.5) or an inline input anchor ("the
        // meeting notes") — makes the goal statement Strong even without a
        // deliverable noun or goal clause.
        let anchored =
            "Summarize it in three bullet points. Use the value in {FILE_CONTENT} as the document.";
        let fs = extract(anchored, Language::En);
        assert_eq!(fs.goal_statement, EvidenceStrength::Strong);

        let inline = "Summarize the meeting notes.";
        let fs = extract(inline, Language::En);
        assert_eq!(fs.goal_statement, EvidenceStrength::Strong);
    }

    #[test]
    fn external_ref_broadened_not_self_contained() {
        // F9: prompts referencing an undefined external subject — "unsere
        // neue Software", "das Team-Meeting", "das Konzept", "the input
        // file", "a customer", "the new gadget", "das Buch", "das
        // wöchentliche Statusmeeting" — are NOT self-contained.
        let cases = [
            "Schreibe einen Werbetext für die neue App.",
            "Erstelle eine Präsentation für das Team-Meeting am Freitag.",
            "Erkläre mir das Konzept. Halte es kurz und einfach.",
            "Write a script that processes the input file and saves the output.",
            "Write an email to the customer.",
            "Write a product description for the new gadget.",
            "Verfasse eine kurze Bewertung für das Buch.",
            "Erstelle eine Folienpräsentation für das monatliche Statusmeeting.",
            "Write a summary of the meeting.",
        ];
        for c in cases {
            let fs = extract(c, Language::En);
            assert!(!fs.self_contained, "expected NOT self-contained: {c}");
        }
    }

    #[test]
    fn r4_inline_meeting_not_external_subject() {
        // A quoted inline input being rewritten ("The meeting was
        // postponed.") must NOT count as an external subject reference, so
        // the prompt stays self-contained.
        let content = "Rewrite this sentence in a formal tone: \"The meeting was postponed.\"\nReturn only the rewritten sentence.";
        let fs = extract(content, Language::En);
        assert!(
            fs.self_contained,
            "inline quoted input must stay self-contained"
        );
    }

    #[test]
    fn meeting_notes_transform_input_not_external_subject() {
        // "the meeting notes" are the transform input, not an external
        // subject — the prompt stays self-contained.
        let content = "Summarize the meeting notes.";
        let fs = extract(content, Language::En);
        assert!(
            fs.self_contained,
            "transform input must stay self-contained"
        );
    }

    #[test]
    fn text_below_anchor_references_placeholder() {
        // The input-anchor phrase "the text below" must count the trailing
        // {{contact_details}} paragraph as referenced — a placeholder
        // anchored by "from the text below" is not placeholder spam.
        let content = "Extract all email addresses and phone numbers from the text below. Return them as a JSON object with the keys \"emails\" and \"phones\":\n\n{{contact_details}}";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 1);
        assert_eq!(
            fs.referenced_placeholder_fraction, 1.0,
            "{{contact_details}} anchored by 'the text below' must be referenced"
        );
        assert!(fs.placeholder_quality >= 0.8);
    }

    #[test]
    fn sensitive_lexeme_in_boilerplate_paragraph_not_safety_relevant() {
        // F12 paragraph-scoped: a sensitive lexeme ("personal data",
        // "secret") inside a boilerplate paragraph ("Safety notice: ...")
        // does NOT mark the task safety-relevant; the boilerplate block
        // still raises the boilerplate severity (>= 1).
        let content = "Write a short recipe for apple cake.\n\nSafety notice: Do not disclose personal data. Follow the data protection regulation. Do not use secret keys. Do not create backups. Inform the data protection officer about incidents.";
        let fs = extract(content, Language::En);
        assert!(!fs.safety_relevant);
        assert!(fs.safety_boilerplate_severity >= 1);
    }

    #[test]
    fn sensitive_lexeme_outside_boilerplate_is_safety_relevant() {
        // F12 positive control: a sensitive lexeme in a NON-boilerplate
        // paragraph still marks the task safety-relevant, even when a
        // separate boilerplate paragraph is present.
        let content =
            "Audit the auth token handling in {REPO}.\n\nDatenschutz: Personenbezogene Daten vertraulich behandeln.";
        let fs = extract(content, Language::En);
        assert!(fs.safety_relevant);
        assert!(fs.safety_boilerplate_severity >= 1);
    }

    #[test]
    fn weak_input_in_boilerplate_paragraph_not_input_present() {
        // F12 block-scope consistency: a weak-input lexeme ("the data") inside
        // a boilerplate paragraph ("Safety notice: ... the data protection
        // regulation ...") is compliance noise, not an input reference. It
        // must NOT elevate input_present — otherwise the Input dimension
        // becomes applicable and the boilerplate addition moves the score
        // beyond the |delta| <= 5 metamorphic bound.
        let content = "Write a short recipe for apple cake.\n\nSafety notice: Do not disclose personal data. Follow the data protection regulation. Do not use secret keys. Do not create backups. Inform the data protection officer about incidents.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.input_present, EvidenceStrength::None);
    }

    #[test]
    fn constraint_statements_require_constraint_terms() {
        // Change B (F11 revert): only sentences carrying a constraint/negation
        // term count as constraint statements — plain action sentences do not.
        let content = "Review the code in {REPO}. Do not use unsafe Rust. Avoid unwrap().";
        let fs = extract(content, Language::En);
        // "Do not use unsafe Rust" is the only task-relevant constraint
        // sentence (constraint term "Do not" + action verb "use").
        // "Review the code in {REPO}" carries NO constraint term and is not
        // counted at all (reverted behavior). "Avoid unwrap()" is a
        // constraint sentence without an action-verb/artifact tie ->
        // boilerplate.
        assert_eq!(fs.relevant_constraints, 1);
        assert_eq!(fs.boilerplate_constraints, 1);
    }

    #[test]
    fn labeled_field_accepts_double_and_single_braces() {
        // F4 rule (b): double-brace placeholders in labeled-field lines must
        // match the labeled-field regex, single braces must keep matching.
        for line in [
            "- Woche: {{woche}}",
            "- Incident ID: {{incident_id}}",
            "- Environment: {ENVIRONMENT}",
        ] {
            assert!(labeled_field_re().is_match(line), "must match: {line}");
        }
    }

    #[test]
    fn double_brace_labeled_fields_referenced() {
        // A labeled-field template: the six labeled fields are all referenced
        // via the labeled-field rule. The "What happened (2-3 sentences)"
        // label carries parentheses outside the label character class, so
        // that single field stays unreferenced (pre-existing single-brace
        // limitation, unchanged by the brace fix).
        let content = "# Incident Handoff Form\n\nUse this template when handing an incident to the next shift team.\n\n- Incident ID: {{incident_id}}\n- Severity: {{severity}}\n- What happened (2-3 sentences): {{what_happened}}\n- Actions already taken: {{actions}}\n- Open questions: {{open_questions}}\n- Next expected action: {{next_action}}\n\nFill every field. If a field is unknown, write UNKNOWN instead of leaving it blank.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 6);
        assert_eq!(
            fs.referenced_placeholder_fraction,
            5.0 / 6.0,
            "incident_id/severity/actions/open_questions/next_action referenced; what_happened has a parenthesized label"
        );
    }

    #[test]
    fn boilerplate_last_paragraph_does_not_shadow_placeholder() {
        // A trailing boilerplate paragraph ("Sicherheitshinweis: ...") must
        // NOT be treated as the "last paragraph" of the input-anchor rule —
        // {{artikel_inhalt}} sits in the paragraph before it and counts as
        // referenced (otherwise the boilerplate would shadow it).
        let content = "Fasse den folgenden Artikel in drei prägnanten Sätzen zusammen. Nenne nur die Kernaussagen, keine Bewertung:\n\n{{artikel_inhalt}}\n\nSicherheitshinweis: Gib keine personenbezogenen Daten Dritter aus, teile keine vertraulichen Informationen und beachte die geltende Datenschutzrichtlinie.";
        let fs = extract(content, Language::De);
        assert_eq!(fs.placeholder_count, 1);
        assert_eq!(fs.referenced_placeholder_fraction, 1.0);
    }

    #[test]
    fn input_heading_references_placeholder() {
        // {German_Text} sits in the paragraph under the "## Input" heading —
        // rule (e) counts it as referenced.
        let content = "# Role Definition\nYou are a professional translator.\n\n## Goal\nYour task is to translate the following German paragraph into British English.\n\n## Context\nIt is a text that needs to be translated. Translations are important for communication.\n\n## Input\n{German_Text}\n\n## Procedure\n1. Read the text.\n2. Translate it.\n3. Check the result.\n\n## Output Format\nReturn the translation.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 1);
        assert_eq!(fs.referenced_placeholder_fraction, 1.0);
    }

    #[test]
    fn heading_section_placeholder_referenced() {
        // A meeting-minutes-shaped template puts its section slots directly
        // under NON-input headings (## Agenda / ## Decisions / ## Action
        // Items / ## Notes). Broadened rule (e) counts each slot as
        // referenced (its paragraph carries the heading line), so the shape
        // is 7/7 referenced instead of placeholder spam.
        let content = "# Meeting Minutes\n\n- Meeting: {{meeting_title}}\n- Date: {{meeting_date}}\n- Attendees: {{attendee_list}}\n\n## Agenda\n{{agenda_entries}}\n\n## Decisions\n{{decision_log}}\n\n## Action Items\n{{action_items}} (owner, due date)\n\n## Notes\n{{note_entries}}\n\nFill every section. If a section has no content, write NOTHING instead of leaving it empty.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 7);
        assert_eq!(fs.referenced_placeholder_fraction, 1.0);
    }

    #[test]
    fn numbered_step_references_placeholder() {
        // {EVIDENCE_DIR} appears in numbered step 3 — rule (f) counts it as
        // referenced.
        let content = "# Security Incident Response Guideline\n\n## Scope\nApplies to confirmed security incidents affecting production systems.\n\n## Procedure\n1. Classify the incident by confidentiality, integrity, availability impact.\n2. Isolate affected systems from the network.\n3. Collect forensic data into {EVIDENCE_DIR}.\n4. Escalate to the security lead if impact is HIGH.";
        let fs = extract(content, Language::En);
        assert_eq!(fs.placeholder_count, 1);
        assert_eq!(fs.referenced_placeholder_fraction, 1.0);
    }

    #[test]
    fn concrete_core_true_for_specific_tasks() {
        // Specific operation verbs or >= 2 specific content nouns make the
        // core concrete.
        let cases = [
            "Write a function in Python that counts word frequencies in a text. Ignore case and punctuation. Return a dict sorted by frequency, most frequent first.",
            "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}",
            "Summarize the meeting notes.",
            "Write a short recipe for apple cake.",
        ];
        for c in cases {
            let fs = extract(c, Language::En);
            assert!(fs.concrete_core, "expected concrete core TRUE: {c}");
        }
    }

    #[test]
    fn concrete_core_false_for_generic_tasks() {
        // Bare/generic task sentences — all nouns generic, no specific
        // operation verb — stay below the bar. "Erstelle ein Angebot für den
        // Kunden." ("Angebot" generic deliverable category, "Kunden" the
        // generic "kunde" surface) and "Erstelle einen Bericht über das
        // Projekt." ("Bericht"/"Projekt" generic; "einen"/"über" function
        // words) stay bare, as do "Write a product announcement." (generic
        // marketing deliverable category), "Verfasse eine Bewertung für das
        // Buch." ("bewertung"/"buch" generic) and "Erstelle eine
        // Folienpräsentation für das monatliche Statusmeeting."
        // ("folienpräsentation"/"statusmeeting" generic).
        let cases: [(&str, Language); 10] = [
            ("Write an email to the customer.", Language::En),
            ("Schreibe einen Werbetext für die neue App.", Language::De),
            (
                "Write a script that processes the input file and saves the output.",
                Language::En,
            ),
            (
                "Erstelle eine Präsentation für das Team-Meeting am Freitag.",
                Language::De,
            ),
            (
                "Erkläre mir das Konzept. Halte es kurz und einfach.",
                Language::De,
            ),
            ("Erstelle bitte ein Angebot für den Kunden.", Language::De),
            ("Erstelle einen Bericht über das Projekt.", Language::De),
            ("Write a product announcement.", Language::En),
            ("Schreibe eine Bewertung für das Buch.", Language::De),
            (
                "Erstelle eine Folienpräsentation für das monatliche Statusmeeting.",
                Language::De,
            ),
        ];
        for (c, l) in cases {
            let fs = extract(c, l);
            assert!(!fs.concrete_core, "expected concrete core FALSE: {c}");
        }
    }

    #[test]
    fn concrete_core_false_without_action_sentence() {
        // No action sentence -> no concrete core.
        let content = "Some random text about the weather.";
        let fs = extract(content, Language::En);
        assert!(!fs.concrete_core);
    }
}
