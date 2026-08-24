# PAIRWISE_V2 — Prospective Evaluation Contract (R2.3)

**Status:** FROZEN prospectively. Must be read and agreed by the methodology
verifier **BEFORE** any new holdout labels are inspected or any new pair is
judged. Contract version `pairwise_v2@1.0.0` — any change after holdout
judging begins requires verifier re-approval and is recorded as a new version.

**Supersedes:** the ad-hoc 27-pair ordering scoring used in the R2.2 dev run
(22/27 = 81.48%). The R2.2 dev result is preserved *exactly as historical
evidence* and is **NOT** retroactively re-scored. The two R2.2 pairs with only
~1–2 reference-score points of separation are recognized as non-meaningful
semantic ordering tests and remain recorded as historical, not as PASS.

**Artifact binding:** `benchmarks/semantic-quality-v5/pairs.json` is the sole
builder-visible pair manifest. It MUST contain at least one ordered pair per
required family P1–P7 on split `development` before freeze. Builder-visible holdout
pairs are PROHIBITED. Holdout P1–P7 contrasts are constructed exclusively by the
independent verifier under `HOLDOUT_PAIRWISE_PROTOCOL.md`.

---

## 1. When pairwise ordering MAY be scored

A pairwise comparison receives an order-expectation **only if** one of:

- (A) The pair was **deliberately constructed** as a semantic contrast
      (see §4 families), **or**
- (B) **Independent reference judgments** (two blind judges, see R2.3
      blind-judge rule) establish a meaningful preference.

Pairs that do not satisfy (A) or (B) are **excluded** from the ordering metric,
not scored as ties-by-default.

## 2. Reference-margin policy (frozen)

Before any holdout judging, a margin rule is applied to the *independent
reference* scores of the two items. Default margin = 5 (configurable via
`--margin` before freeze, frozen thereafter):

```
abs(reference_A - reference_B) < 5   ->  TIE / NO_ORDER_EXPECTED
abs(reference_A - reference_B) >= 5  ->  meaningful order expected (direction per §4)
```

The exact margin (5) may be adjusted by the methodology verifier **before** new
holdout judging, but once holdout judging begins it is **frozen** and may not be
changed to improve the percentage. Scorer CLI `--margin` must match the frozen
value recorded in the contract seal.

### 2a. Tie handling (normative)

- When `TIE / NO_ORDER_EXPECTED` applies, the pair is **excluded from the
  denominator**. It contributes neither PASS nor FAIL.
- The legacy equivalence checks `A1/A2` (terse-dev EN vs DE) and `G1/G2`
  (ambiguity-dev EN vs DE) are classified as `EQUIVALENCE_CHECK` in R2.3: their
  reference margins are `<5` (A: 0, G: 4), therefore they are `TIE` and MUST NOT
  be scored as ordering. Builders may either omit them from `pairs.json` or
  declare them with `semantic_relation: EQUIVALENCE_CHECK` and exclude them from
  ordering accuracy.
- Scorer MUST report `TIED_EXCLUDED` per-pair and MUST NOT count tied pairs
  toward accuracy.

## 3. Scoring rule

- If `NO_ORDER_EXPECTED` (margin < threshold): no pass/fail is recorded for that pair. Status = `TIE`.
- If order expected (margin >= threshold): `PASS` iff PromptVault's relative ordering matches the
  reference direction (`A > B` when `expected_direction: A_GT_B`). `FAIL` otherwise.
  Equal PromptVault scores when ordering is expected = `FAIL` (not tie).
- Pairwise accuracy = `PASS / (PASS + FAIL)` over *scored* pairs only (tied/excluded pairs omitted from denominator).
- **FAIL CLOSED conditions:**
  - Missing required family (any of P1–P7 absent from `pairs.json`): `FAIL_CLOSED` — overall result `FAIL` regardless of accuracy.
  - Any declared pair references an ID absent from reference gold or candidate results, or absent from development split: that pair = `NOT_EVALUATED` and forces overall `FAIL_CLOSED` (not silent skip).
  - Duplicate `pair_id` or duplicate `(case_a, case_b)` across pairs: `FAIL_CLOSED`.
  - Builder-visible holdout split pairs present before freeze: `FAIL_CLOSED`.
