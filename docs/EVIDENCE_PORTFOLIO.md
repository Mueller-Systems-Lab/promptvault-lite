# Evidence Portfolio — PromptVault Lite

> Living Software Portfolio. Updated with every significant agent run.
> No marketing claims — only evidence-backed facts.

**Last evidence run:** 2026-08-12 (Final Reconciliation — Admin Observability + CLI documentation)

---

## Current Capabilities (Evidence-Backed)

| Capability                                                         | Evidence                               | Last Verified |
| ------------------------------------------------------------------ | -------------------------------------- | ------------- |
| Recursive .md/.markdown/.txt file scanning with 1 MiB limit        | 40 Rust tests PASS                     | 2026-06-22    |
| YAML frontmatter parsing (UTF-8, special chars)                    | 11 Rust tests PASS                     | 2026-06-19    |
| Quality scoring (10 criteria, multi-language)                      | 17 Rust tests + 67 frontend tests PASS | 2026-06-19    |
| Hygiene detection (18 artifact categories)                         | 27 Rust tests PASS                     | 2026-06-19    |
| Prompt optimization (3 modes, deterministic)                       | 54 frontend tests PASS                 | 2026-06-19    |
| Dark mode (auto-detect, localStorage persist)                      | 10 frontend tests PASS                 | 2026-06-19    |
| File tree with search, filter, favorites                           | 50 frontend tests PASS                 | 2026-06-19    |
| Export (JSON, Markdown, ZIP) with path safety                      | 10 Rust tests PASS                     | 2026-06-19    |
| Typed local action layer (13 actions)                              | 44 frontend tests PASS                 | 2026-06-19    |
| Blueprint detection & classification (7 classes)                   | 35 frontend tests PASS                 | 2026-06-19    |
| Blueprint quality evaluation (10 dimensions)                       | 35 frontend tests PASS                 | 2026-06-19    |
| Blueprint optimization (3 modes)                                   | 35 frontend tests PASS                 | 2026-06-19    |
| Blueprint contamination detection                                  | 35 frontend tests PASS                 | 2026-06-19    |
| Tauri IPC command layer                                            | 17 Rust integration tests PASS         | 2026-06-19    |
| SQLite/FTS5 database layer                                         | 14 Rust tests PASS                     | 2026-06-19    |
| Symlink containment & path traversal protection                    | 10 Rust tests PASS                     | 2026-06-19    |
| Settings Modal (theme, export format, dev mode, reset)             | 19 frontend tests PASS                 | 2026-07-06    |
| Audio Summary — Text + TTS via Web Speech API (local)              | 11 frontend tests PASS                 | 2026-07-06    |
| Paste Prompt Analyzer — Clipboard & direct text (no file, no save) | 26 frontend tests PASS                 | 2026-07-06    |
| Embeddings Phase 1 — Mock Provider + feature flag (no real model)  | 49 frontend tests PASS                 | 2026-07-06    |
| Admin Observability — Trace/Span, Reason Codes, Redaction, Store    | 8 frontend suites + Rust correlation tests PASS | 2026-08-12 |
| Frontend↔Backend trace correlation                                  | `observability_correlation.rs` PASS     | 2026-08-12    |
| Native observability proof on Windows (WebdriverIO/WebView2)        | `admin-observability.native.spec.js`    | 2026-08-12    |
| promptvault CLI (doctor/install/launch/update/diagnostics/uninstall)| `tests/test_releases.py` PASS           | 2026-08-12    |

---

## New Capabilities Since v1.6.0

| Capability                                      | PR/Issue  | Status                                |
| ----------------------------------------------- | --------- | ------------------------------------- |
| NAS-mounted markdown folder scanning            | #145      | ✅ Merged (2026-06-20)                |
| Optimizer placeholder hardening                 | #147      | ✅ Merged (2026-06-20)                |
| Blueprint detection, evaluation & optimization  | #148      | ✅ Merged (2026-06-19)                |
| Native .txt prompt ingestion                    | #168      | ✅ Merged (2026-06-21)                |
| Centralized scanner extension handling          | #170      | ✅ Merged (2026-06-21)                |
| Shared file size limit (1 MiB)                  | #172      | ✅ Merged (2026-06-21)                |
| Real prompt corpus pilot                        | #166      | ✅ Completed; corpus review finalized |
| Docs-as-Code MkDocs platform                    | #162      | ✅ Merged (2026-06-21)                |
| Historical evidence archive                     | #163      | ✅ Merged (2026-06-21)                |
| UI/Optimizer/Classification/Layout fixes        | #185      | ✅ Merged (2026-06-24)                |
| Settings Modal (theme, export, dev mode, reset) | #186      | ✅ Merged (2026-07-02)                |
| Five-file Playwright evidence (sanitized)       | #187      | ✅ Validated (2026-07-02)             |
| GUIDELINE classification                        | #190      | ✅ Merged (2026-07-03)                |
| Real-corpus classification reasons              | #192      | ✅ Merged (2026-07-03)                |
| Regex/backtracking hardening                    | #196      | ✅ Merged (2026-07-03)                |
| BLUEPRINT/DOCUMENTATION boundary refinement     | #197      | ✅ Merged (2026-07-03)                |
| UNKNOWN confidence / fallback explanations      | #198      | ✅ Merged (2026-07-04)                |
| Audio Summary (TTS via Web Speech API)          | #200/#202 | ✅ Merged (2026-07-03)                |
| Paste Prompt Analyzer                           | #204/#205 | ✅ Merged (2026-07-05)                |
| Embeddings Phase 1 (Mock Provider)              | #199/#206 | ✅ Merged (2026-07-06)                |

