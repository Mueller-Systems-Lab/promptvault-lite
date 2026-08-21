# PVL — Analyzer R2.1 Cleanroom — Test Contract (Agent #5) (2026-08-21)

**Status:** TEST_CONTRACT: PASS (binding contract, 16 classes + 7 metamorphic invariants)
**Reviewer:** ANALYZER_R2_1_TEST_CONTRACT_REVIEWER (read-only)
**Deterministic entry:** `r2::deep_evaluate_for_test(content) -> R2TestOutcome` (NEW; delegates to production pipeline; env-var-free)
**Test file:** `src-tauri/tests/r2_1_contract.rs` (NEW; do NOT modify r2_contract.rs)

## Engine tests (RED today, binding post-fix)

| ID | Class | Key assertions |
|---|---|---|
| r21_fh_false_high | dangerous false-high | broken ≤ 45, crit, cw ≥ 6, Consistency 0, clean ≥ 70, Δ ≤ −15 |
| r21_voice_contradiction_de_en | VOICE | cw ≥ 6, crit, Consistency 0, both langs |
| r21_final_summary_contradiction | Fazit/section order | cw ≥ 6, crit |
| r21_metric_contradiction | METRIC | cw ≥ 6, crit |
| r21_format_contradiction | FORMAT (yaml/xml) | cw ≥ 4, not crit, < 70, Δ ≤ −15 |
| r21_language_contradiction_de | LANGUAGE via missing verb | cw ≥ 6, crit |
| r21_terse_extraction_en_de | terse extraction | s ≥ 85, not sig-poor, terse_sufficient, Extraction, recs ≤ 2 |
| r21_action_family_recognition | owner families EN(10)/DE(8) | not sig-poor, s ≥ 70, Extraction routing |
| r21_template_sufficiency | useful vs spam | useful: template, not sig-poor, ≥ 80, Reuse ≥ 7; spam: sig-poor, < 45, Δ ≥ 25 |
| r21_guideline_routing_de_en | guideline sufficiency | guideline, routed, ≥ 70 (declarative rule prose) |
| r21_type_aware_signal_sufficiency | short-but-complete | not sig-poor, terse_sufficient, ≥ 85 |
| r21_critical_conflict_cap | critical cap | critical: ≤ 45, crit, Consistency 0, sig-poor |

## Metamorphic invariants

M1 GOOD+headings ≤ 5 Δ · M2 GOOD+contradiction ≤ −15 · M3 terse+boilerplate never inflate (≤0, ≥ −15) · M4 DE↔EN ≤ 10 · M5 useful placeholders not sig-poor · M6 spam < 45 & Δ ≥ 25 · M7 broken+headings still ≤ 45 · G1 gaming junk still < 45.

## New conflict-class severity table

LANGUAGE(crit,6), VOICE(crit,6), FINAL_SUMMARY/SECTION_ORDER(crit,6), METRIC+unit/include_exclude/source_use/web_use/reasoning_disclosure/json_vs_prose(crit,6), FORMAT incl yaml/xml(non-crit,4). Cap: `weight>=6 || has_critical_conflict → min(45)`; critical → Consistency 0 + signal_poor.

## Harness/protocol tests (Python, scripts/__tests__/)

- r21_pair_fail_closed.py — missing pair member → NOT_EVALUATED + non-zero exit; denominator 0 → FAIL; empty pairs.json → refuse; positive control.
- r21_holdout_one_shot.py — one-shot log guard: repeat → ONE_SHOT_VIOLATION; fingerprint drift → FROZEN_CANDIDATE_DRIFT; no frozen marker → abort.
- r21_gold_isolation.py — v3 holdout dir empty/absent; no v3-h- IDs in tracked files; no holdout gold tracked; seal path not referenced.
- r21_contamination_scan.py — automated scan of src-tauri/src, src/, scripts/ for case IDs + gold anchors + calibration provenance + verbatim corpus prompts; zero matches required. RED today.

## No-overlap verification

All contract prompts verified against all 4 benchmark corpora: 0 exact matches, max 5 shared content tokens.
