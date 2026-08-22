//! R2.1 cleanroom contract — deterministic, principle-based.
//! Binding contract for false-high / false-low fixes. No corpus overlap,
//! no calibration anchors. Uses deep_evaluate_for_test.
#![allow(clippy::manual_range_contains)]
#![allow(dead_code, unused_variables)]

use promptvault_lite_lib::analysis::r2::deep_evaluate_for_test;

// Helpers
fn deep(p: &str) -> promptvault_lite_lib::analysis::r2::R2TestOutcome {
    deep_evaluate_for_test(p)
}
fn s(p: &str) -> u8 {
    deep(p).eval.overall_score
}
fn sig(p: &str) -> bool {
    deep(p).signal_poor
}
fn cw(p: &str) -> u8 {
    deep(p).conflict_weight
}
fn crit(p: &str) -> bool {
    deep(p).has_critical_conflict
}
fn dim(p: &str, name: &str) -> f64 {
    deep(p).dims.iter().find(|d| d.name == name).unwrap().score
}
fn kind(p: &str) -> String {
    deep(p).kind_label.to_string()
}
fn ptype(p: &str) -> String {
    deep(p).prompt_type.to_string()
}
fn terse(p: &str) -> bool {
    deep(p).terse_sufficient
}
fn recs(p: &str) -> usize {
    deep(p).eval.recommendations.len()
}

// ---------------------------------------------------------------------------
// Prompt literals (synthetic, not verbatim corpus)
// ---------------------------------------------------------------------------

const FH_BROKEN: &str = "Erstelle den Projektbericht. Beginne mit dem Fazit. Ende mit dem Fazit. Schreibe in aktiver Form. Schreibe in passiver Form. Nenne keine Zahlen. Gib alle Kennzahlen an.";
const FH_CLEAN: &str = "Erstelle den Projektbericht. Beginne mit der Einleitung. Schreibe in aktiver Form. Füge alle Kennzahlen präzise hinzu.";

const VOICE_DE: &str =
    "Schreibe den Bericht in aktiver Form. Schreibe den Bericht in passiver Form.";
const VOICE_EN: &str = "Write the report in active voice. Write the report in passive voice.";

const SECTION_DE: &str = "Beginne mit dem Fazit. Ende mit dem Fazit.";
const SECTION_EN: &str = "Start with the conclusion. End with the conclusion.";

const METRIC: &str = "Nenne keine Zahlen. Gib alle Kennzahlen an.";

const FORMAT_BROKEN: &str = "Return only YAML. Return only XML.";
const FORMAT_CLEAN: &str = "List the configuration keys and their default values from the file below. Return the mapping as YAML.\n\n{{config_file}}";

const LANG_DE: &str = "Schreibe die Antwort auf Deutsch. Übersetze die Antwort ins Englische.";

const TERSE_EN: &str = "List all email addresses and phone numbers from the following text. Return one per line.\n\n{{text}}";
const TERSE_DE: &str = "Liste alle E-Mail-Adressen und Telefonnummern aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";

const TEMPLATE_USEFUL: &str = "# Project Update Template\n\n- Project: {{project_name}}\n- Date: {{date}}\n- Owner: {{owner}}\n- Status: {{status}}\n- Next steps: {{next_steps}}\n\nFill every section. If a section has no content, write NOTHING.";
const TEMPLATE_SPAM: &str = "Create a report about {A} with regard to {B} and {C}, including {D}, {E}, {F}, and optionally {G} or {H}. Reference {I}, {J} and {K} as needed. Consider {L} and {M} where relevant.";

const GUIDELINE_DE: &str = "# Antwort-Regeln\n\n- Antworte immer auf Deutsch.\n- Verwende einen freundlichen Ton.\n- Erkläre jede Entscheidung kurz.\n\nJede Antwort muss die Regeln befolgen.";
const GUIDELINE_EN: &str = "# Documentation Guidelines\n\n- Keep sentences short.\n- Use active voice.\n- Always include an example.\n\n# Code Style\n\n- Use 2-space indentation.\n- Name variables descriptively.";

const TYPE_AWARE: &str = "List the two choices and the one action from the note below as three separate lines:\n\n\"The team decided to prolong testing for four weeks, selected the Friday slot, and requested sales to verify the limit.\"";

