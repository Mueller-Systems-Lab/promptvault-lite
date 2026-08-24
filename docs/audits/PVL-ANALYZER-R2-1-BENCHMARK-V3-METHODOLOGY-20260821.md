# PVL — Analyzer R2.1 Cleanroom — Benchmark V3 Methodology Protocol (Agent #2) (2026-08-21)

**Status:** METHODOLOGY_DESIGN: PASS (design approved for implementation)
**Architect:** CLEANROOM_BENCHMARK_METHODOLOGY_ARCHITECT
**Scope:** 96 new synthetic cases (72 dev / 24 holdout), two independent blind judge families, one-shot holdout, gold isolation, artifact separation.

## Protocol Summary (implementable spec)

1. **DATASET_STRUCTURE** — `benchmarks/semantic-quality-v3/` with `cases/development.json` (72, tracked), `reference/development.gold.json` (tracked), `reference/judge-a/*.jsonl` + `reference/judge-b/*.jsonl` (tracked raw judge outputs), empty `reference/holdout/`, `results/dev-results/` (72-entry only), `results/holdout-final-results/` (24-entry only), `pairs.json` (tracked pair contract), `markers/CANDIDATE_FROZEN.json`, `markers/holdout-execution-log.jsonl`, `markers/holdout_seal.sha256`, `tools/` (run_dev_v3.sh, run_holdout_v3.sh, seal_holdout_v3.sh, metrics_v3.py, validate_artifact_v3.py).
2. **DEV_STORAGE** — dev cases + dev gold tracked (legit tuning set); raw judge outputs archived for auditability.
3. **HOLDOUT_STORAGE** — external seal dir OUTSIDE the repo: `/media/xxammaxx/software/promptvault-lite-v3-holdout-seal/` (chmod 700), holdout INPUTS + GOLD both withheld until freeze (owner's preferred option); hash pinned via `markers/holdout_seal.sha256`; marker gate `CANDIDATE_FROZEN.json` required for any holdout execution; builder never receives the seal path.
4. **GOLD_STORAGE** — per-entry provenance: judge_a {model_id, provider_family, score, band, raw_ref, prompt_fingerprint}, judge_b, judge_c (nullable), adjudication {rule, reason, resolved_by, final_score}, gold_revision, generated_by, timestamp. `gold_validator` asserts provenance invariants (score == adjudicated judge score; band consistent).
5. **BLINDNESS_PROTOCOL** — judge receives ONLY {task marker, rubric text, prompt string, instructions}; never PV scores/criteria/recommendations/missing-info/stratum/pair. Fingerprints: judge_prompt_fingerprint (sha256 of instruction template), case_input_fingerprint (sha256 of prompt bytes), result_fingerprint (sha256 of raw output). Judges: A = `deepseek/deepseek-v4-pro` (deepseek), B = `opencode/nemotron-3.5-lightning-free` (nemotron). Raw outputs stored unmodified; malformed responses rejected, not repaired.
6. **FREEZE_PROTOCOL** — `markers/CANDIDATE_FROZEN.json` records candidate_sha, source_fingerprint, weight_fingerprint, benchmark_fingerprint, dev_result_fingerprint, calibration_iterations_used, branch. Holdout runner re-derives source_fingerprint → drift aborts `FROZEN_CANDIDATE_DRIFT`.
7. **RUN_PROTOCOL** — dev runs repeated (max 2 calibration iterations), split=development only, header `{"split":"dev","count":72}`; holdout runs exactly once post-freeze, split=holdout, header `{"split":"holdout","count":24}`, guard chain: frozen marker → fingerprint match → seal sha256 match → no prior log record.
8. **ARTIFACT_PROTOCOL** — dev artifacts in dev-results/ only; holdout in holdout-final-results/ only; never combined; `validate_artifact_v3.py` fails on contamination (dev artifact containing `v3-h-` ID or vice versa); metrics refuse artifacts without `split` header.
9. **ONE_SHOT_HOLDOUT_PROTOCOL** — `holdout-execution-log.jsonl` (append-only, tracked) is the HOLDOUT_EXECUTED marker; same candidate_sha + benchmark_fingerprint → `ONE_SHOT_VIOLATION` abort; post-hoc diagnostics only recompute against recorded artifact → `CONSUMED_DIAGNOSTIC`.
10. **PAIR_TEST_PROTOCOL** — `pairs.json` machine-readable contract (H1/H2 boilerplate-isolation in holdout; A1/A2 + G1/G2 in dev); `metrics_v3.py` reads pairs.json as single source; missing member → `NOT_EVALUATED` + non-zero exit (fail-closed); empty pairs.json → refuse to run.
11. **PROVENANCE_PROTOCOL** — judge identities + families per case; judge prompt fingerprint constant per family; Judge C on |A−B|>15 OR band diff OR fit-for-purpose disagreement; if no third family verified → fresh blind re-run of both families + median/merge; owner adjudication last resort, recorded; gold_validator enforces score == recorded judge/adjudication output.

## Metrics (strictly split-separated, never mixed)

Spearman, MAE, Median AE, Within-one-band, False-high, False-low, Pairwise ordering, Routing, Recommendation usefulness, Gaming EXCELLENT count — all computed per split (dev 72 / holdout 24).

## Fail-closed rules

1. Expected-case check: artifact ID set == split ID set, else `EXPECTED_CASES_MISSING` FAIL.
2. Contamination check: no cross-split IDs, else `CONTAMINATION` FAIL.
3. Metric denominator check: required metric with denominator 0 ⇒ FAIL (never 0/0 PASS).
4. Pair check: all declared pairs evaluated; any NOT_EVALUATED ⇒ FAIL.
5. Non-zero exit on any FAIL; PASS only when all gates pass.
