# PromptVault Semantic Quality Benchmark v4 — Dataset Manifest

- **Title:** PromptVault Semantic-Quality Benchmark v4 (development + locked holdout)
- **Version:** v4.0.0
- **Date:** 2026-08-22
- **Location:**
  - Development: `benchmarks/semantic-quality-v4/cases/development.json` (90)
  - Holdout: `benchmarks/semantic-quality-v4/cases/holdout.json` (30)
  - Rubric: `benchmarks/semantic-quality-v4/rubric.json` (v1.0.0 reference rubric, pinned)
  - Pairs: `benchmarks/semantic-quality-v4/pairs.json`

## 1. Dataset Overview

| Set | Cases |
|---|---:|
| Development | 90 |
| Holdout (locked) | 30 |
| **Total v4** | 120 |

## 2. Holdout Secrecy

Holdout gold sealed at `markers/holdout.gold.json.sealed` with SHA256 d1744734c09e. Development gold at `reference/development.gold.json`. Holdout inputs are committed but gold is sealed until candidate freeze.

## 3. Rubric Pin

`benchmarks/semantic-quality-v4/rubric.json` is byte-identical to `benchmarks/semantic-quality/rubric.json` v1.0.0 (pinned).
