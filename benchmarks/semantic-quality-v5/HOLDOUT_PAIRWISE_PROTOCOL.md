# HOLDOUT Pairwise Protocol — Verifier-Only (R2.3)

**Status:** Sealed-protocol FROZEN at `pairwise_v2@1.0.0`. Builder-visible repository MUST NOT contain holdout pair membership or expected directions before freeze. This document describes ONLY the procedure the independent verifier executes AFTER freeze, off-repo, with sealed artifacts.

## 1. Purpose

Prevent leakage of holdout ordering signal to builders. All holdout P1–P7 contrasts are constructed by an independent methodology verifier who has no builder role, after the development pairwise manifest is frozen and before any PromptVault holdout scores are opened.

## 2. Actors

- **Builder:** PromptVault team. Sees only `development.json` (110 cases) and `pairs.json` containing `split: development` P1–P7 pairs. Has NO access to `cases/holdout.json` inputs or `reference/holdout.gold.json` ordering beyond sealed hash.
- **Verifier:** Independent methodology reviewer. Receives sealed holdout inputs + blind judge references under independent custody (outside repo, e.g., `markers/holdout.gold.json.sealed` hash-sealed, or external drive). Verifier identity is recorded in the sealed manifest.

## 3. Timing — BEFORE PromptVault scoring is opened

Sequence (strict):

1. Builder freezes `PAIRWISE_V2_CONTRACT.md` (`pairwise_v2@1.0.0` SHA256), `pairs.json` (development-only P1–P7), scorer `metrics_v2.py` (frozen margin), and seals holdout gold hash. Builder commits these and stops.
2. **Holdout inputs + blind reference judgments (two independent judge families + adjudication on delta>15) are delivered to verifier** via sealed channel. Verifier validates `holdout_input_sha256` and `reference_sha256` against sealed hashes.
3. Verifier inspects holdout cases, selects semantically matching P1–P7 contrasts **using ONLY reference scores and rubric** (never PromptVault outputs). For each family at least one ordered pair with reference margin >= frozen margin (default 5) is required; ties (<5) are recorded as `TIE/NOT_SCORED`.
4. **Verifier records `expected_direction` (A_GT_B) BEFORE any PromptVault holdout results are decrypted/opened.** Manifest is timestamped with `created_before_promptvault_scoring: true` and `promptvault_scores_seen: false`.
5. Verifier computes SHA256 hashes and writes the sealed holdout pair manifest (outside the builder repo or in a private verifier repo). Only the hash of the manifest is optionally published for audit; full membership remains verifier-only until holdout evaluation.
6. Only after the sealed manifest hash is published does the operator open PromptVault holdout scores and run the frozen scorer on holdout split. Scorer CLI: `python3 benchmarks/semantic-quality-v5/metrics_v2.py --pairs <verifier_holdout_pairs.json> --reference <holdout.gold.json> --candidate <pv-r23-v5-holdout.json> --margin 5`.
7. Verifier reports per-family PASS/FAIL and aggregate accuracy = PASS/(PASS+FAIL) over scored pairs only (TIED excluded). 0/0 = NOT_PASS, never PASS. Missing required holdout family = FAIL_CLOSED.

## 4. Required sealed manifest fields

The verifier's holdout manifest (JSON) MUST contain:

```json
{
  "contract": "pairwise_v2@1.0.0",
  "contract_sha256": "<sha256 of PAIRWISE_V2_CONTRACT.md frozen>",
  "holdout_input_sha256": "<sha256 of cases/holdout.json as sealed>",
  "reference_sha256": "<sha256 of holdout.gold.json as judged>",
  "pair_manifest_sha256": "<sha256 of the holdout pairs.json itself>",
  "margin": 5,
  "created_before_promptvault_scoring": true,
  "promptvault_scores_seen": false,
  "verifier_identity": "<name + contact or key id>",
  "created_at": "ISO8601 UTC",
  "pairs": [
    {
      "pair_id": "HOLDOUT-P1-...",
      "family_id": "P1",
      "split": "holdout",
      "case_a": "v5-h-...",
      "case_b": "v5-h-...",
      "semantic_relation": "COMPLETE > INCOMPLETE",
      "expected_direction": "A_GT_B",
      "construction_rationale": "... (reference-grounded, not tuned to PromptVault)",
      "pairwise_v2": true,
      "holdout_only": true
    }
  ]
}
```

All hashes are hex SHA256 over the raw file bytes as sealed. The manifest file itself is hashed after writing (`pair_manifest_sha256` = hash of the canonical JSON serialization). `created_before_promptvault_scoring` and `promptvault_scores_seen` are boolean attestations by the verifier.

## 5. Prohibitions for builder repo

- NO `split: holdout` entries in `benchmarks/semantic-quality-v5/pairs.json` before freeze.
- NO holdout case IDs, pair membership, or expected directions in builder-visible files, commit messages, or evidence reports before freeze.
- NO `benchmarks/semantic-quality-v5/results/pv-r23-v5-holdout*.json` in builder-visible repo before verifier seal.
- The builder evidence report (`evidence/pairwise-v2-repair/R23_PAIRWISE_REPAIR_REPORT.md`) lists ONLY development pairs and their hashes.

## 6. Tooling

- `scripts/holdout_pairwise_seal.py` — verifier-only tool to construct the sealed holdout manifest from holdout gold + holdout cases, validate margin, emit SHA256 hashes, and assert `promptvault_scores_seen == false` at seal time. It refuses to run if a candidate PromptVault holdout results file is present alongside the manifest without explicit `--allow-scores-seen` (audit trail).
- `benchmarks/semantic-quality-v5/metrics_v2.py` — scorer used for both development and holdout; holdout invocation requires the verifier-produced `pairs` file, not the builder `pairs.json`.

## 7. Audit

After freeze, the methodology verifier publishes: contract SHA256, holdout input/reference hashes, pair manifest hash, verifier identity, and timestamp. Full holdout pair membership is revealed only together with the holdout accuracy report, after PromptVault holdout scoring is complete. The seal can be independently re-verified by any auditor recomputing SHA256 over the frozen files.

## 8. Leakage failure mode

If any builder-visible artifact is found to contain holdout pair membership or directions before the freeze timestamp, the holdout evaluation is declared INVALID and must be re-done with a disjoint holdout set.

## 9. Relation to development contract

This protocol is subordinate to `PAIRWISE_V2_CONTRACT.md` §§2–3 (margin, tie exclusion, FAIL CLOSED, 0/0 NOT_PASS). Development P1–P7 pairs are scored builder-side; holdout P1–P7 pairs are scored verifier-side with identical logic. Both splits require all 7 families present.
