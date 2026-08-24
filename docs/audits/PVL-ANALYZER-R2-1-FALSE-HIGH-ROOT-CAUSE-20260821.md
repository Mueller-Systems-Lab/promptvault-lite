# PVL — Analyzer R2.1 Cleanroom — False-High Root-Cause Analysis (Agent #3) (2026-08-21)

**Status:** ANALYSIS COMPLETE (verified against live engine via scratch crate, no repo files modified)
**Analyst:** DANGEROUS_FALSE_HIGH_ROOT_CAUSE_ANALYST

## FALSE_HIGH_ROOT_CAUSE — `s2-h-task-de-broken-contradictory-001` (gold 38 BROKEN, engine 78 GOOD)

Three stacked detection failures → `conflicts=[]`, `conflict_weight=0`:
1. **Fatal verbs not mandates:** "Schreibe", "Ende", "Erstelle" absent from IMPERATIVE_VERBS (`contradictions.rs:119-167`).
2. **No topics:** only 3/7 sentences become mandates and all have `topic=None` — no VOICE, SECTION/Fazit-order, METRIC topics in TOPIC_TABLE.
3. **No pairing:** 3 None-topic mandates can never pair (`conflict_for_topic` requires shared topic).

**Aggregation mechanism:** equal-weight mean over 9 applicable dims → 9/9 neutral/high anchors = 78. All three defense layers (signal_poor, Consistency ladder, defensive cap `conflict_weight>=6 → min(45)`) depend on detection firing; none did.

## MISSING_CONFLICT_CLASSES (all measured at weight 0 today)

VOICE, SECTION_REQUIRED/FORBIDDEN, FINAL_SUMMARY, SECTION_ORDER (begin vs end), METRIC, UNIT, INCLUDE_EXCLUDE, SOURCE_USE, WEB_USE, REASONING_DISCLOSURE, JSON_VS_PROSE, FORMAT (yaml/xml missing), LENGTH cross-sentence, LANGUAGE (DE "Schreibe" missing → invisible).

Cross-cutting: IMPERATIVE_VERBS closed list missing common verbs (DE: Schreibe, Erstelle, Ende, Beende, Füge, Zeige, Zitiere, Starte, Schließe; EN: Begin, Start, End, Finish, Include, Exclude, Show, Cite, State, Explain). Precision gate: only closed antonym pairs fire.

## AGGREGATION_FAILURE

Yes — equal-weight mean + single binary cap keyed on weight-sum (not class presence). Weight-4 conflicts never reach the 45 cap; cap is undirected (fatal class indistinguishable from accumulation of minor ones). Must become class-based (`has_critical_conflict`).

## REQUIRED_RED_TESTS (17 pairs, all fail today, verified)

VOICE de/en, FINAL_SUMMARY de/en, METRIC de/en, UNIT en, LENGTH en, SECTION en, INCLUDE_EXCLUDE en, SECTION_ORDER de, JSON_VS_PROSE en/de, WEB_USE en, SOURCE_USE en, REASONING en, LANG de. Contract: `conflict_weight(variant) >= 6`, `variant < 70`, `clean >= 70`, `variant <= clean - 15`.

## MINIMAL_GENERAL_FIX

(a) New contradiction classes (general lexicons: voice/section/metric/unit/inclusion/source/web/reasoning/prose topics + verb additions + `mandatory|required|verpflichtend|erforderlich` constraint signals). (b) `Conflict.critical: bool` for fatal classes; `has_critical_conflict()`; cap predicate becomes `conflict_weight >= 6 || has_critical_conflict`; critical → Consistency 0 + signal_poor. (c) Cap value 45 unchanged. Failing case → ≈27 BROKEN under the fix.
