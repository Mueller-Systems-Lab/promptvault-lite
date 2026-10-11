// Regression tests for the project no-force-push command guard.
//
// The guard rejects force-push *intent* lexically, so these cases are pure
// string-in / verdict-out: no repository and no network are involved.
//
// Run: pnpm vitest run scripts/__tests__/force-push-guard.test.js
// @vitest-environment node
import { describe, expect, it } from "vitest";
import { detectForcePush, REJECTION_CODE, rejectionMessage } from "../governance/force-push-guard.mjs";

const BLOCKED = [
  "git push --force origin feature",
  "git push -f origin feature",
  "git push --force-with-lease origin feature",
  "git push --force-with-lease=feature origin feature",
  "git push --force-if-includes origin feature",
  "git push origin +HEAD:feature",
  "git push origin +feature:feature",
  "git push origin master:main --force",
  "git -C /some/dir push --force origin feature",
  "git -c push.default=current push --force origin feature",
  "FOO=bar git push --force origin feature",
  "git status && git push --force origin feature",
  "git fetch && git push -f origin feature",
  // Force intent is rejected even when the update would be a fast-forward.
  "git push --force origin main",
  // Short-option clusters containing `f`.
  "git push -uf origin feature",
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
  "git push -o ci.skip origin feature",
  "git -C /some/dir push origin feature",
  "git status",
  "git log --grep push",
  "git commit -m 'git push --force origin feature'",
  "echo 'git push --force'",
  "git fetch --all",
];

describe("force-push command guard", () => {
  it.each(BLOCKED)("blocks: %s", (command) => {
    const finding = detectForcePush(command);
    expect(finding.blocked).toBe(true);
    expect(finding.reason).toBeTruthy();
  });

  it.each(ALLOWED)("allows: %s", (command) => {
    expect(detectForcePush(command).blocked).toBe(false);
  });

  it("names the offending token so the rejection is actionable", () => {
    expect(detectForcePush("git push --force origin feature").matched).toBe("--force");
    expect(detectForcePush("git push origin +HEAD:feature").matched).toBe("+HEAD:feature");
    expect(detectForcePush("git push -f origin feature").matched).toBe("-f");
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
});
