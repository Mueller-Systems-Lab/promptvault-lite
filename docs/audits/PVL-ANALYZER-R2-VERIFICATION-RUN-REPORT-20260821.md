# PVL — Analyzer R2 Verification Run Report (2026-08-21)

**Status:** COMPLETE (verification performed; integration NOT performed)
**Classification:** `AMBER_PROMPTVAULT_ANALYZER_R2_IMPROVED_NOT_GENERALIZED`
**Branch:** `quality/analyzer-r2` (4 commits ahead of master, unmerged)
**Frozen candidate:** `5f39208baf612ff9af6d7cf2d7ba3216aa65699c`
**Baseline master:** `7baa673955f9dad42a89e30b1e24461a991fc47e` (== origin/master, AMBER)
**Linux only:** Linux, bash. Node v22.23.2, pnpm 11.22.0, Rust 1.97.1, Python 3.12.3.

This report documents the independent verification of the previously
implemented Analyzer R2 candidate. The R2 implementation and benchmark v2
were committed by a prior session; this run verified all gates with fresh
evidence and invoked the full agent verification chain (Agents #5-#9).

---

## 1. Reality Refresh (live state)

- `git fetch origin --prune` OK. `origin/master` still at `7baa673` (AMBER baseline).
- Branch `quality/analyzer-r2` is 4 commits ahead of master:
  `da3e8fb` (R2 implementation), `0abadb8` (benchmark v2), `9b4f137`
  (gitignore results + hidden holdout gold), `5f39208` (freeze, calibration v2).
- Working tree clean apart from pre-existing untracked doc files
  (owner prompt files, older demo/audit docs) — not part of this run.
- Advisory state in the owner prompt (master == 7baa673) confirmed live.

## 2. MCP + Tool Foundation

| Component | Status | Evidence |
|---|---|---|
| GitHub MCP | PASS | `list_issues` / `search_issues` returned live repo data (issue-types 404 = valid API response, auth working) |
| Playwright MCP | PASS | browser launch, navigation, DOM snapshot, semantic locator (`getByRole`), click, fill, type, screenshot — all verified live |
| Dev server | PASS | `pnpm dev` at localhost:1420, HTTP 200 |
| `gh` CLI | TOOL_GAP | not installed; GitHub MCP used instead (documented gap, no simulation) |

**MCP_FOUNDATION_GREEN.**

## 3. Model Capability Foundation (live probes)

### DeepSeek text/agent path
- `deepseek-v4-flash` chat probe: **PASS**, latency 1.3 s, expected output.
- Text-only model rejects image input (HTTP 400) — proves the routing need.

### Vision model discovery
- Live DeepSeek API exposes: `deepseek-v4-flash`, `deepseek-v4-pro`,
  `deepseek-v4-flash-vision-exp`.
- opencode model cache marks `deepseek-v4-flash` `attachment: false`
  (text-only) — consistent with live rejection test.

### Actual PNG smoke test (spec §5)
Synthetic 800×500 PNG: heading "PromptVault Vision Test", button "Analyse",
score "Score 43/100", one icon, two separated regions.

`deepseek-v4-flash-vision-exp` returned (2/2 runs, byte-identical JSON):
```json
{"heading": "PromptVault Vision Test", "button_text": "Analyse",
 "score_text": "Score 43/100", "regions": 2, "vision_supported": true}
```
- VISION_IMAGE_INPUT: PASS
- VISION_SEMANTIC_INTERPRETATION: PASS
- VISION_STRUCTURED_OUTPUT: PASS

### Cost (per DeepSeek pricing docs, per 1M tokens)
| Model | Input (cache miss, off-peak) | Output (off-peak) |
|---|---|---|
| deepseek-v4-flash | $0.22 | $0.66 |
| deepseek-v4-pro | $0.66 | $1.98 |
| deepseek-v4-flash-vision-exp | $0.22 | $0.66 |

Vision candidate costs the same as the default text model — cheapest
sufficient verified vision model. No escalation needed (no expensive
flagship). OpenAI OAuth provider present in auth but token scoped (403 on
direct API) — not used; DeepSeek vision path is sufficient and cheaper.

### Model routing report
```
DEFAULT_TEXT_MODEL:              deepseek/deepseek-v4-flash
DEEPSEEK_VERSION:                DeepSeek-V4-Flash-0731 (live API)
DEEPSEEK_IMAGE_SUPPORT:          NOT_SUPPORTED (live 400 rejection; cache attachment:false)
AVAILABLE_VISION_MODELS:         deepseek-v4-flash-vision-exp (DeepSeek, verified);
                                 openai gpt-4o-mini etc. listed in cache but token 403 → not usable here
SELECTED_VISION_MODEL:           deepseek-v4-flash-vision-exp
VISION_PROVIDER:                 deepseek (api.deepseek.com)
VISION_COST_CLASS:               LOW — identical to text model ($0.22/$0.66)
VISION_SMOKE_TEST:               PASS (2/2 exact schema)
VISION_FALLBACK_MODEL:           none verified live in this environment
                                 (escalation path documented: retry once → stronger model; none configured)
PLAYWRIGHT_DOM_MODEL:            DeepSeek V4 Flash
PLAYWRIGHT_VISUAL_MODEL:         deepseek-v4-flash-vision-exp
MODEL_CAPABILITY_FOUNDATION:     GREEN
```

## 4. Baseline freeze and benchmark results (fresh evidence)

### Determinism
Two fresh full v2 runs (`r2-frozen-det1`, `r2-frozen-det2`): all 72 case
results byte-identical (SHA-256 of `results` array equal), and identical to
the prior `candidate-final` file. **DETERMINISM: PASS.**

### Old 60-case regression (R2 vs R1; regression corpus only)
| Metric | R1 baseline | R2 (48 cal) | R2 (12 old holdout) |
|---|---|---|---|
| MAE | 23.6–29.25 | 11.67 | 17.42 |
| Median AE | 19.5–25.5 | 7.5 | 18.0 |
| Spearman | 0.31–0.49 | 0.861 | 0.706 |
| Within-one-band | 54–67 % | 85.4 % | 83.3 % |
| False-high | 0 % | 0 % | 0 % |
| False-low | 16–80 % | 0 % | 0 % |
| Routing | 0/9 guidelines | 9/9 | 2/2 |
| Terse-good mean | 27.5 | 86.25 | — |

R2 is a dramatic, verified improvement over R1 on the old corpus.

### Fresh benchmark v2 — development (54; frozen candidate)
| Metric | Target | Result |
|---|---|---|
| Spearman | ≥ 0.70 | **0.877** |
| MAE | ≤ 14 | **10.85** |
| Median AE | ≤ 12 | **11.0** |
| Within-one-band | ≥ 85 % | **98.15 %** |
| False-high | ≤ 3 % | **0 %** |
| False-low | ≤ 12 % | **0 %** |
| Pairwise | ≥ 88 % | **88.9 %** |
| Routing | ≥ 95 % | **98.15 %** |
| Gaming EXCELLENT | 0 | **0** (resistance 1.0) |
| Recommendation usefulness | ≥ 75 % | 51 % (below target) |
| Terse fairness | — | 100 %, terse mean 85.43 |

Dev targets met (except recommendation usefulness).

### Fresh benchmark v2 — hidden holdout (18; frozen candidate, decisive test)
| Metric | Target | Result | Verdict |
|---|---|---|---|
| MAE | ≤ 16 | **22.72** | FAIL |
| Median AE | ≤ 14 | 10.0 | pass |
| Spearman | ≥ 0.65 | **0.3625** | FAIL |
| Within-one-band | ≥ 80 % | **66.67 %** | FAIL |
| False-high | ≤ 5 % | **10 %** (1 case) | FAIL — dangerous |
| False-low | ≤ 15 % | **71.4 %** (5/7) | FAIL |
| Pairwise | ≥ 85 % | **62.5 %** | FAIL |
| Routing | ≥ 90 % | 100 % | pass |
| Gaming EXCELLENT | 0 | 0 | pass |

**R2 holdout FAILS on 6 of 9 headline targets.** For comparison, R1 on the
same holdout: MAE 32.67, Spearman 0.416, within-one 55.6 %, FH 0 %, FL 71.4 %,
pairwise 50 %. R2 improves several metrics vs R1 but is worse on Spearman and
introduces a **new false-high R1 did not have**.

**Decisive cases:**
- `s2-h-task-en-terse-excellent-001` (extraction, gold 97 EXCELLENT) → R2 **33**
  (BROKEN). Root cause: "list" absent from `ACTION_VERBS_EN` → `signal_poor`
  cap crushes all substance dimensions.
- `s2-h-task-de-broken-contradictory-001` (4 contradiction pairs, gold 38
  BROKEN) → R2 **78** (GOOD). Root cause: contradiction detector lacks
  voice ("aktiv/passiv"), Fazit/order, and metrics topics; "Schreibe"/"Ende"
  missing from `IMPERATIVE_VERBS` → `conflict_weight = 0` → no defensive cap.

## 5. Performance (fresh measurements)

| Input | p50 |
|---|---|
| short (34 chars) | 133 ms (after warmup) |
| medium (1.2K) | 156 ms |
| large (137K) | 1.1 s |
| 100K bounded | 3.9 s |

No catastrophic regex backtracking, no quadratic blowup. Bounded and
acceptable. Determinism also holds on large inputs.

## 6. Full repo gates (fresh runs, all green)

| Gate | Result |
|---|---|
| `pnpm test` | 1734 passed / 0 failed (76 files) |
| `pnpm lint` | PASS (0 warnings) |
| `pnpm exec tsc --noEmit` | PASS |
| `git diff --check` | PASS |
| `cargo test --workspace` | 302 passed / 0 failed (incl. 27 r2_contract + 17 command_errors) |
| `cargo fmt --check --all` | PASS |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS |
| `pnpm build` | PASS |
| Playwright E2E (chromium) | 59 passed / 0 failed (5 skipped = USB corpus env) |
| Playwright E2E (webkit/firefox) | TOOL_GAP — browser binaries not installed (infrastructure, not code) |

## 7. Anti-overfit scan

- No benchmark IDs (`s2-*`, `sem-t-*`) matched via automated overlap scan of
  production source. Lexicon overlap is generic DE/EN vocabulary only.
- **BUT** Agent #5 identified violations: holdout case ID `fmis-504` named in
  `features.rs:395`; calibration-v2/dev-set-derived thresholds with gold
  anchors and a case-ID debug dump in `scoring.rs`; contract-assertion
  loosenings (R10, R25) in `r2_contract.rs`.
- **KNOWN_BENCHMARK_OVERFIT_SCAN: FAIL** (case IDs + corpus-derived thresholds
  in source violate spec §13 / §14.6).

## 8. Verification agent chain (all actually invoked)

| Agent | Verdict |
|---|---|
| #5 ANALYZER_R2_IMPLEMENTATION_REVIEWER | **BLOCKERS** — contradiction gaps, lexicon gaps, overfit violations, spec divergences (Safety N/A for all kinds, Safety max 9, missing confidence gate, contradiction recs without PV keyword) |
| #6 ANALYZER_R2_METHODOLOGY_VERIFIER | **COMPROMISED** — holdout secrecy broken (runner writes dev+holdout in one file → holdout scores in every calibration artifact; gold on disk pre-freeze; MANIFEST publishes band design intent), v2 dev set contains truncated copies of old *holdout* cases, judge blindness unverifiable (no gold provenance), holdout run ≥ 11× (deterministically identical → benign), v2 pair checks silently disabled (H1/H2 never evaluated); metric arithmetic PASS |
| #7 ANALYZER_R2_PROMPT_QUALITY_EXPERT | 12/18 holdout golds defensible; 4 over-generous/inconsistent (H2 boilerplate 90 vs dev GOOD; de-guideline 59 vs dev 34; "improve X" 46 vs dev 15/21; fair-incomplete drift). **Core engine failures (false-high + terse/template/guideline false-lows) are genuine and survive any relabeling.** Gold not trustworthy enough to certify generalization degree |
| #8 ANALYZER_R2_VISUAL_QA_VERIFIER | **PASS** — DOM verified (sections, scores, no dialogs, 0 console errors, no stale results); screenshot routed to `deepseek-v4-flash-vision-exp` → `{"layout_broken":false,"text_clipped":false,"overlap_detected":false,"unexpected_dialog":false,"analysis_result_visible":true,"heading_visible":true,"confidence":0.95,"findings":[]}`; 1 vision call, 0 escalations |
| #9 FINAL_ANALYZER_R2_VERIFIER | **FAIL on verification gate; classification AMBER_PROMPTVAULT_ANALYZER_R2_IMPROVED_NOT_GENERALIZED; DO NOT INTEGRATE** |

## 9. Classification (exactly one)

**`AMBER_PROMPTVAULT_ANALYZER_R2_IMPROVED_NOT_GENERALIZED`**

Rationale:
- NOT GREEN: generalization not proven — fresh holdout fails all headline
  targets; new dangerous false-high; anti-overfit violations in source;
  holdout methodology compromised.
- NOT RED: R2 is a dramatic, verified improvement over R1 on the old corpus
  and dev set, and beats R1 on most fresh-holdout metrics (MAE 32.67→22.72,
  within-one 55.6→66.7 %, pairwise 50→62.5 %, routing, terse). It is worse
  than R1 on holdout Spearman and introduces a new false-high class.

## 10. Integration decision

**DO NOT INTEGRATE to master.** The owner's hard gate is "integrate only if
generalization is proven"; it is not proven. The branch stays on
`quality/analyzer-r2` with the R2 implementation, benchmark v2, and this
evidence. The engine is a major step forward and should be hardened against
the blockers below, then re-evaluated against a genuinely clean, secret
holdout.

## 11. Blockers before GREEN could be claimed

1. Remove anti-overfit contamination: `fmis-504` ref, corpus-derived
   thresholds, gold anchors, case-ID debug dump; restore rubric-anchor-only
   provenance.
2. Restore or owner-sign-off the R10/R25 contract loosenings.
3. Clean holdout protocol: gold absent from working tree, separate output
   files per split, exactly one post-freeze run.
4. Eliminate the dangerous false-high: voice/Fazit/metrics contradiction
   detection; FH must be 0 %.
5. Fix the false-low class: extraction verbs ("list", …) in the action-verb
   table; decouple `signal_poor` from templates/guidelines.
6. Re-enable H1/H2 pair evaluation in the metrics script.
7. Meet fresh-holdout targets on a clean re-run.
8. Implement the recommendation confidence gate; keyword-bearing
   contradiction recs.
9. Reconcile spec divergences (Safety applicability matrix, Safety max 9)
   with owner sign-off; re-derive a clean dev set free of legacy-holdout
   truncations.
10. Restore gold provenance/blindness documentation.

## 12. Final report additions (owner-required fields)

- Default text/code model: `deepseek/deepseek-v4-flash`
- DeepSeek model: `deepseek-v4-flash` (V4-Flash-0731)
- DeepSeek vision capability: NOT_SUPPORTED (live 400 rejection)
- Vision candidates tested: `deepseek-v4-flash-vision-exp` (smoke test PASS 2/2)
- Selected vision model: `deepseek-v4-flash-vision-exp`
- Why selected: cheapest verified model; cost identical to text model
- Relative cost: same as text default ($0.22/$0.66 per 1M off-peak)
- Vision smoke test: PASS
- Playwright DOM model: DeepSeek V4 Flash
- Playwright visual model: `deepseek-v4-flash-vision-exp`
- Vision calls: 1 (visual QA) + 2 (smoke test) = 3 total this run
- Vision escalations: 0 (one transient token-budget retry in orchestrator
  visual QA; Agent #8 had 0 escalations)
- OCR used: NONE
- OCR used as sole visual verifier: NO
- GitHub MCP: PASS
- Playwright MCP: PASS
- Vision route: PASS
- R2 architecture: deterministic Rust pipeline, no LLM; spec divergences noted
- Old benchmark: R2 strongly improves R1 (MAE 11.67 vs 23.6+)
- Fresh development: targets met (Spearman 0.877, MAE 10.85, FH/FL 0 %)
- Fresh holdout: FAILS (Spearman 0.36, MAE 22.72, FH 10 %, FL 71 %)
- Visual QA: PASS
- Determinism: PASS
- Performance: PASS (bounded)
- TTS untouched: PASS; release untouched: PASS

## 13. Evidence artifacts

- `benchmarks/semantic-quality-v2/results/pv-r2-frozen-det1.json` / `det2`
  (fresh deterministic runs, gitignored)
- `benchmarks/semantic-quality-v2/results/pv-master-v2-holdout.json` (R1 baseline)
- `evidence/analyzer-r2/20260821/pvl-analyzer-direct-synthetic.png`
  (visual QA screenshot, synthetic content only)
- `src-tauri/tests/perf_check.rs` (performance smoke test)
- This report
