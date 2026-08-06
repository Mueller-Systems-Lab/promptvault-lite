# AGENTS.md — PromptVault Lite Agent Rules

> Target Agent/Runtime: OpenCode Agent (issue-orchestrator mode) as primary; subagents for specialized work.
> This file is the single source of truth for all AI agents working in this repository.

---

## 1. Runtime & Shell Compatibility

This repository is developed on **Windows 10 (10.0.19045)**. Agents MUST:

- Detect the OS and shell before executing commands.
- On Windows: prefer PowerShell 5.1 compatible syntax.
- Do NOT blindly assume Linux/bash or macOS/zsh when running on Windows.
- Do NOT mix shell syntax across platforms without validation.

When in doubt, run a preflight:

```powershell
Get-Location; $PSVersionTable.PSVersion; git --version; node --version; pnpm --version
```

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

GitHub Actions / Remote-CI is currently **`REMOTE_CI_INFRA_BLOCKED`** (see Issue #154).

- Do NOT trigger GitHub Actions re-runs without explicit owner approval.
- Do NOT treat remote CI failures as code errors.
- Local CI is the technical quality gate until Remote-CI is restored or intentionally re-enabled.

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

- **Host:** Windows 10 (10.0.19045)
- **Shell:** PowerShell 5.1 (primary); git-bash available for compatibility
- **Package Manager:** pnpm (Node.js), cargo (Rust)
- **Git:** 2.47.0+
- **OpenCode:** 1.15.0

---

## Agent skills

### Issue tracker

Issues and specs live as GitHub issues (via `gh` CLI). See `docs/agents/issue-tracker.md`.

### Domain docs

Single-context: `CONTEXT.md` at repo root; ADRs at `.opencode/spec/adr/` (project convention). See `docs/agents/domain.md`.

### Engineering skills

Project-local skills in `.agents/skills/` (shared by Hermes/OpenCode/Codex/Cursor), installed from `mattpocock/skills` at pinned commit (see `skills-lock.json`):

- `domain-modeling`, `to-spec`, `to-tickets`, `tdd`, `implement`, `code-review`, `handoff`, `setup-matt-pocock-skills`
- Orchestrator: `question-firewall-vertical-slices` — resolve project context before asking, persist decisions, escalate only genuine blockers, structure work as observable vertical slices.
