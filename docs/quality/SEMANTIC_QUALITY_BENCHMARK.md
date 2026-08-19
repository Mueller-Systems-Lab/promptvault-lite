# Semantic Quality Benchmark — Methodology & Findings

**Status:** AMBER — the analysis is useful as structural/completeness guidance,
but it is not an authoritative semantic quality judgment and is not framed as
such anymore.

## Question

Does PromptVault's analysis output correspond to what a competent prompt
engineer would consider good, mediocre, poor, misleading or broken?

## Method (summary)

1. **Corpus** — 60 fully synthetic prompts (48 calibration + 12 locked
   holdout; 34 EN / 26 DE; 44 tasks / 11 guidelines / 5 templates; all five
   quality bands; 6 contrast pairs A–F; 12 adversarial gaming cases;
   terse-excellent fairness set). No private prompts.
2. **Blind reference panel** — Judge A (`openai/gpt-5.4`), Judge B
   (`deepseek/deepseek-v4-pro`) scored every prompt against the reference
   rubric **without ever seeing PromptVault output**. Judge C
   (`opencode/nemotron-3-ultra-free`) was invoked for the 16 disagreement
   cases (score delta > 15, band gap > 1, or fit-for-purpose polarity).
   Final labels = reasoned adjudication, not blind averaging.
3. **Baseline freeze** — the production engine was frozen at
   `2e6b93e7` and run on all 60 cases via the real Rust implementation.
4. **Metrics** — MAE, median AE, Spearman, band accuracies, critical
   false-high/false-low, pairwise ordering, guideline/task routing,
   missing-info precision/recall/FPR, recommendation usefulness, gaming
   resistance, terse-prompt fairness, contrast-pair assertions.
5. **Remediation** — minimal principled, deterministic changes to
   `quality.rs` (applicability-aware N/A scoring, substance-gated formatting
   rewards, safety substantive-vs-negation split, coherence/noise penalties,
   English guideline routing, recommendation gating, goal adjacency).
   Red principle-level tests first, then implementation; calibration was the
   only iteration set.
6. **Locked holdout** — run exactly once after candidate freeze; holdout
   labels were never visible during tuning.

## Results

| Metric | Target | Baseline (cal) | Candidate (cal) | Candidate (holdout) |
|---|---|---|---|---|
| MAE | ≤ 10 | 29.9 | 23.6 | 26.4 |
| Median AE | ≤ 8 | 25.5 | 19.5 | 27 |
| Spearman | ≥ 0.75 | 0.15 | 0.49 | 0.37 |
| Within-one-band | ≥ 90 % | 54 % | 67 % | 67 % |
| Critical false-high | ≤ 5 % | 0 % | 0 % | 0 % |
| Critical false-low | ≤ 5 % | 47 % | 16 % | 60 % |
| Pairwise ordering | ≥ 90 % | 48 % | 54 % | 83 % |
| Guideline/task routing | ≥ 95 % | 90 % | 94 % | 83 % |
| Missing-info precision | ≥ 60 % | 9 % | 11 % | 11 % |
| Missing-info recall | ≥ 70 % | 54 % | 44 % | 67 % |
| Missing-info FPR | ≤ 30 % | 69 % | 56 % | 76 % |
| Recommendation usefulness | ≥ 85 % | 34 % | 42 % | 36 % |
| Gaming resistance | 1.0 | 1.0 | 1.0 | 1.0 |
| Terse-good mean | ≥ 80 | 27.5 | 59 | 25 |

## Interpretation

- **The engine is a structure/completeness heuristic, not a semantic judge.**
  Even after remediation, Spearman on the holdout is 0.37 and MAE 26.
- **Remediation improved the calibration set** (false-low 47 % → 16 %, terse
  mean 27.5 → 59, pairs A/D/F fixed) **but did not generalize** to the
  holdout — holdout scores are identical before/after, because the holdout
  prompt shapes do not trigger the N/A mechanism. This is precisely what a
  locked holdout exists to expose; no retuning was performed.
- **Safe properties:** zero critical false-highs (no POOR/BROKEN prompt
  reaches 70+) and perfect gaming resistance (no adversarial prompt is rated
  EXCELLENT) on both splits. The hygiene analysis remains reliable.
- **Dangerous property:** critical false-lows — good, terse, natural prompts
  are still rated < 40 (47 % baseline → 16 % calibration → 60 % holdout).
  Presenting the score as an authoritative "quality" measure is misleading.

## Public-claim corrections (applied)

- `docs/USER_GUIDE.md` — "Qualitätsscore" section reframed as
  "Struktur- und Vollständigkeits-Analyse" with explicit limits.
- `README.md` — "evaluates their quality and hygiene" →
  "evaluates their structural quality (structure & completeness) and hygiene";
  feature list renamed to "Structural Quality & Hygiene Analysis".
- `website/index.html` — "Struktur und Qualität" → "Struktur und Vollständigkeit".

## Durable regression

8 principle-level tests (`test_red_*` in `quality.rs`) encode the general
behavior contract. `benchmarks/semantic-quality/public-regression-cases.json`
maps the durable categories to benchmark cases.

## Reproducibility

- Baseline SHA: `2e6b93e74fef0f0103cd5095717a171d12d6e543`
- Candidate SHA (frozen for holdout): same tree as baseline + remediation
  changes on branch `quality/semantic-analysis-benchmark`
- Judge models: `openai/gpt-5.4`, `deepseek/deepseek-v4-pro`,
  `opencode/nemotron-3-ultra-free`
- Rubric version: `benchmarks/semantic-quality/rubric.json` (v1.0.0)
- Full run: `docs/audits/PVL-SEMANTIC-QUALITY-RUN-REPORT-20260819.md`
- Evidence: `evidence/semantic-quality/20260819/`
