# PVL — Analyzer R2.1 Cleanroom — Reality Refresh Report (2026-08-21)

**Status:** PRE-MUTATION SNAPSHOT (no production mutation performed yet)
**Branch:** `quality/analyzer-r2-cleanroom` (created, no commits yet)
**Host:** Linux (bash), Node v22.23.2, pnpm 11.22.0, Rust 1.97.1, Python 3.12.3, opencode 1.18.20

---

## 1. Git State (live, before any mutation)

| Field | Value |
|---|---|
| `MASTER_SHA` | `7baa673955f9dad42a89e30b1e24461a991fc47e` |
| `ORIGIN_MASTER_SHA` | `7baa673955f9dad42a89e30b1e24461a991fc47e` (remote only has `master`; R2 branch is local-only, never pushed) |
| `R2_BRANCH_SHA` | `7d17334426b9b408ac7b8e17026fabfc34eeda7e` |
| `R2_EVIDENCE_SHA` | `7d17334` (docs: R2 verification run report + perf smoke test — HEAD of R2 branch) |
| `R2_1_START_SHA` | `7d17334426b9b408ac7b8e17026fabfc34eeda7e` (cleanroom branch base) |
| Frozen R2 candidate | `5f39208baf612ff9af6d7cf2d7ba3216aa65699c` (commit `5f39208`, calibration v2) |
| R2 branch commits vs master | `da3e8fb` (R2 impl), `0abadb8` (benchmark v2), `9b4f137` (gitignore), `5f39208` (freeze), `7d17334` (report) — 5 commits |
| `WORKTREE_STATE` | 1 pre-existing modified tracked file (`docs/audits/PVL-v1.11.1-MCP-FOUNDATION-RUN-REPORT-20260819.md`, unrelated to this run) + pre-existing untracked owner prompt/doc files (NOT part of this run; left untouched) |

## 2. R2 Files Changed vs master (22 files, +10521/-193)

- `src-tauri/src/analysis/r2/`: mod.rs, lexicons.rs, type_router.rs, features.rs, applicability.rs, contradictions.rs, scoring.rs, recommendations.rs (the R2 engine)
- `src-tauri/src/analysis/quality.rs`, `hygiene.rs`, `analysis/mod.rs` (wiring)
- `src-tauri/tests/r2_contract.rs` (contract tests), `src-tauri/tests/perf_check.rs`, `src-tauri/tests/semantic_benchmark_runner.rs`
- `benchmarks/semantic-quality-v2/`: MANIFEST.md, cases/development.json (54), cases/holdout.json (18), reference/development.gold.json
- `scripts/semantic_quality_metrics.py`
- `docs/quality/ANALYZER_R2_ARCHITECTURE.md`, `docs/audits/PVL-ANALYZER-R2-VERIFICATION-RUN-REPORT-20260821.md`

## 3. Benchmark / Gold / Holdout Files

- V1 corpus: `benchmarks/semantic-quality/cases/calibration.json` (48), `benchmarks/semantic-quality/holdout/cases.json` (12), `reference/calibration.gold.json`, `holdout/reference.gold.json` (on disk, gitignored)
- V2 corpus: `benchmarks/semantic-quality-v2/cases/development.json` (54), `cases/holdout.json` (18), `reference/development.gold.json` (tracked), `reference/holdout.gold.json` (ON DISK, gitignored — **18 entries, readable**)
- **CONTAMINATION CONFIRMED: holdout gold exists on disk pre-freeze (both v1 `reference.gold.json` and v2 `holdout.gold.json`).**
- Result files mix dev+holdout in one artifact: `pv-r2-frozen-det1.json`, `pv-r2-v2-cal1.json`, `pv-r2-v2-cal2.json`, `pv-r2-candidate-final.json` each contain 72 results (54 dev + 18 holdout) — methodology violation confirmed.

## 4. Known Contamination Locations (production source)

