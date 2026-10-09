# Project Status — PromptVault Lite

**Last updated:** 2026-10-09
**Latest published release:** v1.13.1 (GitHub Release, Linux x64 — `.deb`, `.rpm`, AppImage plus `SHA256SUMS.txt` and a source-identity manifest), published 2026-10-09 from tag `v1.13.1`
**v1.13.2:** hardening patch in preparation — scan-root authorization, automated release gate, load-invariant performance gate, AppImage `.DirIcon` fix
**Branch:** main

---

**v1.13.2 (in preparation):** post-release hardening on top of v1.13.1; see `docs/CHANGELOG.md` for the exact scope.

**v1.13.0 (published):** adds an optional LAN-deployable HTTP server (`promptvault-server`, read-only by default) plus Docker/Compose deployment on top of the v1.12.0 desktop application. The offline, local-first and deterministic Analyzer contract is unchanged. Broad external semantic generalization is not claimed; the 86/176 external study remains incomplete due to provider instability. The Windows-only CLI remains on its last compatible `1.11.1` PyPI release.

## Current Status: GREEN_CODE / v1.13.2 RELEASE CANDIDATE 🟢

**Code/Tests:** GREEN — Frontend (Vitest), Rust (`cargo test`/`clippy`/`fmt`), server API tests and native E2E (Playwright + WebdriverIO on Windows) suites are verified.
**Remote-CI:** GitHub Actions runs and passes on `main` (13/13 on `4add9d20`); Issue #154 is closed. Local gates remain required before merge.
**Release candidate:** v1.13.2 hardening patch — the v1.13.1 Linux x64 packages were published on 2026-10-09.
**Publication:** `promptvault-lite-manager` PyPI publication = `PUBLISHED` (v1.10.0, via OIDC Trusted Publishing).
**v1.10.0 (released):** in-app prompt authoring lifecycle (create/edit/save/cancel, restart persistence, optimizer apply, stale-analysis invalidation, authoring observability). Public native + CLI install/update proofs PASS; public authoring lifecycle E2E 6/6 PASS on the installed release binary.

---

## v1.13.0 — Web/LAN & Container Release (published, historical) ✅

**Status: RELEASED** — published 2026-10-09 from tag `v1.13.0` (commit `bd001f48d162612b38af608684083fe639aecb66`). The Web/LAN server, the `promptvault-core` / `promptvault-server` split and the Docker/Compose deployment shipped in that release.

