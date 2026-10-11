// Project policy: NO FORCE PUSH — on any branch, by any actor.
//
// This module is the single source of truth for "does this command line carry
// force-push *intent*". It is deliberately lexical: force intent is rejected
// even when the proposed update would happen to be a fast-forward, because the
// policy forbids the intent, not merely the effect.
//
// Two callers use it:
//   * the project-local command guard (`.zcode/config.json` ->
//     `scripts/governance/force-push-hook.mjs`), which blocks the tool call
//     before Git runs;
//   * `.githooks/pre-push`, which rejects the *effect* (a non-fast-forward ref
//     update) regardless of the flags used.
//
// Those are separate contracts: the command guard sees flags, the pre-push hook
// sees the resulting ref update. Neither one alone proves the other.

/** Git global options that consume a following value. */
const GIT_GLOBAL_WITH_VALUE = new Set([
  "-C",
  "-c",
  "--git-dir",
  "--work-tree",
  "--namespace",
  "--exec-path",
  "--config-env",
  "--super-prefix",
]);

/** Long force options (exact match or `name=value`). */
const FORCE_LONG_OPTIONS = ["--force", "--force-with-lease", "--force-if-includes"];

/**
 * Split a shell command into segments at unquoted control operators.
 * Quoting is respected so `echo "a && b"` stays one segment.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function splitCommandSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      continue;
    }

    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      segments.push(current);
      current = "";
      i += 1;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") {
      segments.push(current);
      current = "";
      continue;
    }

    current += ch;
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Tokenize one command segment, respecting single/double quotes.
 *
 * @param {string} segment
 * @returns {string[]}
 */
export function tokenize(segment) {
  const tokens = [];
  let current = "";
  let hasCurrent = false;
  let quote = null;

  for (let i = 0; i < segment.length; i += 1) {
    const ch = segment[i];

    if (quote) {
      if (ch === quote) {
        quote = null;
      } else {
        current += ch;
      }
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      hasCurrent = true;
      continue;
    }

    if (ch === " " || ch === "\t") {
      if (hasCurrent) {
        tokens.push(current);
        current = "";
        hasCurrent = false;
      }
      continue;
    }

    current += ch;
    hasCurrent = true;
  }
  if (hasCurrent) tokens.push(current);
  return tokens;
}

/**
 * Return the arguments of a `git push` invocation in this token list, or null
 * when the segment is not a `git push`.
 *
 * Handles `git -C <dir> push`, `git -c k=v push`, leading environment
 * assignments (`FOO=bar git push …`) and an optional `command`/`env` prefix is
 * deliberately NOT handled — an unrecognised prefix returns null, so the
 * command guard never guesses about a command shape it does not understand.
 *
 * @param {string[]} tokens
 * @returns {string[] | null}
 */
export function gitPushArguments(tokens) {
  let i = 0;

  // Leading environment assignments: FOO=bar git push …
  while (i < tokens.length && /^[A-Za-z_][A-Za-z0-9_]*=/.test(tokens[i])) i += 1;

  if (tokens[i] !== "git") return null;
  i += 1;

  while (i < tokens.length) {
    const token = tokens[i];

    if (token === "push") return tokens.slice(i + 1);

    if (token.startsWith("--")) {
      // `--opt=value` consumes itself; a bare value-taking option consumes two.
      if (token.includes("=")) {
        i += 1;
        continue;
      }
      i += GIT_GLOBAL_WITH_VALUE.has(token) ? 2 : 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
      // Short option, possibly clustered (`-C<dir>` is valid git syntax).
      const head = token.slice(0, 2);
      if (GIT_GLOBAL_WITH_VALUE.has(head)) {
        i += token.length > 2 ? 1 : 2;
        continue;
      }
      i += 1;
      continue;
    }

    // First non-option token after `git` is the subcommand; it is not `push`.
    return null;
  }
  return null;
}

/**
 * True when a push option token carries force intent.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isForceOption(token) {
  if (token.startsWith("--")) {
    const name = token.split("=", 1)[0];
    return FORCE_LONG_OPTIONS.includes(name);
  }
  if (token.startsWith("-") && token.length > 1) {
    // Short cluster such as `-f`, `-uf`, `-fv`.
    return token.slice(1).includes("f");
  }
  return false;
}

/**
 * True when a token is an explicitly forced refspec (`+src:dst`).
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isForcedRefspec(token) {
  return token.startsWith("+");
}

/**
 * Inspect one command segment. Returns a finding for the first force intent, or
 * null when the segment carries none.
 *
 * @param {string} segment
 * @returns {{ reason: string, matched: string, kind: string } | null}
 */
export function inspectSegment(segment) {
  const args = gitPushArguments(tokenize(segment));
  if (args === null) return null;

  for (const token of args) {
    if (isForceOption(token)) {
      return {
        kind: "force-option",
        matched: token,
        reason: `force option \`${token}\``,
      };
    }
    if (isForcedRefspec(token)) {
      return {
        kind: "forced-refspec",
        matched: token,
        reason: `forced refspec \`${token}\``,
      };
    }
  }
  return null;
}

/**
 * Find force-push intent anywhere in a shell command.
 *
 * @param {unknown} command
 * @returns {{ blocked: boolean, reason?: string, matched?: string, kind?: string, segment?: string }}
 */
export function detectForcePush(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    return { blocked: false };
  }
  for (const segment of splitCommandSegments(command)) {
    const finding = inspectSegment(segment);
    if (finding) {
      return { blocked: true, segment, ...finding };
    }
  }
  return { blocked: false };
}

export const REJECTION_CODE = "FORCE_PUSH_BLOCKED_BY_PROJECT_POLICY";

/**
 * Human-readable rejection text used by the command guard and the hook.
 *
 * @param {{ reason?: string, matched?: string }} finding
 * @returns {string}
 */
export function rejectionMessage(finding) {
  return [
    `${REJECTION_CODE}: force push is not permitted in this repository (any branch).`,
    `Detected: ${finding.reason ?? "force intent"}.`,
    "Use a normal fast-forward push, or add a correction commit instead of rewriting history.",
  ].join("\n");
}
