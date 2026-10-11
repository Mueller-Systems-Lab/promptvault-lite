// Project policy: NO FORCE PUSH — on any branch, by any actor.
//
// This module is the single source of truth for "does this command line carry
// force-push *intent*". It is deliberately lexical: force intent is rejected
// even when the proposed update would happen to be a fast-forward, because the
// policy forbids the intent, not merely the effect.
//
// Three callers use it:
//   * the project-local command guard (`.zcode/config.json` ->
//     `scripts/governance/force-push-hook.mjs`), which blocks the tool call
//     before Git runs;
//   * `.githooks/pre-push`, which rejects the *effect* (a non-fast-forward ref
//     update) regardless of the flags used;
//   * the regression tests.
//
// Those are separate contracts: the command guard sees flags, the pre-push hook
// sees the resulting ref update. Neither one alone proves the other.
//
// Scope of the lexical check, stated honestly: it defeats the forms a person or
// an agent plausibly types, including shell wrappers (`command`/`env`/`nohup`),
// `bash -c '…'`, command substitution and backticks, unquoted backslash
// escapes, trailing `#` comments, unambiguous Git long-option abbreviations
// (`--force-w`) and `--no-verify` on a push. It cannot defeat arbitrary runtime
// indirection such as building the flag in a variable (`F=--force; git push $F`);
// that is what the pre-push hook and the server-side ruleset are for.

/** Git long options that mean "make this update non-fast-forward". */
const FORCE_LONG_OPTIONS = ["--force", "--force-with-lease", "--force-if-includes"];

/** Options that disable the effect-level guard locally. */
const GUARD_BYPASS_OPTIONS = ["--no-verify"];

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

/** Leading words that only wrap the real command. */
const COMMAND_WRAPPERS = new Set([
  "command",
  "builtin",
  "exec",
  "env",
  "nohup",
  "nice",
  "setsid",
  "stdbuf",
  "time",
]);

/** Shells whose `-c <string>` form holds the real command. */
const SHELLS = new Set(["bash", "sh", "zsh", "dash", "ksh"]);

/** Maximum expansion depth, so a pathological command cannot loop forever. */
const MAX_EXPANSION_DEPTH = 4;

/**
 * Split a shell command into segments at unquoted control operators, dropping
 * unquoted `#` comments. Quoting is respected so `echo "a && b"` stays one
 * segment.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function splitCommandSegments(command) {
  const segments = [];
  let current = "";
  let quote = null;
  let escaped = false;
  let tokenStart = true;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      current += ch;
      escaped = false;
      tokenStart = false;
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) quote = null;
      continue;
    }
    if (ch === "\\") {
      current += ch;
      escaped = true;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      current += ch;
      tokenStart = false;
      continue;
    }
    if (ch === "#" && tokenStart) {
      // Unquoted comment: skip to end of line.
      while (i < command.length && command[i] !== "\n") i += 1;
      segments.push(current);
      current = "";
      tokenStart = true;
      continue;
    }

    const two = command.slice(i, i + 2);
    if (two === "&&" || two === "||") {
      segments.push(current);
      current = "";
      i += 1;
      tokenStart = true;
      continue;
    }
    if (ch === ";" || ch === "|" || ch === "\n" || ch === "&") {
      segments.push(current);
      current = "";
      tokenStart = true;
      continue;
    }

    current += ch;
    tokenStart = ch === " " || ch === "\t";
  }
  segments.push(current);
  return segments.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Tokenize one command segment, respecting quotes and removing unquoted
 * backslash escapes (so `--for\ce` reads as `--force`).
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

    if (ch === "\\") {
      const next = segment[i + 1];
      if (next === undefined) break;
      if (next === "\n") {
        i += 1; // line continuation
        continue;
      }
      current += next;
      hasCurrent = true;
      i += 1;
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

    if (ch === '"' || ch === "'") {
      quote = ch;
      hasCurrent = true;
      continue;
    }

    current += ch;
    hasCurrent = true;
  }
  if (hasCurrent) tokens.push(current);
  return tokens;
}

/** Drop leading wrappers and environment assignments from a token list. */
function stripLeadingWrappers(tokens) {
  let i = 0;
  while (i < tokens.length) {
    const token = tokens[i];
    if (COMMAND_WRAPPERS.has(token)) {
      i += 1;
      continue;
    }
    if (/^[A-Za-z_][A-Za-z0-9_]*=/.test(token)) {
      i += 1;
      continue;
    }
    break;
  }
  return tokens.slice(i);
}

/**
 * If the segment is `sh -c '…'` (or equivalent), return the inner command.
 *
 * @param {string[]} tokens
 * @returns {string | null}
 */
function unwrapShell(tokens) {
  const rest = stripLeadingWrappers(tokens);
  if (!SHELLS.has(rest[0])) return null;
  const index = rest.indexOf("-c");
  if (index === -1 || rest[index + 1] === undefined) return null;
  return rest[index + 1];
}

/**
 * Collect the contents of command substitutions (`$(…)`) and backticks.
 *
 * @param {string} command
 * @returns {string[]}
 */
