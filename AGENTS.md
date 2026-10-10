# AGENTS.md — PromptVault Lite Agent Rules

> Target Agent/Runtime: OpenCode Agent (issue-orchestrator mode) as primary; subagents for specialized work.
> This file is the single source of truth for all AI agents working in this repository.

---

## 1. Runtime, Shell & Host — discover at runtime

**`CURRENT_HOST = DISCOVER_AT_RUNTIME`.** This repository is developed on more
than one machine. Do **not** assume Windows, Linux or macOS, and treat no fixed
host, shell, package manager or tool version as authoritative. A remembered host
value is a guess, never a fact.

At every preflight, detect and record:

- OS and version
- active shell and its version (`$SHELL` / `$PSVersionTable.PSVersion`)
- path and encoding conventions
- resolved repository root (`git rev-parse --show-toplevel`)
- available toolchain and versions (`git`, `node`, `pnpm`, `cargo`)

```bash
# bash / POSIX profile
uname -a; echo "$SHELL"; git --version; node --version; pnpm --version; cargo --version
```

```powershell
# PowerShell 5.1+ profile
Get-Location; $PSVersionTable.PSVersion; git --version; node --version; pnpm --version
```

Then:

- Use the syntax of the shell you **actually detected**.
- Do NOT mix shell syntax across platforms without validation.
- Windows/PowerShell and Linux/bash are **compatibility profiles**, not rival
  claims about the current host. Neither is more authoritative than the other.

### Project identity and workspace preflight

- The repository identity is `Mueller-Systems-Lab/promptvault-lite`; `origin` must resolve to that GitHub repository over HTTPS or SSH. A fork is valid only when its owner/repository and canonical HTTPS/SSH remotes are explicitly listed under `approvedForks` in the project contract; an empty list means no forks are approved. The actual checkout root is the filesystem-resolved result of `git rev-parse --show-toplevel`, never a guessed current directory or parent folder. The canonical default branch is `main` (renamed from `master` on 2026-10-08); pull requests target `main`, and CI/Pages workflows are configured for it.
- The versioned, machine-readable project contract is `.agents/project-contract.v1.json`; its versioned schema is `.agents/schemas/project-contract.v1.schema.json`. Validate it with `node tools/validate-project-contract.mjs` before repository-scoped work. Check a planned write path with `node tools/validate-project-contract.mjs --check-write <repo-relative-path>`; a denied path is a preflight stop. This checker reports policy but does not block arbitrary filesystem writes. The JSON records identity and path facts; this file remains the sole narrative policy authority.
- Repository-relative path map: root instructions `AGENTS.md`; specs `.opencode/spec/`, `.opencode/specs/`, and `docs/specs/`; skills `.agents/skills/`; tests `src/`, `tests/`, `src-tauri/tests/`, `crates/*/tests/`, `scripts/__tests__/`, and `tools/promptvault-cli/tests/`; evidence `evidence/` and `.opencode/reports/`.
- `NO_NESTED_PROJECT_ROOT`: do not treat a nested Git root as part of this project by default. A nested root is allowed only when declared by relative path and kind in the project contract; undeclared nested Git roots and duplicate checkouts are preflight failures. Ordinary source modules and vendored examples without their own Git metadata do not create nested roots. Linked worktrees and submodules must be explicitly modeled when they are part of a workspace.
- `NO_CONFIGURATION_SHADOWING`: before acting, inspect the instructions and skills applicable to the active runtime, record which runtime is active, and surface conflicting global/project guidance. This is a preflight rule; it does not claim that documentation can prevent another configuration layer from overriding it.
- Before writing, confirm the resolved root, canonical `origin`, branch/HEAD, worktree/submodule relationship, contract identity, and permitted write area. Never write outside the declared repository/workspace scope. Treat `.aws/`, `Promps/`, `.env*`, private local evidence, generated output, and private configuration as restricted unless a task explicitly authorizes their use; sanitized evidence may be written only under the declared evidence paths. Never copy private contents into tracked artifacts.
- Re-run preflight and rebind all repository context when the working directory, Git root, remote, worktree, submodule, or target repository changes. Do not reuse identity or path conclusions from a prior repository.
- Configuration shadowing is a preflight concern: inspect only applicable agent/harness instruction locations and report which runtime was actually active. A documented rule is not proof of hook or broker enforcement.
- Report enforcement accurately: `DOCUMENT_ONLY` means prose guidance; `VALIDATOR_AVAILABLE` means the contract or write-path checker is callable; `HOOK_ENFORCED` and `BROKER_ENFORCED` require evidence that the corresponding mechanism actually blocks writes; `TOOL_GAP` identifies a missing enforcement capability; `NOT_VERIFIED` means the host/runtime could not be audited. The validator currently provides `VALIDATOR_AVAILABLE`; write blocking remains `TOOL_GAP`, and no hook or broker enforcement is claimed.

