# PVL — Backlog Completion Ledger — 2026-09-30

**Run type:** Fresh-clone backlog completion (owner-authorized)
**Repository:** https://github.com/Mueller-Systems-Lab/promptvault-lite
**Default branch:** `master`
**Fresh-clone baseline HEAD:** `271729ca43b4955d1843be3b324f1f4e5f9c4ace`
**Host:** Linux x86_64 (kernel 6.8.0-85-generic), bash 5.2.21, git 2.43.0, node v22.23.2, pnpm 11.22.0, rustc/cargo 1.97.1
**Browser for GitHub state:** visible headed Chromium via Playwright (no headless, no API mutations)

## 1. Baseline inventory (live GitHub, 2026-09-30)

**Live open issues: 56. Open pull requests: 0 (72 closed). Latest published release: v1.11.1. Tag `v1.12.0` exists; the v1.12.0 GitHub Release is NOT published. No branch-protection rules configured (Settings → Branches: "Classic branch protections have not been configured").**

### Reconciliation: owner-reported "58 issues" vs. live 56 open

The two most recently closed issues are #298 ("docs(brand): add Mueller-Systems-Lab endorsement", closed via PR #299, 2026-08-27) and #291 (same title, closed via PR #300 merge line, 2026-08-28). 56 open + these 2 = 58. The owner count predates those closures. Baseline scope of this run = the 56 live-open issues below; #90 and #154 (explicitly referenced) are additionally verified in their closed state.

### Baseline issues (56)

| # | Title (verified live) | Group |
|---|---|---|
| 40 | [P3] Screenshots in docs/screenshots/ ergänzen | DOC |
| 42 | [P3] docs/README.md archivieren oder löschen | DOC |
| 43 | [P3] Native-Dependencies je Plattform in INSTALL.md dokumentieren | DOC |
| 45 | [Feature] Prompt-Vorschlaege uebernehmen und neu schreiben | FEAT |
| 69 | [Testing] Prompt-Packs im UI manuell testen | TEST |
| 97 | Web/LAN Backend-Adapter für Docker/LXC-Deployment | EPIC |
| 99 | A2 — Create promptvault-core library crate | EPIC |
| 100 | A3 — Create promptvault-server binary crate | EPIC |
| 101 | B1 — Move models module to promptvault-core | EPIC |
| 102 | B2 — Move parser module to promptvault-core | EPIC |
| 103 | B3 — Move analysis module to promptvault-core | EPIC |
| 104 | B4 — Move scanner/file_scanner.rs to promptvault-core | EPIC |
| 105 | B5 — Move database module to promptvault-core | EPIC |
| 106 | C1 — Restructure promptvault-tauri crate | EPIC |
| 107 | C2 — Update Tauri crate import paths to use promptvault-core | EPIC |
| 108 | C3 — Verify 16 Tauri commands functional after core migration | EPIC |
| 109 | C4 — Update CI for workspace builds | EPIC |
| 110 | D1 — Implement server binary and configuration module | EPIC |
| 111 | D2 — Create shared error model and middleware stack | EPIC |
| 112 | D3 — Set up server integration test harness | EPIC |
| 113 | E1 — Implement health endpoint GET /api/health | EPIC |
| 114 | E2 — Implement scan and list endpoints | EPIC |
| 115 | E3 — Implement get and analyze endpoints | EPIC |
| 116 | E4 — Implement favorites and context-evaluation endpoints | EPIC |
| 117 | E5 — Implement evidence-read and export endpoints | EPIC |
| 118 | F1 — Create runtime detection module and adapter interface | EPIC |
| 119 | F2 — Create HTTP adapter | EPIC |
| 120 | F3 — Extract Tauri adapter to implement BackendAdapter interface | EPIC |
| 121 | F4 — Update all consumers to use adapter factory | EPIC |
| 122 | F5 — Make Tauri plugin dependencies optional/dynamic | EPIC |
| 123 | G1 — Update Vite config for dual-mode builds | EPIC |
| 124 | G2 — Web-specific UI adjustments | EPIC |
| 125 | G3 — End-to-end web mode integration test | EPIC |
| 126 | H1 — Create multi-stage Dockerfile | EPIC |
| 127 | H2 — Create docker-compose.yml and .env.example | EPIC |
| 128 | H3 — Docker smoke test | EPIC |
| 129 | I1 — Create LXC setup documentation | EPIC |
| 130 | I2 — Create NAS mount documentation | EPIC |
| 131 | I3 — Create deployment README | EPIC |
| 132 | J1 — Implement red tests: path traversal and symlink escape | EPIC |
| 133 | J2 — Implement red tests: NAS security and read-only enforcement | EPIC |
| 134 | J3 — Implement red tests: web/Tauri isolation | EPIC |
| 135 | J4 — Core and server unit/integration test suite | EPIC |
| 136 | J5 — Create security gate script and CI integration | EPIC |
| 137 | K1 — Local Docker Compose preview with screenshot | EPIC |
| 138 | K2 — LAN accessibility verification | EPIC |
| 139 | L1 — Delegated code review by review-agent | EPIC |
| 140 | L2 — Human approval gate | EPIC |
| 141 | L3 — Evidence documentation on issue | EPIC |
| 142 | L4 — Merge to master | EPIC |
| 146 | Agentic/Vibe-Coding Baseline 2026 — Einbauprompt | GOV |
| 152 | test: add visual E2E coverage for blueprint autodetection UI | TEST |
| 155 | docs: add Mermaid architecture map for blueprint detection flow | DOC |
| 199 | feat(embeddings): add optional local semantic search and prompt intelligence MVP | FEAT |
| 295 | v1.11.0 MINOR - Advanced Workflows GA (Missing Info / Direction / Variants) | FEAT |
| 296 | Portfolio consolidation: absorb prompt archive and freeze as harvest/sale asset | STRATEGY |

## 2. Disposition ledger

Legend — Status: DONE (verified complete), PARTIAL, NOT_DONE, CONFLICT (conflicts with a higher-priority repository decision), BLOCKED (external dependency / owner decision required). Final state: issue state after this run.

| # | Evidence-based assessment | Status | Action | Final state |
|---|---|---|---|---|
| … | (filled during the run) | | | |

## 3. Local gate evidence

(Filled during the run; exact commands, exit codes, PASS/FAIL/BLOCKED/NOT_RUN.)

## 4. Pull requests created/merged in this run

(Filled during the run.)