export function extractSubstitutions(command) {
  const found = [];
  let quote = null;
  let escaped = false;

  for (let i = 0; i < command.length; i += 1) {
    const ch = command[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (quote === "'") {
      if (ch === "'") quote = null;
      continue;
    }
    if (quote === '"') {
      if (ch === '"') quote = null;
      continue;
    }
    if (ch === "'" || ch === '"') {
      quote = ch;
      continue;
    }

    if (ch === "`") {
      const end = command.indexOf("`", i + 1);
      if (end === -1) break;
      found.push(command.slice(i + 1, end));
      i = end;
      continue;
    }

    if (ch === "$" && command[i + 1] === "(") {
      let depth = 1;
      let j = i + 2;
      for (; j < command.length && depth > 0; j += 1) {
        if (command[j] === "(") depth += 1;
        else if (command[j] === ")") depth -= 1;
      }
      found.push(command.slice(i + 2, j - 1));
      i = j - 1;
    }
  }
  return found;
}

/**
 * Return the arguments of a `git push` invocation in this token list, or null
 * when the segment is not a `git push`.
 *
 * @param {string[]} tokens
 * @returns {string[] | null}
 */
export function gitPushArguments(tokens) {
  const rest = stripLeadingWrappers(tokens);
  let i = 0;

  if (rest[i] !== "git") return null;
  i += 1;

  while (i < rest.length) {
    const token = rest[i];

    if (token === "push") return rest.slice(i + 1);

    if (token.startsWith("--")) {
      if (token.includes("=")) {
        i += 1;
        continue;
      }
      i += GIT_GLOBAL_WITH_VALUE.has(token) ? 2 : 1;
      continue;
    }

    if (token.startsWith("-") && token.length > 1) {
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
 * True when a push option token carries force intent, including unambiguous
 * Git long-option abbreviations such as `--force-w`.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isForceOption(token) {
  if (token.startsWith("--")) {
    const name = token.split("=", 1)[0];
    if (FORCE_LONG_OPTIONS.includes(name)) return true;
    // Git accepts any unambiguous prefix; `--f` is ambiguous in Git itself but
    // blocking it is fail-safe, so only a bare `--` is excluded.
    return name.length > 2 && FORCE_LONG_OPTIONS.some((option) => option.startsWith(name));
  }
  if (token.startsWith("-") && token.length > 1) {
    // Short cluster such as `-f`, `-uf`, `-fv`.
    return token.slice(1).includes("f");
  }
  return false;
}

/**
 * True when a token disables the local effect-level guard.
 *
 * @param {string} token
 * @returns {boolean}
 */
export function isGuardBypassOption(token) {
  const name = token.startsWith("--") ? token.split("=", 1)[0] : token;
  return GUARD_BYPASS_OPTIONS.includes(name);
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

/** True when a token's value cannot be determined without evaluating a shell. */
export function isIndeterminateToken(token) {
  return token.includes("$(") || token.includes("`") || /\$[A-Za-z_{]/.test(token);
}

/**
 * Inspect one command segment. Returns a finding for the first force intent, or
 * null when the segment carries none.
 *
 * @param {string} segment
 * @returns {{ reason: string, matched: string, kind: string } | null}
 */
export function inspectSegment(segment) {
  const tokens = tokenize(segment);
  const args = gitPushArguments(tokens);
  if (args === null) return null;

  for (const token of args) {
    if (isForceOption(token)) {
      return { kind: "force-option", matched: token, reason: `force option \`${token}\`` };
    }
    if (isGuardBypassOption(token)) {
      return {
        kind: "guard-bypass",
        matched: token,
        reason: `\`${token}\` on a push skips the repository pre-push guard`,
      };
    }
    if (isForcedRefspec(token)) {
      return {
        kind: "forced-refspec",
        matched: token,
        reason: `forced refspec \`${token}\``,
      };
    }
    // A flag the shell must evaluate could expand to `--force`. Fail closed:
    // write the resolved form instead.
    if (isIndeterminateToken(token)) {
      return {
        kind: "indeterminate-argument",
        matched: token,
        reason: `argument \`${token}\` cannot be resolved without running the shell, so it cannot be cleared of force intent`,
      };
    }
  }
  return null;
}

/**
 * Inspect a token list directly (used for expanded inner commands).
 *
 * @param {string} segment
 * @returns {{ reason: string, matched: string, kind: string } | null}
 */
function inspectTokensAsSegment(tokens, originalSegment) {
  const finding = inspectSegment(tokens.join(" "));
  return finding ? { ...finding, segment: originalSegment } : null;
}

/**
 * Find force-push intent anywhere in a shell command, including inside command
 * substitutions, backticks and `sh -c '…'` wrappers.
 *
 * @param {unknown} command
 * @returns {{ blocked: boolean, reason?: string, matched?: string, kind?: string, segment?: string }}
 */
export function detectForcePush(command) {
  if (typeof command !== "string" || command.trim().length === 0) {
    return { blocked: false };
  }

  const queue = [{ text: command, depth: 0 }];
  const seen = new Set();

  while (queue.length > 0) {
    const { text, depth } = queue.shift();
    if (seen.has(text)) continue;
    seen.add(text);

    if (depth < MAX_EXPANSION_DEPTH) {
      for (const substitution of extractSubstitutions(text)) {
        queue.push({ text: substitution, depth: depth + 1 });
      }
    }

    for (const segment of splitCommandSegments(text)) {
      const tokens = tokenize(segment);

      // `bash -c '<real command>'` — analyse the inner command instead.
      const inner = unwrapShell(tokens);
      if (inner !== null) {
        if (depth < MAX_EXPANSION_DEPTH) queue.push({ text: inner, depth: depth + 1 });
        continue;
      }

      const finding = inspectTokensAsSegment(tokens, segment);
      if (finding) return { blocked: true, ...finding };
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
