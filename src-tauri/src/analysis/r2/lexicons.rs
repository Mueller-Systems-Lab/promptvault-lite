#![allow(dead_code)] // consumed by Task Capsule B wiring; keep build clean meanwhile

//! R2 lexicons (spec §2/§7) — DE/EN tables: action verbs, type lexicons,
//! guideline/template signals, imperative bullets, negators, boilerplate
//! markers, noise/filler lexicons, and the closed topic-relation table for
//! contradictions.
//!
//! All tables are `pub const` arrays of `&str` (regex fragments where noted)
//! so `features.rs`, `type_router.rs` and `contradictions.rs` can consume
//! them directly. Stopword tables mirror `quality.rs::generate_quality_recommendations`
//! (`is_german` detection block) exactly.

/// German imperative verb stems as regex fragments (anchored with `\b` +
/// `\w*` by consumers to match conjugated forms, e.g. `schreib\w*` matches
/// "schreibe", "schreibst", "schreiben").
pub const ACTION_VERBS_DE: &[&str] = &[
    r"schreib\w*",
    r"erstell\w*",
    r"generier\w*",
    r"übersetz\w*",
    r"fass\w*",
    r"summar\w*",
    r"analysier\w*",
    r"prüf\w*",
    r"erklär\w*",
    r"extrahier\w*",
    r"klassifizier\w*",
    r"konvertier\w*",
    r"plan\w*",
    r"kürz\w*",
    r"paraphras\w*",
    r"korrigier\w*",
    r"bewert\w*",
    r"erstell\w*",
    r"entwirf\w*",
];

/// English imperative verb stems as regex fragments (consumer adds `\b` +
/// optional suffix, e.g. `analy` matches "analyze"/"analyse").
pub const ACTION_VERBS_EN: &[&str] = &[
    r"write",
    r"create",
    r"generate",
    r"translate",
    r"summarize",
    r"summarise",
    r"analy",
    r"review",
    r"check",
    r"extract",
    r"classify",
    r"convert",
    r"plan",
    r"draft",
    r"rewrite",
    r"rename",
    r"refactor",
    r"tidy",
    r"fill",
    r"explain",
    r"improve",
];

/// German transformation verbs (input-to-output conversion signals).
pub const TRANSFORM_VERBS_DE: &[&str] = &[
    "übersetz",
    "fass zusammen",
    "summar",
    "konvertier",
    "rewrit",
    "paraphras",
    "kürz",
    "shorten",
    "proofread",
    "refactor",
    "rename",
    "normalize",
];

/// English transformation verbs (input-to-output conversion signals).
pub const TRANSFORM_VERBS_EN: &[&str] = &[
    "translate",
    "summarize",
    "convert",
    "rewrite",
    "paraphrase",
    "shorten",
    "proofread",
    "refactor",
    "rename",
    "normalize",
];

/// Artifact noun lexicon — what the output is supposed to be (list, table,
/// report, email, code, structured formats, creative pieces).
pub const ARTIFACT_NOUNS: &[&str] = &[
    "liste",
    "list",
    "tabelle",
    "table",
    "bericht",
    "report",
    "email",
    "letter",
    "code",
    "script",
    "dict",
    "json",
    "csv",
    "markdown",
    "zusammenfassung",
    "summary",
    "outline",
    "rezept",
    "recipe",
    "haiku",
    "gedicht",
    "werbetext",
    "function",
    "bullet",
    "key",
    "keys",
];

/// Output-format signal words (markup/serialization formats plus German
/// structural terms).
pub const OUTPUT_FORMAT_WORDS: &[&str] = &[
    "json", "csv", "markdown", "yaml", "xml", "tabelle", "table", "liste", "list", "text",
    "format", "struktur", "schema",
];

/// Section heading keywords that indicate a guideline/constraint block.
pub const GUIDELINE_HEADINGS: &[&str] = &[
    "Regeln",
    "Rules",
    "Principles",
    "Scope",
    "Geltungsbereich",
    "Policy",
    "Policies",
    "Richtlinie",
    "Guidelines",
    "Conventions",
    "Vorgaben",
    "Anweisungen",
    "Leitlinie",
    "Prinzipien",
];

