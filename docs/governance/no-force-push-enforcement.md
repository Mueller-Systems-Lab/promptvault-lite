# No force push — enforcement layers

`AGENTS.md` §4 already forbids force pushing. This document records **which
layers enforce it technically**, what each layer does and does not prove, and
how to apply the server-side rule.

## Scope

Any branch, any actor, any remote in this repository:

- default branch `main`
- feature / fix / chore branches
- release branches
- temporary mission branches

Rewriting published history is not permitted on any of them. Adding a correction
commit is the supported way to fix a mistake.

## Layers

| Layer | Mechanism | What it enforces | Verified how |
| --- | --- | --- | --- |
| A | `AGENTS.md` §9, this document | Policy, on paper | Documented |
| B | `.zcode/config.json` → `scripts/governance/force-push-hook.mjs` | **Command intent**: a `Bash` tool call whose command carries force intent is blocked before Git runs | 53 unit cases; hook activation is per-session (see below) |
| C | `.githooks/pre-push` | **Local effect**: the forced updates Git is otherwise willing to send (`--force`, `-f`, `--force-with-lease`, `+refspec`) are rejected | 9 synthetic git fixture cases + mutation probe; **requires activation** (below) |
| D | GitHub ruleset `all-branches-no-force-push` (id `24865972`) | **Server-side effect**: GitHub refuses a non-fast-forward update on any branch | Read back via API; live negative proof (below) |

## What each layer does NOT enforce

These are different contracts. Do not let one stand in for another.

- **`non_fast_forward` (Layer D) prevents the *effect*** — a history rewrite
  reaching the remote. It does **not** prove an agent never typed `--force`.
  A force push that happens to be a fast-forward (or that targets a branch the
  actor has no write access to) is not evidence either way.
- **`.githooks/pre-push` (Layer C) sees the resulting ref update, not the CLI
  flags.** It proves "a forced local non-fast-forward push is rejected". It
  cannot prove that `--force-with-lease` was never invoked.

  Measured Git behaviour worth knowing, because it bounds the claim: Git refuses
  a **plain** non-fast-forward push itself and does **not** hand that ref to the
  pre-push hook at all — the hook receives no line for it. Git does hand the hook
  every update it is otherwise willing to send, which is exactly the forced set
  (`--force`, `-f`, `--force-with-lease`, `+refspec`). So the plain-rewrite cases
  are rejected by Git, and the forced cases are rejected by this hook. The tests
  assert accordingly: forced cases must carry the hook's marker, plain cases must
  merely be rejected.
- **The command guard (Layer B) sees flags, not effects.** It blocks force
  *intent* even when the proposed update would be a fast-forward. It only covers
  tool calls routed through the agent runtime; a human running `git` directly in
  a shell is outside its reach. That case is covered by Layers C and D.

  Within its reach it covers the forms a person or an agent plausibly types:
  `--force`, `-f` (including short clusters such as `-uf`),
  `--force-with-lease[=ref]`, `--force-if-includes`, forced `+refspec`,
  unambiguous long-option abbreviations (`--force-w`), unquoted backslash
  escapes, shell wrapper words (`command`, `env`, `nohup`, …), `sh -c '…'`,
  command substitution and backticks, and `--no-verify` on a push. A push
  argument that would need the shell to be evaluated (`git push $(…)` or
  `git push $FLAG`) is **rejected rather than guessed at** — write the resolved
  form.

  It cannot defeat arbitrary runtime indirection where the flag is assembled
  somewhere the guard never sees, and it never sees a human's own shell. Those
  are what Layers C and D are for.

Neither B nor C nor D alone is sufficient; they are layered deliberately.

## Layer B activation (important, and honestly limited)

ZCode workspace hooks are read from `<repo>/.zcode/config.json` and, like every
configuration-file hook, only run when `hooks.enabled` is `true` — which this
file sets. Hooks load **when a session starts**. A session that was already
running when the file was added will not pick it up; the guard becomes live for
the next session started in this workspace.

Check the actual state of any checkout with:

```bash
node scripts/governance/check-hook-activation.mjs
```

It reports `LOCAL_CLONE_HOOK_ACTIVE`, `TRACKED_HOOK_AVAILABLE` or
`HOOK_NOT_ACTIVE` — never a guess.

Activate the Git hook in a fresh clone:

```bash
git config core.hooksPath .githooks
```

## Layer D — applying the server ruleset

The intended configuration is tracked verbatim at
`docs/governance/all-branches-no-force-push-ruleset.json`:

```json
{
  "name": "all-branches-no-force-push",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~ALL"], "exclude": [] } },
  "rules": [{ "type": "non_fast_forward" }]
}
```

Apply it with:

```bash
gh api -X POST repos/Mueller-Systems-Lab/promptvault-lite/rulesets \
  --input docs/governance/all-branches-no-force-push-ruleset.json
```

Design notes:

- `~ALL` covers every branch, including `main`. Overlap with the existing
  `main-protection` ruleset is intentional and additive: GitHub evaluates all
  applicable rulesets, and `main-protection` additionally carries PR, status
  check and deletion rules.
- `bypass_actors` is empty on purpose. There is no admin/app/role bypass.
- The ruleset contains **only** `non_fast_forward`. In particular it does **not**
  add `deletion`, so mission/feature branches remain deletable through the normal
  owner-approved cleanup workflow. `main` keeps its deletion protection from
  `main-protection`.

### Layer D — verified state

Read back from the API after creation (`gh api repos/…/rulesets/24865972`):

```json
{
  "id": 24865972,
  "name": "all-branches-no-force-push",
  "target": "branch",
  "enforcement": "active",
  "bypass_actors": [],
  "conditions": { "ref_name": { "include": ["~ALL"], "exclude": [] } },
  "rules": [{ "type": "non_fast_forward" }]
}
```

`main-protection` (id `24841719`) is unchanged: `deletion`, `non_fast_forward`,
`pull_request`, `required_status_checks`, no bypass. Exactly two rulesets exist.

Live negative proof on a throwaway branch (`no-force-push-probe`, created from
`main` in a clone with **no** `core.hooksPath`, so only the server rule could
act — the branch was deleted afterwards):

| attempt | result |
| --- | --- |
| create the branch (new ref) | accepted |
| ordinary second commit (fast-forward) | accepted |
| `git push --force` after rewinding | **rejected** — `GH013 … Cannot force-push to this branch` |
| `git push origin +refs/heads/…:refs/heads/…` | **rejected** — `GH013 … Repository rule violations` |
| `git push --force-with-lease` | **rejected** — `GH013 … Repository rule violations` |
| `git push --delete` the probe branch | accepted (deletion is not blocked) |

So the server-side rule is not merely configured; it was observed refusing the
effect on a real branch, while still allowing branch creation and deletion.

## Audit record — prior deviation

During the v1.13.3 release preparation one `git push --force-with-lease` was used
on a mission-owned release branch to replace an invalid review-evidence commit.

- Impact: no rewrite of `main`, no protection bypass, no invalidated release.
  The published `v1.13.3` remains valid.
- Corrective action: the enforcement layers above were added so the rule no
  longer depends on instructions alone.

The historical record was not rewritten; this entry is additive.
