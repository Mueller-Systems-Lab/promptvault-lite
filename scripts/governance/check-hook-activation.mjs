#!/usr/bin/env node
// Report — never assume — whether the project hook and guard are actually live.
//
// A tracked hook file does nothing until Git is told to use it, and a tracked
// workspace hook config does nothing until a session starts with it in place.
// This script prints what is true for THIS checkout, using the honest
// classification vocabulary from the governance note:
//
//   TRACKED_HOOK_AVAILABLE  the file exists in the repository
//   LOCAL_CLONE_HOOK_ACTIVE core.hooksPath points at the repository hooks dir
//   HOOK_NOT_ACTIVE         neither of the above
//
// Usage:
//   node scripts/governance/check-hook-activation.mjs
//   node scripts/governance/check-hook-activation.mjs --require-active

import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const EXPECTED_HOOKS_PATH = ".githooks";
const HOOK_FILE = join(REPO_ROOT, ".githooks", "pre-push");
const GUARD_CONFIG = join(REPO_ROOT, ".zcode", "config.json");
const GUARD_SCRIPT = join(REPO_ROOT, "scripts", "governance", "force-push-hook.mjs");

function readHooksPath() {
  try {
    return execFileSync("git", ["config", "--get", "core.hooksPath"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "";
  }
}

const hooksPath = readHooksPath();
const hookExists = existsSync(HOOK_FILE);
const hookExecutable = hookExists && (statSync(HOOK_FILE).mode & 0o111) !== 0;
const hooksPathActive = hooksPath !== "" && resolve(REPO_ROOT, hooksPath) === resolve(REPO_ROOT, EXPECTED_HOOKS_PATH);

const trackedHookAvailable = hookExists && hookExecutable;
const localCloneHookActive = trackedHookAvailable && hooksPathActive;

const classification = localCloneHookActive
  ? "LOCAL_CLONE_HOOK_ACTIVE"
  : trackedHookAvailable
    ? "TRACKED_HOOK_AVAILABLE"
    : "HOOK_NOT_ACTIVE";

const lines = [
  `hooks.prepush.file_present=${hookExists}`,
  `hooks.prepush.executable=${hookExecutable}`,
  `hooks.prepush.core_hooks_path=${hooksPath || "<unset>"}`,
  `hooks.prepush.expected=${EXPECTED_HOOKS_PATH}`,
  `hooks.classification=${classification}`,
];

// Report the command guard from the file's actual contents, not from its
// presence: a config that exists but has `hooks.enabled: false` or no matching
// PreToolUse matcher enforces nothing.
let guardConfig = null;
try {
  guardConfig = JSON.parse(readFileSync(GUARD_CONFIG, "utf8"));
} catch {
  guardConfig = null;
}

const guardEnabled = guardConfig?.hooks?.enabled === true;
const preToolUse = guardConfig?.hooks?.events?.PreToolUse;
// The matcher is a case-sensitive regex tested against the tool name, so it has
// to be evaluated, not merely found: a `Read` matcher would never fire for Bash.
const guardMatcherPresent =
  Array.isArray(preToolUse) &&
  preToolUse.some((entry) => {
    if (!Array.isArray(entry?.hooks)) return false;
    let matchesBash = false;
    if (entry.matcher === undefined) {
      matchesBash = true; // an omitted matcher matches everything
    } else {
      try {
        matchesBash = new RegExp(entry.matcher).test("Bash");
      } catch {
        matchesBash = false; // an invalid regex never matches
      }
    }
    return (
      matchesBash &&
      entry.hooks.some(
        (h) => typeof h?.command === "string" && h.command.includes("force-push-hook.mjs"),
      )
    );
  });

lines.push(`hooks.command_guard.config_present=${existsSync(GUARD_CONFIG)}`);
lines.push(`hooks.command_guard.script_present=${existsSync(GUARD_SCRIPT)}`);
lines.push(`hooks.command_guard.hooks_enabled=${guardEnabled}`);
lines.push(`hooks.command_guard.matcher_present=${guardMatcherPresent}`);
lines.push(
  `hooks.command_guard.classification=${
    guardEnabled && guardMatcherPresent ? "CONFIGURED" : "NOT_CONFIGURED"
  }`,
);

// Workspace hooks load at session start, so a checker running inside an
// already-started session cannot prove the guard is live. Say exactly that.
lines.push(
  "hooks.command_guard.activation=REQUIRES_SESSION_START (workspace hooks are read when a session starts)",
);

process.stdout.write(lines.join("\n") + "\n");

if (process.argv.includes("--require-active") && !localCloneHookActive) {
  process.stderr.write(
    "Hook is not active for this clone. Run: git config core.hooksPath " +
      EXPECTED_HOOKS_PATH +
      "\n",
  );
  process.exit(1);
}
