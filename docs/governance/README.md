# Repository governance artifacts

Machine-applicable governance configuration, kept next to the policy it
encodes so a change is reviewable in a PR before it is applied in GitHub.

## `main-protection-ruleset.json` — PROPOSED, NOT YET APPLIED

> **Status: `READY_FOR_OWNER_ADMIN_APPROVAL`.**
> Applying a ruleset is an administrative mutation of the GitHub repository
> (`AGENTS.md` §7: branch-protection changes require approval). This file
> prepares the exact payload; it does **not** prove protection exists.

### Observed state before this change

Read live on 2026-10-10 (evidence, not assumption):

- `GET /repos/Mueller-Systems-Lab/promptvault-lite/branches/main/protection`
  → HTTP 404 `Branch not protected`
- `GET /repos/Mueller-Systems-Lab/promptvault-lite/rulesets` → `[]`

So `main` was **unprotected**, with no repository ruleset.

### What the proposal does

| Rule | Intent |
| --- | --- |
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | No force-push. |
| `pull_request` | Changes land via PR. Approval count is `0` because this is a single-owner repository — requiring ≥1 approval would deadlock every merge. Review-thread resolution is on. |
| `required_status_checks` | The CI gates below must be green. `strict` is off (the branch need not be up to date with `main` immediately before merge). |
| `bypass_actors` | The repository-admin role keeps `bypass_mode: always`, i.e. intentional owner emergency access. Remove this entry if the owner does not want any bypass. |

Deliberately **not** enabled: signed commits, linear-history enforcement,
merge-method restrictions, code-owner review. They are available toggles but
not part of the repository's observed workflow.

### Required checks — and why exactly these

The 14 entries are the CI job names observed green on `main` at
`68fa663b08021cfc5ccfab631417fe7cbc5e615f` (`.github/workflows/ci.yml`). Every
one of them runs on `pull_request`, so none can deadlock a merge.

**Excluded on purpose** (they never run on PRs — requiring them would block every
merge forever):

- `Release (Linux)` / `Build & verify Linux release set` — `release.yml`, tag
  push `v*` only.
- `Publish to PyPI` — `publish-pypi.yml`, `workflow_dispatch` only.
- `Deploy static content to GitHub Pages` — `pages.yml`, push to `main` only.

**Maintenance note:** required checks are matched by job *name*. Renaming a CI
job silently breaks every merge until this list is updated. Update this file in
the same PR that renames a job.

### Apply (owner only)

```bash
gh api --method POST \
  repos/Mueller-Systems-Lab/promptvault-lite/rulesets \
  --input docs/governance/main-protection-ruleset.json
```

### Read back and verify (independent of the apply)

```bash
gh api repos/Mueller-Systems-Lab/promptvault-lite/rulesets \
  --jq '.[] | {id,name,enforcement,target}'
gh api repos/Mueller-Systems-Lab/promptvault-lite/rulesets/<id> \
  --jq '.rules[] | .type'
```

Do not claim protection exists until the read-back returns the ruleset with
`enforcement: "active"`.
