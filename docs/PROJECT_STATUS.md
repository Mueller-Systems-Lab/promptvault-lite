# Project Status — PromptVault Lite

**Last updated:** 2026-08-05
**Current stable release:** v1.8.0
**Branch:** master
**Master HEAD:** `fe85e29` → pending merge of `fix/autonomous-test-harness-trust` (#294)

---

## Current Status: GREEN_CI 🟢

**Code/Tests:** GREEN — 1581 Vitest (59 files), 62 Python, 156 Rust, 177 Playwright E2E — all PASS.
**CI:** GREEN — 13/13 jobs fully green on `fix/autonomous-test-harness-trust` (Run 184).
**Security:** GREEN — E2E Bridge Gate fail-closed (debug-only), Secret Scan clean.
**Release:** AMBER — PR #294 pending owner review before merge. No merge without approval.

Remote-CI is `REMOTE_CI_INFRA_BLOCKED` (Issue #154). Local CI is authoritative.

---

## Implemented

| Feature                                                | Evidence                                                  | Since  |
| ------------------------------------------------------ | --------------------------------------------------------- | ------ |
| Local Prompt Archive (recursive scan)                  | Rust tests: `scanner/file_scanner`                        | v1.0   |
| Scanner: .md, .markdown, .txt, 1 MiB limit             | Rust tests: `scanner/file_scanner`                        | v1.7.0 |
| YAML Frontmatter Parser                                | Rust tests: `parser/frontmatter`                          | v1.0   |
| Quality Analysis (10 criteria)                         | Rust tests: `analysis/quality`                            | v1.0   |
| Hygiene Analysis (18 artifact categories)              | Rust tests: `analysis/hygiene`                            | v1.6.0 |
| Prompt Optimizer (3 modes)                             | Frontend tests: `promptOptimizer.test.ts`                 | v1.6.0 |
| Dark Mode (light/dark/auto)                            | Frontend tests: `ThemeToggle.test.tsx`                    | v1.6.0 |
| Resizable Explorer                                     | Frontend tests: `FileTree.test.tsx`                       | v1.6.0 |
| Export (JSON, Markdown, ZIP)                           | Rust tests: `commands/export`                             | v1.0   |
| Typed Local Action Layer (13 actions)                  | Frontend tests: `red-tests.test.ts`                       | v1.6.0 |
| Blueprint Detection & Classification                   | Frontend tests: `blueprintDetection.test.ts`              | v1.7.0 |
| Blueprint Quality Evaluation (10 dimensions)           | Frontend tests: `blueprintDetection.test.ts`              | v1.7.0 |
| Blueprint Optimization (3 modes)                       | Frontend tests: `blueprintDetection.test.ts`              | v1.7.0 |
| Blueprint Contamination Detection                      | Frontend tests: `blueprintDetection.test.ts`              | v1.7.0 |
| Favorites Backend (SQLite persistence)                 | Rust integration tests                                    | v1.5.0 |
| Tauri Desktop App (1400×900 window)                    | Tauri config, local verification                          | v1.0   |
| Symlink Containment / Path-Traversal Protection        | Rust tests                                                | v1.4.0 |
| File Watcher (500ms debounce)                          | Rust: `scanner/watcher`                                   | v1.0   |
| Settings Modal (theme, export format, dev mode, reset) | Frontend tests: `SettingsModal.test.tsx`                  | master |
| Audio Summary (TTS via Web Speech API, local)          | Frontend tests: `PromptAudioSummary.test.tsx`             | master |
| Paste Prompt Analyzer (clipboard/direct, no file)      | Frontend tests: `PastePromptAnalyzer.test.tsx` (26 tests) | master |
| Embeddings Phase 1 (Mock Provider, feature flag)       | Frontend tests: `embeddings/__tests__/*` (49 tests)       | master |

---

## On Master (Not Yet in v1.7.1 Release)

| Feature                                     | Status                                |
| ------------------------------------------- | ------------------------------------- |
| NAS-Mounted Markdown Folder Ingestion       | ✅ Merged (PR #145, 2026-06-20)       |
| Scanner Extension Support (.txt, .markdown) | ✅ Merged (PR #168, #170, 2026-06-21) |
| Shared File Size Limit (1 MiB)              | ✅ Merged (PR #172, 2026-06-21)       |
| UI/Optimizer/Classification/Layout Fixes    | ✅ Merged (PR #185, 2026-06-24)       |
| Settings Modal (#63)                        | ✅ Merged (PR #186, 2026-07-02)       |
| GUIDELINE Classification                    | ✅ Merged (PR #190, 2026-07-03)       |
| Real-Corpus Classification Reasons          | ✅ Merged (PR #192, 2026-07-03)       |
| Regex/Backtracking Hardening                | ✅ Merged (PR #196, 2026-07-03)       |
| BLUEPRINT/DOCUMENTATION Boundary Refinement | ✅ Merged (PR #197, 2026-07-03)       |
| UNKNOWN Confidence / Fallback Explanations  | ✅ Merged (PR #198, 2026-07-04)       |
| Audio Summary (TTS, Web Speech API)         | ✅ Merged (PR #202, 2026-07-03)       |
| Paste Prompt Analyzer                       | ✅ Merged (PR #205, 2026-07-05)       |
| Embeddings Phase 1 (Mock Provider)          | ✅ Merged (PR #206, 2026-07-06)       |
| Docs Baseline Sync                          | ✅ Merged (PR #208)                   |

---

## Not Present

- Signed/code-signed binaries (Windows installer is unsigned)
- Auto-updater
- macOS/Linux native installers (Windows x64 only)
- Cloud backend / API / telemetry
- Real semantic search / ML embeddings (Phase 1 mock-only)
- Docker production deployment (issues #126–128 open)
- Web/LAN Backend Adapter (issues #97–#142, deferred)
- macOS/Windows CI (only Linux in CI)
- `.opencode/policies/` directory (referenced in legacy docs, not yet created)

---

## Known Limitations

- **Windows installer unsigned:** SmartScreen shows "Unknown publisher" warning
- **No auto-updater:** Manual download required for each release
- **Linux-only CI:** No macOS or Windows CI runners
- **Remote-CI infra-blocked** (Issue #154)
- **Embeddings Phase 1 mock-only** — no real semantic search, no ONNX/Ollama/sqlite-vec
- **SQLite not fully wired** as primary persistence for scanned prompts
- **CSV export** referenced in settings UI but not implemented in backend

---

## Test Summary (2026-08-05)

| Suite                             | Tests | Result                                    |
| --------------------------------- | ----- | ----------------------------------------- |
| Frontend (Vitest)                 | 1581  | PASS (59 files)                           |
| Rust Unit (lib)                   | 134   | PASS (+1 ignored)                         |
| Rust Integration (command_errors) | 17    | PASS                                      |
| Rust Regex Regression             | 5     | PASS                                      |
| Rust Real Corpus Validation       | 1     | IGNORED (requires real prompt folder)     |
| Rust Total                        | 156   | PASS (2 ignored)                          |
| Playwright E2E (Chromium)         | 64    | PASS (5 skipped)                          |
| Playwright E2E (Firefox)          | 64    | PASS (5 skipped)                          |
| Playwright E2E (WebKit)           | 64    | PASS (5 skipped)                          |
| Native Tauri E2E (E19)            | 13    | PASS                                      |
| Native Dialog Smoke (E21)         | 1     | PASS                                      |
| Python AT-SPI Selection           | 62    | PASS                                      |
| ESLint                            | —     | PASS (0 errors, 0 warnings)               |
| TypeScript                        | —     | PASS (tsc --noEmit, 0 errors)             |
| cargo fmt                         | —     | PASS                                      |
| cargo clippy                      | —     | PASS (0 warnings)                         |
| pnpm build                        | —     | PASS                                      |
| Remote CI (GitHub Actions)        | 13/13 | PASS — Run 184 fully green               |

---

## Open Issues

| Issue | Description                             | Status                     |
| ----- | --------------------------------------- | -------------------------- |
| #199  | Embeddings Phase 2: DB schema/storage   | OPEN (Phase 1 merged)      |
| #207  | Docs Baseline Sync (pre v1.7.2 release) | ✅ Closed (PR #208 merged) |
| #154  | Remote-CI infra-blocked                 | OPEN                       |

---

## Next Steps (Recommended)

1. **v1.8.0 Released:** Direction Profiles, Missing-Info-Gate, Optimizer Hardening, Visual Gate merged and released.
2. **Embeddings Phase 2 (#199):** DB schema/storage planning (still mock-only, no real provider).
3. **Architecture Contract Audit:** Validate current architecture docs against code.
4. **Security Posture Review:** Document CSP, capabilities, update_prompt trust model.
5. **Tool Gap Closure:** mkdocs, secret scan, Playwright stability.
