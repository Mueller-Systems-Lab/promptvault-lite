// Regression tests for `.githooks/pre-push`.
//
// A fully local synthetic fixture: one bare "remote" and one working clone per
// case. `core.hooksPath` points at the repository's real tracked `.githooks`, so
// the tests exercise the shipped hook, not a copy. No network is used.
//
// Verified Git behaviour that shapes these tests (measured, not assumed):
//   * Git refuses a *plain* non-fast-forward push itself and does NOT hand that
//     ref to the pre-push hook — the hook sees no line for it. Such a push is
//     still rejected, just not by us, so those cases assert rejection without
//     requiring the hook's marker.
//   * Git hands the hook every update it is otherwise willing to send — which is
//     exactly the forced cases (`--force`, `-f`, `--force-with-lease`,
//     `+refspec`). Those cases assert rejection *with* the hook's marker, so a
//     rejection by Git can never be mistaken for the project guard.
//
// The last test is a mutation probe: with the guard replaced by a no-op the same
// forced rewrite must be *accepted*, proving the marker assertions are
// load-bearing rather than passing for unrelated reasons.
//
// Run: pnpm vitest run scripts/__tests__/pre-push-non-fast-forward.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REAL_HOOKS_PATH = join(REPO_ROOT, ".githooks");
const MARKER = "NON_FAST_FORWARD_PUSH_BLOCKED_BY_PROJECT_POLICY";

const sandbox = mkdtempSync(join(tmpdir(), "pvl-prepush-"));

afterAll(() => {
  rmSync(sandbox, { recursive: true, force: true });
});

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

/** Build a bare remote plus a working clone wired to the given hooks path. */
function makeFixture(name, hooksPath) {
  const root = join(sandbox, name);
  const remote = join(root, "remote.git");
  const work = join(root, "work");

  mkdirSync(root, { recursive: true });
  git(["init", "--bare", "--quiet", "-b", "main", remote], root);
  git(["clone", "--quiet", remote, work], root);
  git(["config", "user.email", "fixture@example.invalid"], work);
  git(["config", "user.name", "Fixture"], work);
  git(["config", "core.hooksPath", hooksPath], work);

  writeFileSync(join(work, "file.txt"), "one\n");
  git(["add", "file.txt"], work);
  git(["commit", "--quiet", "-m", "first"], work);

  return { root, remote, work };
}

function commitNext(work, content, message) {
  writeFileSync(join(work, "file.txt"), content);
  git(["add", "file.txt"], work);
  git(["commit", "--quiet", "-m", message], work);
  return git(["rev-parse", "HEAD"], work).stdout.trim();
}

/** Publish two commits, then rewind the working clone so the next push rewrites. */
function fixtureWithPublishedHistory(name, hooksPath) {
  const fixture = makeFixture(name, hooksPath);
  const { work } = fixture;
  const first = git(["rev-parse", "HEAD"], work).stdout.trim();
  git(["push", "--quiet", "origin", "main"], work);
  commitNext(work, "two\n", "second");
  git(["push", "--quiet", "origin", "main"], work);
  git(["reset", "--hard", "--quiet", first], work);
  return fixture;
}

describe("pre-push non-fast-forward defense (real tracked hook)", () => {
  it("A. allows creating a new branch on the remote", () => {
    const { work } = makeFixture("new-branch", REAL_HOOKS_PATH);
    const result = git(["push", "--quiet", "origin", "main"], work, { allowFailure: true });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });

  it("B. allows a fast-forward update", () => {
    const { work } = makeFixture("fast-forward", REAL_HOOKS_PATH);
    git(["push", "--quiet", "origin", "main"], work);
    commitNext(work, "two\n", "second");
    const result = git(["push", "--quiet", "origin", "main"], work, { allowFailure: true });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });

  it("C. rejects a plain non-fast-forward rewrite", () => {
    const { work } = fixtureWithPublishedHistory("non-ff", REAL_HOOKS_PATH);
    const result = git(["push", "origin", "main"], work, { allowFailure: true });
    // Git refuses this one itself and never consults the hook for the ref, so
    // assert the rejection (and that it is not mis-attributed to our guard).
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });

  it("D. rejects pushing a branch that was reset backwards", () => {
    const { work } = fixtureWithPublishedHistory("reset-back", REAL_HOOKS_PATH);
    const result = git(["push", "origin", "HEAD:main"], work, { allowFailure: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });

  it("E. rejects a forced +refspec via the hook", () => {
    const { work } = fixtureWithPublishedHistory("forced-refspec", REAL_HOOKS_PATH);
    const result = git(["push", "origin", "+HEAD:main"], work, { allowFailure: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(MARKER);
  });

  it("F. rejects a --force-with-lease rewrite via the hook", () => {
    const { work } = fixtureWithPublishedHistory("force-with-lease", REAL_HOOKS_PATH);
    const result = git(["push", "--force-with-lease", "origin", "main"], work, {
      allowFailure: true,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(MARKER);
  });

  it("G. rejects a --force rewrite via the hook", () => {
    const { work } = fixtureWithPublishedHistory("force", REAL_HOOKS_PATH);
    const result = git(["push", "--force", "origin", "main"], work, { allowFailure: true });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(MARKER);
  });

  it("H. allows branch deletion (deletion is not a history rewrite)", () => {
    const { work } = makeFixture("deletion", REAL_HOOKS_PATH);
    git(["push", "--quiet", "origin", "main"], work);
    commitNext(work, "side\n", "side");
    git(["push", "--quiet", "origin", "main:side"], work);

    const result = git(["push", "--quiet", "origin", "--delete", "side"], work, {
      allowFailure: true,
    });
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });

  it("I. mutation probe: without the guard the forced rewrite is accepted", () => {
    // Guard removed on purpose: a no-op pre-push accepts everything.
    const mutatedHooks = join(sandbox, "mutated-hooks");
    mkdirSync(mutatedHooks, { recursive: true });
    writeFileSync(join(mutatedHooks, "pre-push"), "#!/bin/sh\nexit 0\n", { mode: 0o755 });

    const { work } = fixtureWithPublishedHistory("mutation-probe", mutatedHooks);
    const result = git(["push", "--force", "origin", "main"], work, { allowFailure: true });

    // Same forced rewrite as case G, now accepted — proving G fails only because
    // the tracked guard is present and effective.
    expect(result.status).toBe(0);
    expect(result.stderr).not.toContain(MARKER);
  });
});
