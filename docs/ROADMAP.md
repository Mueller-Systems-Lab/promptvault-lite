# Roadmap — PromptVault Lite

**Last updated:** 2026-08-16
**Current version:** v1.10.0 (GitHub Release published 2026-08-15 — Windows x64 installer `PromptVault.Lite_1.10.0_x64-setup.exe`; PyPI `promptvault-lite-manager==1.10.0` published via OIDC)
**Next target:** v1.11.0 planning — candidate scope: Advanced Workflows GA (Missing Info / Direction), Embeddings Phase 2 (#199), code signing

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
| P0 | Missing-Info-Gate (#216) | ✅ Implemented — master, feature flag |
| P0 | Direction Profiles & Variants (#215) | ✅ Implemented — master, feature flag |
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

---

## Short-Term (Planned)

| Priority | Task | Issue |
| -------- | --- | --- |
| P1 | ~~PyPI-Publikation `promptvault-lite-manager` + public `uv tool install` verifizieren~~ ✅ Done | — |
| P1 | Advanced Workflows GA (Missing Info / Direction) — candidate for v1.11.0 (not yet done) | — |
| P2 | Embeddings Phase 2: DB schema/storage | #199 |
| P2 | Architecture Contract Audit | — |
| P2 | Security Posture Review | — |
| P2 | Code signing for Windows installer | — |

---

## Medium-Term

| Priority | Feature Area | Status |
| -------- | --- | --- |
| P1 | Docker/LXC Web Backend Adapter MVP | Deferred — large epic |
| P2 | Docker Deployment | Deferred |

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
- Docker/Web/LAN production deployment (deferred)
