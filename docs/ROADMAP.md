# Roadmap — PromptVault Lite

**Last updated:** 2026-08-12
**Current version:** v1.8.0 (stable release, published 2026-08-03)
**Next target:** kein benannter Release — Veröffentlichung der integrierten Arbeit (Admin Observability + CLI) steht als separate Owner-Entscheidung aus

---

## Recently Completed (on `master`, unreleased)

| Task | Status |
| --- | --- |
| Admin Observability (Trace/Span, Reason Codes, Redaction, Diagnostics Panel) | ✅ DONE / INTEGRATED |
| Frontend↔Backend Trace-Korrelation | ✅ DONE / INTEGRATED |
| Windows Native Runtime Proof (WebdriverIO/WebView2) | ✅ DONE |
| promptvault CLI (`doctor`/`install`/`launch`/`update`/`diagnostics`/`uninstall`) | ✅ IMPLEMENTED / VERIFIED |
| uv package (`promptvault-cli`) | ✅ READY_FOR_PUBLICATION |

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

## Publication (NOT YET)

| Item | Status |
| --- | --- |
| PyPI publish (`promptvault-cli`) | ❌ NOT YET (Owner-Freigabe nötig) |
| GitHub Release für neuen master-Stand | ❌ NOT YET |
| `v1.9.0` Tag | ❌ NOT YET |

---

## Short-Term (Planned)

| Priority | Task | Issue |
| -------- | --- | --- |
| P2 | Windows x64 Installer-Artefakt veröffentlichen (CLI-Install-Pfad end-to-end) | — |
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
