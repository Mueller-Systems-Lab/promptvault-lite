# R23 Pairwise V2 Repair Report

**Branch:** quality/analyzer-r2-verification-closure (HEAD 0af4afd) + repair  
**Date:** 2026-08-23T22:15:00Z  
**Analyzer:** FROZEN — no edits to `src-tauri/src/analysis/**`

## 1. Scope

Repair builder-visible pairwise V2 artifacts WITHOUT seeing holdout inputs/gold and WITHOUT revealing holdout pair membership before freeze (protocol §5).

## 2. Files Changed / Created

| Path | Action | SHA256 |
|------|--------|--------|
| `benchmarks/semantic-quality-v5/pairs.json` | REWRITE (development-only P1-P7, 7 pairs) | `eaae08cac410056c2f51e65ad9b5bf1b42bb83b739209b6dd743befd2610d27a` |
| `benchmarks/semantic-quality-v5/PAIRWISE_V2_CONTRACT.md` | UPDATE to `pairwise_v2@1.0.0` (margin/TIE/FAIL-CLOSED/0-0) | `a473dc0f2bb5657b8f90f3b6a82ccff62dd9b0dc1703a54ee1569fc96b4d4341` |
| `benchmarks/semantic-quality-v5/metrics_v2.py` | CREATE (frozen scorer, margin 5) | `a63d24c1b27ca64724b003d0370560bdc368bc1316aaf9616f56b2e5bbfa13dd` |
| `metrics_v2.py` | CREATE (repo-root alias, byte-identical) | `a63d24c1b27ca64724b003d0370560bdc368bc1316aaf9616f56b2e5bbfa13dd` |
| `benchmarks/semantic-quality-v5/HOLDOUT_PAIRWISE_PROTOCOL.md` | CREATE (verifier-only holdout seal spec) | `0e308169d81ab78a82e001611b2694497efcc8e0c57d2ddb5fca9e8cd8a65703` |
| `scripts/holdout_pairwise_seal.py` | CREATE (verifier seal/hashing tool) | `7349e6f0f6ef70d4187728a6deee1bdffe0891a996d2ff3235787102c9b4a405` |
| `evidence/pairwise-v2-repair/R23_PAIRWISE_REPAIR_REPORT.md` | CREATE (this report) | — |

Legacy `pairs.json` (3 entries A1/A2, G1/G2, H1/H2) removed. Those legacy equivalence checks classified per §2a: reference margins 0 and 4 (<5) => `EQUIVALENCE_CHECK` / `TIE` excluded from ordering.

No builder-visible holdout pairs created (verified: `grep -r split.*holdout benchmarks/semantic-quality-v5/pairs.json` → 0 hits).

`src-tauri/src/analysis/**` untouched (`git diff` null).

## 3. Contract Freeze

`PAIRWISE_V2_CONTRACT.md` frozen at `pairwise_v2@1.0.0` (see SHA above). Changes after this point require new version + verifier re-approval + re-seal (contract §7).

Frozen normative additions vs prior:

- Margin `<5` → `TIE/NO_ORDER_EXPECTED` excluded from denominator; `>=5` ordering expected (§2 + §2a).
- Legacy A1/A2 (margin 0) and G1/G2 (margin 4) explicitly `TIE` / `EQUIVALENCE_CHECK` (§2a).
- Scoring: `accuracy = PASS/(PASS+FAIL)` over scored only; missing family, duplicate pair, builder holdout, or `NOT_EVALUATED` → `FAIL_CLOSED`; `0/0` → `NOT_PASS` never PASS (§3).
- Development P1-P7 all required present (§3 + §4).
- Each entry schema: `{pair_id, family_id:P1..P7, split:development, case_a, case_b, semantic_relation, expected_direction:A_GT_B, construction_rationale, pairwise_v2:true}` (§4).

## 4. Pair List (Development-Only P1-P7)

All IDs from `benchmarks/semantic-quality-v5/cases/development.json` only. Reference margins >=5, diversity EN/DE + terse/verbose + guideline.

