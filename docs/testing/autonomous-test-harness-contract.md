# Autonomous Test Harness — Verification Contract

> Version 1.1.0 | Candidate SHA: `918b81a` | Branch: `fix/autonomous-test-harness-trust`
> Repaired: 2026-08-03 | Status: GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED

## 1. Purpose

This contract defines the gate names, commands, status model, evidence schema, and independent verifier rules for the permanent autonomous test harness. It derives all gates from the live project configuration in `scripts/lib/gates.mjs`.

## 2. Gate Matrix

### Quick Gate (`pnpm verify:quick`)

| Gate ID | Name | Command | Mandatory |
|---------|------|---------|-----------|
| Q1 | Repo Hygiene | `git diff --check` | Yes |
| Q2 | ESLint | `pnpm lint` | Yes |
| Q3 | TypeScript | `pnpm exec tsc --noEmit` | Yes |
| Q4 | Vitest (Quick) | `pnpm test` | Yes |
| Q5 | Version Consistency | Cross-check package.json, Cargo.toml, tauri.conf.json | Yes |
| Q6 | Feature Flags | Check DIRECTION_PROFILES, MISSING_INFO_GATE, EMBEDDINGS defaults | Yes |

### Full Gate (`pnpm verify:all`)

| Gate ID | Name | Command | Mandatory |
|---------|------|---------|-----------|
| E1 | Repo Hygiene | `git diff --check` | Yes |
| E2 | Deps Integrity | `pnpm install --frozen-lockfile` | Yes |
| E3 | Frontend Tests (Vitest) | `pnpm test` | Yes |
| E4 | ESLint | `pnpm lint` | Yes |
| E5 | TypeScript | `pnpm exec tsc --noEmit` | Yes |
| E6 | Frontend Build | `pnpm build` | Yes |
| E7 | Rust Format | `cargo fmt --check --all` (workspace) | Yes |
| E8 | Rust Tests | `cargo test --workspace --locked` | Yes |
| E9 | Rust Clippy | `cargo clippy --workspace --locked --all-targets -- -D warnings` | Yes |
| E10 | Secret Scan | CI pattern + .env + .db scan | Yes |
| E11 | Playwright E2E | `pnpm exec playwright test` | Yes |
| E12 | Version Consistency | Cross-check all version fields | Yes |
| E13 | Lockfile Drift | Check pnpm-lock.yaml + src-tauri/Cargo.lock | Yes |
| E14 | Feature Flags | Verify all flags default to disabled | Yes |
| E15 | Visual Evidence | Playwright visual-release-gate (structural) | Optional |

### Independent Verifier Gate

Same as Full Gate, executed on a **fresh clone** at the identical target SHA. The verifier:
1. Creates a fresh clone from origin
2. Checks out exact SHA in detached HEAD
3. Runs full matrix independently
4. Compares primary vs verifier results
5. Compares build chunk hashes byte-for-byte
6. Produces AMBER_PRIMARY_VERIFIER_DIVERGENCE on mismatch

## 3. Status Model

### Gate-Level Status

```
PASS
RED_PRODUCT_FAILURE
RED_TEST_FAILURE
RED_INFRASTRUCTURE_FAILURE
AMBER_FLAKY_TEST
AMBER_PRIMARY_VERIFIER_DIVERGENCE
YELLOW_OPTIONAL_HARDWARE_NOT_EXECUTED
YELLOW_VISUAL_BASELINE_MISSING
YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY
```

### Run-Level Classification

```
GREEN_AUTONOMOUS_TEST_HARNESS_PERSISTENT_AND_VALIDATED
GREEN_CORE_GATES_AMBER_OPTIONAL_PLATFORM_OR_HARDWARE_COVERAGE
AMBER_PRIMARY_VERIFIER_DIVERGENCE
AMBER_FLAKY_TESTS_BLOCK_COMPLETION_CLAIM
RED_REPRODUCIBLE_PRODUCT_FAILURE
RED_TEST_INFRASTRUCTURE_FAILURE
```

## 4. Evidence Schema

### Path

```
evidence/autonomous-test/<RUN_ID>/
```

`RUN_ID` format: `PVL-AUTONOMOUS-TEST-HARNESS-YYYYMMDD-NNN-PID-RND`

### Structure

