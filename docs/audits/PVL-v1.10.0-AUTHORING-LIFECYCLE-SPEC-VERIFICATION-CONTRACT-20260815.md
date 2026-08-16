# PVL v1.10.0 — Authoring Lifecycle: Spec + Verification Contract

**Milestone:** AUTHORING_LIFECYCLE (v1.10.0, MINOR)
**Baseline:** v1.9.2 frozen
**Date:** 2026-08-15

## 1. Desired Behavior (User Journey)

```
SELECT/CREATE → EDIT → SAVE → ANALYZE → OPTIMIZE → APPLY RESULT → SAVE → REOPEN AFTER RESTART
```

A normal user (no Developer Mode, no feature flags) can:
1. **CREATE** a new prompt (title + content) in the normal UI
2. **EDIT** an existing prompt (title + content)
3. See an explicit **dirty indicator** for unsaved changes
4. **CANCEL** and discard changes
5. **SAVE** persistently through the canonical storage layer (filesystem `.md` via existing `create_prompt`/`update_prompt` Tauri commands — no second storage system)
6. **RESTART** the app → saved prompts still present (auto-restore last folder + rescan)
7. **OPTIMIZER APPLY** — take an optimizer result into the editor by explicit user action (never auto-overwrite)
8. **ANALYSIS CONSISTENCY** — after content change + save, stale analysis is invalidated (never shown as current)
9. **OBSERVABILITY** — `prompt.create`, `prompt.edit`, `prompt.save`, `prompt.save_failed`, `prompt.cancel`, `optimizer.apply` with safe metadata only

## 2. Architecture Approach (canonical, no redesign)

- **Backend:** reuse existing, tested `create_prompt` / `update_prompt` Tauri commands (`src-tauri/src/commands/actions.rs`). NO new Rust commands, NO migration (filesystem is canonical; SQLite `prompts` table already exists for favorites).
- **IPC:** reuse existing `createPrompt` / `updatePrompt` wrappers in `src/lib/tauri.ts`.
- **Store:** add authoring actions to `src/stores/appStore.ts` that call the Tauri wrappers directly (same pattern as `saveVariantAsPrompt` — do NOT route through the Developer-Mode-gated action layer; that layer stays untouched for developer tooling).
- **UI:** new editor component `src/components/editor/PromptEditor.tsx` (or `src/components/authoring/`), mounted in `App.tsx` like other modals. Follows existing modal design system (`modal-overlay` / `modal-container`, cf. `VariantPanel.tsx`).
- **Entry points:** "Neuer Prompt" button in the toolbar (or Explorer header); "Bearbeiten" button in `DetailsPanel` ActionBar.
- **Restart:** persist last vault folder in `localStorage` (e.g. `promptvault.lastFolder`) during `scanFolder`; on app startup, if present, auto-restore + rescan.
- **Stale analysis:** reuse the content fingerprint pattern already in `App.tsx` (`${length}:${slice(0,64)}`). Add store action `invalidateAnalysisForPrompt(promptId)` that removes `evaluations`, `hygiene`, `contextEvaluations`, `blueprintDetections`, `blueprintEvaluations` entries for the prompt after a content update. After update, the T8 auto-detection effect re-runs because the fingerprint changed.

## 3. Acceptance Criteria

1. New prompt created via UI appears in explorer after save; file exists in vault dir.
2. Edit saves changes; file content updated on disk.
3. Dirty indicator visible when unsaved changes exist; Save disabled when clean; Cancel discards.
4. After full app restart (same machine), the last folder reopens and created/edited prompts are present. `AUTHORING_RESTART_PERSISTENCE: PASS`.
5. Optimizer result can be applied into the editor via an explicit "Übernehmen" button; saving persists the applied content.
6. After editing + saving content, previously computed quality/hygiene/context/blueprint results for that prompt are invalidated (not displayed as current).
7. Observability emits `prompt.create`, `prompt.edit`, `prompt.save`, `prompt.save_failed`, `prompt.cancel`, `optimizer.apply` with safe metadata only — **no prompt text, no title content, no clipboard**.
8. No data loss: create→edit→save→restart→content identical.
9. Privacy sentinel: diagnostic export contains 0 prompt bodies / 0 editor texts.

## 4. Red Tests (write first, expect fail)

Frontend (Vitest):
- `store: createPrompt persists via tauri (mock) and updates store`
- `store: updatePrompt persists and invalidates analysis`
- `store: save failure sets error + emits save_failed`
- `store: cancel discards changes (no tauri call)`
- `store: dirty state transitions`
- `store: restart persistence — lastFolder restore triggers scan`
- `component: editor opens for create and edit, renders title+content`
- `component: dirty indicator, save-disabled-when-clean, cancel`
- `component: optimizer apply button opens editor with applied content`
- `observability: authoring events carry safe metadata only (no content)`
- `no data loss: create → edit → save → content equal`

## 5. Regression Tests (must stay green)

- All existing appStore suites (missingInfoGate, variantResults, blueprint, autodetect, batchclassify)
- DetailsPanel/AnalysisPanel/OptimizationPanel suites
- Existing observability + redaction suites
- `pnpm test` → 1663 passing baseline + new; 5 pre-existing harness-contract failures remain UNCHANGED
- `cargo test --workspace`, `cargo fmt --check --all`, `cargo clippy -D warnings` (no Rust changes expected)
- `pnpm lint`, `pnpm exec tsc --noEmit`, `pnpm build`, `git diff --check`

## 6. Native E2E (Windows, WebdriverIO) — REQUIRED

New spec `e2e-tests/specs/authoring-lifecycle.native.spec.js` following the pattern of `admin-observability.native.spec.js` (real binary `target/debug/promptvault-lite.exe`, real WebView2, real IPC, real FS, temp synthetic vault — no user data).

Proof flow:
1. Launch app → load synthetic archive via `__pvlLoadArchive` bridge
2. Create new prompt (title + content) via UI
3. Verify file exists in temp vault dir
4. Edit content → save
5. Verify file content on disk changed
6. Close app → relaunch → auto-restore folder → edited prompt present (restart persistence)
7. Optimize → apply result → save
8. Privacy sentinel: export diagnostics → assert 0 prompt bodies / 0 editor texts

## 7. Privacy Contract (v1.9.2 baseline)

- No prompt text, no title-with-sensitive-content, no clipboard in observability events or diagnostic export.
- Observability metadata only: `operation`, `status`, `reasonCode`, `category`, `duration`, opaque `promptId`/fingerprint.
- Redaction allowlist (`SAFE_ATTRIBUTE_KEYS`) stays authoritative; new attributes must be allowlisted safe metadata.

## 8. Non-Goals (explicit)

- DELETE prompt (no existing backend; would inflate scope)
- Move/organize/collection redesign (preserve existing category/tags/explorer)
- Advanced Workflows GA (separate future milestone)
- TTS, installer signing, Windows harness fixes
- New Rust commands, migrations, second storage system

## 9. Version

- Bump `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json` → `1.10.0`
- Docs: README, CHANGELOG, PROJECT_STATUS, USER_GUIDE, ARCHITECTURE (minimal, milestone-scoped)

## 10. Verification Contract Summary

| Field | Value |
|---|---|
| Desired behavior | see §1 |
| Acceptance criteria | see §3 |
| Red tests | see §4 |
| Regression tests | see §5 |
| Reality gate | `git diff --stat`, gates in §5, native E2E, restart proof |
| Evidence types | test output, native E2E log, restart proof, privacy sentinel, independent verifier |
| Untestable assumptions | file watcher auto-rescan on external changes (covered by existing watcher tests); Windows WebView2 driver availability (harness present) |
