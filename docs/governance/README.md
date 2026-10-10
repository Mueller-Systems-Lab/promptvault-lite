# Repository governance artifacts

Machine-applicable governance configuration, kept next to the policy it
encodes so a change is reviewable in a PR before it is applied in GitHub.

## `main-protection-ruleset.json`

> **Status: corrected and prepared for application.** The payload is validated
> and intended to be created on `main` via the documented `gh api` call. Do not
> claim protection exists until the API read-back returns the ruleset with
> `enforcement: "active"` (see *Read back and verify*).

### Correction history

The first committed version of this file carried two choices that do **not**
match the repository's governance and must not be activated as-is:

1. `bypass_actors` granted an unconditional `bypass_mode: "always"` to the
   repository-admin role. `AGENTS.md` §9 forbids branch-protection bypass, so a
   permanent admin bypass is not an acceptable default. It is **removed**
   (`bypass_actors: []`).
2. `required_approving_review_count: 0` was described as if it enforced review.
   It does not. `0` is a *technical necessity* here, not review enforcement —
   see the next section.

### Review enforcement: `REVIEW_ENFORCEMENT_TOOL_GAP`

Owner policy is *no unreviewed merge*. GitHub cannot enforce that for this
repository today:

- The `Mueller-Systems-Lab` organization has exactly **one** member
  (`xxammaxx`), **no teams**, and **no pending invitations** — verified live on
  2026-10-10. There is no distinct, eligible GitHub identity that could approve.
- GitHub does not let a PR author approve their own pull request.

Setting `required_approving_review_count: 1` would therefore put `main` in a
**permanent deadlock**: every PR — including this repository's own governance
PRs — could never be merged.

`required_approving_review_count` is consequently `0`. **This is not review
enforcement and must never be described as such.** The independent-review rule
continues to be enforced as a *process* gate through the durable evidence in
`docs/audits/reviews/` (`AGENT_INDEPENDENT_REVIEW`), which is **not** a native
GitHub approval. The distinction is mandatory:

```
AGENT_INDEPENDENT_REVIEW  !=  HUMAN_GITHUB_APPROVAL
```

If a second eligible reviewer is ever added to the organization, raise
`required_approving_review_count` to `1` and re-evaluate
`dismiss_stale_reviews_on_push` / `require_last_push_approval` in the same
change.

### What the ruleset enforces

| Rule | Intent |
| --- | --- |
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | No force-push. |
| `pull_request` | Changes land via a pull request; review conversations must be resolved. Approval count is `0` (see the tool-gap note above) — **not** review enforcement. |
| `required_status_checks` | The CI gates below must be green. `strict` is **off**: this repository merges short-lived PRs promptly and does not require rebasing every PR onto the newest `main` first; turning it on would add merge churn without changing what runs. |
| `bypass_actors` | **`[]`** — no bypass. No actor may push to or merge into `main` outside the rules. |

Deliberately **not** enabled: signed commits, linear-history enforcement,
merge-method restrictions, code-owner review. They are available toggles but not
part of the repository's observed workflow.

### Required checks — and why exactly these

The 14 entries are the CI job names in `.github/workflows/ci.yml`. Every one of
them runs on `pull_request`, so none can deadlock a merge.

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
  --jq '{rules: [.rules[].type], bypass: .bypass_actors}'
```

Do not claim protection exists until the read-back returns the ruleset with
`enforcement: "active"` and `bypass_actors: []`.