| Feature | Status | Evidence |
| --- | --- | --- |
| `promptvault-core` — framework-free engine (models, parser, scanner, analysis, database) | ✅ IMPLEMENTED | `crates/promptvault-core/` + ADR-007 |
| `promptvault-server` — axum HTTP API under `/api` (health, scan, prompts, favorites, evidence, export) | ✅ IMPLEMENTED | `crates/promptvault-server/src/routes/*` + API tests |
| Web mode — the server serves the built UI; frontend uses the HTTP adapter | ✅ IMPLEMENTED | `src/lib/backend/httpAdapter.ts` + backend adapter tests |
| Read-only by default; mutating routes return `403` unless `PROMPTVAULT_SERVER_READ_ONLY=0` | ✅ VERIFIED | `routes/mod.rs` guard; runtime check returns 403 with a German message |
| Fail-closed config: loopback bind default, absolute existing vault directory required | ✅ VERIFIED | `crates/promptvault-server/src/config.rs` + unit tests |
| Traversal defense: `..` segments rejected, paths canonicalized, scanner enforces symlink containment | ✅ IMPLEMENTED | `routes/scan.rs::validate_scan_path` + `scanner/file_scanner.rs` |
| Docker / Compose deployment (multi-stage, non-root runtime user, vault `:ro`) | ✅ VERIFIED | `deploy/Dockerfile` + `deploy/docker-compose.yml`; image builds and serves `/api/health` at version 1.13.0 |
| Web-mode export surfaces save failures with stage-aware German messages | ✅ IMPLEMENTED | `src/lib/export/webExport.ts` + adversarial write-failure test |
| Local embeddings MVP (#199) | ✅ IMPLEMENTED (synthetic provider) | `src/lib/embeddings/*` + storage/commands |
| Recommendation-apply workflow (#45) | ✅ IMPLEMENTED | recommendation blocks + test suites |

## v1.12.0 — Bounded Offline Analyzer Release (published, historical)

**Status: RELEASED** — published 2026-10-09 from tag `v1.12.0` (commit `ab242f74853469cf3360d870678883fe39412f74`) as Linux x64 `.deb`, `.rpm` and AppImage, plus `SHA256SUMS.txt` and a source-identity manifest. Windows and macOS installers were not produced in that Linux run; the immutable Windows `v1.11.1` release remains available.

| Feature | Status | Evidence |
| --- | --- | --- |
| Missing Info (#216) normal product capability — available by default in the standard production build | ✅ IMPLEMENTED / GA | `src/lib/advancedWorkflowsAvailability.ts` + `src/components/gates/MissingInfoGate.tsx` + advanced-workflows test suites |
| Direction / Direction Profiles / Variants (#215) normal product capability — available by default | ✅ IMPLEMENTED / GA | `src/lib/advancedWorkflowsAvailability.ts` + `src/components/variants/*` + variant test suites |
| Build-time env gates removed; production build can never be disabled via env (dev-only override remains) | ✅ IMPLEMENTED / REGRESSION-PROVEN | `src/lib/advancedWorkflowsAvailability.ts` (GA contract) + `src/lib/__tests__/advancedWorkflowsAvailability.test.ts` |
| No Developer Mode required | ✅ IMPLEMENTED | advanced-workflows entry points work with devMode=false, no env (verified in appStore tests) |
| Apply-to-editor integration (Missing-Info enrichment + Direction variants → PromptEditor, dirty state, explicit Save) | ✅ IMPLEMENTED | `applyMissingInfoResultToEditor` / `applyVariantToEditor` in `src/stores/appStore.ts` + `VariantPanel.ga.test.tsx` |
| Stale-state invalidation (source change → results invalidated, apply refused `STALE_SOURCE`) | ✅ IMPLEMENTED | `invalidateAnalysisForPrompt` + `appStore.advancedWorkflowsGa.test.ts` |
| Safe observability: `missing_info.*` / `direction.*` + bounded reason codes (safe-metadata-v1, fail-closed) | ✅ IMPLEMENTED | `src/observability/contracts.ts` + `diagnostics.ts` + `redaction.ts` + `advancedWorkflowsObservability.test.ts` |
| Production native build proven (exe + NSIS + MSI, no feature env flags) | ✅ PROVEN | `target\release\promptvault-lite.exe` (1.11.0), `PromptVault Lite_1.11.0_x64-setup.exe`, MSI |
| Native production E2E | ✅ PASS 11/11 | native production E2E suite (11/11), privacy sentinel 0 |

> v1.11.0 builds on the v1.10.0 authoring lifecycle: advanced-workflow results (Missing-Info enrichment, direction variants) land in the v1.10.0 PromptEditor via explicit "Übernehmen" and are persisted with the existing save path.

---

## Integrated (v1.10.0 — RELEASED)

| Feature | Status | Evidence |
| --- | --- | --- |
| In-App Prompt Authoring Lifecycle (create/edit/save/cancel, dirty state) | ✅ DONE / RELEASED (v1.10.0) | `docs/audits/PVL-v1.10.0-AUTHORING-LIFECYCLE-DECISION-RECORD-20260815.md` + `docs/audits/PVL-v1.10.0-AUTHORING-LIFECYCLE-RUN-REPORT-20260815.md` + `src/stores/appStore.ts` + `src/components/editor/PromptEditor.tsx` + authoring test suites |
| Persistent save via canonical filesystem (`create_prompt`/`update_prompt`) + restart persistence (`promptvault.lastFolder` auto-restore) | ✅ DONE / RELEASED (v1.10.0) | `src/lib/tauri.ts` + `src/App.tsx` (startup restore) + `appStore.authoring.test.ts` + native/public E2E |
| Optimizer "Übernehmen" (apply to editor, explicit user action) + stale-analysis invalidation on content change | ✅ DONE / RELEASED (v1.10.0) | `src/components/optimization/OptimizationPanel.tsx` + `invalidateAnalysisForPrompt` + test suites + public E2E test 5 |
| Authoring observability (prompt.create/edit/save/save_failed/cancel, optimizer.apply — safe metadata only) | ✅ DONE / RELEASED (v1.10.0) | `src/observability/__tests__/authoringObservability.test.tsx` + `AUTHORING_SAVE_FAILED` ReasonCode + public privacy sentinel 0 |
| Native + public E2E on the installed release binary | ✅ PASS / RELEASED (v1.10.0) | `e2e-tests/specs/authoring-lifecycle.native.spec.js` + `e2e-tests/specs/authoring-lifecycle.public.spec.js` (6/6 each, app_version 1.10.0) |

v1.12.0 includes the Advanced Workflows GA on the existing editor: Missing-Info enrichment and Direction variants can be applied into the PromptEditor (dirty state → explicit Save); stale results are invalidated on source change.

---

## Integrated (v1.9.2)

| Feature | Status | Evidence |
| --- | --- | --- |
| Fail-closed diagnostic export privacy boundary (`safe-metadata-v1`) | ✅ DONE / RELEASED (v1.9.2) | `src/observability/redaction.ts` + `e2e-tests/specs/privacy-export.native.spec.js` + public native proof (sentinel 0, raw 0, secret 0, private path 0) |
| Unknown/nested diagnostic attributes omitted (never "redact and keep") | ✅ DONE (v1.9.2) | `src/observability/redaction.ts` (SAFE_ATTRIBUTE_KEYS allowlist, fail-closed) |
| Deep Diagnostics within the same export privacy boundary | ✅ DONE (v1.9.2) | `src/observability/redaction.ts` sanitizeSpan (nested traces) |
| Dynamic/canonical app version in diagnostics (`app_version`) | ✅ DONE (v1.9.2) | `AdminDiagnosticsPanel.handleExport` uses `__APP_VERSION__`; export policy v1 |

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
| Direction Profiles & Variants (GA in v1.12.0) | v1.8.0 |
| Missing-Info-Gate (GA in v1.12.0) | v1.8.0 |
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
| v1.9.2 GitHub Release / Tag | ✅ Published (Windows x64 NSIS installer + release manifest + `SHA256SUMS.txt`) |
| v1.10.0 GitHub Release / Tag | ✅ Published (Windows x64 NSIS installer `PromptVault.Lite_1.10.0_x64-setup.exe` + release manifest + `SHA256SUMS.txt`) |
| PyPI (`promptvault-lite-manager==1.9.0`) | ✅ Published (OIDC Trusted Publishing) |
| PyPI (`promptvault-lite-manager==1.9.1`) | ✅ Published (OIDC Trusted Publishing) |
| PyPI (`promptvault-lite-manager==1.9.2`) | ✅ Published (OIDC Trusted Publishing) |
| PyPI (`promptvault-lite-manager==1.10.0`) | ✅ Published (OIDC Trusted Publishing) |
| Windows v1.9.1 installer asset | ✅ Published (`PromptVault.Lite_1.9.1_x64-setup.exe`) |
| Windows v1.9.2 installer asset | ✅ Published (`PromptVault.Lite_1.9.2_x64-setup.exe`) |
| Windows v1.10.0 installer asset | ✅ Published (`PromptVault.Lite_1.10.0_x64-setup.exe`) |

---

## Not Present

- Signed/code-signed binaries (installer unsigned)
- Auto-updater
- macOS pre-built installer
- Cloud backend / API / telemetry
- Real semantic search / ML embeddings (Phase 1 mock-only)

---

## Known Limitations

- **Windows installer unsigned:** SmartScreen shows "Unknown publisher" warning
- **No auto-updater:** manual update for each release
- **Web/LAN-Server ohne Authentifizierung** — für ein vertrauenswürdiges LAN gedacht, nicht für WAN. `POST /api/scan` akzeptiert einen beliebigen absoluten Verzeichnispfad (Ordnerauswahl-UX); im Container-Deployment ist der erreichbare Pfadraum auf das Container-Dateisystem plus den gemounteten Vault begrenzt (verifiziert), bei einem Bare-Metal-Lauf nicht. Details: `docs/DEPLOYMENT.md` → Sicherheitsgrenzen
- **Remote-CI:** GitHub Actions runs and passes on `main` (Issue #154 is closed); local gates remain required before merge
- **Embeddings Phase 1 mock-only** — no real semantic search
- **Local TTS neural path** — adapter implemented and verified end-to-end on Windows against a real local Piper runtime + German model (`de_DE-thorsten-high`); Piper/model are external local runtime requirements (not bundled); Web Speech remains the fallback
- **SQLite not fully wired** as primary persistence for scanned prompts (filesystem remains the canonical storage; since v1.10.0 authored prompts persist directly via the filesystem through `create_prompt`/`update_prompt`, which is the canonical storage layer — SQLite keeps its existing roles, e.g. favorites)
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
| Native E2E (WebdriverIO, Windows) | PASS — `e2e-tests/specs/admin-observability.native.spec.js` + `e2e-tests/specs/authoring-lifecycle.native.spec.js` + `authoring-lifecycle.public.spec.js` (public release binary) |
| Playwright E2E | PASS — `pnpm exec playwright test` |

> Exact test counts are intentionally not hard-coded here — they change frequently. Run the local gates to reproduce current numbers. See `docs/TESTING.md`.

---

## Next Steps (Recommended)

1. **v1.10.0 released (done):** GitHub Release v1.10.0 (Windows x64 NSIS installer + release manifest + checksums) and PyPI `promptvault-lite-manager==1.10.0` (OIDC Trusted Publishing) published; tag `v1.10.0` pushed. Public native + CLI install/update proofs PASS; public authoring lifecycle E2E 6/6 PASS on the installed release binary.
2. **v1.12.0 published (done):** Linux x64 packages, checksums and source-identity manifest published 2026-10-09 from tag `v1.12.0`. The Windows-only CLI remains on its separate `1.11.1` stream.
3. **v1.13.0 published (done):** Web/LAN server, `promptvault-core` / `promptvault-server` split and Docker/Compose deployment, published 2026-10-09.
4. **v1.13.1 published (done):** post-release hardening — manifest-schema discrimination, artifact path scanning, invariant documentation and regression coverage, published 2026-10-09.
5. **v1.13.2 (in preparation):** scan-root authorization, automated release gate, load-invariant performance gate, AppImage `.DirIcon` fix.
6. **Embeddings Phase 2 (#199):** DB schema/storage (still mock-only).
7. **Code signing for the Windows installer.**
8. **Architecture Contract Audit / Security Posture Review.**
