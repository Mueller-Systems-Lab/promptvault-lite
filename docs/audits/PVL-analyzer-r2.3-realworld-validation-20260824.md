---
title: PVL Analyzer R2.3 Real-World Validation Evidence
date: 2026-08-24
status: INTERIM_BLOCKED
classification: AMBER_PROMPTVAULT_R2_3_REALWORLD_PRIVACY_REVIEW_BLOCKED
scope: documentation/evidence only
---

# PVL Analyzer R2.3 — Real-World Validation Evidence

> **Interim/blocked result — not GREEN.** This report is an aggregate, sanitized evidence record. It does not reproduce raw prompt text, secrets, private corpus paths, real corpus filenames, full source paths, or restricted metadata.

## Reality and scope

- **Observed runtime:** Linux/bash.
- **Observed branch:** quality/analyzer-r2-realworld-validation.
- **Observed current HEAD:** 4d96603020403f42e7f5fc9c883114a8233dbfd8.
- The frozen analyzer fingerprint matched before and after validation. The Analyzer R2 source fingerprint also matched.
- The source-corpus hash set was unchanged.
- This activity is documentation/evidence only: product code, analyzer code, CI, and corpus were not modified.
- No push was performed. Authenticated SSH read access exists, but no remote branch publication occurred.
- No matching open issue was found. No GitHub issue comments are claimed.

## Corpus and exhaustive local run

| Measure | Result |
|---|---:|
| Corpus files | 197 |
| Corpus bytes | 2,939,582 |
| Directories | 114 including root (113 nested) |
| Prompt units | 185 |
| Unique prompt units | 179 |
| Exact duplicate clusters | 6 |
| Local exhaustive run | 185/185 successful (100%) |
| Fresh duration | 226399 ms |
| Mean duration | 1223.8 ms |

The corpus language was **German-only**; no English comparison was performed.

## Determinism and contamination scan

- **Determinism:** 50/50 results were byte-identical.
- **Contamination scan:** 0 production-source matches in the current scan. This aggregate result does not by itself establish a GREEN generalization or privacy verdict.
- **Live semantic judgment:** 53 unique hashes were judged from 176 planned external-safe representatives.
- **Live calls:** 135/137 exited 0; 2 exited 124. These call results do not close the incomplete representative/judgment reconciliation.
- **Live Recommendation V2:** not executed.

### Interim semantic metrics

These are interim metrics only and must not be treated as a release certification:

| Metric | Interim result |
|---|---:|
| Spearman | 0.0042 |
| MAE | 26.6 |
| Median AE | 23 |
| Within-one-band | 50.94% |
| Candidate false-high | 10/14 (candidates only) |
| Candidate false-low | 9/26 (candidates only) |

## UI evidence

- Playwright analysis: **1 passed**.
- Playwright stale/reanalysis checks: **2 passed**.
- Tests asserted no external network requests.

This UI evidence does not substitute for the blocked semantic and privacy verifiers.

## Required verifier results

| Verifier | Result | Concise blocker |
|---|---|---|
| Methodology | **FAIL** | The live judgment set is interim and incomplete; the planned stratified blind coverage and call/judgment reconciliation are not closed. |
| Semantic plausibility | **FAIL** | Interim rank/error metrics are weak, with candidate false-high and false-low findings still present. |
| Privacy | **FAIL** | Metadata sanitization and the complete privacy review remain outstanding; this report intentionally omits restricted material. |
| Final | **FAIL** | Methodology, semantic plausibility, and privacy blockers prevent a GREEN conclusion. |

## Recorded local gate status

| Gate | Status |
|---|---|
| pnpm test | **PASS** — 1734/1734 |
| pnpm lint | **PASS** |
| pnpm exec tsc --noEmit | **PASS** |
| pnpm build | **PASS** |
| cargo test --workspace | **PASS** — recorded passing components: 248 + 17 + 5 + 23 + 27 + 1; one ignored/performance-ignored entry |
| cargo fmt --check --all | **FAIL** — solely due to formatting in an untracked helper binary |
| cargo clippy --workspace --all-targets -- -D warnings | **FAIL** — solely due to warnings from an untracked helper binary |
| git diff --check | **PASS** |

The Rust format and clippy failures are not attributed to product or analyzer source.

## Final classification

**AMBER_PROMPTVAULT_R2_3_REALWORLD_PRIVACY_REVIEW_BLOCKED**

This is an interim/blocked result, **not GREEN**. The local analyzer execution and determinism evidence are useful, but the current live semantic sample, verifier failures, privacy review state, and incomplete reconciliation do not support release or generalization approval.

## Follow-up plan

1. Sanitize remaining metadata.
2. Complete at least a 100-case stratified blind sample, or document and justify a smaller cap.
3. Execute the live Recommendation V2 review.
4. Reconcile live call records with judgment records.
5. Rerun the final verifiers.
6. Request commit and push approvals only after the blockers are resolved.
