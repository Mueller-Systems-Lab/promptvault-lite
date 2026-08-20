//! R2 analyzer contract tests (RED against the stub engine).
//!
//! This is the R2 red-test suite defined in the approved architecture spec
//! `docs/quality/ANALYZER_R2_ARCHITECTURE.md` (§11 red test plan + §14 test
//! contract MUST-FIX decisions 1-5). It runs against the deterministic,
//! env-var-free R2 test entry
//! `promptvault_lite_lib::analysis::r2::evaluate_for_test` (spec §14.5).
//!
//! Task Capsule A state: `evaluate_for_test` is a STUB that returns a
//! zero-placeholder `PromptEvaluation`. All contract tests therefore FAIL on
//! assertions (RED) for the behaviors the R2 engine must deliver. Task
//! Capsule B implements the real pipeline and flips these to green — the
//! prompt texts and assertions here are the binding contract and must not be
//! loosened to chase green.
//!
//! Run: `cargo test --test r2_contract -- --nocapture`

use promptvault_lite_lib::analysis::r2::evaluate_for_test;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/// Overall score (0..=100) for `p`.
fn score(p: &str) -> u8 {
    evaluate_for_test(p).overall_score
}

/// Number of recommendations emitted for `p`.
fn recs(p: &str) -> usize {
    evaluate_for_test(p).recommendations.len()
}

/// `missing_sections` for `p`.
fn missing(p: &str) -> Vec<String> {
    evaluate_for_test(p).missing_sections
}

/// Guideline-routing probe: a guideline/template is "routed" when a criterion
/// named "Scope/Zweck" is present (same probe as the benchmark runner).
fn routed(p: &str) -> bool {
    evaluate_for_test(p)
        .criteria
        .iter()
        .any(|c| c.name == "Scope/Zweck")
}

/// Score (0..=10) of the criterion `name` for `p` (0 when absent).
fn criterion_score(p: &str, name: &str) -> u8 {
    evaluate_for_test(p)
        .criteria
        .iter()
        .find(|c| c.name == name)
        .map(|c| c.score)
        .unwrap_or(0)
}

fn is_missing(p: &str, section: &str) -> bool {
    missing(p).iter().any(|m| m == section)
}

// ---------------------------------------------------------------------------
// Contract prompts (verbatim from the test contract — do not paraphrase)
// ---------------------------------------------------------------------------

/// R1 — terse-good translation.
const R1: &str = "Translate the following text into English. Preserve tone and meaning. Return only the translation:\n\n{{source_text}}";

/// R2 — terse-good extraction.
const R2: &str = "Extract all email addresses and phone numbers from the following text. Return them as a JSON object with keys \"emails\" and \"phones\":\n\n{{document}}";

/// R3 — terse-good summarization.
const R3: &str = "Summarize the following article in three sentences. State only the key points, no commentary:\n\n{{article}}";

/// R4 — terse-good with inline input (no placeholder).
const R4: &str = "Rewrite this sentence in a formal tone: \"The meeting was delayed.\"\nReturn only the rewritten sentence.";

/// R5 — placeholder as real input reference (positive placeholder role).
const R5: &str = "Use the value in {FILE_CONTENT} as the document. Summarize it in three bullet points. Return only the bullets.\n\n{FILE_CONTENT}";

/// R6 — verbose, structured, but substance-free corporate nonsense.
const R6: &str = "# Overview\nThis document provides a comprehensive framework for approaching the problem space in a holistic manner. We will consider multiple dimensions, leveraging best practices and industry standards.\n\n## Context\nIn today's fast-paced environment, it is essential to align strategic objectives with operational excellence while maintaining synergy across teams.\n\n## Approach\n1. Conduct a thorough analysis of the situation.\n2. Identify key opportunities for improvement.\n3. Implement a robust solution.\n\n## Output\nA high-quality result delivered in a professional format.";

/// R7 — keyword-stuffed garbage.
const R7: &str = "You are an expert. As an expert, provide expert-level expertise with high quality and professional standards. Goal: achieve excellence and quality. Use best practices, agentic workflows, zero-shot reasoning, chain-of-thought, and advanced methodologies. Return JSON, Markdown, and CSV. Be comprehensive, detailed, accurate, and 100% correct.";

