// Smoke tests for scripts/release/repro-compare.mjs (review finding D4).
//
// The comparison tool backs the reproducibility experiment's evidence, and a
// latent CLI bug (path.resolve as an Array.map callback) once made it
// unrunnable without any test noticing. These tests pin the CLI contract:
// identical fixture sets compare BIT_FOR_BIT_IDENTICAL, differing bytes
// compare DIVERGENT with exit 0 (divergence is data, not failure), and a
// missing package directory is a hard usage error.
//
// Run: pnpm vitest run scripts/__tests__/repro-compare.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(TEST_DIR, "..", "release", "repro-compare.mjs");

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Build a real minimal .deb so the diagnosis path has something to unpack. */
function buildDeb(destDir, name, payload) {
  const root = join(destDir, `${name}.tree`);
  mkdirSync(join(root, "DEBIAN"), { recursive: true });
  writeFileSync(
    join(root, "DEBIAN", "control"),
    "Package: fixture\nVersion: 1.0.0\nArchitecture: amd64\nMaintainer: t <t@example.invalid>\nDescription: f\n",
  );
  writeFileSync(join(root, "payload.txt"), payload);
  const file = join(destDir, name);
  execFileSync("dpkg-deb", ["--build", root, file], { stdio: "ignore" });
  return file;
}

function side(tag, payload) {
  const dir = mkdtempSync(join(tmpdir(), `pv-repro-smoke-${tag}-`));
  cleanups.push(dir);
  buildDeb(dir, "fixture_1.0.0_amd64.deb", payload);
  return dir;
}

function run(a, b, extra = []) {
  try {
    const out = execFileSync("node", [SCRIPT, a, b, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("repro-compare", () => {
  it("reports BIT_FOR_BIT_IDENTICAL for identical fixture sets", () => {
    const a = side("a", "same payload");
    const b = side("b", "same payload");
    const res = run(a, b, ["--json", join(a, "report.json")]);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/BIT_FOR_BIT_IDENTICAL/);
    const report = JSON.parse(require("node:fs").readFileSync(join(a, "report.json"), "utf8"));
    expect(report.verdict).toBe("BIT_FOR_BIT_IDENTICAL");
    expect(report.artifacts[0].byte_identical).toBe(true);
  });

  it("reports DIVERGENT (exit 0 — divergence is data) and diagnoses the deb layer", () => {
    const a = side("a", "payload one");
    const b = side("b", "payload two");
    const res = run(a, b);
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/DIVERGENT/);
    expect(res.out).toMatch(/payload: \d+ files, \d+ with differing bytes/);
  });

  it("fails as a usage error when a directory has no packages", () => {
    const a = side("a", "payload");
    const empty = mkdtempSync(join(tmpdir(), "pv-repro-smoke-empty-"));
    cleanups.push(empty);
    const res = run(a, empty);
    expect(res.code).not.toBe(0);
  });
});