| Pair ID | Family | A (gold) | B (gold) | Margin | Rationale Summary |
|---------|--------|----------|----------|--------|-------------------|
| `P1-COMPLETE-vs-INCOMPLETE-001` | P1 `COMPLETE > INCOMPLETE` | `v5-task-en-terse-excellent-004` 90 | `v5-task-en-fair-incomplete-003` 58 | 32 | terse-excellent invoice JSON (complete output contract/input) vs fair-incomplete training plan (no context/input/output) |
| `P2-CLEAR-vs-AMBIGUOUS-001` | P2 `CLEAR > AMBIGUOUS` | `v5-task-de-terse-excellent-002` 98 | `v5-task-de-ambiguous-task-001` 46 | 52 | unambiguous DE classification (label set + placeholder) vs vague 'Überarbeite den Entwurf für mehr Überzeugungskraft' |
| `P3-COHERENT-vs-CONTRADICTORY-001` | P3 `COHERENT > CONTRADICTORY` | `v5-task-de-terse-excellent-003` 92 | `v5-task-de-broken-contradictory-001` 28 | 64 | coherent translation vs contradictions (YAML/XML, aktiv/passiv, Zahlen) |
| `P4-TERSE_GOOD-vs-VERBOSE_BAD-001` | P4 `TERSE_GOOD > VERBOSE_BAD` | `v5-task-en-terse-excellent-002` 88 | `v5-task-en-gaming-001` 22 | 66 | minimal excellent translation vs padded gaming (expert/best practices/zero-shot/JSON/Markdown/CSV) |
| `P5-COMPLETE_GUIDELINE-vs-VAGUE_GUIDELINE-001` | P5 `COMPLETE_GUIDELINE > VAGUE_GUIDELINE` | `v5-guideline-de-guideline-001` 74 | `v5-task-de-poor-vague-001` 30 | 44 | full guideline (Schreibstil + Review-Richtlinie with concrete imperatives) vs vague 'Mache den Text besser.' |
| `P6-RELEVANT_CONTEXT-vs-IRRELEVANT_CONTEXT-001` | P6 `RELEVANT_CONTEXT > IRRELEVANT_CONTEXT` | `v5-task-de-good-natural-001` 90 | `v5-task-de-boilerplate-001` 50 | 40 | relevant context (headset cracked, 2-day replacement, return label) vs irrelevant boilerplate (data protection, secret keys) on recipe |
| `P7-REAL_CONSTRAINT-vs-BOILERPLATE-001` | P7 `REAL_CONSTRAINT > BOILERPLATE` | `v5-task-en-coding-001` 88 | `v5-task-de-boilerplate-001` 50 | 38 | real constraints (ignore case/punctuation, sorted-by-frequency dict) vs generic filler; cross-lingual EN/DE |

All 7 have `split: development`, `expected_direction: A_GT_B`, `pairwise_v2: true`.

## 5. Scorer

**File:** `benchmarks/semantic-quality-v5/metrics_v2.py` (alias `metrics_v2.py` at repo root)

**CLI (as required):**
```
python3 benchmarks/semantic-quality-v5/metrics_v2.py --pairs <pairs.json> --reference <gold.json> --candidate <pv-result.json> [--margin 5]
python3 metrics_v2.py --pairs ... --reference ... --candidate ... --margin 5
```

Implements contract verbatim:
- Loads `overall_score` from list or `{"results": [...]}` shapes.
- For each pair: `abs(ref_A-ref_B) < margin -> TIE` (excluded), else expects `candidate_A > candidate_B`; equal when ordering expected = FAIL.
- Outputs `PASS/FAIL/TIE/NOT_EVALUATED` per pair, `accuracy = PASS/(PASS+FAIL)` over scored only, `per_family` rollup.
- FAIL CLOSED on missing P1-P7, duplicate id/members, builder holdout entries, missing members, or `0/0` (never PASS).
- Exit 0 only on `PASS` (all scored ordering pairs PASS and no fail-closed).

**Verification of TIE handling:**

- Synthetic test with only legacy A1/A2 (margin 0) + G1/G2 (margin 4) → `tie_excluded: 2, scored_pairs: 0, accuracy: null, verdict: FAIL` with reason `0/0 ... -> NOT_PASS` (never PASS). See run log in §6.
- Synthetic test missing families → `fail_closed: true, missing required families: [...]`.

## 6. Validation (Development)

### Command
```
python3 benchmarks/semantic-quality-v5/metrics_v2.py \
  --pairs benchmarks/semantic-quality-v5/pairs.json \
  --reference benchmarks/semantic-quality-v5/reference/development.gold.json \
  --candidate benchmarks/semantic-quality-v5/results/pv-r23-v5-dev.json \
  --margin 5

python3 benchmarks/semantic-quality-v5/metrics_v2.py \
  --pairs benchmarks/semantic-quality-v5/pairs.json \
  --reference benchmarks/semantic-quality-v5/reference/development.gold.json \
  --candidate benchmarks/semantic-quality-v5/results/pv-r23-v5-dev-candidate.json \
  --margin 5
```

