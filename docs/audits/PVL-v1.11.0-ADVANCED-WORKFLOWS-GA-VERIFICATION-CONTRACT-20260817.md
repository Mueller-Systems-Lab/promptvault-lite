# PVL v1.11.0 — ADVANCED_WORKFLOWS_GA — Verification Contract

**Issue:** https://github.com/xxammaxx/promptvault-lite/issues/295
**Branch:** feature/advanced-workflows-ga
**Baseline:** master @ 6c34a64 (= origin/master), v1.10.0 released baseline.
**Date:** 2026-08-17

## Risk Tier
HIGH_HUMAN_GATE (product GA milestone; 11–30 files; privacy-relevant diagnostics; production native build; final owner approval required).

## Desired Behavior
1. Missing Information and Direction/Variants are **available by default** in every standard production build of PromptVault Lite.
2. No Developer Mode, no dev menu, no build-time env flag required for a normal user.
3. Direction variant results support **Apply into the v1.10.0 PromptEditor** (dirty state, explicit save, cancel preserves original).
4. Missing-Info enriched results support **Apply into the PromptEditor**.
5. Content changes invalidate old Missing-Info results, Direction variants and enriched contexts (no silent stale reuse).
6. Safe observability (`missing_info.*`, `direction.*`) with bounded reason codes, no prompt/answer/variant text in exports.

## Acceptance Criteria (GA Contract)
- `PUBLIC_CAPABILITY_DEFAULT: AVAILABLE` — both features available without env vars.
- `NO_PRODUCTION_BUILD_FLAG_DEPENDENCY: PASS` — a release pipeline cannot accidentally hide the features (`false`/unset env cannot disable in production mode).
- `DIRECTION_NORMAL_USER_FLOW: PASS` — select → profile → generate → select → apply → editor → save.
- `ADVANCED_STALE_STATE: PASS` — source edit → old variants/gate results invalidated.
- `ADVANCED_WORKFLOW_PRIVACY: PASS` — diagnostics export contains no prompt body, answers, or variant text.
- `ADVANCED_WORKFLOWS_PRODUCTION_BUILD: PASS`, `NATIVE_PRODUCTION_MISSING_INFO: PASS`, `NATIVE_PRODUCTION_DIRECTION: PASS`, `ADVANCED_APPLY_RESTART_PERSISTENCE: PASS`, `ADVANCED_OBSERVABILITY_EQUIVALENCE: PASS`, `INDEPENDENT_ADVANCED_GA_VERIFICATION: PASS`.

## Red Tests (fail before implementation — spec §26)
GA AVAILABILITY:
1. `isMissingInfoGateEnabled({})` === true (no env).
2. `isDirectionProfilesEnabled({})` === true (no env).
3. Gate/variant store actions work with `devMode=false`.
4. Production availability resolver returns true for production mode.
5. `PROMPTVAULT_*_GATE=0/false` does NOT disable in production mode.

MISSING INFO:
6. Entry button rendered (DetailsPanel) without env.
7. Loading/preparing state renders.
8. Empty state (no items).
9. Error state (analysis missing).
10. Complete flow → enrichedContext created.
11. Cancel state (CANCELLED).
12. Stale after prompt edit → sessions/contexts cleared on save.

DIRECTION:
13. Entry button rendered without env.
14. Profile/direction selection works.
15. Variant generation works.
16. Variant selection works.
17. Apply → editor opens with selected variant content.
18. Apply sets dirty state (isDirty=true).
19. Apply + Cancel → original disk content unchanged.
20. Apply + Save → disk content updated; rescan restores.
21. Old variants stale after source edit (cleared / apply refused with STALE_SOURCE).

PRIVACY:
22–25. Missing-info answer sentinel, variant text sentinel, prompt body sentinel absent from export; safe metadata preserved.

PRODUCTION CONTRACT:
26. Release-mode/native build works with no feature env flags (unit + native E2E).

## Regression Tests (must remain green)
- All existing suites: `pnpm test` (1706 baseline + new), `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, `cargo fmt --check --all`, `cargo test --workspace`, `cargo clippy --workspace --all-targets -- -D warnings`.
- Known pre-existing harness-contract failures (5) remain `PRE_EXISTING_UNCHANGED`.
- Authoring v1.10.0, Analyze, Optimizer, Persistence, Observability, TTS unchanged.

## Reality Gate
- Real app runtime check (isolated test vault, no real user prompts).
- REAL production Tauri build (`pnpm tauri build`) WITHOUT feature env flags.
- Native E2E on the real binary: Missing Info flow + Direction flow (profile → generate → select → apply → editor → save → rescan).
- Restart persistence proof (saved applied variant present after reload).
- Production privacy sentinel export scan (sentinel 0).
- OFF/ON observability equivalence.

## Evidence Types
- `pnpm test` output (new GA suites + regression).
- `git diff --stat` per commit.
- Native build artifact + wdio spec logs.
- Privacy export JSON scan.
- Independent verifier report (review-agent).

## Completion Claim Gate
- [ ] Red tests written and observed RED
- [ ] Red tests GREEN after implementation
- [ ] All regression gates pass (or documented PRE_EXISTING_UNCHANGED)
- [ ] Production native build without flags
- [ ] Native E2E Missing Info + Direction PASS
- [ ] Restart persistence PASS
- [ ] Privacy sentinel 0
- [ ] OFF/ON equivalence PASS
- [ ] Independent verifier PASS
- [ ] Docs PENDING RELEASE
- [ ] Human approval requested for push/merge/release

## Untestable Assumptions
- Windows installer UI behavior beyond the tested E2E flows (SmartScreen) — not in scope.
- Real user vault contents — never used; only synthetic test archives.