/// Suffixes that turn a compound heading into a guideline-style block
/// (e.g. "Antwort-stil", "Code-policy", "Schreib-Rules").
pub const COMPOUND_HEADING_SUFFIXES: &[&str] = &[
    "-stil",
    "-richtlinie",
    "-policy",
    "-guideline",
    "-anleitung",
    "-konvention",
    "-regeln",
    "-Rules",
    "-Style",
];

/// German imperative bullet openers (bullet-point directives).
pub const IMPERATIVE_BULLETS_DE: &[&str] = &[
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
    "Bleibe",
    "Antworte",
    "Erkläre",
];

/// English imperative bullet openers (bullet-point directives).
pub const IMPERATIVE_BULLETS_EN: &[&str] = &[
    "Always", "Never", "Use", "Avoid", "Ensure", "Keep", "Apply", "Do not", "Don't", "Prefer",
    "Only", "When",
];

/// Domain policy terms (PromptVault evaluation vocabulary).
pub const POLICY_TERMS: &[&str] = &[
    "Token-Effizienz",
    "BatchPrompting",
    "Batch-Verarbeitung",
    "Ausgabequalität",
    "Skeleton-of-Thought",
    "Kontext-Management",
    "Output-Management",
];

/// Template signal words/phrases that mark prompt templates (fill-in forms,
/// issue/report templates).
pub const TEMPLATE_MARKERS: &[&str] = &[
    "Vorlage",
    "template",
    "use this template",
    "Fill every section",
    "füllen Sie",
    "ausfüllen",
    "Bug Report Template",
    "Meeting Minutes Template",
];

/// German negation words (constraint/forbidden-language detection).
pub const NEGATORS_DE: &[&str] = &[
    "nicht",
    "kein",
    "keine",
    "keinen",
    "nie",
    "niemals",
    "verboten",
    "ohne",
    "ausschließen",
    "vermeiden",
    "unterlassen",
];

/// English negation words/phrases (constraint/forbidden-language detection).
pub const NEGATORS_EN: &[&str] = &[
    "do not", "never", "must not", "no", "without", "don't", "avoid", "exclude", "refrain",
];

/// Boilerplate compliance/security markers (boilerplate-noise detection).
pub const BOILERPLATE_MARKERS: &[&str] = &[
    "sicherheitshinweis",
    "compliance",
    "vorschrift",
    "dsgvo",
    "datenschutzrichtlinie",
    "datenschutz-grundverordnung",
    "privacy note",
    "privacy policy",
    "sicherheit",
];

/// German filler/courtesy words (noise detection).
pub const NOISE_FILLER_DE: &[&str] = &[
    "hoffe",
    "danke",
    "übrigens",
    "wir hoffen",
    "gerne",
    "bitte",
    "immerhin",
    "In der heutigen",
    "In today",
];

/// English filler/buzzword lexicon (noise detection).
pub const NOISE_FILLER_EN: &[&str] = &[
    "hope",
    "thanks",
    "let's",
    "anyway",
    "you know",
    "data is the new oil",
    "best practices",
    "industry standards",
    "synergy",
    "holistic",
    "state-of-the-art",
    "leverage",
    "world-class",
    "cutting-edge",
    "comprehensive framework",
    "fast-paced environment",
    "high quality",
    "professional standards",
];

/// Sensitive lexemes (PII, secrets, security/finance/medical topics) for
/// sensitive-content detection.
pub const SENSITIVE_LEXEMES: &[&str] = &[
    "secret",
    "vertraulich",
    "datenschutz",
    "pii",
    "personenbezogen",
    "auth",
    "token",
    "cve",
    "schwachstell",
    "sicherheitslück",
    "unsicher",
    "destruktiv",
    "irreversibel",
    "finanz",
    "bank",
    "medizin",
    "gesundheit",
    "personal data",
];

