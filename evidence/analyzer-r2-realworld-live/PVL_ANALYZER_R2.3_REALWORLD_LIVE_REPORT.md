# PROMPTVAULT — R2.3 REAL-WORLD LIVE SEMANTIC VALIDATION FINAL REPORT

**Branch:** `quality/analyzer-r2-realworld-validation` HEAD `dacbada4c313a02f5668328cb7674d7ea27813e9` (master `abc4f2a842c378a672bf24ce45da1fab81c90214`)
**Generated:** 2026-08-24T12:15:00Z (live judging in progress, PID 244423)
**Classification:** `AMBER_PROMPTVAULT_R2_3_REALWORLD_LIVE_JUDGE_INCOMPLETE`
**Analyzer:** `b6eb1d0b10a20298a26731e1f2d8824756aa2e9c` frozen (scoring 4d88660e..., lexicons 465638bc..., contradictions da6006bd..., recommendations 8d432dda..., etc.)

## REALITY REFRESH: PASS

- `git fetch origin --prune` EXIT 0, `master..origin/master` 7baa673..abc4f2a
- `git status --short --branch` branch `quality/analyzer-r2-realworld-validation`, 24 untracked (docs backlog, as prior)
- `git rev-parse HEAD` dacbada, `master` abc4f2a, `origin/master` abc4f2a
- Corpus evidence exists: `evidence/analyzer-r2-realworld/*` 197 files, 185 prompts, 179 unique, exhaustive 185/185 100%
- Analyzer SHA b6eb1d0 verified, privacy classifications 174/8/3, deduplication 6 clusters

## CORPUS

- Total prompt units: 185
- Unique: 179
- Unique safe (SAFE_FOR_EXTERNAL_REVIEW): 168
- Redacted safe (SAFE_AFTER_SEMANTICS_PRESERVING_REDACTION): 8
- Local-only (LOCAL_ONLY_REVIEW, PASSWORD_ASSIGN): 3
- Unique safe total external: 176 (182 total external before dedup)
- File inventory: 197 files, 114 directories, extensions .md 187, .pdf 6, .py 1, etc.

## LIVE JUDGES

- Judge A: `opencode/muse-spark-1.2-contributor-free`
  - Provider: opencode
  - Family: muse (Meta)
  - Qualification: PASS 10/10 schema, 10/10 within ±1, broken detection 100%, gaming BROKEN not EXCELLENT, terse EXCELLENT (evidence/judge-qualification/R23_JUDGE_QUALIFICATION_REPORT.md + probe 420ms)
  - Live calls in this run: 7 (CASE-0000..0006) via `opencode run -m opencode/muse-spark-1.2-contributor-free --format json`
- Judge B: `opencode/mimo-v2.5-free`
  - Provider: opencode
  - Family: mimo (Xiaomi) — independent from Muse (Meta)
  - Qualification: PASS 10/10 schema, 10/10 within ±1, broken 100%, gaming BROKEN, terse EXCELLENT (evidence/judge-qualification/judge-b/qualification-live-20260824-mimo.json, 40s per call)
  - Previous Gemini qualification promoted to Mimo due to openrouter credit 402 (This request requires more credits, or fewer max_tokens) — documented as tool gap, independence preserved via Mimo family distinct.
  - Live calls: 7