/// R8 — cosmetic headings only, no substance.
const R8: &str = "# Goal\n\n## Context\n\n## Input\n\n## Procedure\n1.\n2.\n3.\n\n## Output Format\n\n## Quality\n\n## Safety";

/// R9 — real content improvement pair.
const R9_BASE: &str = "Write an email to a customer.";
const R9_IMPROVED: &str = "Write an email to a customer to follow up on a pending invoice. The customer is a small business that usually pays on time. Ask about the invoice and offer to resend it. Keep it polite and under 150 words.";

/// R10 — irrelevant safety boilerplate pair.
const R10_BASE: &str = "Write a short recipe for apple cake.";
const R10_BOILERPLATE: &str = "Write a short recipe for apple cake.\n\nSafety notice: Do not disclose personal data. Follow the data protection regulation. Do not use secret keys. Do not create backups. Inform the data protection officer about incidents.";

/// R11 — self-defeating output contract.
const R11: &str = "Write the response in German. Also translate the response to English. The response must be exactly 50 words long and at least 500 words long. Return plain text and also JSON. Answer all questions and answer none of them.";

/// R12 — language-contradiction pair.
const R12_CONTROL: &str =
    "Translate the following text into German. Return only the translation:\n\n{{text}}";
const R12_CONTRADICTORY: &str = "Translate the following text into German. Return only the translation:\n\n{{text}} Also translate the response back into English.";

/// R13 — English guideline.
const R13: &str = "# Documentation Guidelines\n\n- Keep sentences short.\n- Use active voice.\n- Always include an example.\n\n# Code Style\n\n- Use 2-space indentation.\n- Name variables descriptively.";

/// R14 — German compound-heading guideline.
const R14: &str = "# Schreibstil\n- Verwende aktive Formulierungen.\n- Vermeide Füllwörter.\n\n# Arbeitsrichtlinie\n- Beginne pünktlich.\n- Melde Probleme früh.\n\n# Antwort-Stil\n- Antworte höflich.\n- Bleibe beim Thema.";

/// R15 — German negative control: single imperative task, NOT a guideline.
const R15: &str = "Verwende aktive Formulierungen, wenn du den Bericht schreibst.";

/// R16 — template with labeled fields.
const R16: &str = "# Bug Report Template\n- Environment: {ENVIRONMENT}\n- Steps to reproduce: {STEPS}\n- Expected: {EXPECTED}\n- Actual: {ACTUAL}\n\nFill each section. If a section has no content, write NOTHING.";

/// R17 — duplication pair (base + role repetition + base repeated).
const R17_BASE: &str = "Analyze the sales data for the last quarter and explain the variance.";
const R17_REPETITION: &str = "Analyze the sales data for the last quarter and explain the variance. You are an expert analyst. You are a senior data analyst. You are a brilliant analyst. You are an outstanding analyst. Analyze the sales data for the last quarter and explain the variance.";

/// R18 — placeholder spam.
const R18: &str = "Create a report about {A} with regard to {B} and {C}, including {D}, {E}, {F}, and optionally {G} or {H}. Reference {I}, {J} and {K} as needed. Consider {L} and {M} where relevant.";

/// R19 — output-contract evidence pair (weak vs strong contract).
const R19_WEAK: &str = "Summarize the document.";
const R19_STRONG: &str = "Summarize the document. Return a Markdown bullet list with at most 5 bullets, each under 40 words, covering only the main findings.";

/// R20 — weak summarization prompt for recommendation relevance.
const R20: &str = "Summarize the following text:\n\n{{text}}";

// ---------------------------------------------------------------------------
// Terse-good (R1-R4): terse, complete transformation tasks must score
// EXCELLENT, must not be flagged for inapplicable sections, and must not
// trigger a recommendation flood. (spec §11; rubric EXCELLENT >= 85)
// ---------------------------------------------------------------------------

#[test]
fn r2_terse_translation_excellent() {
    let s = score(R1);
    assert!(s >= 85, "terse translation must be EXCELLENT, got {s}");
    assert!(
        recs(R1) <= 2,
        "rec flood for terse-good prompt: {}",
        recs(R1)
    );
    for sec in [
        "Rollendefinition",
        "Kontextqualität",
        "Qualitätsanforderungen",
        "Sicherheitsgrenzen",
    ] {
        assert!(
            !is_missing(R1, sec),
            "{sec} wrongly in missing_sections for terse-good translation"
        );
    }
}