/// German stopwords — mirrors `quality.rs::generate_quality_recommendations`
/// `is_german` detection block (`de_words`).
pub const STOPWORDS_DE: &[&str] = &[
    "der", "die", "das", "und", "ist", "ein", "eine", "nicht", "auf", "mit", "für", "im", "bei",
    "wird", "soll", "kann", "du", "deine", "bitte", "sie", "wir",
];

/// English stopwords — mirrors `quality.rs::generate_quality_recommendations`
/// `is_german` detection block (`en_words`).
pub const STOPWORDS_EN: &[&str] = &[
    "the", "and", "is", "a", "to", "of", "for", "with", "you", "your", "should", "will", "can",
    "not", "this", "that", "be", "in", "on", "it",
];

/// A topic-relation rule: one topic name plus its German and English trigger
/// lexemes. Used by the closed contradiction table.
pub struct TopicRule {
    /// Canonical topic name (e.g. "language", "length", "tone").
    pub name: &'static str,
    /// German trigger lexemes (substring matches).
    pub de: &'static [&'static str],
    /// English trigger lexemes (substring matches).
    pub en: &'static [&'static str],
}

/// Closed topic-relation table (spec §2/§8) — canonical topic name with DE/EN
/// trigger lexemes for contradiction detection (e.g. "kurz" vs. "ausführlich").
pub const TOPIC_TABLE: &[TopicRule] = &[
    TopicRule {
        name: "language",
        de: &["deutsch", "auf deutsch", "deutsche antwort", "ins deutsche"],
        en: &[
            "english",
            "in english",
            "english answer",
            "translate to english",
            "into english",
            "german",
            "into german",
            "to german",
            "ins englische",
        ],
    },
    TopicRule {
        name: "length",
        de: &[
            "kurz",
            "lang",
            "ausführlich",
            "detailliert",
            "prägnant",
            "50 wörter",
            "500 wörter",
        ],
        en: &[
            "short",
            "long",
            "brief",
            "exhaustive",
            "detailed",
            "concise",
            "50 words",
            "500 words",
        ],
    },
    TopicRule {
        name: "tone",
        de: &["formell", "sachlich", "freundlich", "höflich", "informell"],
        en: &["formal", "casual", "friendly", "polite", "informal"],
    },
    TopicRule {
        name: "media",
        de: &["bild", "bilder", "screenshot", "grafik"],
        en: &["image", "images", "picture", "screenshot", "graphic"],
    },
    TopicRule {
        name: "format",
        de: &["json", "csv", "markdown", "tabelle", "plain text", "text"],
        en: &["json", "csv", "markdown", "table", "plain text"],
    },
    TopicRule {
        name: "output_data",
        de: &[
            "alle daten",
            "daten ausgeben",
            "keine daten",
            "personenbezogene daten",
        ],
        en: &["output all", "all data", "no data", "personal data"],
    },
    TopicRule {
        name: "question_scope",
        de: &[
            "beantworte alle fragen",
            "beantworte keine fragen",
            "keine fragen",
        ],
        en: &[
            "answer all questions",
            "answer every question",
            "answer no questions",
            "ask questions",
        ],
    },
    TopicRule {
        name: "secrecy",
        de: &["vertraulich", "geheim", "veröffentlichen", "öffentlich"],
        en: &["confidential", "secret", "publish", "public"],
    },
    TopicRule {
        name: "quality",
        de: &["vollständig", "lückenlos", "keine fehler"],
        en: &["complete", "exhaustive", "no errors", "flawless"],
    },
    TopicRule {
        name: "procedure_order",
        de: &["sofort", "erst", "warte auf freigabe", "freigabe"],
        en: &["immediately", "first", "wait for approval", "approval"],
    },
    TopicRule {
        name: "budget",
        de: &["budget", "überschreite niemals", "gib alles aus"],
        en: &["budget", "never exceed", "spend all"],
    },
];