- **0/0 handling:** If all declared pairs are tied/excluded or not evaluatable, denominator = 0. Accuracy is `null` and the overall verdict is `FAIL_CLOSED` / `NOT_PASS` — never `PASS`. Empty ordering sets cannot be reported as 100% or as passing.
- **Pass threshold:** Development P1–P7 ordering accuracy = 100% (all 7/7 ordering families pass) is required for R2.3 development gate unless contract explicitly documents a different threshold before freeze. Any FAIL on a scored ordering pair is a gate failure.

## 4. Required future pair classes (construct-valid)

Each class below is a deliberate semantic contrast. Pair definitions + expected
direction MUST exist **before** PromptVault scores are examined. For development,
each family MUST have at least one ordered pair in `pairs.json`; additional
pairs per family are allowed but must satisfy the same margin rule.

| ID | Family | Expected direction | Construction |
|----|--------|--------------------|--------------|
| P1 | COMPLETE > INCOMPLETE | complete scores higher | same prompt, one with required sections missing |
| P2 | CLEAR > AMBIGUOUS | clear scores higher | clear instruction vs. vague/under-specified |
| P3 | COHERENT > CONTRADICTORY | coherent scores higher | consistent constraints vs. internal contradiction |
| P4 | TERSE_GOOD > VERBOSE_BAD | terse-good scores higher | minimal excellent vs. padded/redundant verbosity |
| P5 | COMPLETE_GUIDELINE > VAGUE_GUIDELINE | complete guideline higher | full guideline vs. vague guidance |
| P6 | RELEVANT_CONTEXT > IRRELEVANT_CONTEXT | relevant-context higher | on-topic context vs. off-topic filler |
| P7 | REAL_CONSTRAINT > BOILERPLATE | real-constraint higher | concrete boundary vs. generic boilerplate |

Schema for each entry in `pairs.json`:
```json
{
  "pair_id": "P1-COMPLETE-vs-INCOMPLETE-001",
  "family_id": "P1",
  "split": "development",
  "case_a": "<id in development.json>",
  "case_b": "<id in development.json>",
  "semantic_relation": "COMPLETE > INCOMPLETE",
  "expected_direction": "A_GT_B",
  "construction_rationale": "...",
  "pairwise_v2": true
}
```
Constraints: `family_id` in `P1`..`P7`, `split` == `development` (builder-visible), `expected_direction` == `A_GT_B`, `pairwise_v2` == `true`.

## 5. Prohibitions

- NO random pair generation solely to increase sample count.
- NO retroactive marking of the legacy 22/27 pairs as PASS.
- NO forcing arbitrary A>B ordering when reference margin < threshold.
- Pair direction is defined from the *reference*, never reverse-engineered
  from PromptVault output.
- NO builder-visible holdout pair membership or expected directions before freeze
  (see `HOLDOUT_PAIRWISE_PROTOCOL.md`). Holdout contrasts are sealed by the
  verifier.
- NO `0/0` reported as `PASS`; see §3 0/0 handling.

## 6. Verification

Scorer `benchmarks/semantic-quality-v5/metrics_v2.py` (or `scripts/semantic_quality_metrics.py --pairwise_v2`) implements this contract verbatim:

- Takes `--pairs`, `--reference`, `--candidate`, `--margin` (default 5).
- For each pair: loads reference scores, computes margin, classifies TIE vs ORDERED, then compares candidate ordering.
- Outputs per-pair `PASS`/`FAIL`/`TIE`/`NOT_EVALUATED` and aggregate `PASS/(PASS+FAIL)`.
- Exits non-zero on any `FAIL_CLOSED` condition, including missing P1–P7.

## 7. Version seal

FROZEN at `pairwise_v2@1.0.0` for R2.3. File SHA256 is recorded in the
`R23_PAIRWISE_REPAIR_REPORT.md` evidence and in the holdout seal manifest.
Changes require a new version, verifier sign-off, and re-sealing of the holdout
manifest before any holdout scores are opened.
