# Roadmap — PromptVault Lite

**Last updated:** 2026-10-09
**Current version:** v1.13.1 release candidate (post-release hardening on top of v1.13.0; no product behaviour change)
**Latest published release:** v1.13.0 (GitHub Release, Linux x64 — published 2026-10-09)
**Next target:** publish v1.13.1; optional future work is independent external semantic validation.

---

## Recently Completed (v1.10.0)

| Task | Status |
| --- | --- |
| In-App Prompt Authoring Lifecycle (create/edit/save/cancel, dirty state) | ✅ DONE / RELEASED (v1.10.0) |
| Persistent save via canonical filesystem (`create_prompt`/`update_prompt`) + restart persistence (`promptvault.lastFolder`) | ✅ DONE / RELEASED (v1.10.0) |
| Optimizer "Übernehmen" (apply) + stale-analysis invalidation | ✅ DONE / RELEASED (v1.10.0) |
| Authoring observability (safe metadata only, `AUTHORING_SAVE_FAILED` ReasonCode) | ✅ DONE / RELEASED (v1.10.0) |
| Native + public E2E on the installed release binary (authoring lifecycle 6/6; public install/update proofs) | ✅ PASS (v1.10.0) |
| Windows x64 NSIS installer + release manifest + checksums | ✅ PUBLISHED (v1.10.0 GitHub Release) |
| PyPI `promptvault-lite-manager==1.10.0` | ✅ PUBLISHED (OIDC Trusted Publishing) |

## Current Milestone (v1.13.0 — Web/LAN & Container, Release Candidate)

