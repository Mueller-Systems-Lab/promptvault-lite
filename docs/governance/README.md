# Repository governance artifacts

Machine-applicable governance configuration, kept next to the policy it
encodes so a change is reviewable in a PR before it is applied in GitHub.

## `main-protection-ruleset.json`

> **Status: APPLIED** — ruleset `main-protection` (id `24841719`) is active on
> `main`; `branches/main.protected == true` and `bypass_actors == []` were
> confirmed by API read-back on 2026-10-10. The payload below is the tracked
> source of truth for every *deliberate* settings choice; rule parameters GitHub
> materialises from its own defaults are noted where they matter.

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

### `require_extra_approval_for_unattributed_changes: false` (explicit)

GitHub defaults this rule parameter to `true`. "Unattributed" here has a precise
meaning: a commit whose **author email is not linked to a GitHub account**, so the
API reports `author == null` for it. That covers commits made with an app token
*and* commits authored under a local identity that was never linked to GitHub —
both are the same case to the rule.

In this repository the default `true` can only ever **block**, never
**protect**. The "extra approval" it demands must come from a second eligible
approver, and none exists (single-member organization, see above) — so any pull
request whose range contains an unattributed commit becomes **permanently
unmergeable**.

**This is not hypothetical, and it is why the parameter is pinned to `false`:**

- `git log origin/main --format='%an <%ae>'` → **47 of 319 commits** on `main`
  are authored by `Issue Orchestrator <orchestrator@promptvault.dev>`, an
  identity that is **not linked to any GitHub account** (`author == null` in the
  API). An orchestration-authored commit in a future PR range would deadlock that
  PR under the default.
- Independently: `grep -rnE "git (commit|push)" .github/workflows/` returns
  nothing and there is no Dependabot/Renovate configuration, so no *workflow*
  produces unattributed commits.
- One GitHub App *is* installed org-wide and holds `contents: write`; it has
  produced no commits or PRs to date.

So the default protects nothing achievable here and closes no path that is not
already closed, while it would block a real, already-present commit provenance.
Pinning it to `false` closes that deadlock class. This is the **only** rule
parameter the repository deliberately relaxes away from a GitHub default, and it
is recorded here for that reason.

> **Correction history (review findings).** An earlier revision of this section
> claimed "no bot … exists"; that was wrong — an app is installed (see above). A
> second revision then claimed "no commit or pull request is authored by a bot or
> an unattributed identity"; that was *also* wrong, and in the more important
> direction: 47 unattributed commits are already on `main` (see above). Both
> corrections are recorded rather than silently rewritten, because the second one
> is precisely the evidence that justifies the `false` setting.

### What the ruleset enforces

| Rule | Intent |
| --- | --- |
| `deletion` | `main` cannot be deleted. |
| `non_fast_forward` | No force-push. |
| `pull_request` | Changes land via a pull request; review conversations must be resolved. Approval count is `0` (see the tool-gap note above) — **not** review enforcement. `require_extra_approval_for_unattributed_changes` is pinned to `false` (see below). |
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
