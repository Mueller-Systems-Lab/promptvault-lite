#!/usr/bin/env node
// Load-bearing proof for the pre-push guard.
//
// Runs the identical forced rewrite twice against a throwaway local fixture:
//   * with the repository's tracked `.githooks/pre-push`  -> must be REJECTED
//   * with a no-op pre-push                               -> must be ACCEPTED
//
// If the second run were also rejected, the rejection would be coming from
// something other than the guard and the negative tests would be vacuous. This
// script exists to make that check explicit and re-runnable outside vitest.
//
// Prints `GUARD_MUTATION_PROBE=PASS` on success and exits 0. No network.
//
// Usage: node scripts/governance/run-guard-mutation-probe.mjs

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_HOOKS = join(REPO_ROOT, ".githooks");
const MARKER = "NON_FAST_FORWARD_PUSH_BLOCKED_BY_PROJECT_POLICY";

function git(args, cwd, { allowFailure = false } = {}) {
  try {
    const stdout = execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, stdout, stderr: "" };
  } catch (error) {
    if (!allowFailure) throw error;
    return {
      status: typeof error.status === "number" ? error.status : 1,
      stdout: error.stdout?.toString() ?? "",
      stderr: error.stderr?.toString() ?? "",
    };
  }
}

/**
 * Create a fixture whose remote is one commit ahead of the local clone, so the
 * next `--force` push is a history rewrite.
 */
function buildRewritableFixture(root, hooksPath) {
  const remote = join(root, "remote.git");
  const work = join(root, "work");

  mkdirSync(root, { recursive: true });
  git(["init", "--bare", "--quiet", "-b", "main", remote], root);
  git(["clone", "--quiet", remote, work], root);
  git(["config", "user.email", "probe@example.invalid"], work);
  git(["config", "user.name", "Probe"], work);
  git(["config", "core.hooksPath", hooksPath], work);

  writeFileSync(join(work, "file.txt"), "one\n");
  git(["add", "file.txt"], work);
  git(["commit", "--quiet", "-m", "first"], work);
  const first = git(["rev-parse", "HEAD"], work).stdout.trim();
  git(["push", "--quiet", "origin", "main"], work);

  writeFileSync(join(work, "file.txt"), "two\n");
  git(["add", "file.txt"], work);
  git(["commit", "--quiet", "-m", "second"], work);
  git(["push", "--quiet", "origin", "main"], work);

  git(["reset", "--hard", "--quiet", first], work);
  return work;
}

const sandbox = mkdtempSync(join(tmpdir(), "pvl-guard-probe-"));
let exitCode = 0;

try {
  const guarded = buildRewritableFixture(join(sandbox, "guarded"), REAL_HOOKS);
  const guardedPush = git(["push", "--force", "origin", "main"], guarded, {
    allowFailure: true,
  });
  const guardRejected = guardedPush.status !== 0 && guardedPush.stderr.includes(MARKER);

  const mutatedHooks = join(sandbox, "mutated-hooks");
  mkdirSync(mutatedHooks, { recursive: true });
  writeFileSync(join(mutatedHooks, "pre-push"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

  const mutated = buildRewritableFixture(join(sandbox, "mutated"), mutatedHooks);
  const mutatedPush = git(["push", "--force", "origin", "main"], mutated, {
    allowFailure: true,
  });
  const mutationAccepted = mutatedPush.status === 0;

  process.stdout.write(`guard_rejected=${guardRejected}\n`);
  process.stdout.write(`mutation_accepted=${mutationAccepted}\n`);

  if (guardRejected && mutationAccepted) {
    process.stdout.write("GUARD_MUTATION_PROBE=PASS\n");
  } else {
    process.stdout.write("GUARD_MUTATION_PROBE=FAIL\n");
    exitCode = 1;
  }
} finally {
  rmSync(sandbox, { recursive: true, force: true });
}

process.exit(exitCode);
