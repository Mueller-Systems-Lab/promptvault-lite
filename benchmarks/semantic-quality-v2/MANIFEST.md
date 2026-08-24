# PromptVault Semantic Quality Benchmark v2 — Dataset Manifest

- **Title:** PromptVault Semantic-Quality Benchmark v2 (development + hidden holdout)
- **Version:** v2.0.0
- **Date:** 2026-08-20
- **Location:**
  - Development: `benchmarks/semantic-quality-v2/cases/development.json`
  - Holdout: `benchmarks/semantic-quality-v2/cases/holdout.json`
  - Rubric: `benchmarks/semantic-quality/rubric.json` (v1.0.0 reference rubric)

## 1. Dataset Overview

| Set | Cases | Path |
| --- | ---: | --- |
| Development | 54 | `cases/development.json` |
| Holdout (hidden) | 18 | `cases/holdout.json` |
| **Total v2** | **72** | — |

- **ID scheme (development):** `s2-<kind>-<lang>-<stratum>-<nnn>` (e.g. `s2-task-en-terse-excellent-001`)
- **ID scheme (holdout):** `s2-h-<kind>-<lang>-<stratum>-<nnn>` — the literal marker `h` directly after the `s2-` prefix makes every holdout ID structurally disjoint from every development ID. No collision is possible.
- Holdout IDs are unique within the holdout (18/18) and disjoint from the development set (0 intersection).

## 2. Stratum Composition

Per-stratum counts across development and holdout. Holdout stratum mix follows the required balanced spec (both languages for the primary strata, adversarial variants distinct from development).

| Stratum | Dev | Holdout | Total |
| --- | ---: | ---: | ---: |
| terse-excellent | 7 | 2 | 9 |
| good-natural | 4 | 1 | 5 |
| fair-incomplete | 5 | 2 | 7 |
| poor-vague | 12 | 2 | 14 |
| broken-buzzword | 4 | 2 | 6 |
| broken-contradictory | 4 | 2 | 6 |
| fair-boilerplate-noise | 2 | 1 | 3 |
| poor-repetitive | 2 | 1 | 3 |
| good-coding-concrete | 1 | 0 | 1 |
| poor-coding-vague | 1 | 0 | 1 |
| good-agent-workflow | 1 | 0 | 1 |
| reusable-template | 4 | 2 | 6 |
| guideline | 4 | 2 | 6 |
| ambiguous-task | 2 | 1 | 3 |
| unusual-valid | 1 | 0 | 1 |
| **Total** | **54** | **18** | **72** |

## 3. Language Counts

| Language | Dev | Holdout | Total |
| --- | ---: | ---: | ---: |
| de | 25 | 8 | 33 |
| en | 29 | 10 | 39 |
| **Total** | **54** | **18** | **72** |

Both languages appear in every bilingual stratum of the holdout (terse-excellent, fair-incomplete, poor-vague, broken-buzzword, broken-contradictory, reusable-template, guideline).

## 4. Kind Counts

| Kind | Dev | Holdout | Total |
| --- | ---: | ---: | ---: |
| task | 46 | 14 | 60 |
| guideline | 4 | 2 | 6 |
| template | 4 | 2 | 6 |
| **Total** | **54** | **18** | **72** |

## 5. Adversarial Pattern Counts

| Adversarial pattern | Dev | Holdout | Total |
| --- | ---: | ---: | ---: |
| buzzword-no-substance | 4 | 2 | 6 |
| contradictory-requirements | 4 | 2 | 6 |
| repeated-role | 2 | 1 | 3 |
| **Total adversarial** | **10** | **5** | **15** |

Holdout adversarial wording uses a buzzword/contradiction vocabulary distinct from the development cases (see §7).

## 6. Contrast Pairs

| Pair | Members | Where members live |
| --- | --- | --- |
| A1 | `s2-task-en-terse-excellent-001` (translation, placeholder, no noise) | development |
| A2 | `s2-task-de-terse-excellent-005` (translation, placeholder, no noise) | development |
| G1 | `s2-task-en-ambiguous-task-001` | development |
| G2 | `s2-task-de-ambiguous-task-001` | development |
| H1 | `s2-h-task-en-terse-excellent-001` (terse task, clean, no guardrail) | holdout |
| H2 | `s2-h-task-en-fair-boilerplate-noise-001` (same core task + compliance guardrail) | holdout |