---

## 2. Source of Truth

1. Repository files (git status, real file content)
2. Git history (`git log`)
3. Real shell/tool output — never simulated
4. GitHub Issues, Pull Requests, Releases (via `gh` CLI)
5. Local CI gate output (tests, lint, build)
6. Evidence files and audit logs
7. README / docs (tracked files only)

---

## 3. Local-CI-First Policy

GitHub Actions runs on every push to `main` and currently passes there. The
earlier **`REMOTE_CI_INFRA_BLOCKED`** classification (Issue #154, now closed)
no longer matches the observed behavior.

- Do NOT trigger GitHub Actions re-runs without explicit owner approval.
- Do NOT treat remote CI failures as code errors.
- Local CI gates remain required before merge; remote CI is an additional
  signal, not a replacement for them.

### Required Local Gates (Pre-Commit / Pre-Merge)

| Gate             | Command                                                 |
| ---------------- | ------------------------------------------------------- |
| Frontend tests   | `pnpm test`                                             |
| Frontend lint    | `pnpm lint`                                             |
| TypeScript check | `pnpm exec tsc --noEmit`                                |
| Whitespace check | `git diff --check`                                      |
| Rust tests       | `cargo test --workspace`                                |
| Rust format      | `cargo fmt --check --all`                               |
| Rust clippy      | `cargo clippy --workspace --all-targets -- -D warnings` |
| Build            | `pnpm build`                                            |

---

## 4. Absolute Verbote (Absolute Prohibitions)

- **Keine Fake-Execution:** A bash/PowerShell code-block is not execution. "I'll run…" without real tool output is invalid.
- **Keine Fake-PASS:** A test without output/exit-code is never PASS.
- **Keine Pseudo-Toolcalls:** No simulated tool outputs.
- **Keine stillen riskanten Änderungen:** Document everything.
- **Keine Auto-Merges:** Never merge without Human Approval.
- **Keine Secrets:** Never read `.env` files, never log credentials or tokens.
- **Keine globale Agenten-Konfiguration überschreiben.**
- **Kein `--yolo`, `/yolo`, `--oneshot/-z`, `--accept-hooks` ohne Approval.**
- **Kein `--ignore-rules`, `--ignore-user-config` oder `--safe-mode` für normale Schreibläufe.**
- **Kein `/background`/`/bg`/`/btw` ohne Approval.**
- **Keine `cron`-/Automation-Läufe ohne Approval.**
- **Snapshot-/Checkpoint-Restore nur mit expliziter Freigabe.**

---

## 5. Workflow für Änderungen

```
Issue -> Spec -> Verification Contract -> Red Tests -> Agent-Code
-> Local CI/Security Gates -> Sandbox Preview -> Reviewer-Agent
-> Human Approval -> Evidence-Kommentar -> Merge
```

### Merge First (permanent)

Before starting an unrelated implementation branch, inspect the current local
and remote integration queue, including open PRs, active branches, and pending
review or validation work. Finish the existing work first: obtain the required
independent review, address findings, run its required gates, and merge only
after the applicable human approval. If existing work cannot or should not be
merged, record an explicit disposition (for example blocked, superseded,
archived, or intentionally abandoned) with its reason and evidence before
starting unrelated work. Keep this rule in force for every subsequent task.

This rule does not authorize automatic merges, self-review, bypassing branch
protection, or skipping human approval; the review and approval requirements in
§§4, 7, and 9 continue to apply.

---

## 6. Evidence-Format

Every relevant action must be documented:

```text
COMMAND_ID: <sequential number>
CWD: <working directory>
COMMAND: <exact command>
EXIT_CODE: <0 or other>
STDOUT_SUMMARY: <relevant output>
STDERR_SUMMARY: <relevant error output>
EVIDENCE_STATUS: PASS / FAIL / NOT_RUN / MISSING / BLOCKED
```

---

## 7. Human-Approval-Regel (Human Approval Rule)

**Erlaubt ohne Approval:**

- README/docs (tracked) aktualisieren
- Evidence-Dateien erstellen
- Agentenregeln dokumentieren
- Issue-Entwürfe vorbereiten
- Sichere Tests ausführen
- Git status, log, diff (read-only)

**Nicht erlaubt ohne Approval:**

- Produktiven Code großflächig umbauen
- Architektur wechseln
- Neue externe Dependencies hinzufügen
- CI-/Security-Gates abschwächen
- Tests löschen
- Force-pushen, mergen, releasen
- Repository-Settings ändern
- GitHub Actions re-runs triggern
- Billing-/Spending-Limit-Einstellungen ändern
- Branch Protection ändern

---

## 8. Scope Discipline

- Use small, reviewable PRs.
- Do NOT mix feature/code work with docs-backlog cleanup.
- Do NOT commit untracked files blindly — every file must be intentional.
- Do NOT commit `.playwright-mcp/` artifacts.
- Keep docs backlog separate from feature/code PRs.
- **Review packages:** build them only with `scripts/create-review-package.mjs`
  (`pnpm review:package`). It packages **tracked repository state only**; every
  untracked path is excluded by construction, and restricted roots
  (`Promps/`, `.aws/`, `.env*`, key/credential files, caches) are excluded even
  when tracked. Never `tar`/`zip`/copy the working directory, and never treat
  "it is inside the repository" as permission to package a file.
  `UNTRACKED != SAFE`. See `docs/audits/reviews/README.md`.

---

## 9. Git / PR Rules

- No auto-merge.
- No force-merge.
- No branch-protection bypass.
- Merge only with explicit Human Approval and green local gates.
- No untracked docs mass-commit without per-file owner review.

---

## 10. Agent Delegation (OpenCode)

OpenCode subagents available in this repository:

| Agent                 | Purpose                                         |
| --------------------- | ----------------------------------------------- |
| `review-agent`        | Code quality, security surface review           |
| `research-agent`      | External docs, CVE lookups, dependency research |
| `compliance-agent`    | DSGVO/legal audits                              |
| `migration-agent`     | Database migration validation                   |
| `playwright-agent`    | Visual QA, screenshot comparison                |
| `architecture-agent`  | ADR creation, coupling analysis                 |
| `security-agent`      | Vulnerability research, PoC reproduction        |
| `documentation-agent` | Docs, changelog, README updates                 |

Delegate to these agents for specialized work. The orchestrator (`issue-orchestrator`) coordinates but never implements code directly.

---

## 11. Host-Umgebung (Host Environment)

`CURRENT_HOST = DISCOVER_AT_RUNTIME` — see §1. The host is whatever the §1
preflight reports; nothing here is a fixed claim about the current machine.

Compatibility profiles (examples of what a preflight may report, **not** fixed
facts):

- **Windows 10 + PowerShell 5.1** (git-bash available) — supported profile.
- **Linux (e.g. Linux Mint / Ubuntu) + bash** — supported profile.

Shared toolchain, verified at every preflight rather than pinned here: `git`,
Node.js + `pnpm`, Rust + `cargo`, Docker + Compose when deployment is involved.
Tool versions move — read them from the preflight and never quote a remembered
version as current.

---

## 12. Review-Evidence (durable)

Independent review must be durable evidence, not only prose in a commit message
or PR body. For each reviewed PR:

- Record the **exact reviewed commit SHA**, the review type, the reviewer role,
  the verdict and the findings in `docs/audits/reviews/REVIEW-<pr>-<sha>.json`,
  and validate it with `pnpm review:evidence`. Format:
  `docs/audits/reviews/README.md`.
- Post the independent review as a PR comment quoting that same SHA.

Keep the classes distinct; never conflate them:

| Class | Meaning |
| --- | --- |
| `CI_VALIDATION` | Automated gates (local + GitHub Actions). |
| `AGENT_INDEPENDENT_REVIEW` | An independent reviewer agent inspected the exact HEAD. **Not a human approval.** |
| `HUMAN_APPROVAL` | The owner approved the merge (§7). |

Enforcement is documented, not server-side: GitHub branch protection cannot
require an agent-review artifact (`DOCUMENT_ONLY`); the record format has a
`VALIDATOR_AVAILABLE`. Do not claim server-side enforcement that does not exist.

---

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (via `gh` CLI). Governance and merge
intent: `docs/GOVERNANCE.md`. Pull-request expectations:
`.github/pull_request_template.md`.

### Domain docs

Context: `docs/ARCHITECTURE.md` (system overview) and `docs/GOVERNANCE.md`
(rules). ADRs at `.opencode/spec/adr/` (project convention). There is no
`CONTEXT.md` at the repo root.

### Engineering skills

Project-local skills in `.agents/skills/` (shared by Hermes/OpenCode/Codex/Cursor), installed from `mattpocock/skills` at pinned commit (see `skills-lock.json`):

- `domain-modeling`, `to-spec`, `to-tickets`, `tdd`, `implement`, `code-review`, `handoff`, `setup-matt-pocock-skills`
- Orchestrator: `question-firewall-vertical-slices` — resolve project context before asking, persist decisions, escalate only genuine blockers, structure work as observable vertical slices.
