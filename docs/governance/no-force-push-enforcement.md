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
| A | `AGENTS.md` §4, this document | Policy, on paper | Documented |
| B | `.zcode/config.json` → `scripts/governance/force-push-hook.mjs` | **Command intent**: a `Bash` tool call whose command carries force intent is blocked before Git runs | Unit-tested lexical guard; hook activation is per-session (see below) |
| C | `.githooks/pre-push` | **Local effect**: the forced updates Git is otherwise willing to send (`--force`, `-f`, `--force-with-lease`, `+refspec`) are rejected | Synthetic git fixture tests: new branch / fast-forward / plain rewrite / reset-backwards / `+refspec` / `--force-with-lease` / `--force` / deletion / mutation probe |
| D | GitHub ruleset `all-branches-no-force-push` | **Server-side effect**: GitHub refuses a non-fast-forward update on any branch | Ruleset active, read back via API; negative proof on a disposable branch |

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

## Audit record — prior deviation

During the v1.13.3 release preparation one `git push --force-with-lease` was used
on a mission-owned release branch to replace an invalid review-evidence commit.

- Impact: no rewrite of `main`, no protection bypass, no invalidated release.
  The published `v1.13.3` remains valid.
- Corrective action: the enforcement layers above were added so the rule no
  longer depends on instructions alone.

The historical record was not rewritten; this entry is additive.
