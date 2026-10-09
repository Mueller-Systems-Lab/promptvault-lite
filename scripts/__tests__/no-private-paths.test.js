// Prevention guard: no NEW private absolute path may enter the tracked tree.
//
// Rationale: machine-specific absolute paths (`/home/<user>/...`,
// `C:\Users\<user>\...`) are not portable and unnecessarily expose the build
// user. They are legitimate in exactly one place: frozen historical records
// (audit reports, build/perf logs, signed evidence), which must keep their
// original text. Everything else must stay path-neutral.
//
// The allowlist below is exhaustive and intentional. Adding an entry means
// accepting that the file is an immutable historical record — prefer fixing the
// file instead.
//
// Run: pnpm vitest run scripts/__tests__/no-private-paths.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..", "..");

const HISTORICAL_ALLOWLIST = new Set([
  ".opencode/reports/compliance/R2.3-realworld-privacy-gate-2026-08-24.md",
  "docs/audits/PVL-ANALYZER-R2-1-BENCHMARK-V3-METHODOLOGY-20260821.md",
  "docs/audits/PVL-ANALYZER-R2-RELEASE-PERFORMANCE-20260824.md",
  "docs/audits/PVL-ANALYZER-R2-RELEASE-PERFORMANCE-build-20260824.log",
  "docs/audits/PVL-ANALYZER-R2-RELEASE-PERFORMANCE-perf-20260824.log",
  "docs/audits/PVL-v1.10.0-AUTHORING-LIFECYCLE-DECISION-RECORD-20260815.md",
  "docs/audits/PVL-v1.12.0-INSTALLABLE-RELEASE-CLOSURE-20260824.md",
  "evidence/visual-r23/R23_VISUAL_QA_REPORT.md",
]);

// A user name in a home/profile path. Two deliberate exclusions keep this
// precise:
//   * generic markers such as "/media/" or "/tmp/" are not matched — bundled
//     libraries and system paths legitimately contain them;
//   * the conventional placeholder account names (used throughout fixtures and
//     docs, e.g. "/home/user/vault") are not treated as private data.
const PLACEHOLDER_USERS = "user|username|you|example|someone|test|alice|bob";
// ERE for the candidate search (git grep -E has no lookahead) …
const CANDIDATE_ERE = String.raw`(/home/[A-Za-z0-9_.-]+/|[A-Za-z]:\\Users\\[^\\]+\\|/Users/[A-Za-z0-9_.-]+/)`;
// … and the precise JS pattern applied to each candidate line.
const PRIVATE_PATH =
  String.raw`(/home/(?!(${PLACEHOLDER_USERS})/)[A-Za-z0-9_.-]+/` +
  String.raw`|[A-Za-z]:\\Users\\(?!(${PLACEHOLDER_USERS})\\)[^\\]+\\` +
  String.raw`|/Users/(?!(${PLACEHOLDER_USERS})/)[A-Za-z0-9_.-]+/)`;

/** Tracked files containing a real (non-placeholder) private absolute path. */
function filesWithPrivatePaths() {
  let out;
  try {
    out = execFileSync("git", ["grep", "-nE", CANDIDATE_ERE, "--", "."], {
      cwd: REPO_ROOT,
      encoding: "utf8",
    });
  } catch (e) {
    if (e.status === 1) return []; // no candidate at all
    throw e;
  }
  const precise = new RegExp(PRIVATE_PATH);
  const files = new Set();
  for (const line of out.split("\n")) {
    if (!line) continue;
    const text = line.slice(line.indexOf(":", line.indexOf(":") + 1) + 1);
    if (precise.test(text)) files.add(line.slice(0, line.indexOf(":")));
  }
  return [...files];
}

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("private absolute paths in the tracked tree", () => {
  it("are confined to the documented historical records", () => {
    const unexpected = filesWithPrivatePaths().filter((f) => !HISTORICAL_ALLOWLIST.has(f));
    expect(unexpected, `new private path(s) in: ${unexpected.join(", ")}`).toEqual([]);
  });

  it("detects a private path in a newly added file (guard is effective)", () => {
    // Proves the pattern actually matches: synthetic examples, not repo files.
    expect(new RegExp(PRIVATE_PATH).test("/home/realuser/prompts")).toBe(true);
    expect(new RegExp(PRIVATE_PATH).test(String.raw`C:\Users\realuser\AppData`)).toBe(true);
    // and stays quiet on the intended non-matches
    expect(new RegExp(PRIVATE_PATH).test("/home/user/vault")).toBe(false);
    expect(new RegExp(PRIVATE_PATH).test("/mnt/data/prompts")).toBe(false);
    expect(new RegExp(PRIVATE_PATH).test("/media/removable")).toBe(false);
  });

  it("allowlisted historical records still exist", () => {
    // Keeps the allowlist honest: a renamed record must be re-classified.
    for (const path of HISTORICAL_ALLOWLIST) {
      expect(
        () =>
          execFileSync("git", ["ls-files", "--error-unmatch", path], {
            cwd: REPO_ROOT,
            stdio: "ignore",
          }),
        `${path} is no longer tracked`,
      ).not.toThrow();
    }
  });
});