```
00-context-manifest.json       — OS, tool versions, SHA, branch
01-test-inventory.json         — Reserved for future use
02-skill-state.json            — Reserved for future use
03-primary-summary.json        — Primary run gate results (structured)
04-primary-logs/               — Per-gate stdout/stderr (one file per gate)
05-playwright-report/          — Playwright JSON output (if E2E executed)
06-independent-summary.json    — Independent verifier results
07-primary-verifier-delta.json — Comparison between primary and verifier
08-build-hashes-primary.json   — SHA-256 of primary build outputs
09-build-hashes-independent.json — SHA-256 of verifier build outputs
FINAL-REPORT.md                — Human-readable summary
```

## 5. Independent Verifier Contract

1. Freeze target SHA before starting.
2. Read origin URL from live repository (`git config --get remote.origin.url`).
3. Create cryptographically unique temporary directory under `~/tmp/pvl-verifier/`.
4. Fresh clone from origin (`git clone --no-local`).
5. Checkout exact SHA in detached HEAD.
6. `git rev-parse HEAD` must exactly match target SHA — abort on mismatch.
7. No inherited `dist/`, `target/`, Playwright outputs, or test reports.
8. Run `pnpm install --frozen-lockfile`.
9. Execute Full Matrix (E1-E15).
10. Produce own evidence under the same evidence directory.
11. Check working tree is clean after all gates.
12. Compare results against primary run.
13. Compare build chunk hashes (dist/, target/) byte-for-byte via SHA-256.
14. On divergence: classify `AMBER_PRIMARY_VERIFIER_DIVERGENCE`, exit non-zero.
15. Keep clone directory on failure for diagnosis; clean up on success.

## 6. Flakiness Rules

On test failure:
1. Save first complete failure log.
2. Original failure classification is preserved (RED remains RED).
3. A RED that later passes is recorded as YELLOW_TRANSIENT_RUNNER_INVOCATION_ANOMALY.
4. A RED that remains RED preserves the original classification.
5. No automatic retry increases, quarantine, `skip`, `fixme`, or snapshot updates.

## 7. Security Boundaries

### Local Runner
- Pattern scan: AWS keys, GitHub tokens, Stripe keys, private keys
- `.env` file detection in tracked files
- `.db`/`.db-shm`/`.db-wal`/`.db-journal` detection in tracked files
- Secret masking in all output (stdout, stderr, evidence)

### Allowed
- Start local test commands.
- Write local evidence (atomic, same-filesystem temp files).
- Create temporary directories under `~/tmp/`.
- Create fresh clone.
- Read-only Git operations.

### Prohibited
- Output secrets, log `.env` contents, read SSH keys, display tokens.
- Push changes, create PRs, delete branches, create tags/releases.
- Modify issues, change feature flags, auto-repair production files.

## 8. Module Structure

```
scripts/
├── verify-all.mjs          — CLI and orchestration (549 lines)
├── lib/
│   ├── runner.mjs          — Core infrastructure (240 lines)
│   ├── gates.mjs           — Gate definitions and checks (491 lines)
│   └── verifier.mjs        — Independent verifier (394 lines)
└── __tests__/
    ├── runner.test.js      — Runner unit tests (16 tests, 176 lines)
    └── harness-contract.test.js — Contract tests (32 tests, 422 lines)
```

## 9. Runner Interface

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

## 10. Repaired Defects

| ID | Defect | Fix |
|----|--------|-----|
| F1 | Independent mode: no fresh clone | `verifier.mjs`: full clone → checkout → verify → delta → build hash comparison |
| F2 | Feature flags: always PASS | `gates.mjs`: dynamic import of flag modules, static source inspection as fallback |
| F3 | Lockfile drift: ignored exit codes, missing Cargo.lock | `gates.mjs`: explicit exit code checks, both lockfiles, `git status` verification |
| F4 | Playwright: optional | `gates.mjs`: E11 mandatory=true, E15 stays optional (visual baselines) |
| F5 | Secret scan: incomplete | `gates.mjs`: pattern scan + `.env` check + `.db` check (matching CI) |
| F6 | Tests: helpers only | `harness-contract.test.js`: 32 tests for CLI control flow, classification, evidence |
| F7 | Evidence: Run-ID collision, cross-FS, branch, error class | PID+random Run-ID, same-FS atomic write, ESM branch detection, classification preservation |
