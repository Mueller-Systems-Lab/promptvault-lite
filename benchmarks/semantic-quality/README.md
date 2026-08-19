# Semantic Quality Benchmark — PromptVault Lite

## Purpose

Does PromptVault's analysis output correspond to what a competent prompt
engineer would call excellent, good, fair, poor, misleading or broken?
The benchmark answers this empirically by comparing the real production
engine (`src-tauri/src/analysis/quality.rs` + `hygiene.rs`) against a blind,
independent reference panel on a synthetic corpus.

This benchmark exists because **technical correctness is not semantic
validity**: the engine is deterministic, fast and well tested, but a
deterministic rule engine can still confidently output misleading judgments.

## Layout

```
benchmarks/semantic-quality/
  README.md                 this file
  rubric.json               reference rubric (12 criteria, N/A policy, bands)
  cases/calibration.json    48 synthetic calibration cases (committed)
  reference/calibration.gold.json   reference consensus labels (judges, committed)
  holdout/cases.json        12 synthetic holdout prompts (committed)
  holdout/reference.gold.json       holdout labels (GITIGNORED — hidden from tuning)
  results/                  engine run outputs (gitignored)
  public-regression-cases.json      durable regression subset
```

## Corpus

- 60 synthetic prompts, 100% synthetic (no private prompts).
- 48 calibration + 12 locked holdout (holdout labels never exposed to tuning).
- Languages: 34 EN / 26 DE. Kinds: 44 task / 11 guideline / 5 template.
- Reference-consensus bands (actual judge distribution, all 60 cases):
  18 EXCELLENT / 6 GOOD / 6 FAIR / 8 POOR / 22 BROKEN — the independent
  judges were stricter than the planned design distribution; this reflects
  the reference panel, not a design error.
- 6 contrast pairs (A–F), 12 adversarial gaming cases, 4+1 terse-excellent
  fairness cases.

## Reference panel

- Judge A: `openai/gpt-5.4` (OpenAI family) — blind, all 60 cases.
- Judge B: `deepseek/deepseek-v4-pro` (DeepSeek family) — blind, all 60 cases.
- Judge C: `opencode/nemotron-3-ultra-free` (NVIDIA family) — blind, 16
  disagreement cases only (delta > 15 / band gap > 1 / fit-for-purpose polarity).
- Adjudication: reasoned consensus by the Reference Adjudicator; no blind averaging.
- Blindness: judges saw only prompt + rubric; PromptVault results were never
  shown before judge freeze.

## Running

Engine run (real production Rust implementation):

```bash
cd src-tauri
PV_BENCH_LABEL=baseline cargo test --test semantic_benchmark_runner -- --nocapture
```

Metrics:

```bash
python3 scripts/semantic_quality_metrics.py \
  benchmarks/semantic-quality/results/pv-<label>.json \
  benchmarks/semantic-quality/reference/calibration.gold.json \
  benchmarks/semantic-quality/cases/calibration.json
```

## Baseline result (pre-remediation, calibration n=48)

MAE 29.85 · median AE 25.5 · Spearman 0.15 · within-one-band 54 % ·
critical false-low 47 % · recommendation usefulness 34 % ·
terse-good mean 27.5 · contrast pairs A/B/C/F FAIL.

## Candidate result (post-remediation, calibration n=48)

MAE 23.6 · median AE 19.5 · Spearman 0.49 · within-one-band 67 % ·
critical false-low 16 % · terse-good mean 59 · pairs A/D/F pass ·
routing 94 % · missing-info precision 11 % / recall 44 % / FPR 56 % ·
recommendation usefulness 42 % · gaming resistance 1.0 (0 EXCELLENT on adversarial).

## Holdout result (locked, n=12, run exactly once)

MAE 26.4 · median AE 27 · Spearman 0.37 · within-one-band 67 % ·
critical false-low 60 % · critical false-high 0 · routing 83 % ·
gaming resistance 1.0 · pairwise ordering 83 %.

**Interpretation:** the remediation improved calibration-set behavior but did
not generalize to the holdout (holdout scores identical pre/post remediation —
the N/A mechanism is only triggered by specific prompt shapes). The engine
remains a structure/completeness heuristic. Final classification:
**AMBER_PROMPTVAULT_ANALYSIS_STRUCTURALLY_USEFUL_SEMANTICALLY_LIMITED**.

## Public claim impact

The product wording has been corrected to describe the analysis as
"Struktur- und Vollständigkeits-Analyse" (structure & completeness), not
authoritative semantic quality. See `docs/quality/SEMANTIC_QUALITY_BENCHMARK.md`
and `docs/audits/PVL-SEMANTIC-QUALITY-RUN-REPORT-20260819.md`.

## Durable regression tests

The 8 principle-level tests in `quality.rs` (`test_red_*`) encode the general
behavior: terse-good prompts must not be crushed, keyword-stuffed nonsense must
not be rewarded, contradictions must be penalized, cosmetic headings must not
inflate, real context must matter, irrelevant safety boilerplate must not
inflate, guidelines must route correctly, and irrelevant missing-info must not
be reported. They express general rules — no benchmark IDs or phrases.
