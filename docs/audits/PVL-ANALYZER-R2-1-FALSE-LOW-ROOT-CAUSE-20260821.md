# PVL — Analyzer R2.1 Cleanroom — False-Low Root-Cause Analysis (Agent #4) (2026-08-21)

**Status:** ANALYSIS COMPLETE (hand-traces reproduce recorded engine scores exactly: 33, 29 confirmed)
**Analyst:** FALSE_LOW_ROOT_CAUSE_ANALYST

## FALSE_LOW_CLASSES (distinct mechanisms)

- **FLC-1** Missing action-verb surface → `task_signal = None` → global `signal_poor` cap (10/12 dims clamped to 3.0). Explains 33/34/35/29.
- **FLC-2** `signal_poor` is kind-blind: Guidelines/Templates measured by Task-kind predicate. `guideline_signal`/`template_signal` never reach `signal_poor`.
- **FLC-3** Short-but-complete treated as poor via double negation (missing verb → `atomic_action=false` → `terse_sufficiency=false`).
- **FLC-4** Template credit (calibration 8.0) defeated by its own gate (cap clamps it).
- **FLC-5** EN verb inflection asymmetry: EN stems lack `\w*` (`explains`/`describes` never match).
- **FLC-6** Extraction/listing output contracts not recognized ("three separate lines", "one per line").
- **FLC-7** Inline quoted input invisible to F3.
- **FLC-8** Mis-routing: `List…` → GeneralTask (Input NA) instead of Extraction (Input Required).

## SIGNAL_POOR_FAILURE — exact mechanics

`signal_poor` first arm `task_signal == None` (scoring.rs:116-123) → caps 10 dims to 3.0 (scoring.rs:475-479). Terse extraction: goal Strong→3, context Strong→3, completeness 10→3 → mean 33. Traced exactly.

## MISSING_FEATURE_FAMILIES

Three divergent verb vocabularies (ACTION_VERBS, CONCRETE_OP_VERBS, TRANSFORM_VERBS) — divergence is the failure. Owner families missing: EN {list, identify, find, return, enumerate, collect, select, retrieve, show, output} (only extract present); DE {liste, identifiziere, finde, gib zurück, nenne, ermittle, zeige} (only extrahier present). Plus: extraction type-router family, enumeration output contracts, inline-quoted input family, EN inflection handling.

## GENERAL_FIXES (principled, gaming-resistant)

(a) **Action-family recognition** — single-source `VerbFamily` table deriving action_re + concrete_op + type-router regexes. (b) **Type-aware signal sufficiency** — `signal_sufficient(features, kind)`: Task = task_signal OR terse bundle (atomic intent + goal + defined input + output contract + low ambiguity); Guideline = rule-language sufficiency (imperative density, modal rules, prohibitions, scope, structure); Template = useful placeholders (referenced fraction, quality, fill instruction) — USEFUL PLACEHOLDER ≠ PLACEHOLDER SPAM. (c) Template credits kept but not nullified by cap. (d) Guideline sufficiency broadened. (e) Output/input contract families (enumeration shapes, quoted inline input). Gaming resistance preserved (junk prompts still fail all arms).

## RED_TESTS (7, all fail today)

RT-1 EN extraction/listing (`List all email addresses...Return one per line.\n\n{{text}}`), RT-2 DE listing (`Liste alle E-Mail-Adressen...auf`), RT-3 terse sufficiency (`Extract every noun...comma-separated list`), RT-4 template with useful placeholders (Project Update Template), RT-5 EN guideline verb-free rule prose (Documentation Policy), RT-6 DE guideline sufficiency (Antwort-Regeln), RT-7 gaming guard (keyword-stuffed junk must stay <45).
