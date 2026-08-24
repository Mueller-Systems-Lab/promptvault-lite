# RECOMMENDATION_V2 — Prospective Evaluation Contract (R2.3)

**Status:** FROZEN prospectively. Replaces the prior recommendation-usefulness
metric (dev 56.98%) which was partially **construct-misaligned** (it forced
PromptVault's internal 10 dimensions to map 1:1 onto reference rubric
dimensions that are NOT semantically equivalent).

**Mandate:** Do NOT force PromptVault's 10 internal dimensions to map 1:1 onto
reference rubric dimensions. Do NOT suppress valid **Output**-dimension
recommendations merely because the old gold taxonomy failed to align with
PromptVault's Output dimension.

---

## 1. Per-recommendation judgment schema (strict)

Every emitted PromptVault recommendation is independently judged on:

| Field | Type | Meaning |
|-------|------|---------|
| `relevant` | bool | addresses the prompt's actual issue |
| `actionable` | bool | concrete, doable guidance (not vague) |
| `already_satisfied` | bool | prompt already meets it (=> not useful) |
| `redundant` | bool | duplicates another emitted recommendation |
| `misleading` | bool | factually/semantically wrong or harmful |
| `would_improve_prompt` | bool | applying it would improve quality |
| `confidence` | float 0..1 | judge confidence |

## 2. USEFUL definition

A recommendation counts **USEFUL** iff ALL hold:

```
relevant == true
AND actionable == true
AND already_satisfied == false
AND redundant == false
AND misleading == false
AND would_improve_prompt == true
```

## 3. MISSED_RECOMMENDATION

When the prompt contains a **material weakness** but PromptVault emitted **no**
useful recommendation for it, record `MISSED_RECOMMENDATION` (flagged
`critical` if the weakness is safety/constraint/contradiction-class).

## 4. Final metrics

| Metric | Definition |
|--------|------------|
| `RECOMMENDATION_PRECISION` | USEFUL / (total emitted recommendations judged) |
| `USEFUL_RECOMMENDATION_RATE` | USEFUL / (emitted count) |
| `MISLEADING_RECOMMENDATION_RATE` | misleading / (emitted count) |
| `REDUNDANT_RECOMMENDATION_RATE` | redundant / (emitted count) |
| `MISSED_CRITICAL_RECOMMENDATION_RATE` | missed-critical / (prompts with critical weakness) |

## 5. GREEN targets

- `USEFUL_RECOMMENDATION_RATE >= 70%`
- `MISLEADING_RECOMMENDATION_RATE = 0%` (preferred)
- `critical misleading recommendation = 0` (mandatory)

## 6. Judgment independence

Recommendations are judged by the **blind judge panel** (prompt + emitted rec
only; judges are NOT shown PromptVault scores, expected band, or stratum) per
the R2.3 blind-judge rule. Judge C is invoked only on material disagreement.

## 7. Prohibitions

- NO suppression of valid Output-dimension recommendations to match the old
  gold taxonomy.
- NO 1:1 forced mapping of PromptVault's 10 dims onto non-isomorphic reference
  rubric dims.
- NO dev-only proof used to claim GREEN.
