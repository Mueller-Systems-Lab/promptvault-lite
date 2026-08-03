# Autonomous Test Harness — Verification Contract

> Version 1.0.0 | Candidate SHA: `6aa9e8f` | Run ID: `PVL-AUTONOMOUS-TEST-HARNESS-20260803-002`

## 1. Purpose

This contract defines the gate names, commands, status model, evidence schema, and independent verifier rules for the permanent autonomous test harness (`scripts/verify-all.mjs`). It derives all gates from the live project configuration, not from any prior run card or memory.

## 2. Gate Matrix

### Quick Gate (`pnpm verify:quick`)

| Gate ID | Name | Command | Mandatory |
|---------|------|---------|-----------|
| Q1 | Repo Hygiene | `git diff --check` | Yes |
| Q2 | ESLint | `pnpm lint` | Yes |
| Q3 | TypeScript | `pnpm exec tsc --noEmit` | Yes |
| Q4 | Vitest (Short) | `pnpm test` | Yes |
| Q5 | Version Consistency | Cross-check package.json, Cargo.toml, tauri.conf.json | Yes |
| Q6 | Feature Flags | Check DIRECTION_PROFILES, MISSING_INFO_GATE, EMBEDDINGS defaults | Yes |

### Full Gate (`pnpm verify:all`)

| Gate ID | Name | Command | Mandatory |
|---------|------|---------|-----------|
| E1 | Repo Hygiene | `git diff --check` + `git status --short` | Yes |
| E2 | Deps Integrity | `pnpm install --frozen-lockfile` | Yes |
| E3 | Frontend Tests (Vitest) | `pnpm test` | Yes |
| E4 | ESLint | `pnpm lint` | Yes |
| E5 | TypeScript | `pnpm exec tsc --noEmit` | Yes |
| E6 | Frontend Build | `pnpm build` | Yes |
| E7 | Rust Format | `cargo fmt --check --all` (workspace) | Yes |
| E8 | Rust Tests | `cargo test --workspace` | Yes |
| E9 | Rust Clippy | `cargo clippy --workspace --all-targets -- -D warnings` | Yes |
| E10 | Secret Scan | CI pattern scan (see `.github/workflows/ci.yml` secret-scan job) | Yes |
| E11 | Playwright E2E | `pnpm exec playwright test` | Yes (core: app-shell smoke) |
| E12 | Version Consistency | Cross-check all version fields | Yes |
| E13 | Lockfile Drift | Check `pnpm-lock.yaml` against tracked state | Yes |
| E14 | Feature Flags | Verify all flags default to disabled | Yes |
| E15 | Visual Evidence | Playwright visual-release-gate (structural, no baselines) | Optional |

### Independent Verifier Gate

Same as Full Gate, executed on a fresh clone/worktree at the identical target SHA.

## 3. Status Model

### Gate-Level Status

```
PASS
RED_PRODUCT_FAILURE
RED_TEST_FAILURE
RED_INFRASTRUCTURE_FAILURE
AMBER_FLAKY_TEST
AMBER_ORDER_OR_STATE_LEAK
AMBER_ENVIRONMENT_DRIFT
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
YELLOW_VISUAL_BASELINE_MISSING
YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY
```

### Run-Level Classification

```
GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
GREEN_ALREADY_SATISFIED_NO_CHANGE
AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM
AMBER_ARCHITECTURAL_EROSION
AMBER_PRIMARY_VERIFIER_DIVERGENCE
AMBER_SKILL_UPSTREAM_DRIFT_REVIEW_REQUIRED
RED_TEST_INFRASTRUCTURE_FAILURE
RED_REPRODUCIBLE_PRODUCT_FAILURE
```

## 4. Evidence Schema

### Path

```
evidence/autonomous-test/<RUN_ID>/
```

`RUN_ID` format: `PVL-AUTONOMOUS-TEST-HARNESS-YYYYMMDD-NNN`

### Structure