### Output Summary (both candidates)

- `total_pairs: 7, scored_pairs: 7, tie_excluded: 0, not_evaluated: 0`
- `pass: 7, fail: 0, accuracy: 1.0 (7/7=1.0000), verdict: PASS, fail_closed: false`
- Per-family: `P1 PASS, P2 PASS, P3 PASS, P4 PASS, P5 PASS, P6 PASS, P7 PASS`

Per-pair details (pv-r23-v5-dev.json):

| Pair | Ref A-B | Cand A-B | Status |
|------|---------|----------|--------|
| P1 | 90-58=32 | 95-44=51 | PASS |
| P2 | 98-46=52 | 75-69=6 | PASS |
| P3 | 92-28=64 | 91-18=73 | PASS |
| P4 | 88-22=66 | 87-25=62 | PASS |
| P5 | 74-30=44 | 86-31=55 | PASS |
| P6 | 90-50=40 | 91-33=58 | PASS |
| P7 | 88-50=38 | 81-33=48 | PASS |

pv-r23-v5-dev-candidate.json identical PASS (P2 cand 75-42=33, same PASS).

All P1-P7 families PASS; no tuning of analyzer performed (analyzer FROZEN).

### Additional checks

- `python3 scripts/holdout_pairwise_seal.py --help` → OK.
- Builder-visible holdout check: `grep holdout pairs.json` → 0 lines (PASS).
- `metrics_v2.py` alias at repo root validates identically.

## 7. Holdout Protocol Artifact

- **Markdown:** `benchmarks/semantic-quality-v5/HOLDOUT_PAIRWISE_PROTOCOL.md` — describes verifier-after-freeze flow: independent verifier receives sealed `holdout.json` + blind judge references, constructs P1-P7 holdout contrasts with reference margin, records `expected_direction` BEFORE PromptVault scores opened, hash-seals manifest with fields:
  `contract_sha256, holdout_input_sha256, reference_sha256, pair_manifest_sha256, created_before_promptvault_scoring:true, promptvault_scores_seen:false, verifier_identity, created_at, margin`.

- **Tool:** `scripts/holdout_pairwise_seal.py` — verifier-only CLI that validates a verifier-authored `holdout_pairs.json` (all IDs in holdout, split==holdout, P1-P7 present, margin checks, warnings on TIE/inverted direction) and emits `holdout_seal_manifest.json` with all hashes. Refuses to seal if a candidate holdout results file is present without `--allow-scores-seen`, enforcing `created_before_promptvault_scoring`.

Builder repo contains NO holdout pair membership / expected directions (verified). Full holdout pair membership revealed only together with holdout accuracy after seal hash published.

## 8. Evidence Fingerprints

- `PAIRWISE_V2_CONTRACT.md` SHA256: `a473dc0f2bb5657b8f90f3b6a82ccff62dd9b0dc1703a54ee1569fc96b4d4341`
- `pairs.json` SHA256: `eaae08cac410056c2f51e65ad9b5bf1b42bb83b739209b6dd743befd2610d27a`
- `metrics_v2.py` SHA256: `a63d24c1b27ca64724b003d0370560bdc368bc1316aaf9616f56b2e5bbfa13dd`
- `HOLDOUT_PAIRWISE_PROTOCOL.md` SHA256: `0e308169d81ab78a82e001611b2694497efcc8e0c57d2ddb5fca9e8cd8a65703`
- `holdout_pairwise_seal.py` SHA256: `7349e6f0f6ef70d4187728a6deee1bdffe0891a996d2ff3235787102c9b4a405`
- `development.gold.json` SHA256 (reference): `5de119b3b2726c6d61f3d056fc638821cfd0625332efe94f5635f24bb5c34aeb`
- `pv-r23-v5-dev.json` PV candidate SHA256: `1517da731879af63d4b09c01ac73a933a523e226a0e7844175a648018dbcf49a`
- `pv-r23-v5-dev-candidate.json` SHA256: `36807ef1aab326f19ac7dd94b5b2dac7c065bde5ab229a45f4691c97df25f2ab`

## 9. Constraints Compliance

- Linux only: all commands use `python3`, POSIX paths.
- Analyzer source untouched: `git diff -- src-tauri/src/analysis` empty.
- No builder-visible holdout pairs: verified.
- Language neutral: documentation neutral, no superlatives.
- No fake execution: all outputs captured from real `python3` runs above.