---

## Unchanged Limitations

| Limitation                                       | Since  | Notes                               |
| ------------------------------------------------ | ------ | ----------------------------------- |
| Windows installer unsigned (SmartScreen warning) | v1.7.1 | No code signing certificate         |
| Linux-only CI                                    | v1.0   | No macOS/Windows runners            |
| No Docker deployment                             | v1.0   | Issues #126–128 open                |
| Embeddings mock-only (no real ML)                | v1.7.2 | Phase 1 — Phase 2 DB schema planned |
| No macOS/Linux pre-built installers              | v1.0   | Source build only                   |

---

## Screenshot Evidence

| Screenshot          | File                                                     |
| ------------------- | -------------------------------------------------------- |
| Light Mode Overview | `docs/assets/screenshots/promptvault-overview-light.png` |
| Dark Mode Overview  | `docs/assets/screenshots/promptvault-overview-dark.png`  |
| Explorer View       | `docs/assets/screenshots/promptvault-explorer.png`       |
| Analysis View       | `docs/assets/screenshots/promptvault-analysis.png`       |
| Optimizer View      | `docs/assets/screenshots/promptvault-optimizer.png`      |

---

## Release History

| Version     | Date       | Type        |
| ----------- | ---------- | ----------- |
| v1.8.0      | 2026-08-03 | Stable      |
| v1.7.1      | 2026-07-01 | Stable      |
| v1.7.0      | 2026-06-22 | Pre-release |
| v1.6.0      | 2026-06-15 | Stable      |
| v1.5.0-rc.1 | 2026-06-07 | Pre-release |
| v1.5.0      | 2026-06-05 | Stable      |
| v1.4.0      | 2026-06-04 | Stable      |

---

## Gate Results (2026-07-06 Fresh Run)

| Gate                       | Command                       | Result                       |
| -------------------------- | ----------------------------- | ---------------------------- |
| Frontend Tests             | `pnpm test`                   | 785/785 PASS (34 files)      |
| ESLint                     | `pnpm lint`                   | PASS (0 errors, 0 warnings)  |
| TypeScript                 | `tsc --noEmit`                | PASS (0 errors)              |
| Rust Unit Tests            | `cargo test --lib`            | 134/134 PASS (+1 ignored)    |
| Rust Integration Tests     | `cargo test --test "*"`       | 22/22 PASS (+1 ignored)      |
| cargo fmt                  | `cargo fmt --check --all`     | PASS                         |
| cargo clippy               | `cargo clippy -- -D warnings` | PASS (0 warnings)            |
| Git diff check             | `git diff --check`            | PASS (no conflicts)          |
| MkDocs build               | `mkdocs build --strict`       | TOOL_MISSING (not installed) |
| pnpm build                 | `pnpm build`                  | PASS                         |
| Local CI (10/11 gates)     | —                             | 10/11 PASS (mkdocs excluded) |
| Remote CI (GitHub Actions) | `gh run list`                 | REMOTE_CI_INFRA_BLOCKED      |

---

## Next Step

- **Completed:** v1.8.0 released — Direction Profiles, Missing-Info-Gate, Optimizer Hardening, Visual Gate.
- **Completed (v1.9.0):** GitHub Release + Tag published — Admin Observability, promptvault CLI, Local Neural TTS, Windows x64 NSIS installer.
- **Completed (v1.9.0):** PyPI publish (`promptvault-lite-manager==1.9.0`) — OIDC Trusted Publishing, public install verified.
- **Planned:** Embeddings Phase 2 (#199), Architecture Contract Audit, Security Posture Review.