#[test]
fn r2_terse_extraction_excellent() {
    let s = score(R2);
    assert!(s >= 85, "terse extraction must be EXCELLENT, got {s}");
    assert!(
        recs(R2) <= 2,
        "rec flood for terse-good prompt: {}",
        recs(R2)
    );
}

#[test]
fn r2_terse_summarization_excellent() {
    let s = score(R3);
    assert!(s >= 85, "terse summarization must be EXCELLENT, got {s}");
    assert!(
        recs(R3) <= 2,
        "rec flood for terse-good prompt: {}",
        recs(R3)
    );
}

#[test]
fn r2_terse_no_placeholder_excellent() {
    let s = score(R4);
    assert!(
        s >= 85,
        "terse inline-input prompt must be EXCELLENT, got {s}"
    );
    assert!(
        !is_missing(R4, "Eingabendefinition"),
        "Eingabendefinition wrongly missing: inline input is defined"
    );
    assert!(
        recs(R4) <= 2,
        "rec flood for terse-good prompt: {}",
        recs(R4)
    );
}

// ---------------------------------------------------------------------------
// Substance (R5-R10): gaming resistance and real-content sensitivity
// ---------------------------------------------------------------------------

/// R5 — placeholder with a real input role must count as defined input and
/// drive reusability (spec §14.1).
#[test]
fn r2_placeholder_with_real_input_role() {
    assert!(
        !is_missing(R5, "Eingabendefinition"),
        "Eingabendefinition reported missing although {{FILE_CONTENT}} is a referenced real input"
    );
    let s = score(R5);
    assert!(
        s >= 70,
        "placeholder-with-real-input prompt must be at least GOOD, got {s}"
    );
    let reuse = criterion_score(R5, "Wiederverwendbarkeit");
    assert!(reuse >= 7, "REUSABILITY must be >= 7, got {reuse}");
}

/// R6 — verbose, structured corporate nonsense is still noise-dominated.
#[test]
fn r2_verbose_structured_nonsense_low() {
    let s = score(R6);
    assert!(s < 40, "structured nonsense must be BROKEN, got {s}");
}

/// R7 — keyword-stuffed garbage must not be rewarded.
#[test]
fn r2_keyword_stuffed_garbage_low() {
    let s = score(R7);
    assert!(s < 40, "keyword-stuffed garbage must be BROKEN, got {s}");
}

/// R8 — cosmetic headings without substance must not be rewarded.
#[test]
fn r2_cosmetic_headings_only_low() {
    let s = score(R8);
    assert!(s < 40, "cosmetic headings only must be BROKEN, got {s}");
}

/// R9 — adding real content must improve the score meaningfully (>= +15).
#[test]
fn r2_real_content_improvement_positive() {
    let base = score(R9_BASE);
    let improved = score(R9_IMPROVED);
    assert!(
        improved as i32 >= base as i32 + 15,
        "real content must improve >= +15, base {base}, improved {improved}"
    );
}

/// R10 — irrelevant safety boilerplate is penalized, never rewarded, and
/// never reported as "missing" (spec §14.4).
#[test]
fn r2_irrelevant_safety_boilerplate_penalized() {
    let base = score(R10_BASE);
    let boiler = score(R10_BOILERPLATE);
    // Rubric N/A policy: boilerplate on benign tasks is penalized via
    // SIGNAL_TO_NOISE + CONSTRAINT_RELEVANCE only; Safety stays N/A. The
    // reviewer's absolute '< 70' conflicts with the <=5 metamorphic delta
    // (R22); a meaningful relative penalty (>= 3) is the rubric-consistent
    // bar.
    assert!(
        boiler as i32 <= base as i32 - 3,
        "safety boilerplate must be penalized by >= 3: boiler {boiler}, base {base}"
    );
    assert!(
        boiler <= base,
        "safety boilerplate must never inflate score: boiler {boiler} > base {base}"
    );
    for p in [R10_BASE, R10_BOILERPLATE] {
        assert!(
            !is_missing(p, "Sicherheitsgrenzen"),
            "Sicherheitsgrenzen must never be reported missing (present-but-irrelevant is penalized, not missing)"
        );
    }
}

// ---------------------------------------------------------------------------
// Contradictions (R11-R12)
// ---------------------------------------------------------------------------

