# PVL v1.10.0 — AUTHORING LIFECYCLE — Milestone Run Report

**Date:** 2026-08-15 (run day)
**Baseline:** v1.9.2 released/frozen (master `68c38cf`)
**Selected milestone:** AUTHORING_LIFECYCLE (v1.10.0, MINOR / feature wave)
**Decision record:** `docs/audits/PVL-v1.10.0-AUTHORING-LIFECYCLE-DECISION-RECORD-20260815.md`
**Spec + Verification Contract:** `docs/audits/PVL-v1.10.0-AUTHORING-LIFECYCLE-SPEC-VERIFICATION-CONTRACT-20260815.md`

---

## 1. Decision

- **SELECTED:** `AUTHORING_LIFECYCLE`
- **Why:** the normal app had NO natural create→edit→save lifecycle; backend CRUD (`create_prompt`/`update_prompt`) was already implemented and security-tested; no data migration required (filesystem is canonical); closes the largest product gap.
- **Rejected:** `ADVANCED_WORKFLOWS_GA` — features complete but never runtime-proven in a production build; does not close the core product gap; cheaper but not product-completing.
- **Version:** v1.10.0 (MINOR). Not v1.9.3 — new public user-facing capability.

## 2. Scope delivered

- A. **CREATE** — "✏️ Neuer Prompt" toolbar button → editor modal (Titel + Inhalt) → real `create_prompt` (Rust) → file on disk → appears in explorer.
- B. **EDIT** — "✏️ Bearbeiten" button in DetailsPanel action bar → editor pre-filled → real `update_prompt` → disk updated.
- C. **DIRTY STATE** — visible "● Ungespeicherte Änderungen" indicator on change.
- D. **CANCEL** — Abbrechen / Escape discards; emits `prompt.cancel` when dirty.
- E. **SAVE** — persistent via canonical filesystem storage layer (existing `create_prompt`/`update_prompt`); no second storage system; no dev-mode gating (real wrappers, not the developer action layer).
- F. **RESTART** — `scanFolder` persists `promptvault.lastFolder`; App startup auto-restores + rescans → saved prompts reappear.
- G. **OPTIMIZER APPLY** — "✏️ Übernehmen" button in OptimizationPanel → editor opens in edit mode with optimized content (explicit user action, never auto-overwrite) → save persists.
- H. **ANALYSIS CONSISTENCY** — `invalidateAnalysisForPrompt` clears evaluations/hygiene/contextEvaluations/blueprintDetections/blueprintEvaluations on content change; stale analysis never shown as current.
- I. **ORGANIZATION** — existing category/tags/explorer preserved; no library redesign.
- J. **DELETE** — OUT of scope (no existing backend; kept scope tight).
- Observability: `prompt.create`, `prompt.edit`, `prompt.save`, `prompt.save_failed`, `prompt.cancel`, `optimizer.apply` — safe metadata only (mode, opaque prompt_id, duration_ms). New ReasonCode `AUTHORING_SAVE_FAILED`; 3 new allowlisted attribute keys.

## 3. Files changed

