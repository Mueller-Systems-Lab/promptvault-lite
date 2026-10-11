// Regression tests for the project no-force-push command guard.
//
// The guard rejects force-push *intent* lexically, so these cases are pure
// string-in / verdict-out: no repository and no network are involved.
//
// The BLOCKED set deliberately includes the bypass shapes found by adversarial
// review — shell wrappers, `sh -c`, command substitution and backticks used to
// build the flag, unambiguous long-option abbreviations, backslash escapes and
// `--no-verify`. The ALLOWED set includes the false positives that same review
// found (trailing `#` comments) plus the ordinary pushes and non-git commands
// that must never be disturbed.
//
// Run: pnpm vitest run scripts/__tests__/force-push-guard.test.js
// @vitest-environment node
import { describe, expect, it } from "vitest";
import {
  detectForcePush,
  REJECTION_CODE,
  rejectionMessage,
  splitCommandSegments,
  tokenize,
} from "../governance/force-push-guard.mjs";

const BLOCKED = [
  // Canonical forms
  "git push --force origin feature",
  "git push -f origin feature",
  "git push --force-with-lease origin feature",
  "git push --force-with-lease=feature origin feature",
  "git push --force-if-includes origin feature",
  "git push origin +HEAD:feature",
  "git push origin +feature:feature",
  "git push origin feature:feature --force",
  "git push -uf origin feature",
  // Global-option and assignment prefixes
  "git -C /some/dir push --force origin feature",
  "git -c push.default=current push --force origin feature",
  "FOO=bar git push --force origin feature",
  // Segment boundaries
  "git status && git push --force origin feature",
  "git fetch; git push -f origin feature",
  // Wrapper words
  "command git push --force origin feature",
  "env git push --force origin feature",
  "nohup git push --force origin feature",
  // Wrappers with their own options/values
  "sudo git push --force origin feature",
  "doas git push --force origin feature",
  "sudo -u root git push --force origin feature",
  "timeout 5 git push --force origin feature",
  "nice -n 10 git push --force origin feature",
  "command -p git push --force origin feature",
  "xargs -I{} git push --force origin feature",
  "watch git push --force origin feature",
  // Subshell and brace group
  "(git push --force origin feature)",
  "{ git push --force origin feature; }",
  // Shell -c
  "bash -c 'git push --force origin feature'",
  'sh -c "git push --force origin feature"',
  // Substitution / backticks used to build the flag (fail closed)
  "git push $(echo --force) origin feature",
  'git push "$(printf %s --force)" origin feature',
  "git push `echo --force` origin feature",
  // Substitution that itself contains the push
  "$(git push --force origin feature)",
  // A bare variable where a flag belongs (fail closed)
  "git push $FLAG origin feature",
  "F=--force; git push $F origin feature",
  // Unambiguous Git long-option abbreviations
  "git push --force-w origin feature",
  "git push --force-with-l origin feature",
  // Backslash escape inside the flag
  "git push --for\\ce origin feature",
  // Disabling the local effect-level guard
  "git push --no-verify origin feature",
  "git push --no-verify --force origin feature",
  // Force intent is rejected even when the update would be a fast-forward.
  "git push --force origin main",
  // A trailing comment must not excuse the force flag before it.
  "git push --force origin main # ok",
];

const ALLOWED = [
  "git push origin feature",
  "git push -u origin feature",
  "git push origin HEAD:feature",
  "git push",
  "git push origin",
  "git push --tags origin",
  "git push --follow-tags origin feature",
  "git push --delete origin feature",
  "git push origin :feature",
  "git push -o ci.skip origin feature",
  "git -C /some/dir push origin feature",
  "git status",
  "git log --grep push",
  "git commit -m 'git push --force origin feature'",
  "echo 'git push --force'",
  "printf '%s\\n' 'git push --force-with-lease'",
  "git fetch --all",
  // Trailing comments must not be read as arguments (adversarial-review finding).
  "git push origin main # never use --force here",
  "git push origin main # avoid +refs",
  // A variable in refspec position cannot be a force flag (review finding).
  "git push origin $BRANCH",
  "git push origin HEAD:$TARGET",
  'git push origin "refs/heads/$BRANCH"',
];

describe("force-push command guard", () => {
  it.each(BLOCKED)("blocks: %s", (command) => {
    const finding = detectForcePush(command);
    expect(finding.blocked).toBe(true);
    expect(finding.reason).toBeTruthy();
  });

  it.each(ALLOWED)("allows: %s", (command) => {
    const finding = detectForcePush(command);
    expect(finding.blocked, `unexpected block: ${finding.reason}`).toBe(false);
  });

  it("names the offending token so the rejection is actionable", () => {
    expect(detectForcePush("git push --force origin feature").matched).toBe("--force");
    expect(detectForcePush("git push origin +HEAD:feature").matched).toBe("+HEAD:feature");
    expect(detectForcePush("git push -f origin feature").matched).toBe("-f");
    expect(detectForcePush("git push --no-verify origin feature").matched).toBe("--no-verify");
  });

  it("reports a stable policy code in the rejection text", () => {
    const message = rejectionMessage(detectForcePush("git push --force origin x"));
    expect(message).toContain(REJECTION_CODE);
  });

  it("treats non-string and empty input as no force intent", () => {
    expect(detectForcePush(undefined).blocked).toBe(false);
    expect(detectForcePush(null).blocked).toBe(false);
    expect(detectForcePush("").blocked).toBe(false);
    expect(detectForcePush("   ").blocked).toBe(false);
    expect(detectForcePush(42).blocked).toBe(false);
  });

  it("respects quoting when splitting segments", () => {
    expect(splitCommandSegments(`echo "a && b"`)).toEqual([`echo "a && b"`]);
    expect(splitCommandSegments("a && b")).toEqual(["a", "b"]);
    expect(tokenize(`git commit -m "first line"`)).toEqual(["git", "commit", "-m", "first line"]);
  });

  it("does not loop on pathological nesting", () => {
    const nested = "git push $(git push $(git push --force origin x)) origin x";
    expect(detectForcePush(nested).blocked).toBe(true);
  });
});
