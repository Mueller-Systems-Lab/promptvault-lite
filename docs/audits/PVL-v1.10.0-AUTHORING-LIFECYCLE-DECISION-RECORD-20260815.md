# PVL — Next Milestone Decision Record: AUTHORING_LIFECYCLE

**Date:** 2026-08-15
**Baseline:** v1.9.2 (released, frozen, tag immutable) — master `68c38cf`
**Run type:** Product milestone run (reality + decision + vertical build)

---

## 1. Reality Refresh Result

- **Repo:** `C:\promptvault-lite`, branch `master`, HEAD `68c38cf` = docs: mark v1.9.2 released and frozen. Up to date with `origin/master`.
- **Baseline gates:** `pnpm test` → 1663 passed, 5 failed — ALL 5 in `scripts/__tests__/harness-contract.test.js` (Unix-only shell syntax on Windows). These are the known pre-existing Windows harness-contract failures → `PRE_EXISTING_UNCHANGED`.
- **Governance hygiene:** `.agent-governance.quarantine-20260815.bak/` and `opencode.jsonc.quarantine-20260815.bak` were found inside the repo dir (untracked). **Archived outside the repository** to `C:\Users\xxammaxx\AppData\Local\Temp\opencode\quarantine-20260815\`. Not committed, not interpreted as product assets, no governance runtime reactivated. `docs/GOVERNANCE.md` remains tracked but no runtime.
- **Untracked artifacts present:** prior run briefs (`# PROMPTVAULT LITE — …md`), `SHA256SUMS.txt`, two `docs/audits/PVL-v1.9.2-*.md`, `OWNER APPROVAL…md` — all left untracked; not part of this milestone.
- **Dirty tree:** `src-tauri/Cargo.toml` shows "modified" but diff is empty (LF/CRLF line-ending artifact only, no content change).

## 2. Phase A — Authoring Lifecycle Readiness (A1–A12)

| # | Question | Finding |
|---|---|---|
| A1 | Create new prompt in normal UI? | **NO** — no create button/UI in any production component |
| A2 | Edit title/content? | **NO** — DetailsPanel is read-only display |
| A3 | Modify existing prompt? | Backend `update_prompt` exists (writes file), but **no UI** |
| A4 | Save? | Backend writes `.md` files with frontmatter (`create_prompt`/`update_prompt`), but **no UI save flow** |
| A5 | Persistent over restart? | Files persist **on disk** (filesystem is canonical). App does NOT auto-restore last folder (`currentFolderPath` not persisted) → manual re-open+rescan required. UI-level auto-restore missing |
| A6 | Move/organize? | **NO** move UI; category exists in model; favorites persist via SQLite |
| A7 | Optimizer apply? | **NO** — only "copy to clipboard" |
| A8 | Analysis after update? | N/A — no update flow exists |
| A9 | Undo/Cancel/Dirty? | **NO** |
| A10 | Backend commands exist but gated? | **YES** — `create_prompt`/`update_prompt` fully implemented in Rust with path-containment security tests. Frontend action layer (`prompts.create`/`prompts.update`) is **Developer-Mode + approval gated** and **unused by production UI**. But `tauri.ts` `createPrompt`/`updatePrompt` wrappers are directly usable (VariantPanel `saveVariantAsPrompt` already calls `tauriCreatePrompt` directly, bypassing the action layer) |
| A11 | Data migration? | **NONE required** — filesystem is canonical; SQLite `prompts` table + FTS exists; scanner reads `.md` files |
| A12 | Buildable without redesign? | **YES** — backend CRUD + IPC wrappers + store handler context already exist. Missing: editor UI, store authoring actions, dirty state, optimizer apply, stale-analysis invalidation, folder restore, observability |

**AUTHORING_READY_PERCENT: ~45%**
Backend/storage layer is ~90% ready (tested Rust CRUD, file persistence, SQLite schema). Frontend product surface is ~10% ready (no editor, no create/save/cancel UX). The remaining work is a well-bounded UI + store + invalidation + observability vertical slice on existing architecture.

## 3. Phase B — Advanced Workflows GA Readiness (B1–B13)

