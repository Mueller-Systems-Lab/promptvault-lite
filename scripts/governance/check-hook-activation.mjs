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
import { existsSync, statSync } from "node:fs";
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
  `hooks.command_guard.config_present=${existsSync(GUARD_CONFIG)}`,
  `hooks.command_guard.script_present=${existsSync(GUARD_SCRIPT)}`,
  `hooks.classification=${classification}`,
];

// The workspace command guard is activated by the agent runtime at session
// start; a checker running inside an already-started session cannot prove it is
// live. Say so explicitly rather than implying it.
if (existsSync(GUARD_CONFIG)) {
  lines.push(
    "hooks.command_guard.activation=REQUIRES_SESSION_RESTART (workspace hooks load at session start)",
  );
}

process.stdout.write(lines.join("\n") + "\n");

if (process.argv.includes("--require-active") && !localCloneHookActive) {
  process.stderr.write(
    "Hook is not active for this clone. Run: git config core.hooksPath " +
      EXPECTED_HOOKS_PATH +
      "\n",
  );
  process.exit(1);
}