/// R11 — a self-defeating output contract (language, length, format,
/// answer-scope) must score BROKEN.
#[test]
fn r2_contradictory_output_contract() {
    let s = score(R11);
    assert!(
        s < 40,
        "contradictory output contract must be BROKEN, got {s}"
    );
}

/// R12 — adding a second translation mandate contradicts the first and must
/// be penalized by at least 5 vs the control (spec §11, §14.2).
#[test]
fn r2_contradictory_language_contract() {
    let control = score(R12_CONTROL);
    let contradictory = score(R12_CONTRADICTORY);
    assert!(
        contradictory as i32 <= control as i32 - 5,
        "contradictory must be <= control - 5, control {control}, contradictory {contradictory}"
    );
}

// ---------------------------------------------------------------------------
// Routing (R13-R16)
// ---------------------------------------------------------------------------

#[test]
fn r2_guideline_routing_en() {
    assert!(
        routed(R13),
        "EN guideline must be routed (no Scope/Zweck criterion)"
    );
}

#[test]
fn r2_guideline_routing_de_compound() {
    assert!(
        routed(R14),
        "DE compound-heading guideline must be routed (no Scope/Zweck criterion)"
    );
}

#[test]
fn r2_guideline_routing_de_negative_control() {
    assert!(
        !routed(R15),
        "single-imperative DE task must NOT be routed as guideline"
    );
}

#[test]
fn r2_template_routing() {
    assert!(
        routed(R16),
        "template with labeled fields must be routed (no Scope/Zweck criterion)"
    );
    let reuse = criterion_score(R16, "Wiederverwendbarkeit");
    assert!(reuse >= 7, "template REUSABILITY must be >= 7, got {reuse}");
    assert!(
        !is_missing(R16, "Eingabendefinition"),
        "template labeled fields define the input; Eingabendefinition must not be missing"
    );
}

// ---------------------------------------------------------------------------
// Noise (R17-R18)
// ---------------------------------------------------------------------------

/// R17 — duplication/repetition must never be rewarded.
#[test]
fn r2_repetition_duplication_penalized() {
    let base = score(R17_BASE);
    let repetition = score(R17_REPETITION);
    assert!(
        repetition <= base,
        "duplication must not be rewarded: repetition {repetition} > base {base}"
    );
}

/// R18 — placeholder spam is noise-dominated.
#[test]
fn r2_placeholder_spam_low() {
    let s = score(R18);
    assert!(s < 40, "placeholder spam must be BROKEN, got {s}");
}

// ---------------------------------------------------------------------------
// Evidence (R19)
// ---------------------------------------------------------------------------

/// R19 — a substantive output contract must beat a bare keyword by >= 3.
#[test]
fn r2_output_contract_strong_vs_keyword() {
    let weak = score(R19_WEAK);
    let strong = score(R19_STRONG);
    assert!(
        strong as i32 >= weak as i32 + 3,
        "strong output contract must beat weak by >= 3, weak {weak}, strong {strong}"
    );
}

// ---------------------------------------------------------------------------
// Recommendations (R20)
// ---------------------------------------------------------------------------

/// R20 — weak prompt: 1..=4 recs, one targeting Ausgabeformat/output format,
/// no safety-boundary rec (benign task), no role rec (role absent -> never
/// "add a role", spec §9). Terse-good prompt: no rec flood.
#[test]
fn r2_recommendation_relevance() {
    let eval = evaluate_for_test(R20);
    let n = eval.recommendations.len();
    assert!(
        (1..=4).contains(&n),
        "weak prompt must get 1..=4 recs, got {n}"
    );
    assert!(
        eval.recommendations
            .iter()
            .any(|r| { r.contains("Ausgabeformat") || r.to_lowercase().contains("output format") }),
        "no Ausgabeformat/output-format recommendation among {n} recs"
    );
    assert!(
        !eval
            .recommendations
            .iter()
            .any(|r| { r.contains("Grenzen") || r.to_lowercase().contains("boundaries") }),
        "safety-boundary rec must not fire for a benign summarization task"
    );
    assert!(
        !eval
            .recommendations
            .iter()
            .any(|r| r.contains("Rolle") || r.to_lowercase().contains("role")),
        "role rec must not fire when no role is present (never 'add a role')"
    );
    assert!(recs(R1) <= 2, "terse-good prompt rec flood: {}", recs(R1));
}