| Location | Type |
|---|---|
| `src-tauri/src/analysis/r2/features.rs:395` | Comment references holdout case `fmis-504` ("Angebot" deliverable special case) |
| `src-tauri/src/analysis/r2/features.rs:1684` | Comment references holdout shape `rtpl-502` |
| `src-tauri/src/analysis/r2/features.rs:1726` | Comment: "Added: fmis-504 holdout" |
| `src-tauri/src/analysis/r2/scoring.rs:172,228,267` | "calibration v2, error class A — GOOD template" comments (corpus-derived thresholds) |
| `src-tauri/src/analysis/r2/scoring.rs:418` | "calibration v2, error class B — repetitive" comment |
| `src-tauri/src/analysis/r2/scoring.rs:480,488` | "old-benchmark regression reg3 + calibration v2" caps (corpus-derived) |
| `src-tauri/src/analysis/r2/scoring.rs:857-863` | `debug_dump_dims()` embeds benchmark case IDs (`fmis-001`, `fmis-002`, `fmis-003`, `famb-002`, `dev-tpl-002`, `dev-rep-en`) in production source |
| `src-tauri/src/analysis/r2/type_router.rs:433,615` | "old-corpus routing/score calibration" comments |
| `src-tauri/src/analysis/r2/type_router.rs:629-630` | Test references "Real holdout shape" |

## 5. Pair Test State

- `scripts/semantic_quality_metrics.py` only evaluates pairs `A1/A2, B1/B2, C1/C2, D1/D2, E1/E2, F1/F2`.
- V2 benchmark defines pairs `A1/A2, G1/G2, H1/H2`.
- **Result: `pair_checks` dict stays empty (silent skip) and H1/H2 are NEVER evaluated. NO error raised. Confirmed "silently disabled".**

## 6. MCP State (live smoke tests this session)

| MCP | Result | Evidence |
|---|---|---|
| GitHub MCP | **PASS** | `list_issues` returned live repo data (55 open issues); `get_commit` for master SHA returned metadata; `list_branches` shows only `master` on remote (R2 local-only) |
| Playwright MCP | **PASS** | browser launch, navigation (data: URL), DOM snapshot (heading/button/paragraph), semantic locator `getByRole`, click, console inspection (0 errors) |

## 7. Model Routing State (live probes this session)

| Field | Value |
|---|---|
| Default text model | `deepseek/deepseek-v4-flash` |
| DeepSeek API catalog (live) | `deepseek-v4-flash`, `deepseek-v4-pro`, `deepseek-v4-flash-vision-exp` |
| `deepseek-v4-flash` text probe | **PASS** (exact JSON `{"model_ok":true,"mode":"text"}`) |
| `deepseek-v4-flash` + image | **REJECTED 400** ("This model does not support image") → text-only CONFIRMED |
| opencode model cache | `deepseek-v4-flash` / `deepseek-v4-pro` → `attachment: False` |
| Vision candidates discovered | `deepseek-v4-flash-vision-exp` (DeepSeek, live in catalog); OpenAI OAuth present but `insufficient_quota` on live call → NOT usable |
| Real PNG probe (800×500: heading "PromptVault Vision Test", button "Analyse", score "43/100", icon, 2 regions) | **PASS 2/2** byte-identical exact schema JSON |
| Selected vision model | `deepseek-v4-flash-vision-exp` (cheapest sufficient; same cost class as text flash) |
| Vision fallback | none verified live (OpenAI quota exceeded; escalation path = retry once → stronger verified model; none configured) |
| Judge-family options | DeepSeek family (v4-pro) + opencode free-tier (nemotron-3.5-lightning-free verified live) for independence |

## 8. Known Failure Classes (from R2 verification report, preserved as evidence)

- **False-high:** `s2-h-task-de-broken-contradictory-001` (gold 38 BROKEN) → R2 scored 78 GOOD. Missing contradiction classes: voice (aktiv/passiv), Fazit/final-section/order, metrics. `conflict_weight = 0` → no defensive cap.
- **False-low:** `s2-h-task-en-terse-excellent-001` (gold 97 EXCELLENT) → R2 scored 33 BROKEN. "list" absent from `ACTION_VERBS_EN` → `signal_poor` cap crushes all substance dimensions.
- **Holdout FAIL:** Spearman 0.36, MAE 22.72, FH 10%, FL 71.4%, pairwise 62.5%.

## 9. Classification Preserved

**`AMBER_PROMPTVAULT_ANALYZER_R2_IMPROVED_NOT_GENERALIZED`** (pre-existing, unchanged — evidence preserved in `docs/audits/PVL-ANALYZER-R2-VERIFICATION-RUN-REPORT-20260821.md`).

---

## 10. Out-of-scope guard

TTS, v1.11.1 release, PyPI, GitHub Pages, public demo, Issue #295, demo evidence, Windows, new product release, embeddings, RAG, production semantic LLM, production model routing — all untouched. No unrelated cleanup.
