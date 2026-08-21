# PVL — Analyzer R2.1 Cleanroom — Contamination Audit (Agent #1) (2026-08-21)

**Status:** CONTAMINATION_AUDIT: PASS (audit executed; findings confirm AMBER)
**Auditor:** ANALYZER_R2_CONTAMINATION_AUDITOR (review-agent, read-only)
**Verdict:** HEAVILY CONTAMINATED — cannot be certified as generalized without cleanroom decontamination.

## Summary of confirmed contamination classes (CRITICAL)

1. **Holdout case IDs in production code:** `features.rs:395-398` (`fmis-504` → `"angebot","kunden"` lexicon entries), `features.rs:586-590` (`rtpl-502` → F4 rule broadening).
2. **Gold-anchored production thresholds:** `scoring.rs:172-181, 228-235, 267-278` (template credits 8.0 tied to "gold 90 EXCELLENT"), `scoring.rs:418-428` (noise cap tied to "gold 64 FAIR"), `scoring.rs:480-523` (bare-task caps tied to "'Write a press release.' was false-high 78 vs gold 54").
3. **Case-ID debug dump in test module:** `scoring.rs:857-862` (`debug_dump_dims` with fmis-001/002/003, famb-002, dev-tpl-002, dev-rep-en).
4. **Verbatim holdout prompts in tests:** `features.rs:1683-1694` (rtpl-502), `features.rs:1722-1766` (fmis-504), `type_router.rs:595-600, 620-634` (v2 holdout Feature Kickoff Brief + Commit Message Policy).
5. **Calibration-v2 lexicon block:** `features.rs:409-435` (12 tokens added for "fresh development-set error classes").
6. **Gadget-case-specific fact regex:** `features.rs:219-227` (`battery|waterproof|hikers|outdoor|aimed at|designed for`).
7. **Benchmark regression provenance:** `contradictions.rs:1085-1143` (verbatim v1 pcon-002/pguid-001).
8. **Dev/holdout result mixing:** `semantic_benchmark_runner.rs` writes 72-case artifacts (dev+holdout interleaved) ≥ 11× during calibration; holdout gold readable on disk pre-freeze.
9. **Silent pair-test disable:** `semantic_quality_metrics.py:102-111` checks v1 pair IDs only; v2 pairs (A1/A2/G1/G2, H1/H2) never evaluated → empty `pair_checks`.
10. **Dataset contamination:** v2 dev contains truncations of v1 holdout cases (`s2-task-en-poor-vague-003` "Make it better." ← v1 holdout famb-503; `s2-guideline-de-guideline-002` ← v1 holdout fguid-503).
11. **MANIFEST §7 label leak:** publishes per-case expected bands for all 18 holdout cases, contradicting §9 secrecy claim.
12. **Judge blindness unverifiable:** `/tmp/opencode/judges/` gone; v2 gold has no judge identity/adjudication/provenance.

## Safe components (genuinely clean/general)

- `mod.rs` pipeline, `applicability.rs` matrix, contradictions core C1-C8 + topic table, scoring base ladders, core lexicons, type_router classify() core, determinism, bounded performance. Threshold VALUES need re-derivation from rubric anchors only.

## Required cleanroom actions (priority order)

1. Strip case IDs + verbatim benchmark/holdout prompts from production and test code.
2. Re-derive all thresholds from rubric-band semantics; delete "calibration v2 / gold N / error class X / reg3" provenance.
3. Fix harness: per-split output, single post-freeze holdout, re-enable H1/H2 + A/G pairs, split-separated metrics.
4. Remove holdout gold from working tree (owner-controlled storage).
5. Rewrite MANIFEST: delete §7 design-intent leakage.
6. Fresh disjoint dev set (gate in CI).
7. Restore gold provenance + judge blindness records.
8. Decouple recommendations from metrics-matcher keywords.
9. Adjudicate gold-quality inconsistencies (H2 90 vs design FAIR).
10. Freeze-flag gating for benchmark reruns.

Full auditor report preserved in session record; this is the condensed cleanroom action plan.
