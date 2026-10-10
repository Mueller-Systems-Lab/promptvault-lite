# Governance

PromptVault Lite uses a small human-controlled governance workflow.

## Source of Truth

GitHub issues, pull requests, commits, and local CI gates are the source of truth.
For AI agent runs, `AGENTS.md` is the operative rule file and takes precedence over this document.
This document (`GOVERNANCE.md`) is the human-readable explanation of governance intent.

## Pull Requests

Every PR must include scope, verification, evidence, and human approval.

Use the [pull request template](.github/pull_request_template.md) when opening a PR.

## The `main` branch

`main` is the canonical integration branch. The intended server-side policy is:

- changes land via pull request (no direct pushes);
- no force-push and no branch deletion;
- the CI gates must pass before merge;
- review conversations must be resolved.

Status of that policy is tracked honestly, not assumed:

| Aspect | State |
| --- | --- |
| Protection/ruleset on `main` | **applied** — ruleset `main-protection` (id `24841719`) is active; `branches/main.protected == true` and `bypass_actors == []` confirmed by API read-back. Tracked source of truth: [`docs/governance/main-protection-ruleset.json`](governance/main-protection-ruleset.json), rationale in [`docs/governance/README.md`](governance/README.md). |
| Server-side review requirement (PR approval) | `REVIEW_ENFORCEMENT_TOOL_GAP` — the organization has a single member, so `required_approving_review_count` is `0`; GitHub cannot enforce a second approval without permanently deadlocking merges. **Not** review enforcement. |
| Branch-protection bypass | **none** — `bypass_actors: []`; `current_user_can_bypass == "never"`; no actor may bypass the rules (`AGENTS.md` §9). |
| Human approval before merge | process rule (`AGENTS.md` §7) — `DOCUMENT_ONLY`, not server-enforced |
| Independent review artifact | recorded under `docs/audits/reviews/` — `DOCUMENT_ONLY`, validator available; **not** a native GitHub approval |

A required CI check must be a check that actually runs on pull requests. Do not
require release-, tag- or Pages-only jobs, which would deadlock merges.

## Review evidence

Independent reviews are persisted as machine-readable records under
`docs/audits/reviews/`. See that directory's `README.md` for the format and for
the explicit separation of `CI_VALIDATION`, `AGENT_INDEPENDENT_REVIEW` and
`HUMAN_APPROVAL`. An agent review is never a human approval.

## Agent Rules

`AGENTS.md` is intentionally committed in this repository and is the operative OpenCode agent rule file.
It defines mandatory workflows, delegation rules, and hard constraints for all AI agents working in this repo.
When there is a conflict between this document and `AGENTS.md`, **AGENTS.md wins for agent execution**.

## Not Allowed in the Product Repository

- Ad-hoc local agent configuration, personal prompts, and scratch policy files not related to the project
- Generated scratch files
- Secrets or credentials
- Unrelated documentation dumps
- Native binaries or release artifacts in source control

## Merge Rule

No merge without green local CI and human approval.
