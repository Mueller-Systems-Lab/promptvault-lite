# Analyzer R2 — Architecture Specification (Approved Design)

**Status:** APPROVED for implementation (R2_ARCHITECTURE_APPROVED)
**Date:** 2026-08-19
**Baseline SHA:** 7baa673955f9dad42a89e30b1e24461a991fc47e
**Scope:** Deterministic, LLM-free, offline feature-composition redesign of the PromptVault analyzer.
**Public contract:** `evaluate_prompt(content, id) -> PromptEvaluation` unchanged. Public wording stays "Struktur- und Vollständigkeits-Analyse".

This document is the specification the R2 implementation must follow. It derives from (a) the failure forensics of the AMBER baseline, (b) the owner's R2 requirements, and (c) the reference rubric in `benchmarks/semantic-quality/rubric.json`.

---

## 1. Architecture Overview

Replace the keyword-count criterion model with an evidence-strength judgement over composable deterministic features.

Pipeline (owner's preferred chain):

```
RAW CONTENT
  -> truncate at 100K chars (existing guard)
  -> PREPROCESS (language DE/EN, tokenize, paragraph/section index)
  -> PROMPT TYPE (type_router: ContentKind {Guideline|Template|Task(PromptType)})
  -> FEATURE EXTRACTION  (features.rs: ~21 evidence-level features)
  -> CRITERION APPLICABILITY (applicability.rs: per-dimension Required/Optional/NA)
  -> EVIDENCE STRENGTH (NONE/WEAK/MODERATE/STRONG per dimension)
  -> CONFLICT/NOISE PENALTIES (contradictions.rs + noise/redundancy -> fold into consistency/noise/completeness)
  -> CRITERION SCORES (scoring.rs: anchor ladders 10/7/5/3/0)
  -> CALIBRATED OVERALL (scoring.rs: equal-weight mean over applicable internal dimensions *10)
  -> CONFIDENCE-AWARE RECOMMENDATIONS (recommendations.rs: gated, capped, WHAT/WHY/CHANGE)
  -> PromptEvaluation (public API, unchanged shape)
```

## 2. Module Layout (new, under src-tauri/src/analysis/r2/)

```
r2/
  mod.rs              pipeline orchestration + InternalEvaluation + FeatureSet/DimensionScores + conversion to PromptEvaluation
  lexicons.rs         DE/EN tables: action verbs, type lexicons, guideline/template signals, imperative bullets,
                      negators, boilerplate markers, noise/filler lexicons, topic relation table (shared router+contradictions)
  type_router.rs      classify() -> ContentKind {Guideline|Template|Task(PromptType)}, PromptType enum, language detect,
                      pub(crate) is_guideline() (single source for quality.rs AND hygiene.rs)
  features.rs         F1..F21 evidence extraction + EvidenceStrength enum + substance helpers
  applicability.rs    Applicability enum + type x dimension matrix + per-dimension decide()
  contradictions.rs   mandate extraction, polarity/topic/scope, C1..C8 classes, conflict_weight
  scoring.rs          anchor-ladder scorer per dimension, equal-weight mean, overall mapping,
                      CriterionEvidence struct (applicability, positive/negative signals, evidence_strength,
                      confidence, raw_score, final_score, details)
  recommendations.rs  gated/capped WHAT-WHY-CHANGE rec generation (DE/EN)
```

`quality.rs` shrinks to: public `evaluate_prompt` entry, empty-prompt constant, 100K guard, delegate to `r2`. `analysis/mod.rs` adds `pub mod r2;`. During the transition window old functions stay (dual-engine behind flag), then removed in a separate cleanup.

## 3. Internal Dimensions (12, mirror of reference rubric)

GOAL_CLARITY, NECESSARY_CONTEXT, INPUT_DEFINITION, OUTPUT_CONTRACT, CONSTRAINT_RELEVANCE, ACTIONABILITY, AMBIGUITY_CONTROL, INTERNAL_CONSISTENCY, FIT_FOR_PURPOSE_COMPLETENESS, SIGNAL_TO_NOISE, SAFETY_PRIVACY_BOUNDARIES, REUSABILITY.

Reported PV criteria: 10 task names / 8 guideline names unchanged. ROLLENDEFINITION is reported-only (never in the overall mean; the reference rubric has no persona dimension).

## 4. Scoring Model

- **Equal-weight mean (1/n) over applicable internal dimensions** — matches reference `round(mean(applicable)*10)`. Fixed unequal weights are dropped (they renormalize on N/A exclusion and bias vs the reference).
- Internal dims score 0..10 via anchor ladders; `overall = round(mean(applicable)*10).clamp(0,100)`.
- "Applicable but not needed" -> rubric-neutral high anchor (10 for constraint/safety/context when appropriately absent; 8 for optional procedure/quality on terse-sufficient prompts), NOT exclusion. This is the structural fix for terse-good false-lows.
- NotApplicable only for genuine inapplicability (pure ideation -> INPUT NA; format-open-by-intent -> OUTPUT NA; one-off -> REUSABILITY NA; benign -> SAFETY NA).
- **Contradictions fold into INTERNAL_CONSISTENCY** (mean member). One defensive post-aggregation guard: `if conflict_weight >= 6 { overall = min(overall, 45) }` (rubric "multiple contradictions" anchor).
- **Noise/redundancy/boilerplate fold into SIGNAL_TO_NOISE + CONSTRAINT_RELEVANCE** (per rubric N/A policy, no double counting). Old N/A-gated noise penalty removed.
- Heuristic ceilings removed (Qualität max 8, Sicherheit max 8 -> both can reach 10).
- Anti-gaming substance rule: **a dimension is never NotApplicable when its content is present**. Present-but-irrelevant content is scored low. Sprinkling keywords makes content applicable, and substance/noise checks punish it.

## 5. Feature Model (F1..F21)

All pure functions of truncated content + ContentKind. Evidence levels NONE=0/WEAK=1/MODERATE=2/STRONG=3.

- F1 task_signal (action verb + substantive object) -> GOAL, ACTIONABILITY
- F2 goal_statement (explicit goal clause/deliverable; NOT placeholder-gated) -> GOAL
- F3 input_present (embedded/named/inline input, boundary clarity) -> INPUT
- F4 input_referenced (placeholder/anchor actually referenced by task) -> INPUT, REUSABILITY, placeholder-spam guard
- F5 output_contract_strength (format+structure+content-boundary ladder) -> OUTPUT
- F6 output_matches_task (output artifact/object overlap with task objects) -> OUTPUT (caps 7 if ratio<0.3), CONSTRAINT
- F7 procedure_steps (numbered/bulleted/sequence, substance, task-overlap; single atomic action = high ACTIONABILITY) -> ACTIONABILITY
- F8 context_substance (task-relevant background; generic-restatement detector) -> CONTEXT
- F9 self_contained (external facts referenced vs supplied) -> CONTEXT (10), COMPLETENESS
- F10 role_present (persona substance, repetition count) -> ROLE (reported only)
- F11 constraint_statements (mandate units classified task-relevant vs boilerplate) -> CONSTRAINT
- F12 safety_relevant (sensitive lexemes outside boilerplate) -> SAFETY applicability
- F13 safety_boilerplate (boilerplate block length/clause count) -> NOISE, CONSTRAINT
- F14 redundancy (token max-freq, dup sentences, role repetition, single-class stuffing) -> NOISE, AMBIGUITY
- F15 filler_ratio (greeting/hedging/generality sentences / total) -> NOISE
- F16 signal_to_noise_ratio (task-signal sentences / total) -> NOISE
- F17 contradiction_count + conflict_weight (from contradictions.rs) -> CONSISTENCY
- F18 lexical_diversity (unique content lemmas / tokens) -> NOISE
- F19 placeholder_quality (distinct, referenced, empty/TODO placeholders) -> INPUT, REUSABILITY, gaming guard
- F20 terse_sufficiency (atomic verb + clear goal + clear input + clear output + low ambiguity + no open decisions) -> COMPLETENESS; absent optional sections are neutral when true
- F21 guideline_signals / template_signals -> CONTENT-KIND classification

Relationship features that must matter more than keyword count: F4, F6, F7 task-overlap, F8 task-relevance, F9, F20.

## 6. Applicability Matrix (Required / Optional(x) / NotApplicable)

| Type | Goal | Context | Input | Output | Constraint | Action | Clarity | Consistency | Completeness | Noise | Safety | Reuse |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| TRANSLATION | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | NA(10 benign) | O |
| SUMMARIZATION | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | NA(10) | O |
| EXTRACTION | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | NA(10) | O |
| CLASSIFICATION | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | O | O |
| TRANSFORMATION | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | NA(10) | O |
| GENERATION | R | R | O | R | O(10) | O(8) | R | R | R | R | NA(10) | O |
| PLANNING | R | R | R | R | R | R | R | R | R | R | O | NA |
| ANALYSIS | R | R | R | R | O(10) | O(8) | R | R | R | R | O | NA |
| CODING | R | R | R | R | R | O(8) | R | R | R | R | O | O |
| AGENT/WORKFLOW | R | R | R | R | R | R | R | R | R | R | R | O |
| TEMPLATE | R | O(10) | R | R | O(10) | O(8) | R | R | R | R | NA(10) | R |
| GENERAL_TASK | R | R | R-if-data | R | O(10) | O(8) | R | R | R | R | O | NA |

Every NA decision carries a machine reason string (confidence/justification).

## 7. Type Router

- Language: existing DE/EN stopword heuristic.
- ContentKind: scored classifier (not hard >=2 gate). guideline_score = sum of per-match counts: +1.0 canonical heading, +0.8 compound heading suffix (`-stil`, `-richtlinie`, `-policy`, `-guideline`, `-anleitung`, `-konvention`, `-regeln`), +0.6 imperative bullet (DE expanded: Verwende/Achte/Vermeide/Halte/Nutze/Stelle sicher/Erledige/Warte/Überschreite/Fasse/Nenne/Kennzeichne/Prüfe/Melde/Beginne/Sprich/Beantworte/Frage/Definiere/Dokumentiere; EN: Always/Never/Use/Avoid/Ensure/Keep/Apply/Do not/Don't/Prefer/Only/When — per-match), +0.5 policy/quality term. Guideline if score >= 2.0, unless dominated by a single-task imperative with concrete deliverable. template_score = placeholder density >= 0.3 + template markers + labeled fields.
- PromptType: type lexicons, scored argmax, GENERAL_TASK fallback on tie/under-threshold. Types: TRANSLATION, SUMMARIZATION, EXTRACTION, CLASSIFICATION, TRANSFORMATION, GENERATION, PLANNING, ANALYSIS, CODING, AGENT/WORKFLOW, TEMPLATE, GENERAL_TASK.
- Single source of truth: `r2::type_router::is_guideline` used by BOTH quality.rs and hygiene.rs (delete the two divergent copies).

## 8. Contradiction Model

- Mandate extraction: imperative sentences/bullets/clauses -> (surface_text, polarity +1/-1, target_topic, scope_paragraph).
- Topic relation table (closed, small, DE/EN): language, length, tone, media, format, output-data, question-scope, secrecy, quality, procedure-order, budget.
- Conflict classes C1..C8 (only same-topic + opposite-polarity): language (w6), format-exclusivity >=3 formats or same-format +/- (w4), length (w3), secrecy/publish (w4), answer-scope (w4), output-data (w6), negation-antonym pair (w4), intent-contrast same-paragraph (w4).
- Conservative gates: same topic + opposite polarity only; paragraph-scope gate; single-pair-per-topic cap; polarity must be unambiguous (ambiguous -> LOW-confidence suspicion only, never penalized); total conflict_weight capped at 12; INTERNAL_CONSISTENCY = max(0, 10 - weight) mapped to anchors.

## 9. Recommendation Model

- Emission gate: applicable AND (score < 5, or < 7 for required GOAL/INPUT/OUTPUT) AND confidence HIGH/MEDIUM.
- Content-gated suppression: ROLE rec only when role present-but-bad (never "add a role" when absent); CONTEXT rec only when external facts missing; INPUT rec suppressed when placeholders exist; OUTPUT rec suppressed when substantive contract exists; SAFETY rec only for sensitive domain with no boundaries; PROCEDURE rec suppressed when single atomic action suffices; CONTRADICTION recs per fired conflict (quote both mandates).
- Cap: max 4 recs per prompt, ranked by conflict severity / impact / confidence.
- Format: "<WHAT>: <dimension keyword> <specific gap> — <WHY> — <CHANGE minimal fix>." Must contain the PV criterion keyword (metrics matching depends on it). DE/EN by detected language.
- Confidence: HIGH when >=2 independent signals agree and none contradict; MEDIUM single signal; LOW contradictory/ambiguous. Optional additive `analysis_confidence: Option<f64>` on PromptEvaluation (default off, needs owner sign-off).

## 10. Migration Plan

- M0: freeze baseline (done: pv-baseline-r2-pre.json).
- M1: r2/ skeleton (lexicons + preprocess + type_router classify) behind no behavior change. Routing red tests first.
- M2: swap quality.rs + hygiene.rs to shared router. Routing accuracy must improve.
- M3: features.rs + contradictions.rs pure functions with unit tests. No wiring.
- M4: applicability.rs + scoring.rs; full pipeline behind flag PV_USE_R2 (default off). Dual-engine compare on calibration. Targets: within-one-band >= 75%, critical false-low < 15%, false-high = 0, terse mean >= 85, gaming 1.0, routing >= 95%. NO holdout run.
- M5: re-baseline 8 test_red_* principles (never delete; document rationale), add R2 red suite.
- M6: flip default, delete deprecated legacy (separate cleanup commit), single locked holdout run once.
- M7: hygiene review; detector threshold alignment only in separate owner-approved PR.

## 11. Red Test Plan (24 tests, written first)

Terse-good: r2_terse_translation_excellent, r2_terse_extraction_excellent, r2_terse_summarization_excellent, r2_terse_no_placeholder_excellent (>=85, <=2 recs, no rec flood).
Gaming/substance: r2_verbose_structured_nonsense_low (<40), r2_keyword_stuffed_garbage_low (<40), r2_cosmetic_headings_only_low (<40), r2_real_content_improvement_positive (>= +15), r2_irrelevant_safety_boilerplate_penalized, r2_contradictory_output_contract (<40), r2_contradictory_language_contract (penalized vs control).
Routing: r2_guideline_routing_en, r2_guideline_routing_de_compound (Schreibstil/Arbeitsrichtlinie/Antwort-Stil), r2_guideline_routing_de_negative_control (NOT routed), r2_template_routing.
Noise: r2_repetition_duplication_penalized, r2_placeholder_spam_low.
Evidence: r2_output_contract_strong_vs_keyword (strong >= weak + 3).
Recommendations: r2_recommendation_relevance.
Metamorphic invariants: r2_metamorphic_cosmetic_heading_delta (<=5), r2_metamorphic_boilerplate_delta (<=5, never upward), r2_metamorphic_de_en_equivalence (<=10), r2_metamorphic_missing_context_addition_positive (positive delta), r2_metamorphic_new_contradiction_negative (>= -3, never positive).

## 12. Risks (accepted, with mitigations)

1. Over-applicability inflating gaming -> substance rule + always-on noise/consistency.
2. Contradiction false positives -> closed topic table, explicit polarity, paragraph-scope, single-pair cap, LOW-confidence never penalizes.
3. Regression in existing good behaviors -> M1-M3 behavior-preserving, dual-engine flag, re-baselined (not deleted) tests.
4. Hygiene divergence -> shared router; detector alignment deferred to separate PR.
5. Performance -> cached regexes, precomputed indices, mandate cap 60, O(m²) bounded.
6. Public API semantics shift (score semantics change is intended; UI labels auto-reflect; no UI change in scope).
7. Holdout contamination -> implementer runs holdout ONCE at M6; red tests use general principles only (holdout-shaped prompts as behavioral tests are now public domain via this spec).

## 13. Non-Goals

No LLM / embeddings / network / new dependencies. No benchmark-specific tuning (no case IDs, no corpus-derived thresholds; thresholds derive from rubric anchors). No public wording change. No UI overhaul. No hiding ranking behind score mapping. No auto-migration of old heuristic as scoring fallback. No hygiene PII/secrets detector changes.

## 14. Test Contract MUST-FIX Decisions (from Test Contract Reviewer, binding)

1. Add three red tests beyond the 24: `r2_placeholder_with_real_input_role` (positive placeholder role, INPUT not missing, REUSABILITY >= 7), `r2_metamorphic_output_contract_addition_positive` (>= +15), `r2_metamorphic_role_repetition_delta` (<= +5, never meaningful gain).
2. NEW_CONTRADICTION invariant: contradictory vs clean control must be `<= -5` and never positive (NOT the earlier weak "-3" bound). Rationale: one real contradiction = INTERNAL_CONSISTENCY 10->5 per rubric, plus defensive guard caps overall at 45 when conflict_weight >= 6.
3. `r2_metamorphic_boilerplate_delta` is bidirectional: |boiler - base| <= 5 AND boiler <= base (addition never upward; removal never a meaningful decrease).
4. `missing_sections` semantics locked: missing = absent-or-insubstantive. Present-but-irrelevant content (e.g., safety boilerplate) is NEVER reported missing and NEVER rewarded; it is penalized via SIGNAL_TO_NOISE / CONSTRAINT_RELEVANCE only. The AMBER regression `test_red_irrelevant_safety_boilerplate` assertion stays green.
5. All red/metamorphic tests run in a dedicated integration binary `src-tauri/tests/r2_contract.rs` against a deterministic R2 test entry `r2::evaluate_for_test` (no PV_USE_R2 env-var races in test binaries). The migration flag PV_USE_R2 is for production default selection only, set at build/compile time.
6. Anti-overfit scan (KNOWN_BENCHMARK_OVERFIT_SCAN): no case IDs (`sem-[a-z]{2}-`) in src-tauri/src or test files outside the benchmark harness; red-test prompt strings must not appear (substring or >=6-token overlap) in calibration.json or holdout/cases.json; per-shape stratum metrics; threshold provenance comments tracing to rubric anchors; paraphrase-variant band stability check (variant band within one band of original).