| Area | Files |
|---|---|
| Store | `src/stores/appStore.ts` (+authoring actions, editor state, lastFolder) |
| UI | `src/components/editor/PromptEditor.tsx` (new), `src/App.tsx`, `src/components/details/DetailsPanel.tsx`, `src/components/optimization/OptimizationPanel.tsx`, `src/App.css` |
| Observability | `src/observability/contracts.ts`, `src/observability/diagnostics.ts`, `src/observability/redaction.ts` |
| Tests (new) | `src/stores/__tests__/appStore.authoring.test.ts`, `src/components/editor/__tests__/PromptEditor.test.tsx`, `src/components/optimization/__tests__/OptimizationPanel.apply.test.tsx`, `src/observability/__tests__/authoringObservability.test.tsx` |
| Native E2E (new) | `e2e-tests/specs/authoring-lifecycle.native.spec.js` + wired into `wdio.conf.windows.mjs` |
| Version | `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `Cargo.lock` → 1.10.0 |
| Docs | README, CHANGELOG, PROJECT_STATUS, USER_GUIDE, ARCHITECTURE, OBSERVABILITY, ROADMAP |
| Unchanged | `src/actions/*` (developer action layer untouched), `src-tauri/src/*` (no Rust changes), package.json deps (no new dependencies) |

## 4. Gate results

| Gate | Result |
|---|---|
| `pnpm test` | **1706 passed / 5 failed** — 5 failures all in `scripts/__tests__/harness-contract.test.js` = pre-existing Windows/Unix harness failures, **PRE_EXISTING_UNCHANGED** (baseline had 1663 passed / same 5) |
| `pnpm lint` | PASS (exit 0) |
| `pnpm exec tsc --noEmit` | PASS (exit 0) |
| `git diff --check` | PASS (exit 0) |
| `cargo fmt --check --all` | PASS (exit 0) |
| `cargo test --workspace` | PASS (exit 0) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS (exit 0) |
| `pnpm build` | PASS (exit 0) |
| Native E2E (wdio, default config) | **2 specs / 16 tests PASS** — admin-observability 10/10 + authoring-lifecycle 6/6 (real binary `target/debug/promptvault-lite.exe` v1.10.0, real WebView2, real IPC, real Rust, real FS) |
| Playwright suite | 170 passed / 4 failed / 3 flaky / 15 skipped. The 4 failures are **proven PRE-EXISTING**: (a) `core-flows.spec.ts:83` stale hardcoded "1.8.0" version (app at 1.9.2/1.10.0) — fixed to version-agnostic regex as part of version consistency; (b) webkit focus-restoration failure — reproduced on pristine v1.9.2 baseline via stash. 3 flaky (focus trap firefox, visual-release-gate firefox) pass in isolation. No authoring regressions. |
| Privacy sentinel (native) | `AUTHORING_SENTINEL_OCCURRENCES=0`, body marker 0, body phrase 0; privacy-export spec 5/5 with omitted-attr fail-closed |

## 5. Runtime proof (native E2E, real binary)

```
✓ 1. REAL_NATIVE_BINARY: echtes Fenster 'PromptVault Lite'
✓ 2. CREATE: '✏️ Neuer Prompt' → Editor → Speichern schreibt Datei
✓ 3. EDIT+SAVE: '✏️ Bearbeiten' vorbelegt, Dirty-Indikator, Speichern persistiert
✓ 4. RESTART-PERSISTENZ: lastFolder + Datei auf Platte + Re-Scan (Neustart-Beweis)
✓ 5. OPTIMIZER-APPLY: ✨ Optimieren → '✏️ Übernehmen' → Speichern persistiert
✓ 6. PRIVACY_SENTINEL: Export enthält Sentinel/Prompt-Body NICHT
```
APP_VERSION reported by the real binary: **1.10.0**.

Restart note: the wdio/tauri-driver harness launches the binary once per session (no mid-spec relaunch mechanism). Test 4 proves the exact startup-restore sequence (localStorage `promptvault.lastFolder` + disk persistence + real `scanFolder(lastFolder)` rescan rediscovers the prompt). True cross-process restart is additionally covered by the unit suite and the App.tsx startup effect — documented honestly in the spec header.

## 6. Independent verification

```
INDEPENDENT_MILESTONE_VERIFICATION: PASS
```
review-agent verified: user flow vertical, persistence, privacy (3 allowlisted keys only, fail-closed export), observability (failure states + reason codes), regression (action layer + Rust untouched, no new deps), scope (bounded surface). Evidence-gap notes addressed: E2E spec now wired into `wdio.conf.windows.mjs`; runtime proof artifacts in this report.

## 7. Git / Integration state

- Working tree contains the milestone (uncommitted). Local commits to be created on `feature/authoring-lifecycle`.
- AGENTS.md requires explicit Human Approval before merge/release → **final integration (merge/push/tag/release/PyPI) blocked pending owner approval**.
- No untracked owner/governance artifacts committed. Quarantine artifacts archived outside the repo.