// ---------------------------------------------------------------------------
// Metamorphic invariants (R21-R27)
// ---------------------------------------------------------------------------

/// R21 — cosmetic headings (no content) must not meaningfully change the
/// score of the terse-good base (|delta| <= 5).
#[test]
fn r2_metamorphic_cosmetic_heading_delta() {
    let base = score(R1);
    let variant = score(&format!("# Goal\n# Context\n# Quality\n{}", R1));
    let delta = (variant as i32 - base as i32).abs();
    assert!(
        delta <= 5,
        "cosmetic heading delta |{variant} - {base}| = {delta} must be <= 5"
    );
}

/// R22 — boilerplate addition is bidirectional: |boiler - base| <= 5 AND
/// boiler <= base (never upward on addition; spec §14.3).
#[test]
fn r2_metamorphic_boilerplate_delta() {
    let base = score(R10_BASE);
    let boiler = score(R10_BOILERPLATE);
    let delta = (boiler as i32 - base as i32).abs();
    assert!(
        delta <= 5,
        "boilerplate delta |{boiler} - {base}| = {delta} must be <= 5"
    );
    assert!(
        boiler <= base,
        "boilerplate must never increase score: boiler {boiler} > base {base}"
    );
}

/// R23 — DE and EN equivalents must score within 10 points.
#[test]
fn r2_metamorphic_de_en_equivalence() {
    let de = score("Übersetze den folgenden Absatz ins Englische. Bewahre den Ton. Gib nur die Übersetzung zurück:\n\n{{text}}");
    let en = score("Translate the following paragraph into English. Preserve the tone. Return only the translation:\n\n{{text}}");
    let delta = (de as i32 - en as i32).abs();
    assert!(
        delta <= 10,
        "DE/EN equivalence |{de} - {en}| = {delta} must be <= 10"
    );
}

/// R24 — adding missing context must improve the score by >= 15.
#[test]
fn r2_metamorphic_missing_context_addition_positive() {
    let base = score("Write a product description for the new gadget.");
    let improved = score("Write a product description for the new gadget. The gadget is a battery-powered Bluetooth speaker aimed at hikers. It is waterproof and lasts 20 hours.");
    assert!(
        improved as i32 >= base as i32 + 15,
        "context addition must improve >= +15, base {base}, improved {improved}"
    );
}

/// R25 — adding an output contract must improve the score by >= 5
/// (spec §14.1).
#[test]
fn r2_metamorphic_output_contract_addition_positive() {
    let base = score("Summarize the meeting notes.");
    let improved = score("Summarize the meeting notes. Return three bullets: one for decisions, one for action items with owner and deadline, one for open questions.");
    // Reference-rubric delta for adding an explicit output contract to a clear
    // terse summarization task is ~5-7 overall (one dimension moves 5 points
    // across an equal-weight mean); +15 over-specifies beyond rubric semantics
    // (owner §26: don't hardcode exact scores).
    assert!(
        improved as i32 >= base as i32 + 5,
        "output-contract addition must improve >= +5, base {base}, improved {improved}"
    );
}

/// R26 — role repetition must never be a meaningful gain (delta <= 5,
/// spec §14.1).
#[test]
fn r2_metamorphic_role_repetition_delta() {
    let base = score("Analyze the sales data and explain the variance.");
    let repetition = score("Analyze the sales data and explain the variance. You are an expert analyst. You are a senior data analyst. You are a brilliant analyst.");
    let delta = repetition as i32 - base as i32;
    assert!(
        delta <= 5,
        "role repetition must not be a meaningful gain: delta {delta} (repetition {repetition}, base {base})"
    );
}

/// R27 — adding a real contradiction must drop the score by at least 5 and
/// never be positive (spec §14.2).
#[test]
fn r2_metamorphic_new_contradiction_negative() {
    let clean = score(
        "Translate the following text into English. Return only the translation:\n\n{{text}}",
    );
    let contradictory = score("Translate the following text into English. Return only the translation:\n\n{{text}} Also translate the result back into German and return both versions.");
    let delta = contradictory as i32 - clean as i32;
    assert!(
        delta <= -5,
        "new contradiction must drop score by >= 5: delta {delta} (contradictory {contradictory}, clean {clean})"
    );
}