The H pair is the only holdout-localized contrast pair and directly isolates the effect of an appended boilerplate guardrail: H1 and H2 share the identical core instruction and differ only in the appended compliance block. The holdout therefore contains the required 2+ contrast-pair members (H1/H2).

## 7. Planned Reference-Band Design Intent

Honest pre-rubric expectation of how each set is designed to land on the v1.0.0 rubric bands (EXCELLENT ≥85, GOOD 70–84, FAIR 55–69, POOR 40–54, BROKEN ≤39). These are design intentions, **not** gold labels.

### Development (54)

| Band | Count | Driven by |
| --- | ---: | --- |
| EXCELLENT | 12 | terse-excellent (7), good-natural best (2), good-coding-concrete (1), good-agent-workflow (1), unusual-valid (1) |
| GOOD | 8 | reusable-template (4), good-natural remainder (2), guideline-good (2) |
| FAIR | 9 | fair-incomplete (5), fair-boilerplate-noise (2), ambiguous-task (2) |
| POOR | 16 | poor-vague (12), poor-coding-vague (1), poor-repetitive weaker (1), guideline-mediocre/conflicting (2) |
| BROKEN | 9 | broken-buzzword (4), broken-contradictory (4), poor-repetitive stronger (1) |

### Holdout (18)

| Band | Count | Driven by |
| --- | ---: | --- |
| EXCELLENT | 2 | terse-excellent H1 (clean, placeholder-free), terse-excellent DE (placeholder, output contract) |
| GOOD | 4 | good-natural EN (1), reusable-template EN+DE (2), guideline EN commit-policy (1) |
| FAIR | 4 | fair-incomplete EN+DE (2), fair-boilerplate-noise H2 (1), ambiguous-task EN (1) |
| POOR | 4 | poor-vague EN+DE (2), poor-repetitive DE (1), guideline DE conflicting (1) |
| BROKEN | 4 | broken-buzzword EN+DE (2), broken-contradictory EN+DE (2) |

Intent is a near-flat holdout band spread (2/4/4/4/4) that stresses band discrimination on genuinely unseen prompts, with no single band dominating.

## 8. Anti-Overlap Statement

**Method.** Each holdout prompt was checked against (a) the v2 development set (54 prompts) and (b) the legacy v1 corpus (60 prompts = `semantic-quality/cases/calibration.json` [48] + `semantic-quality/holdout/cases.json` [12]) using two measures:

1. **Exact-string check:** whitespace-normalized, lowercased full-string equality.
2. **Token-overlap check:** shared content tokens after lowercasing, umlaut normalization (`ä→ae`, `ö→oe`, `ü→ue`, `ß→ss`), and removal of an English+German stopword list. A pair is flagged when it shares ≥6 content tokens.

**Results.**

| Check | vs dev (54) | vs old corpus (60) |
| --- | ---: | ---: |
| Exact-string overlaps | 0 | 0 |
| Max shared content tokens (single pair) | 5 | 5 |
| Pairs flagged at ≥6 shared tokens | 0 | 0 |

The highest observed token overlaps (5) are coincidental vocabulary collisions on generic words (e.g. `write/short/keep/under/words` between two different "short message" tasks; `follow/up/two/weeks` between an extraction task and an unrelated old email prompt) — not paraphrases of the dev or legacy strings. The only intentionally high-overlap pair is H1/H2, which are the designed contrast pair and share their core instruction by construction.

## 9. Holdout Secrecy

The 18 holdout cases are a **hidden holdout**. Gold/reference band labels for the holdout are intentionally **not shipped** in this manifest or anywhere in the repository; they are kept secret from the tuning process. The holdout is reserved for final, post-tuning evaluation of the prompt analyzer and must not be used for prompt engineering, hyper-parameter search, or rubric calibration.
