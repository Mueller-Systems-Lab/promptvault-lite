#!/usr/bin/env node
// Project-local command guard: block force-push intent before Git runs.
//
// Wired as a ZCode workspace `PreToolUse` hook for the `Bash` tool via
// `.zcode/config.json`. The hook receives the tool payload as JSON on stdin;
// this script extracts the shell command, applies the repository's no-force-push
// policy and exits:
//   0  -> allow
//   2  -> block (the documented block exit code for PreToolUse)
//
// The rejection reason goes to stderr. Nothing is written to stdout, so the
// hook can never be mistaken for one that emits a structured JSON verdict.
//
// This guard covers command-level *intent*. It does not replace
// `.githooks/pre-push` (effect-level) or the GitHub ruleset (server-side).

import { detectForcePush, rejectionMessage } from "./force-push-guard.mjs";

/** Extract the shell command from the hook payload, defensively. */
function extractCommand(payload) {
  if (!payload || typeof payload !== "object") return undefined;
  const candidates = [
    payload.tool_input?.command,
    payload.toolInput?.command,
    payload.input?.command,
    payload.arguments?.command,
    payload.command,
    payload.tool_input?.cmd,
  ];
  return candidates.find((c) => typeof c === "string");
}

async function readStdin() {
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  return Buffer.concat(chunks).toString("utf8");
}

const raw = await readStdin();

let payload;
try {
  payload = raw.trim().length > 0 ? JSON.parse(raw) : {};
} catch {
  // A payload we cannot parse is not a force-push finding; let the call through
  // rather than block every Bash invocation on a schema change.
  process.exit(0);
}

const command = extractCommand(payload);
const finding = detectForcePush(command);

if (finding.blocked) {
  process.stderr.write(rejectionMessage(finding) + "\n");
  process.exit(2);
}

process.exit(0);
