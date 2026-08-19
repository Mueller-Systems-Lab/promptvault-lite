# PVL — Semantic Quality Benchmark Run Report (2026-08-19)

**Status:** COMPLETE
**Classification:** `AMBER_PROMPTVAULT_ANALYSIS_STRUCTURALLY_USEFUL_SEMANTICALLY_LIMITED`
**Branch:** `quality/semantic-analysis-benchmark`
**Baseline master:** `2e6b93e74fef0f0103cd5095717a171d12d6e543` (== origin/master)
**Linux only:** Linux Mint 22.1 (Ubuntu noble), kernel 6.8.0-85, bash, de_DE.UTF-8

---

## 1. Question

Does PromptVault's analysis output correspond to what a competent prompt
engineer would consider good, mediocre, poor, misleading or broken?

## 2. Method (condensed)

- 60 synthetic benchmark prompts (48 calibration + 12 locked holdout;
  34 EN / 26 DE; 44 task / 11 guideline / 5 template).
- Reference panel (blind, prompt + rubric only, no PromptVault output):
  Judge A `openai/gpt-5.4`, Judge B `deepseek/deepseek-v4-pro`; Judge C
  `opencode/nemotron-3-ultra-free` on the 16 disagreement cases.
  Final labels = reasoned adjudication.
- Real engine run via `src-tauri/tests/semantic_benchmark_runner.rs`
  (production Rust implementation, no Python re-implementation).
- Metrics via `scripts/semantic_quality_metrics.py`.

## 3. Reference gold distribution (judge consensus, all 60)

18 EXCELLENT / 6 GOOD / 6 FAIR / 8 POOR / 22 BROKEN.

## 4. Results

| Metric | Target | Baseline (cal) | Candidate (cal) | Candidate (holdout) |
|---|---|---|---|---|
| MAE | ≤ 10 | 29.85 | 23.6 | 26.4 |
| Median AE | ≤ 8 | 25.5 | 19.5 | 27.0 |
| Spearman | ≥ 0.75 | 0.15 | 0.49 | 0.37 |
| Exact band | ≥ 50 % | 29 % | 33 % | 33 % |
| Within-one-band | ≥ 90 % | 54 % | 67 % | 67 % |
| Critical false-high | ≤ 5 % | 0 % | 0 % | 0 % |
| Critical false-low | ≤ 5 % | 47 % | 16 % | 60 % |
| Pairwise ordering | ≥ 90 % | 48 % | 54 % | 83 % |
| Guideline/task routing | ≥ 95 % | 90 % | 94 % | 83 % (0/2) |
| Missing-info precision | ≥ 60 % | 9 % | 11 % | 11 % |
| Missing-info recall | ≥ 70 % | 54 % | 44 % | 67 % |
| Missing-info FPR | ≤ 30 % | 69 % | 56 % | 76 % |
| Recommendation usefulness | ≥ 85 % | 34 % | 42 % | 36 % |
| Gaming resistance | 1.0 | 1.0 | 1.0 | 1.0 |
| Terse-good mean | ≥ 80 | 27.5 | 59.0 | 25.0 |

Contrast pairs (calibration): A (terse ≥ formal) FAIL→PASS · B (coherent >
keyword-stuffed) FAIL→FAIL · C (cosmetic ≤ 10) FAIL→FAIL (+36) ·
D (real context ≥ 20) PASS→PASS (+55) · E PASS · F (safety ≤ 5) FAIL→PASS.

## 5. Diagnosis

- The engine is a **structure/completeness heuristic**, not a semantic judge.
- Remediation (applicability-aware N/A, substance gating, safety
  substantive-vs-negation, coherence/noise penalties, English routing,
  recommendation gating, goal adjacency) improved the calibration set
  materially, but the **locked holdout did not change** (baseline == candidate
  on all 12 holdout scores): the holdout prompt shapes do not trigger the N/A
  mechanism. This is exactly what the holdout is designed to expose.
- Safe: zero critical false-highs, perfect gaming resistance (no adversarial
  prompt rated EXCELLENT) on both splits.
- Dangerous: critical false-lows (good/terse prompts rated < 40) — 47 %
  baseline → 16 % calibration → 60 % holdout. Presenting the score as an
  authoritative "quality" measure is misleading.

## 6. Remediation (minimal, principled, deterministic)

All changes confined to `src-tauri/src/analysis/quality.rs` plus a one-line
routing mirror in `hygiene.rs`:
M1 applicability-aware N/A (`task_profile`), M2 goal adjacency,
M3 safety substantive-vs-negation, M4 substance-gated formatting,
M5 English guideline routing, M6 recommendation gating (language-aware),
M7 coherence/noise penalties. 8 principle-level red tests (`test_red_*`)
added first and all passing. No LLM, no new dependencies, no cloud.

Local gates: `cargo test --workspace` PASS (156 lib + integration),
`cargo clippy --workspace --all-targets -- -D warnings` PASS,
`cargo fmt --check --all` PASS.

## 7. Public claim corrections (AMBER wording)

- `docs/USER_GUIDE.md` — "Qualitätsscore" → "Struktur- und
  Vollständigkeits-Analyse" with explicit limits.
- `README.md` — "evaluates their quality" → "structural quality
  (structure & completeness)"; feature renamed.
- `website/index.html` — "Struktur und Qualität" → "Struktur und
  Vollständigkeit".

## 8. Verifiers

- AGENT #6 Methodology Verifier: `METHODOLOGY_VALID: PASS`
  (holdout methodology sound, blind, independent, reproducible; baseline
  artifact restored after evidence-integrity finding).
- AGENT #7 Prompt Quality Expert: `SEMANTIC_PLAUSIBILITY: FAIL` for the
  *semantic quality* framing (2 catastrophic false-confidence cases:
  heading-nonsense 44/100, keyword-stuffed 61/100), which is the evidence
  basis for AMBER; the reference labels themselves are defensible.
- AGENT #8 Final Verifier: `FINAL_SEMANTIC_QUALITY_VERIFICATION: PASS`
  after baseline restoration and run-report creation; classification
  AMBER supported; TTS unchanged; release history untouched; local-first
  preserved; no scope violations.

## 9. Evidence

- `benchmarks/semantic-quality/` — corpus, rubric, gold, README,
  public regression cases.
- `benchmarks/semantic-quality/results/pv-baseline.json` (true baseline),
  `pv-candidate.json` (frozen candidate).
- `scripts/semantic_quality_metrics.py`.
- `evidence/semantic-quality/20260819/` — representative cases,
  owner spot-check pack (+ answers file).
- `docs/quality/SEMANTIC_QUALITY_BENCHMARK.md`.
- Judge raw outputs retained at `/tmp/opencode/judges/` (session-local).

## 10. Owner spot check

`evidence/semantic-quality/20260819/owner-spotcheck-pack.json` (10 blind
cases) + `owner-spotcheck-answers.json` (reference labels). Automated
classification does not depend on the spot check.

## 11. Final classification

**AMBER_PROMPTVAULT_ANALYSIS_STRUCTURALLY_USEFUL_SEMANTICALLY_LIMITED**

The analysis is useful as structural/completeness guidance and is no longer
framed as authoritative semantic quality. Not GREEN (holdout Spearman 0.37,
MAE 26, false-low 60 %), not RED (no dangerous false-highs, gaming
resistance 1.0, hygiene reliable, directionally sane ordering on most cases).