| # | Question | Finding |
|---|---|---|
| B1 | Fully implemented? | **YES** — Missing Info Gate (detector/classifier/gate UI/store) and Direction Profiles (variantGenerator, directionProfiles, selector, compare, panel, save-as-new) are implemented |
| B2 | Hidden by flags? | **YES** — `PROMPTVAULT_MISSING_INFO_GATE` and `PROMPTVAULT_DIRECTION_PROFILES`, default **disabled**, env-var only |
| B3 | Tests? | **Extensive** — `appStore.missingInfoGate.test.ts`, `appStore.variantResults.test.ts`, `MissingInfoGate.*` (4 suites), `VariantPanel.integration`, `VariantCompare`, `DirectionProfileSelector` |
| B4 | Reachable in normal installed app? | **NO** — flags off; no settings toggle |
| B5 | Settings/feature-toggle components? | **NO** — env-var only |
| B6 | Why hidden? | Originally opt-in for controlled rollout |
| B7 | Known quality/UX issues? | Not documented; requires runtime proof in production build |
| B8 | Network/cloud? | **NO** — fully local |
| B9 | Local/deterministic? | **YES** — pure TS generators |
| B10 | Results persistent? | Missing-info sessions + variant results are **session-only** (in-memory); save-as-new-version writes a file (persistent) |
| B11 | Loading/error/empty states? | Present (generationError, empty states, disabled states) |
| B12 | Explainable? | **YES** — German UI, reasonable labels |
| B13 | Flag-unlock risk? | **Moderate** — features never exercised in a production build at runtime; would need production E2E proof |

**ADVANCED_WORKFLOWS_READY_PERCENT: ~88%**
Feature implementation and unit tests are essentially complete. GA work = flag flip to default ON + settings/capability surface + observability events + production runtime proof. Small cost, moderate confidence gap (no production runtime evidence yet).

## 4. A/B Scoring

| Dimension (0–5) | AUTHORING LIFECYCLE | ADVANCED WORKFLOWS GA |
|---|---|---|
| Core workflow impact | 5 | 3 |
| User frequency | 5 | 3 |
| Product completeness | 5 | 2 |
| Implementation readiness | 4 | 5 |
| UX readiness | 2 | 4 |
| Runtime confidence | 3 | 3 |
| Implementation cost (1–5, 1=cheap) | 4 | 1 |
| Regression risk (1–5, 1=low) | 2 | 1 |

## 5. Decision Rule Application

- Authoring gets **special weight**: the current normal app has **no natural create → edit → save lifecycle**. PromptVault is marketed as a prompt *manager* ("managing, analyzing and improving prompt collections") but cannot create or edit a prompt in-app. This is the single largest product gap.
- Advanced GA gets weight only if authoring would require disproportionate architecture/migration. It does **not**: the Rust CRUD backend is already implemented and security-tested; storage is canonical filesystem; no data migration is required.

## 6. HARD DECISION

```
NEXT_MILESTONE: AUTHORING_LIFECYCLE
```

## 7. Version Classification

New public user-facing capability (in-app prompt authoring). Per repo SemVer convention (MINOR = feature wave, e.g. 1.8.0, 1.9.0) and the instruction to avoid a patch for a new capability:

```
RELEASE_CLASSIFICATION: MINOR / FEATURE WAVE
TARGET_VERSION: v1.10.0
```

## 8. Scope (v1.10.0 — Authoring Lifecycle)

**DoD journey:** SELECT/CREATE → EDIT → SAVE → ANALYZE → OPTIMIZE → APPLY RESULT → SAVE → REOPEN AFTER RESTART

In-scope:
- A. CREATE — normal user can create prompt (title + content), persisted via canonical `create_prompt`
- B. EDIT — edit existing prompt title/content via `update_prompt`
- C. DIRTY STATE — unsaved changes visibly indicated
- D. CANCEL — discard edits
- E. SAVE — persistent save over canonical storage layer (filesystem), no parallel storage system
- F. RESTART — saved prompts present after full app restart (folder auto-restore + rescan)
- G. OPTIMIZER APPLY — optimizer result applied into editor by explicit user action (not auto-overwrite)
- H. ANALYSIS CONSISTENCY — stale analysis invalidated on content change (content fingerprint)
- I. ORGANIZATION — preserve existing category/tags/explorer; no library redesign
- J. DELETE — **OUT of scope** (no existing backend delete; would inflate scope)
- Observability: `prompt.create`, `prompt.edit`, `prompt.save`, `prompt.save_failed`, `prompt.cancel`, `optimizer.apply` — safe metadata only, no content
- Tests: red-first authoring suite + native E2E + privacy sentinel + restart persistence proof

**Non-goals:** TTS, installer signing, delete prompt, move/organize redesign, Advanced Workflows GA (separate future milestone), Windows harness fixes, patch-rest leftovers (doctor native version, diagnose filter drift).

## 9. Rejected Alternative

`ADVANCED_WORKFLOWS_GA` — rejected because: features are largely complete but have never run in a production build; more importantly, it does not close the fundamental product gap. PromptVault remains a read-only analyzer without in-app authoring. GA is cheaper but the decision rule prioritizes the candidate that most completes the product, and authoring does not require disproportionate migration — the backend is already there.

## 10. Privacy Boundary (v1.9.2 baseline respected)

- No prompt text, titles-with-sensitive-content, clipboard, or user content in any diagnostic export
- Observability metadata only: operation, status, reason_code, duration, opaque prompt id/fingerprint
- Privacy sentinel test for editor text / prompt body / missing-info answers / direction content = 0 in diagnostics
