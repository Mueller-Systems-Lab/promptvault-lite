# PromptVault Semantic Quality Benchmark v5 — Dataset Manifest

- **Title:** PromptVault Semantic-Quality Benchmark v5 (development + locked holdout)
- **Version:** v5.0.0
- **Date:** 2026-08-22
- **Location:**
  - Development: `benchmarks/semantic-quality-v5/cases/development.json` (110)
  - Holdout: `benchmarks/semantic-quality-v5/cases/holdout.json` (40)
  - Rubric: `benchmarks/semantic-quality-v5/rubric.json` (v1.0.0 reference rubric, pinned)
  - Pairs: `benchmarks/semantic-quality-v5/pairs.json`

## 1. Dataset Overview

| Set | Cases |
|---|---:|
| Development | 110 |
| Holdout (locked) | 40 |
| **Total v5** | 150 |

## 2. Holdout Secrecy

Holdout gold sealed external at sealed artifact; holdout inputs isolated outside repository before freeze (R2.3). Builder only sees 110 dev cases pre-freeze. Max two principled iterations.

## 3. Rubric Pin

`benchmarks/semantic-quality-v5/rubric.json` is byte-identical to `benchmarks/semantic-quality/rubric.json` v1.0.0 (pinned).

## 4. Coverage

- DE/EN balanced (~55/55 dev, ~20/20 holdout)
- Short/medium/long varied
- Natural prose / structured
- Task types: translation, summarization, extraction, classification, transformation, generation, planning, analysis, coding, agent workflows, templates, guidelines, policies
- Strata: terse-excellent, good-natural, fair-incomplete, poor-vague, broken-contradictory, boilerplate, gaming, coding, agent
- Fair/incomplete, ambiguous, contradictory, boilerplate, gaming, noise
- Implicit/explicit output

## 5. Provenance

All cases synthetic-v5, freshly generated 2026-08-22, disjoint from V1/V2/V3/V4 (similarity checked).

## 6. Gold Methodology

Two independent blind judges (different provider families) + adjudication on delta>15 or band diff>1. Judges receive PROMPT+RUBRIC only, blind to PromptVault scores.

## 7. Novelty

V5 vs V1-V4 deterministic similarity + independent semantic duplicate review => MATERIAL_OVERLAP 0 required.

