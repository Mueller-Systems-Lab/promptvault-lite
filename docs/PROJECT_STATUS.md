# Project Status — PromptVault Lite

**Last updated:** 2026-08-13
**Current stable release:** v1.9.1 (patch release — stricter release-manifest validation, fail-closed integrity contract, corrected PyPI description)
**Branch:** master
**Master HEAD:** tagged `v1.9.1` — v1.9.1 release state

---

## Current Status: GREEN_INTEGRATED 🟢

**Code/Tests:** GREEN — Frontend (Vitest), Rust (`cargo test`/`clippy`/`fmt`) and native E2E (Playwright + WebdriverIO on Windows) suites are verified locally.
**Remote-CI:** `REMOTE_CI_INFRA_BLOCKED` (Issue #154) — local CI is authoritative.
**Release:** v1.9.1 published as a GitHub Release (Windows x64 NSIS installer + release manifest + checksums).
**Publication:** `promptvault-lite-manager` PyPI publication = `PUBLISHED` (v1.9.1, via OIDC Trusted Publishing).

---

## Integrated (v1.9.0 → v1.9.1)

| Feature | Status | Evidence |
| --- | --- | --- |
| Admin Observability (Trace/Span, Reason Codes, Redaction, Diagnostics Panel) | ✅ DONE / INTEGRATED | `src/observability/*` + `src-tauri/src/observability/mod.rs` + 8 Test-Suiten |
| Frontend↔Backend Trace-Korrelation | ✅ DONE | `src-tauri/tests/observability_correlation.rs` |
| Native observability proof on Windows | ✅ DONE | `e2e-tests/specs/admin-observability.native.spec.js` + `wdio.conf.windows.mjs` |
| promptvault CLI (`doctor`/`install`/`launch`/`update`/`diagnostics`/`uninstall`) | ✅ IMPLEMENTED / VERIFIED | `tools/promptvault-cli/*` + `tests/test_releases.py` |
| Fail-closed release-manifest integrity contract | ✅ DONE (v1.9.1) | `tools/promptvault-cli/src/promptvault_cli/releases.py` + `tests/test_releases.py` + `tests/test_install_integrity.py` |
| uv package (`promptvault-lite-manager`) | ✅ PUBLISHED (PyPI) | `pyproject.toml` (hatchling wheel) |
| Local TTS Adapter (native Rust commands) | ✅ DONE / RUNTIME VERIFIED | `src-tauri/src/commands/tts.rs` + `src/lib/localTts.ts`; `docs/audits/LOCAL_NEURAL_TTS_RUN_REPORT.md` |

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
| v1.9.0 GitHub Release / Tag | ✅ Published (Windows x64 NSIS installer + release manifest + `SHA256SUMS.txt`) |
| v1.9.1 GitHub Release / Tag | ✅ Published (Windows x64 NSIS installer + release manifest + `SHA256SUMS.txt`) |
| PyPI (`promptvault-lite-manager==1.9.0`) | ✅ Published (OIDC Trusted Publishing) |
| PyPI (`promptvault-lite-manager==1.9.1`) | ✅ Published (OIDC Trusted Publishing) |
| Windows v1.9.1 installer asset | ✅ Published (`PromptVault.Lite_1.9.1_x64-setup.exe`) |

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
- **Local TTS neural path** — adapter implemented and verified end-to-end on Windows against a real local Piper runtime + German model (`de_DE-thorsten-high`); Piper/model are external local runtime requirements (not bundled); Web Speech remains the fallback
- **SQLite not fully wired** as primary persistence for scanned prompts
- **CLI published on PyPI** — `uv tool install promptvault-lite-manager` (verified public install)

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

1. **PyPI publication (done):** `promptvault-lite-manager==1.9.1` is published via OIDC Trusted Publishing; public `uv tool install promptvault-lite-manager` verified.
2. **Embeddings Phase 2 (#199):** DB schema/storage (still mock-only).
3. **Architecture Contract Audit / Security Posture Review.**
