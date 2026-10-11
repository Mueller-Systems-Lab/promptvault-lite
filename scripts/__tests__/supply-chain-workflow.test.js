// Structural assertions for the supply-chain CI/release workflow files.
//
// These are deliberately textual, dependency-free checks over the workflow
// YAML the way the release-pipeline governance treats the release script:
// the supply-chain surface must be pinned and least-privileged, because a
// floating action reference or a broad permission grant is exactly the
// supply-chain weakness this pipeline exists to prevent.
//
// Covered:
//   * the attest action is pinned to an immutable commit SHA (no @main/@vN
//     floats on security-sensitive actions we add);
//   * every job that attests holds exactly id-token/attestations/contents
//     permissions and nothing wider;
//   * the reproducibility experiment really runs two independent build jobs
//     plus a comparison job;
//   * the release workflow wires the SBOM through staging, verification
//     (--require-sbom) and publication.
//
// Run: pnpm vitest run scripts/__tests__/supply-chain-workflow.test.js
// @vitest-environment node
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TEST_DIR, "..", "..");

const read = (rel) => readFileSync(join(REPO_ROOT, rel), "utf8");

const ATTEST_ACTION_RE = /actions\/attest-build-provenance@([0-9a-f]{40})\b/g;
const FLOATING_RE = /attest-build-provenance@(main|master|latest|v\d+)(\s|$)/;

describe("supply-chain workflow contracts", () => {
  it("exists: supply-chain CI job and reproducibility experiment workflow", () => {
    expect(() => read(".github/workflows/supply-chain.yml")).not.toThrow();
    expect(() => read(".github/workflows/supply-chain-repro.yml")).not.toThrow();
  });

  it("pins every attest-build-provenance use to an immutable commit SHA", () => {
    for (const rel of [
      ".github/workflows/supply-chain.yml",
      ".github/workflows/supply-chain-repro.yml",
      ".github/workflows/release.yml",
      ".github/workflows/ci.yml",
    ]) {
      const text = read(rel);
      const floating = text.match(FLOATING_RE);
      expect(floating, `${rel} uses a floating attest action ref`).toBeNull();
      for (const m of text.matchAll(ATTEST_ACTION_RE)) {
        expect(m[1]).toMatch(/^[0-9a-f]{40}$/);
      }
    }
  });

  it("attests in supply-chain.yml with exactly the least-privilege permissions", () => {
    const text = read(".github/workflows/supply-chain.yml");
    // Every permissions block in this file must be the least-privilege triple.
    const blocks = text.match(/permissions:\n((?:\s+[A-Za-z-]+: \w+\n)+)/g) ?? [];
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      const grants = [...block.matchAll(/^\s+([A-Za-z-]+): (\w+)$/gm)].map((m) => `${m[1]}: ${m[2]}`);
      expect(grants.sort()).toEqual(["attestations: write", "contents: read", "id-token: write"]);
    }
    // The attest step exists and is skipped for pull_request events (fork
    // pull requests cannot receive id-token write; main pushes attest).
    expect(text).toMatch(/attest-build-provenance@/);
    expect(text).toMatch(/if: github\.event_name == 'push'/);
    // The determinism proof is part of CI: generate twice, byte-compare.
    expect(text).toMatch(/generate-sbom\.mjs/);
    expect(text).toMatch(/cmp --silent|diff --quiet|sha256sum/);
  });

  it("runs the reproducibility experiment as two independent builds plus a comparison", () => {
    const text = read(".github/workflows/supply-chain-repro.yml");
    expect(text).toMatch(/^\s{2}build-a:$/m);
    expect(text).toMatch(/^\s{2}build-b:$/m);
    expect(text).toMatch(/^\s{2}compare:$/m);
    // Both build jobs are pinned to the run's exact source SHA.
    expect(text.match(/ref: \$\{\{ github\.sha \}\}/g)?.length).toBeGreaterThanOrEqual(2);
    // Toolchains are pinned versions, not floating labels.
    expect(text).toMatch(/version: "9\.15\.9"/);
    expect(text).toMatch(/node-version: "?22\.\d+\.\d+"?/);
    expect(text).toMatch(/toolchain: "?1\.\d+\.\d+"?/);
    expect(text).toMatch(/repro-compare\.mjs/);
  });

  it("wires the SBOM through the release pipeline fail-closed", () => {
    const text = read(".github/workflows/release.yml");
    expect(text).toMatch(/generate-sbom\.mjs/);
    expect(text).toMatch(/--sbom/);
    expect(text.match(/--require-sbom/g)?.length).toBeGreaterThanOrEqual(2); // build gate + publish re-gate
    expect(text).toMatch(/release-staging\/sbom\/\*/);
  });
});