const CRITICAL: &str = "Schreibe in aktiver Form. Schreibe in passiver Form.";

// Action family prompts (EN) — all share the same deliverable to keep Goal Strong
const EN_LIST: &str =
    "List all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_IDENTIFY: &str =
    "Identify all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_FIND: &str =
    "Find all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_RETURN: &str =
    "Return all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_ENUMERATE: &str =
    "Enumerate all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_COLLECT: &str =
    "Collect all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_SELECT: &str =
    "Select all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_RETRIEVE: &str =
    "Retrieve all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_SHOW: &str =
    "Show all email addresses from the following text. Return one per line.\n\n{{text}}";
const EN_OUTPUT: &str =
    "Output all email addresses from the following text. Return one per line.\n\n{{text}}";

// DE family
const DE_LISTE: &str =
    "Liste alle E-Mail-Adressen aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_IDENT: &str = "Identifiziere alle Kostenstellen aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_FINDE: &str =
    "Finde alle Telefonnummern aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_GIB: &str =
    "Gib alle Bestellnummern aus dem folgenden Text zurück. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_NENNE: &str =
    "Nenne alle Teilnehmer aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_ERMITTLE: &str =
    "Ermittle alle Ursachen aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_ZEIGE: &str =
    "Zeige alle Kennzahlen aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";
const DE_EXTRAHIER: &str =
    "Extrahiere alle Beträge aus dem folgenden Text. Gib eine pro Zeile zurück.\n\n{{text}}";

// Metamorphic bases
const GOOD_BASE: &str = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
const GOOD_HEADINGS: &str = "# Goal\n# Context\n# Quality\nTranslate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";
const GOOD_DE: &str = "Übersetze den folgenden Absatz ins Englische. Bewahre den Ton. Gib nur die Übersetzung zurück:\n\n{{text}}";
const GOOD_EN: &str = "Translate the following paragraph into English. Preserve the tone. Return only the translation:\n\n{{text}}";
const BOILER_BASE: &str = "Write a short recipe for apple cake.";
const BOILER_ADD: &str = "Write a short recipe for apple cake.\n\nSafety notice: Do not disclose personal data. Follow the data protection regulation. Do not use secret keys. Do not create backups. Inform the data protection officer about incidents.";
const GAMING_JUNK: &str = "You are an expert. You are a senior expert. Provide expert-level expertise with high quality and professional standards. Avoid filler words. Never use jargon. It is essential to achieve excellence and quality. Use best practices, agentic workflows, zero-shot reasoning, chain-of-thought, and advanced methodologies. The codebase expects expert-level output. This output complies with the privacy policy. Return JSON, Markdown, and CSV.";

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

#[test]
fn r21_fh_false_high() {
    assert!(
        s(FH_BROKEN) <= 45,
        "broken must be <=45, got {}",
        s(FH_BROKEN)
    );
    assert!(crit(FH_BROKEN), "broken must be critical");
    assert!(cw(FH_BROKEN) >= 6, "broken cw >=6");
    assert_eq!(dim(FH_BROKEN, "Consistency"), 0.0);
    assert!(s(FH_CLEAN) >= 70, "clean >=70, got {}", s(FH_CLEAN));
    assert!(
        (s(FH_CLEAN) as i16 - s(FH_BROKEN) as i16) >= 15,
        "delta >=15 clean {} broken {}",
        s(FH_CLEAN),
        s(FH_BROKEN)
    );
}

#[test]
fn r21_voice_contradiction_de() {
    assert!(cw(VOICE_DE) >= 6);
    assert!(crit(VOICE_DE));
    assert_eq!(dim(VOICE_DE, "Consistency"), 0.0);
}

#[test]
fn r21_voice_contradiction_en() {
    assert!(cw(VOICE_EN) >= 6);
    assert!(crit(VOICE_EN));
    assert_eq!(dim(VOICE_EN, "Consistency"), 0.0);
}

#[test]
fn r21_final_summary_contradiction() {
    assert!(cw(SECTION_DE) >= 6, "section de cw {}", cw(SECTION_DE));
    assert!(crit(SECTION_DE));
    assert_eq!(dim(SECTION_DE, "Consistency"), 0.0);
    assert!(cw(SECTION_EN) >= 6);
    assert!(crit(SECTION_EN));
}