| Task | Status |
| --- | --- |
| `promptvault-core` — framework-free engine extracted from the desktop backend (ADR-007) | ✅ DONE |
| `promptvault-server` — axum HTTP API (`/api`) for Web/LAN mode | ✅ DONE |
| Web mode — the server serves the built UI; frontend uses the HTTP adapter | ✅ DONE |
| Read-only-by-default guard + fail-closed configuration | ✅ DONE / VERIFIED |
| Traversal defense (`..` rejection, canonicalization, symlink containment) | ✅ DONE |
| Docker / Compose deployment (non-root runtime user, vault `:ro`) | ✅ DONE / IMAGE VERIFIED |
| Web-mode export failure surfacing with stage-aware German messages | ✅ DONE |
| Local embeddings MVP (#199) | ✅ DONE (synthetic provider) |
| Recommendation-apply workflow (#45) | ✅ DONE |
| Repository default branch `master` → `main` migration | ✅ DONE |
| Version bump to 1.13.0 (desktop, core, server) | ✅ DONE |
| Release: tag + GitHub Release + Linux packages | ⏳ IN PREPARATION |

## Published (v1.12.0)

| Task | Status |
| --- | --- |
| Advanced Workflows GA — Missing Info (#216) + Direction/Variants (#215) as normal product capabilities | ✅ RELEASED (v1.12.0) |
| Build-time env gates removed; production build can never be disabled via env (dev-only override remains) | ✅ RELEASED (v1.12.0) |
| No Developer Mode required | ✅ RELEASED (v1.12.0) |
| Apply-to-editor integration (Missing-Info enrichment + direction variants → PromptEditor, dirty state, explicit Save) | ✅ RELEASED (v1.12.0) |
| Stale-state invalidation (source change → results invalidated, apply refused `STALE_SOURCE`) | ✅ RELEASED (v1.12.0) |
| Safe observability: `missing_info.*` / `direction.*` + bounded reason codes (safe-metadata-v1 fail-closed) | ✅ RELEASED (v1.12.0) |
| Production native build proven (exe + NSIS + MSI, no feature env flags); native E2E 11/11; privacy sentinel 0 | ✅ PROVEN |
| Release: tag + GitHub Release + Linux package publication | ✅ PUBLISHED (2026-10-09) |

## Recently Completed (v1.9.0)

| Task | Status |
| --- | --- |
| Admin Observability (Trace/Span, Reason Codes, Redaction, Diagnostics Panel) | ✅ DONE / INTEGRATED |
| Frontend↔Backend Trace-Korrelation | ✅ DONE / INTEGRATED |
| Windows Native Runtime Proof (WebdriverIO/WebView2) | ✅ DONE |
| promptvault CLI (`doctor`/`install`/`launch`/`update`/`diagnostics`/`uninstall`) | ✅ IMPLEMENTED / VERIFIED |
| uv package (`promptvault-lite-manager`) | ✅ PUBLISHED (PyPI) |
| Local Neural TTS (Piper external runtime, `de_DE-thorsten-high`) | ✅ DONE / RUNTIME VERIFIED |
| Windows x64 NSIS installer | ✅ PUBLISHED (v1.9.0 GitHub Release) |

---

## Completed (v1.8.0 and earlier)

| Priority | Task | Status |
| -------- | --- | --- |
| P0 | Blueprint Detection & Analysis | ✅ Merged |
| P0 | NAS-mounted markdown folder support | ✅ Merged |
| P0 | Settings Modal | ✅ Merged |
| P1 | Audio Summary (TTS via Web Speech API) | ✅ Merged |
| P1 | Paste Prompt Analyzer | ✅ Merged |
| P1 | Embeddings Phase 1 (Mock Provider) | ✅ Merged |
| P0 | Missing-Info-Gate (#216) | ✅ Implemented — v1.8.0 feature flag; **GA in v1.12.0** |
| P0 | Direction Profiles & Variants (#215) | ✅ Implemented — v1.8.0 feature flag; **GA in v1.12.0** |
| P0 | Optimizer Gate Session Guard (#289) | ✅ Closed |
| P0 | Sensitive Content Optimizer Blocking (#291) | ✅ Closed |
| P0 | Autonomous Test Harness Trust (#294) | ✅ Merged |
| P0 | v1.8.0 Release | ✅ Published (2026-08-03) |

---

## Publication

| Item | Status |
| --- | --- |
| `v1.9.0` Tag | ✅ Published |
| GitHub Release v1.9.0 (Windows installer + manifest + checksums) | ✅ Published |
| PyPI publish (`promptvault-lite-manager==1.9.0`) | ✅ Published (OIDC Trusted Publishing) |
| `v1.10.0` Tag | ✅ Published |
| GitHub Release v1.10.0 (Windows installer + manifest + checksums) | ✅ Published |
| PyPI publish (`promptvault-lite-manager==1.10.0`) | ✅ Published (OIDC Trusted Publishing) |
| `v1.11.0` / `v1.11.1` Tags + GitHub Releases (Windows NSIS + manifest + checksums) | ✅ Published |
| PyPI publish (`promptvault-lite-manager==1.11.1`) | ✅ Published (OIDC Trusted Publishing) |
| `v1.12.0` Tag + GitHub Release (Linux `.deb`/`.rpm`/AppImage + `SHA256SUMS.txt` + manifest) | ✅ Published (2026-10-09) |
| `v1.13.0` (Web/LAN + container) | ⏳ In preparation |

---

## Short-Term (Planned)

| Priority | Task | Issue |
| -------- | --- | --- |
| P1 | ~~PyPI-Publikation `promptvault-lite-manager` + public `uv tool install` verifizieren~~ ✅ Done | — |
| P2 | Embeddings Phase 2: DB schema/storage | #199 |
| P2 | Architecture Contract Audit | — |
| P2 | Security Posture Review | — |
| P2 | Code signing for Windows installer | — |

---

## Medium-Term

| Priority | Feature Area | Status |
| -------- | --- | --- |
| P1 | Docker/LXC Web Backend Adapter MVP | ✅ Delivered in v1.13.0 (`promptvault-server`) |
| P2 | Docker Deployment | ✅ Delivered in v1.13.0 (`deploy/Dockerfile`, `deploy/docker-compose.yml`) |

---

## Long-Term / Deferred

- **Proxmox/NAS Integration**
- **Security Red Tests**
- **Real embedding provider** (ONNX/Ollama — deferred per ADR-004 Decision C)
- **macOS/Linux native installers**

---

## Non-Goals (Explicitly Out of Scope)

- Cloud backend or SaaS offering
- API-based prompt optimization (stays local/deterministic)
- User accounts or authentication
- Telemetry or analytics collection (including from Admin Observability)
- Mobile apps
- Real-time collaboration
- Real semantic search / ML embeddings in production (Phase 1 is mock-only)
- Authentication for the Web/LAN server (it is intended for trusted LAN use)
