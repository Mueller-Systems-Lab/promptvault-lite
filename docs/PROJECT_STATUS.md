# Project Status — PromptVault Lite

**Last updated:** 2026-08-12
**Current stable release:** v1.8.0 (published 2026-08-03)
**Branch:** master
**Master HEAD:** `c0e6da8` — Admin Observability + promptvault CLI + native observability proof integrated

---

## Current Status: GREEN_INTEGRATED 🟢

**Code/Tests:** GREEN — Frontend (Vitest), Rust (`cargo test`/`clippy`/`fmt`) and native E2E (Playwright + WebdriverIO on Windows) suites are verified locally.
**Remote-CI:** `REMOTE_CI_INFRA_BLOCKED` (Issue #154) — local CI is authoritative.
**Release:** v1.8.0 published; Admin Observability and CLI are on `master` but **not yet released**.
**Publication:** PyPI/GitHub-Release/`v1.9.0`-Tag = `NOT PUBLISHED`.

---

## Integrated (beyond v1.8.0)

| Feature | Status | Evidence |
| --- | --- | --- |
| Admin Observability (Trace/Span, Reason Codes, Redaction, Diagnostics Panel) | ✅ DONE / INTEGRATED | `src/observability/*` + `src-tauri/src/observability/mod.rs` + 8 Test-Suiten |
| Frontend↔Backend Trace-Korrelation | ✅ DONE | `src-tauri/tests/observability_correlation.rs` |
| Native observability proof on Windows | ✅ DONE | `e2e-tests/specs/admin-observability.native.spec.js` + `wdio.conf.windows.mjs` |
| promptvault CLI (`doctor`/`install`/`launch`/`update`/`diagnostics`/`uninstall`) | ✅ IMPLEMENTED / VERIFIED | `tools/promptvault-cli/*` + `tests/test_releases.py` |
| uv package (`promptvault-cli`) | ✅ READY_FOR_PUBLICATION | `pyproject.toml` (hatchling wheel) |

---

## Implemented (v1.8.0)

| Feature | Since |
| --- | --- |
| Local Prompt Archive (recursive scan, `.md`/`.markdown`/`.txt`, 1 MiB limit) | v1.0 |
| Quality Analysis (10 criteria) | v1.0 |
| Hygiene Analysis (18 artifact categories) | v1.6.0 |
| Prompt Optimizer (3 modes) | v1.6.0 |
| Blueprint Detection / Quality Evaluation / Optimization | v1.7.0 |
| Direction Profiles & Variants (opt-in) | v1.8.0 |
| Missing-Info-Gate (opt-in) | v1.8.0 |
| Audio Summary (TTS via Web Speech API) | v1.7.2 |
| Paste Prompt Analyzer | v1.7.2 |
| Embeddings Phase 1 (mock) | v1.7.2 |
| Typed Local Action Layer | v1.6.0 |
| Settings Modal, Dark Mode, Export (JSON/MD/ZIP) | v1.6.0+ |

---

## Publication Status

| Item | Status |
| --- | --- |
| v1.8.0 GitHub Release | ✅ Published (Linux `.deb`/`.rpm` + `SHA256SUMS.txt`) |
| PyPI (`promptvault-cli`) | ❌ NOT PUBLISHED |
| GitHub Release / Tag for new master state | ❌ NOT PUBLISHED |
| `v1.9.0` release/tag | ❌ NOT RELEASED (package version ≠ release status) |
| Windows v1.8.0 installer asset | ❌ Not published (Linux-only release assets) |

---

## Not Present

- Signed/code-signed binaries (installer unsigned)
- Auto-updater
- macOS pre-built installer
- Cloud backend / API / telemetry
- Real semantic search / ML embeddings (Phase 1 mock-only)
- Docker production deployment (deferred)
- Web/LAN Backend Adapter (deferred)

---

## Known Limitations

- **Windows installer unsigned:** SmartScreen shows "Unknown publisher" warning
- **No auto-updater:** manual update for each release
- **Remote-CI infra-blocked** (Issue #154); local CI authoritative
- **Embeddings Phase 1 mock-only** — no real semantic search
- **SQLite not fully wired** as primary persistence for scanned prompts
- **CLI not published** — install from local wheel until package-index publication

---

## Test Summary

| Suite | Status |
| --- | --- |
| Frontend (Vitest) | PASS — run `pnpm test` |
| ESLint | PASS — `pnpm lint` |
| TypeScript | PASS — `pnpm exec tsc --noEmit` |
| Rust (`cargo test --workspace`) | PASS |
| `cargo fmt --check --all` | PASS |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS |
| Build (`pnpm build`) | PASS |
| Native E2E (WebdriverIO, Windows) | PASS — `e2e-tests/specs/admin-observability.native.spec.js` |
| Playwright E2E | PASS — `pnpm exec playwright test` |

> Exact test counts are intentionally not hard-coded here — they change frequently. Run the local gates to reproduce current numbers. See `docs/TESTING.md`.

---

## Next Steps (Recommended)

1. **Owner decision on publication:** PyPI publish, GitHub Release and `v1.9.0` tag remain separate owner-gated steps.
2. **Windows installer publication:** publish a Windows x64 NSIS artifact so the CLI install path is usable end-to-end.
3. **Embeddings Phase 2 (#199):** DB schema/storage (still mock-only).
4. **Architecture Contract Audit / Security Posture Review.**