#[test]
fn r21_metric_contradiction() {
    assert!(cw(METRIC) >= 6);
    assert!(crit(METRIC));
    assert_eq!(dim(METRIC, "Consistency"), 0.0);
}

#[test]
fn r21_format_contradiction() {
    assert!(cw(FORMAT_BROKEN) >= 4, "yaml/xml cw {}", cw(FORMAT_BROKEN));
    assert!(!crit(FORMAT_BROKEN), "yaml/xml not critical");
    assert!(s(FORMAT_BROKEN) < 70, "broken <70 got {}", s(FORMAT_BROKEN));
    assert!(s(FORMAT_CLEAN) >= 70, "clean >=70 got {}", s(FORMAT_CLEAN));
    assert!(
        (s(FORMAT_CLEAN) as i16 - s(FORMAT_BROKEN) as i16) >= 15,
        "delta >=15"
    );
}

#[test]
fn r21_language_contradiction_de() {
    assert!(cw(LANG_DE) >= 6);
    assert!(crit(LANG_DE));
    assert_eq!(dim(LANG_DE, "Consistency"), 0.0);
}

#[test]
fn r21_terse_extraction_en() {
    assert!(s(TERSE_EN) >= 85, "terse en >=85 got {}", s(TERSE_EN));
    assert!(!sig(TERSE_EN), "not sig poor");
    assert!(terse(TERSE_EN), "terse sufficient");
    assert_eq!(kind(TERSE_EN), "task");
    assert_eq!(ptype(TERSE_EN), "Extraction");
    assert!(recs(TERSE_EN) <= 2, "recs <=2 got {}", recs(TERSE_EN));
}

#[test]
fn r21_terse_extraction_de() {
    assert!(s(TERSE_DE) >= 85, "terse de >=85 got {}", s(TERSE_DE));
    assert!(!sig(TERSE_DE));
    assert!(terse(TERSE_DE));
    assert_eq!(kind(TERSE_DE), "task");
    assert_eq!(ptype(TERSE_DE), "Extraction");
    assert!(recs(TERSE_DE) <= 2);
}

#[test]
fn r21_action_family_recognition() {
    let en_prompts = [
        EN_LIST,
        EN_IDENTIFY,
        EN_FIND,
        EN_RETURN,
        EN_ENUMERATE,
        EN_COLLECT,
        EN_SELECT,
        EN_RETRIEVE,
        EN_SHOW,
        EN_OUTPUT,
    ];
    for p in en_prompts {
        assert!(!sig(p), "en family not sig poor: {}", &p[..20]);
        assert!(s(p) >= 60, "en family >=60 got {} for {}", s(p), &p[..15]);
        assert_eq!(ptype(p), "Extraction", "en family extraction routing");
    }
    let de_prompts = [
        DE_LISTE,
        DE_IDENT,
        DE_FINDE,
        DE_GIB,
        DE_NENNE,
        DE_ERMITTLE,
        DE_ZEIGE,
        DE_EXTRAHIER,
    ];
    for p in de_prompts {
        assert!(!sig(p), "de family not sig poor: {}", &p[..20]);
        assert!(s(p) >= 60, "de family >=60 got {} for {}", s(p), &p[..15]);
        assert_eq!(ptype(p), "Extraction");
    }
}

#[test]
fn r21_template_sufficiency() {
    // useful
    assert_eq!(kind(TEMPLATE_USEFUL), "template");
    assert!(!sig(TEMPLATE_USEFUL), "useful not sig poor");
    assert!(
        s(TEMPLATE_USEFUL) >= 80,
        "useful >=80 got {}",
        s(TEMPLATE_USEFUL)
    );
    assert!(
        dim(TEMPLATE_USEFUL, "Reuse") >= 7.0,
        "reuse >=7 got {}",
        dim(TEMPLATE_USEFUL, "Reuse")
    );
    // spam
    assert!(sig(TEMPLATE_SPAM), "spam sig poor");
    assert!(s(TEMPLATE_SPAM) < 45, "spam <45 got {}", s(TEMPLATE_SPAM));
    assert!(
        (s(TEMPLATE_USEFUL) as i16 - s(TEMPLATE_SPAM) as i16) >= 25,
        "delta >=25 useful {} spam {}",
        s(TEMPLATE_USEFUL),
        s(TEMPLATE_SPAM)
    );
}

