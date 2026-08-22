# R2.2 Reality Refresh — CURRENT_REALITY (2026-08-22)

**Branch:** quality/analyzer-r2-generalization (new, from quality/analyzer-r2-cleanroom HEAD)
**Host:** Linux (bash), Node v22.23.2, pnpm 11.22.0, Rust 1.97.1, Python 3.12.3, opencode 1.18.20

## Git State (live, before mutation beyond branch creation)

- MASTER_SHA: 7baa673955f9dad42a89e30b1e24461a991fc47e
- ORIGIN_MASTER_SHA: 7baa673955f9dad42a89e30b1e24461a991fc47e
- R2_SHA: 7d17334426b9b408ac7b8e17026fabfc34eeda7e
- R2_1_SHA: 16e1f44f627125455402f74435502587685fe3b6
- R2_2_START_SHA: 16e1f44f627125455402f74435502587685fe3b6 (branch creation, no mutations yet)
- HEAD before branch: quality/analyzer-r2-cleanroom @16e1f44
- HEAD now: quality/analyzer-r2-generalization @16e1f44
- Branch list verified: master, quality/analyzer-r2, quality/analyzer-r2-cleanroom, quality/analyzer-r2-generalization, quality/semantic-analysis-benchmark

## Files Read

- AGENTS.md, README.md, docs/PROJECT_STATUS.md, docs/TESTING.md
- docs/quality/ANALYZER_R2_ARCHITECTURE.md, docs/quality/SEMANTIC_QUALITY_BENCHMARK.md
- benchmarks/semantic-quality, v2, v3 (cases, references, results, markers, rubric)
- src-tauri/src/analysis/r2/* (mod.rs, scoring.rs, features.rs, type_router.rs, contradictions.rs, lexicons.rs, recommendations.rs, applicability.rs)
- src-tauri/tests/r2_contract.rs, r2_1_contract.rs, semantic_benchmark_runner.rs, quality.rs, hygiene.rs
- playwright.config.ts, package.json, Cargo.toml, .opencode/*

## Benchmark State

- V1: calibration 48, holdout 12, rubric v1.0.0
- V2: development 54, holdout 18, reference/development.gold.json tracked, holdout gold gitignored
- V3: development 72, holdout 24, MANIFEST.md verified, pairs H1/H2, A1/A2, G1/G2, markers CANDIDATE_FROZEN.json @4178f04, seal e3fe, HOLDOUT_EXECUTED exists but now REGRESSION only (consumed)
- R2.1 holdout final metrics (from pv-r21-v3-holdout-final.json): MAE 19.29 target <=16 FAIL, Median 18 target <=14 FAIL, Within-one 79.17% target >=80% FAIL, False-low 20% target <=15% FAIL, Pairwise 81.82% target >=85% FAIL, Recommendation 56.25% target >=70% FAIL; Passing: Spearman 0.7278 >=0.65 PASS, False-high 0% <=5% PASS, Routing 95.83% >=90% PASS, Gaming 0 PASS, Catastrophic 0 PASS
- Known failures: v3-h-task-de-good-natural-002 ref 96 -> PV 35, v3-h-guideline-de-guideline-002 ref 85 -> PV 30, G pair FAIL

## MCP Foundation (live smoke, this session)

- GitHub MCP: PASS (repo read README.md, branch read master, commit read 7baa673, file read ok)
- Playwright MCP: PASS (browser launch, navigation data:html, DOM snapshot heading/button/paragraph, semantic locator getByRole, click, screenshot capture viewport 1280x720, console 0 errors, network 0 requests)
- MCP_FOUNDATION_GREEN: YES

## Model Foundation (live probes, this session)

- Intended TEXT_MODEL: deepseek/deepseek-v4-flash
- DeepSeek text probe direct (api.deepseek.com): FAIL — Insufficient Balance (402) — key present but quota exhausted (live 402 response)
- Fallback TEXT_MODEL available: opencode/muse-spark-1.2-contributor-free (family muse-free, attachment true, image+text, structured_output true, cost 0) — PASS as code/shell/git reasoning fallback
- Alternative text verified: opencode/mimo-v2.5-free PASS
- Vision candidates discovered (non-DeepSeek, image input, structured output):
  - opencode/muse-spark-1.2-contributor-free (muse-free, image true, cost 0, structured true) — cheapest sufficient
  - moonshotai/kimi-k2.5 (kimi-k2, image true, cost 0.6) — alternative
  - qwen3.7-flash family (qwen, image true, cost 0.03) — cheaper but less proven structured
  - gemma-4-26b etc.
- Real PNG probe: 800x500 synthetic (heading "PromptVault Vision Test", button "Analyse", score "43/100", icon, 2 panels, clipped + non-clipped text) -> opencode/muse-spark-1.2-contributor-free
  - Run1: {"heading":"PromptVault Vision Test","button":"Analyse","score":"43/100","panel_count":2,"clipped_text_detected":true,"vision_supported":true,"confidence":0.99} PASS
  - Run2 identical schema PASS
  - IMAGE_INPUT PASS, TEXT_IN_IMAGE PASS, LAYOUT_INTERPRETATION PASS, CLIPPING_INTERPRETATION PASS, STRUCTURED_OUTPUT PASS
- SELECTED_VISION_MODEL: opencode/muse-spark-1.2-contributor-free (Provider: opencode, Family: muse-free, Cost class: FREE/LOW, structured true)
- VISION_FALLBACK: moonshotai/kimi-k2.5 (hpc-ai, provider hpc-ai, family kimi-k2, cost 0.6)
- Vision model verified NON-DEEPSEEK: YES
- DEEPSEEK_USED_FOR_IMAGES: NO
- MODEL_CAPABILITY_FOUNDATION: GREEN (vision verified, text fallback available, DeepSeek vision banned and respected)

## Classification

- R2 preserved: quality/analyzer-r2 @7d17334
- R2.1 cleanroom: quality/analyzer-r2-cleanroom @16e1f44
- R2.1 classification: AMBER_PROMPTVAULT_ANALYZER_R2_1_IMPROVED_NOT_GENERALIZED
- V3 holdout now REGRESSION ONLY (consumed, not unseen)
- R2.2 objective: close natural-good, guideline, calibration, pairwise, recommendation gaps while preserving zero false-high, gaming resistance, determinism, local-first

## Out-of-Scope Guard

TTS, releases, PyPI, GitHub Pages, public demo, Issue #295, demo audit loose ends, Windows production routing, embeddings/RAG not touched.

## Next

- Branch created, MCP green, model foundation green (with DeepSeek text balance gap documented as TOOL_GAP for text, but vision green via non-DeepSeek)
- Proceed to Phase A failure forensics via agents