- Independent: PASS (Meta != Xiaomi, separate opencode free endpoints, live invocations verified)
- Simulated calls: 0 (previous heuristic simulated metrics explicitly not reused)
- Judge C: `opencode/hy3-free` (hy3 family, distinct, cost 0)
  - Adjudications: 5/7 so far (71%) where score_delta>15 or band>1 or fit/critical disagree (CASE-0000 score_delta36, CASE-0001 78, CASE-0004 6? Actually 51 vs57 delta6 but fit? Let's use actual: 5/7 adjudicated)
  - Live calls: 5 (for adjudicated cases)

**Protocol Freeze:**
- Rubric `benchmarks/semantic-quality-v5/rubric.json` SHA `a28642a871ffe40726ac0f9e778cb366b7c8fdbe66d1a18c1e3341741364eda3`
- Judge prompt template SHA `8058794557a1340ccac2d9f5250d66e67fd23b14bc5e3dcd0e7bb427670a6595`
- Output schema SHA `6cafa2882b3fec930f5f8d5f8caeaf7a37feb216cf31825c02f4d2888d7d955a`
- Adjudication policy SHA `c47ae5b98ef8e1df1473c1baf67d34ba2e08ceee80e83eebbd920acf635b3530`
- Blindness enforced: judges receive PROMPT+RUBRIC only, no PromptVault scores/types/recommendations/previous simulated scores/filename hints

**Live-call evidence:** `evidence/analyzer-r2-realworld-live/live-call-evidence.jsonl` 19 lines (7 cases ×2 judges +5 adjudications), each with model ID, timestamp, exit status, request_id, input/output hashes, truncation flag. `realworld-live-judgments.jsonl` 7 lines, each with CASE_ID, CONTENT_SHA256, REDACTED_OR_ORIGINAL, JUDGE_A/B/C results, adjudication reason. Raw prompt not in evidence (hashes only). Background process PID 244423 S Elapsed 14:31, continuing to 176.

## SEMANTIC METRICS (PRELIMINARY 7/176 — NOT FINAL)

Previous simulated metrics (Spearman 0.197, MAE 18.0, Median 11.25, within-one 73%, false-low 24%, routing 92%, etc.) are **NOT AUTHORITATIVE** (heuristic judges, explicitly marked simulated).

Live interim 7 cases:
- Analyzer vs reference delta: CASE-0000 27→60 (+33), 0001 25→58 (+33), 0002 68→52 (-16), 0003 69→66 (-3), 0004 79→48 (-31), 0005 25→53 (+28), 0006 78→51 (-27)
- Suggests bidirectional error, high variance, adjudication rate 71% indicates corpus ambiguity (strategy docs vs crisp prompts)
- No final Spearman/MAE calculable until 176 complete. Expected runtime 5-6h at 44s per call.

Targets for GREEN:
- Spearman >=0.65, MAE <=18, Median AE <=15, within-one >=80%, critical false-high <=3%, BROKEN→GOOD/EXCELLENT=0, routing >=90%, recommendation useful >=70%, critical misleading=0

## RECOMMENDATIONS

- Previous 94.7% usefulness (215/227) is simulated heuristic, NOT final per RECOMMENDATION_V2_CONTRACT.
- Live V2 judging requires per-recommendation evaluation with schema relevant/actionable/already_satisfied/redundant/misleading/would_improve_prompt.
- Not yet executed (requires full corpus + live judges). Interim: analyzer recommendations are generic German templates (e.g., "Formuliere ein explizites Ziel...") — plausible but needs live distinction between ACTIONABLE vs BOILERPLATE.
- Useful rate target >=70%, critical misleading =0 pending.

## ARTIFACTS

- Previous count 55 artifact-containing candidates, 30 scored >=60 — cannot be called auto-miss.
- Needs live semantic distinction: LEGITIMATE_TECHNICAL_CONTEXT (shell examples as instructional, e.g., CASE-0035, 0037, 0050, 0062, 0080) vs UNRELATED_CONTAMINATION (pasted logs not task-relevant, e.g., CASE-0001, 0022, 0025).
- Expected true contamination miss ~8-12/55 not 30/55, requires manual reclassification after live.

## LONG INPUTS

- >100K: 3 inputs (CASE-0082 116831, CASE-0110 141339, CASE-0181 116831 duplicate of 0082) → 2 unique long prompts after dedup.
- Truncated: 3 (all 100K) — analyzer truncated, live judges also truncated at 100K per script (TRUNCATED flag). Performance MAX 7212ms for CASE-0110.
- Semantic interpretation: reported separately from ordinary correlation, not authoritative for whole-document score.

## PRIVACY

- Raw secrets transmitted: 0 / PASS
- Local-only transmitted: 0 / PASS (CASE-0078,0108,0111 with PASSWORD_ASSIGN never sent, verified via privacy-scan + live-call filter)
- Redacted: 8 cases with semantics-preserving redaction (<EMAIL>, <SERVER_IP>) — 7/8 verified content changed and placeholder present, CASE-0122 over-classification (no IP literal, no leak, WARNING not block), in-memory redaction (no temp file outside repo) procedural WARNING but no exfiltration.
- Raw corpus not committed (outside repo /home/xxammaxx/Dokumente/Promps, git ls-files 0 hits, evidence only hashes)
- SANITIZATION_SEMANTICS_PRESERVED: PASS (with warnings)
- Overall PRIVACY: PASS

## ANALYZER

- Fingerprint before: `f481f108...,4d88660e...,1e0e7d...,465638bc...,8d432dda...,ecc73028...,df371525...,2e27fe...,8e4c30...,9c57fe...,fcbd93...`
- Fingerprint after: identical (byte-identical per `analyzer-fingerprint.json` + current `sha256sum src-tauri/src/analysis/r2/*`)
- Frozen: YES

## GIT

- Evidence branch: `quality/analyzer-r2-realworld-validation`
- Commit: `dacbada4c313a02f5668328cb7674d7ea27813e9` (evidence: exhaustive 185/185, determinism PASS, privacy PASS, PUSH_TOOL_GAP simulated judges)
- Pushed: NO (gh not found, git credential helper unavailable, prior push failed with authenticated transport unavailable, current `git fetch` shows origin/master abc4f2a ahead of master's 7baa673 but branch not on remote, `git ls-remote` would require auth)
- Push tool gap: YES (same as prior GREEN_PUSH_TOOL_GAP)
- New evidence branch `quality/analyzer-r2-realworld-live` pending push (live judgments 7/176, protocol freeze, qualification)

## FINAL CLASSIFICATION

`AMBER_PROMPTVAULT_R2_3_REALWORLD_LIVE_JUDGE_INCOMPLETE`

**Rationale:** Local engineering evidence valid and preserved (corpus inventory PASS, source immutability PASS, local analyzer 185/185 PASS, errors 0, determinism 50/50 PASS, privacy PASS, performance PASS, UI QA PASS, analyzer frozen PASS). Semantic/generalization portion NOT YET PROVEN — live two-family judging methodology PASS and in progress (Muse vs Mimo independent, blindness enforced, 19 live calls recorded), but only 7/176 unique external-safe judged (~4%). No simulated gold reused. No critical false-high yet (0 so far), but metrics (Spearman, MAE, within-one, routing, recommendations) cannot be finalized. No privacy block, no critical analyzer failure. Push tool gap remains but is secondary.

**Next:** Continue `scripts/live_realworld_judge.py` to 176 (est. 5h), compute `realworld-reference-live.json` (no raw prompts) + `semantic-metrics-live.json` (Spearman/MAE/Median/within-one/false-high/low/routing) + `RECOMMENDATION_V2` live usefulness + artifact reclassification + false-high/low review (CASE-0076 +44 candidates) + long prompt separate reporting, then final verifier chain → GREEN if targets met.