#[test]
fn r21_guideline_routing_de() {
    assert_eq!(kind(GUIDELINE_DE), "guideline");
    assert!(
        s(GUIDELINE_DE) >= 70,
        "guideline de >=70 got {}",
        s(GUIDELINE_DE)
    );
    assert!(!sig(GUIDELINE_DE));
}

#[test]
fn r21_guideline_routing_en() {
    assert_eq!(kind(GUIDELINE_EN), "guideline");
    assert!(
        s(GUIDELINE_EN) >= 70,
        "guideline en >=70 got {}",
        s(GUIDELINE_EN)
    );
    assert!(!sig(GUIDELINE_EN));
}

#[test]
fn r21_type_aware_signal_sufficiency() {
    assert!(!sig(TYPE_AWARE), "type aware not sig poor");
    assert!(terse(TYPE_AWARE), "terse sufficient");
    assert!(s(TYPE_AWARE) >= 85, "type aware >=85 got {}", s(TYPE_AWARE));
}

#[test]
fn r21_critical_conflict_cap() {
    assert!(crit(CRITICAL));
    assert!(s(CRITICAL) <= 45, "critical <=45 got {}", s(CRITICAL));
    assert_eq!(dim(CRITICAL, "Consistency"), 0.0);
    assert!(sig(CRITICAL), "critical sig poor");
    assert!(cw(CRITICAL) >= 6);
}

// Metamorphic

#[test]
fn r21_m1_good_headings_delta() {
    let delta = (s(GOOD_HEADINGS) as i16 - s(GOOD_BASE) as i16).abs();
    assert!(delta <= 5, "M1 delta <=5 got {}", delta);
}

#[test]
fn r21_m2_good_contradiction_drop() {
    let good = GOOD_BASE;
    let bad = format!(
        "{} Also translate the result back into German and return both versions.",
        GOOD_BASE.replace("{{source_text}}", "{{text}}")
    );
    // Use a clean vs contradictory pair with language conflict
    let clean =
        "Translate the following text into English. Return only the translation:\n\n{{text}}";
    let contra = "Translate the following text into English. Return only the translation:\n\n{{text}} Also translate the result back into German and return both versions.";
    assert!(
        (s(contra) as i16) <= (s(clean) as i16) - 15,
        "M2 drop >=15 clean {} contra {}",
        s(clean),
        s(contra)
    );
    let _ = good; // suppress unused
}

#[test]
fn r21_m3_terse_boilerplate_never_inflate() {
    let terse = TERSE_EN;
    let boiler = format!("{}\n\nSafety notice: Do not disclose personal data. Follow the data protection regulation.", terse);
    assert!(s(&boiler) <= s(terse), "M3 never inflate");
    let delta = s(terse) as i16 - s(&boiler) as i16;
    assert!(delta >= 0 && delta <= 15, "M3 delta 0..15 got {}", delta);
}

#[test]
fn r21_m4_de_en_equivalence() {
    let delta = (s(GOOD_DE) as i16 - s(GOOD_EN) as i16).abs();
    assert!(delta <= 10, "M4 DE/EN delta <=10 got {}", delta);
}

#[test]
fn r21_m5_useful_placeholders_not_sig_poor() {
    assert!(!sig(TEMPLATE_USEFUL), "M5 useful not sig poor");
}

#[test]
fn r21_m6_spam_delta() {
    assert!(s(TEMPLATE_SPAM) < 45);
    assert!((s(TEMPLATE_USEFUL) as i16 - s(TEMPLATE_SPAM) as i16) >= 25);
}

#[test]
fn r21_m7_broken_headings_still_le_45() {
    let broken_headings = format!("# Goal\n# Context\n{}", FH_BROKEN);
    assert!(
        s(&broken_headings) <= 45,
        "M7 broken+headings still <=45 got {}",
        s(&broken_headings)
    );
}

#[test]
fn r21_g1_gaming_junk_still_lt_45() {
    assert!(s(GAMING_JUNK) < 45, "G1 gaming <45 got {}", s(GAMING_JUNK));
}