```
00-context-manifest.json     — OS, tool versions, SHA, branch
01-test-inventory.json       — Resolved gate list from live config
02-skill-state.json          — Skill inventory and hash audit
03-primary-summary.json      — Primary run gate results (structured)
04-primary-logs/             — Per-gate stdout/stderr (one file per gate)
05-playwright-report/        — Playwright JSON output (if E2E executed)
06-independent-summary.json  — Independent verifier results
07-primary-verifier-delta.json — Comparison between primary and verifier
FINAL-REPORT.md              — Human-readable summary
```

### Gate Entry Shape

```json
{
  "gate": "E3-frontend-tests",
  "command": "pnpm test",
  "runner": "primary",
  "tested_git_sha": "6aa9e8f76b871df7ad75510994faae82f097ff2b",
  "started_at": "2026-08-03T12:00:00Z",
  "ended_at": "2026-08-03T12:01:00Z",
  "duration_ms": 60000,
  "exit_code": 0,
  "passed": 1460,
  "failed": 0,
  "skipped": 0,
  "stdout_log": "04-primary-logs/E3-stdout.txt",
  "stderr_log": "04-primary-logs/E3-stderr.txt",
  "stdout_sha256": "sha256...",
  "stderr_sha256": "sha256...",
  "classification": "PASS"
}
```

## 5. Independent Verifier Contract

1. Freeze target SHA before starting.
2. Fresh clone into `.worktrees/verifier-<TIMESTAMP>/` or `~/tmp/pvl-verifier-<TIMESTAMP>/`.
3. `git rev-parse HEAD` must exactly match target SHA — abort on mismatch.
4. No inherited `dist/`, `target/`, Playwright outputs, or test reports.
5. Run `pnpm install --frozen-lockfile` after clone.
6. Execute Full Matrix (E1-E15).
7. Produce own evidence under `evidence/autonomous-test/<RUN_ID>/`.
8. Check working tree is clean after all gates.
9. Compare results against primary run.
10. Compare build chunk hashes (Vite `index-XXXX.js`) byte-for-byte.
11. On divergence: classify `AMBER_PRIMARY_VERIFIER_DIVERGENCE`.

## 6. Flakiness Rules

On test failure:
1. Save first complete failure log.
2. Reproduce test in isolation.
3. Re-run unchanged at least 3 times.
4. Critical E2E tests: 5 times.
5. Compare single-worker vs parallel.
6. Check for ordering effects.
7. Check for shared-state leaks.

A later PASS does not make an earlier FAIL invisible. No automatic retry increases, quarantine, `skip`, `fixme`, or snapshot updates.

## 7. Security Boundaries

### Allowed
- Start local test commands.
- Write local evidence.
- Create temporary directories.
- Create fresh clone/worktree.
- Read-only GitHub metadata queries.

### Prohibited
- Output secrets.
- Log `.env` contents.
- Read SSH keys.
- Display GitHub tokens.
- Search credential stores.
- Push changes.
- Create PRs.
- Delete branches.
- Create tags/releases.
- Modify issues.
- Change feature flags.
- Auto-repair production files.

## 8. Runner Interface

```
node scripts/verify-all.mjs [options]

Options:
  --quick              Quick gate only
  --full               Full gate (default)
  --independent        Independent verifier (fresh clone)
  --gate <name>        Run single named gate (e.g., "E3")
  --evidence-dir <path> Override evidence output path
  --json-summary <path> Write JSON summary to path
  --target-sha <sha>   Pin to specific SHA (required for --independent)
  --no-color           Disable ANSI colors
```

## 9. Package Scripts

```json
{
  "verify:quick": "node scripts/verify-all.mjs --quick",
  "verify:all": "node scripts/verify-all.mjs --full",
  "verify:independent": "node scripts/verify-all.mjs --independent"
}
```

## 10. Gitignore Exception

The `scripts/` directory is currently gitignored (line 52 of `.gitignore`: `scripts/` under "WIP / Isolated Features"). The test harness runner is NOT WIP or isolated — it is a release-scope project function. An exception is applied so `scripts/verify-all.mjs` is tracked while other `scripts/` content remains ignored.
