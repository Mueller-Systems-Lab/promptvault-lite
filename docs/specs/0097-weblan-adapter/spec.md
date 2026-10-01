# Spec: Web/LAN Backend-Adapter (Epic #97 — Umsetzung 2026-10-01)

**Epic:** #97 · **Owner-Richtung:** 2026-10-01 (ADR-007)
**Status:** Accepted · **Workflow:** dependency-order, kleine reviewbare PRs

## Ziel-Architektur

```
┌──────────────────────────── Desktop (offline, unverändert) ───────────────────────────┐
│  React/TS UI ── adapter factory ──▶ TauriAdapter ──▶ Tauri IPC ──▶ promptvault-lite   │
└────────────────────────────────────────────────────────┬───────────────────────────────┘
                                                         │ (Path-Dep)
                                            ┌────────────▼────────────┐
                                            │   promptvault-core      │  (framework-frei:
                                            │  models/parser/scanner/ │   keine Netzwerk-Aufrufe)
                                            │  analysis/database      │
                                            └────────────▲────────────┘
                                                         │ (Path-Dep)
┌──────────────────────────── Web/LAN (optional, Server) ─┴───────────────────────────────┐
│  Browser ── HTTP ──▶ promptvault-server (axum) ── static/ + /api/* (read-only-Default)  │
└─────────────────────────────────────────────────────────────────────────────────────────┘
```

## Issue-zu-Deliverable-Mapping

| Issue(n) | Deliverable | Verification |
|---|---|---|
| #99 A2 | `crates/promptvault-core` (lib) | `cargo test -p promptvault-core` grün |
| #100 A3 | `crates/promptvault-server` (bin) | Binary startet, Config fail-closed (Unit-Tests) |
| #101–#105 B1–B5 | Module-Move models/parser/scanner/analysis/database → core; tauri re-exportiert | `cargo test --workspace` unverändert grün |
| #106 C1 | src-tauri schrumpft auf Commands/Watcher/lib | Struktur im Diff |
| #107 C2 | `crate::<mod>`-Pfade via Re-Exports stabil; watcher nutzt core-scanner | Kompilieren + Tests |
| #108 C3 | Command-Inventar-Test (alle 24 registrierten IPC-Commands dokumentiert + Compile-Nachweis) | `cargo test -p promptvault-lite --lib commands_inventory` |
| #109 C4 | CI-Jobs laufen `--workspace` (bereits so) + path-filter auf crates/ | ci.yml-Diff |
| #110 D1 | config-Modul (env, fail-closed, read-only-Default, 127.0.0.1-Default) | config-Unit-Tests (6) |
| #111 D2 | Shared Error-DTO + Middleware (CORS-LAN-only, Request-Log, Static-Fallback) | Server-Integrationstests |
| #112 D3 | Server-Testharness (`axum::serve` auf Ephemeral-Port in Tests) | Integrationstests |
| #113 E1 | `GET /api/health` → `{status,version,read_only}` | Test |
| #114 E2 | `POST /api/scan` (Pfad-Validierung!), `GET /api/prompts` | Tests inkl. Path-Traversal-Red-Tests |
| #115 E3 | `GET /api/prompts/:id`, `POST /api/prompts/:id/analyze` | Tests |
| #116 E4 | `GET /api/favorites`, `POST /api/favorites/:id/toggle`, `POST /api/prompts/:id/context` | Tests |
| #117 E5 | `GET /api/evidence/:id`, `POST /api/export` (read-only-Default: nur Export-Leseformen) | Tests |
| #118–#122 F1–F5 | Frontend `src/lib/backend/`: `detect.ts` (runtime detection), `httpAdapter.ts`, `tauriAdapter.ts`, `factory.ts`; Tauri-Plugins optional importierbar | Vitest Adapter-Vertragstests |
| #123 G1 | Vite dual-mode (`pnpm web` existiert; Proxy/Env `VITE_API_BASE`) | Build beider Modi |
| #124 G2 | Web-UI-Anpassungen (kein Tauri-Dialog: Vault-Pfad-Eingabe; Clipboard-Fallback) | Komponententests |
| #125 G3 | Web-E2E (`tests/e2e/web-mode.spec.ts` gegen laufenden Server + Vite) | Playwright chromium |
| #126–#128 H1–H3 | Multi-stage Dockerfile, compose + .env.example, Smoke-Script | Script vorhanden; Ausführung = Docker-Runtime nötig |
| #129–#131 I1–I3 | docs/DEPLOYMENT.md: LXC-Setup, NAS-Mount (read-only), Deployment-README | Docs-PR |
| #132–#134 J1–J3 | Red-Tests: Path-Traversal/Symlink-Escape, NAS read-only Enforcement, Web/Tauri-Isolation | Tests grün (rot vor Implementierung) |
| #135 J4 | Core+Server Unit/Integration-Suite | `cargo test --workspace` |
| #136 J5 | `scripts/security-gate.mjs` (Traversal-Muster, Binding-Checks) + CI-Job | Gate-Run + ci.yml |
| #137 K1 | Compose-Preview + Screenshot | **BLOCKED auf diesem Host: keine Docker-Runtime** — Script + Doku bereitgestellt |
| #138 K2 | LAN-Erreichbarkeit | **BLOCKED: LXC/LAN-Ziel (IP, NAS) liegt außerhalb dieses Hosts** — exakte fehlende Eingabe im Issue |
| #139 L1 | Unabhängige Reviews je PR | Review-Verdicts in den PRs |
| #140 L2 | Human-Approval-Gate | Owner-Freigabe durch Ziel-Anweisung 2026-10-01 + conditions-based Merges (dokumentiert) |
| #141 L3 | Evidence-Kommentare je Issue | GitHub-Issues |
| #142 L4 | Merges nach master | Merge-Commits je PR |

## Sicherheitsregeln ( hart, unverändert )

- Keine Anmeldedaten im Repo; `.env` nur als `.env.example`.
- Server-Default: `read_only=1`, `bind=127.0.0.1`; LAN nur per Opt-in.
- Scan-/Vault-Pfade: absolute Pfade, Traversal-/Symlink-Escape-Tests rot→grün.
- NAS-Mount: read-only empfohlen; Schreibzugriffe nur nach separater Freigabe.
