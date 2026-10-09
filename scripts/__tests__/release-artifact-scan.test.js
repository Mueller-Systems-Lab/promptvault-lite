// Tests for scripts/verify-release-artifacts.mjs.
//
// The Linux release manifest and the CLI/Windows manifest share a file name
// (`promptvault-release-manifest.json`) but have different shapes, so the
// verifier must accept only the Linux schema. These tests also pin the artifact
// name and payload-path checks.
//
// Run: pnpm vitest run scripts/__tests__/release-artifact-scan.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir, hostname } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(TEST_DIR, "..", "verify-release-artifacts.mjs");

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

/** Build a staging directory: artifacts/ + checksums/promptvault-release-manifest.json */
function makeStaging({ assetName = "PromptVault-Lite_1.13.1_amd64.deb", payload = "clean payload", manifest } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pv-artifacts-"));
  cleanups.push(dir);
  mkdirSync(join(dir, "artifacts"));
  mkdirSync(join(dir, "checksums"));
  const file = join(dir, "artifacts", assetName);
  writeFileSync(file, payload);

  const linuxManifest = {
    schema_version: 1,
    release_version: "1.13.1",
    source_commit: "bd001f48d162612b38af608684083fe639aecb66",
    platform: "linux",
    architecture: "x86_64",
    assets: [
      {
        filename: assetName,
        type: "deb",
        size: Buffer.byteLength(payload),
        sha256: sha256(file),
      },
    ],
  };
  writeFileSync(
    join(dir, "checksums", "promptvault-release-manifest.json"),
    JSON.stringify(manifest ?? linuxManifest),
  );
  return dir;
}

function run(stagingDir, extra = []) {
  try {
    const out = execFileSync("node", [SCRIPT, stagingDir, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("verify-release-artifacts", () => {
  it("passes a well-formed Linux release manifest", () => {
    const res = run(makeStaging());
    expect(res.out).toContain("RELEASE ARTIFACTS: PASS");
    expect(res.code).toBe(0);
  });

  it("rejects the CLI/Windows manifest shape (same file name, different schema)", () => {
    const cliManifest = {
      schema_version: 1,
      version: "1.11.1",
      platform: "windows",
      architecture: "x86_64",
      artifacts: { "windows-x86_64": { filename: "setup.exe", type: "nsis" } },
    };
    const res = run(makeStaging({ manifest: cliManifest }));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/CLI\/Windows manifest/i);
  });

  it("rejects an asset file name GitHub would rewrite", () => {
    const res = run(makeStaging({ assetName: "PromptVault Lite_1.13.1_amd64.deb" }));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/unsafe asset name/i);
  });

  it("fails when a payload size does not match the manifest", () => {
    const dir = makeStaging();
    const res = run(dir);
    expect(res.code).toBe(0);
    // tamper with the payload
    writeFileSync(join(dir, "artifacts", "PromptVault-Lite_1.13.1_amd64.deb"), "tampered");
    const after = run(dir);
    expect(after.code).not.toBe(0);
    expect(after.out).toMatch(/size|sha256/i);
  });

  it("detects a forbidden marker inside a payload", () => {
    const res = run(makeStaging({ payload: "leaked /mnt/nvme-data/pvl-v1.13.0/path" }), [
      "--forbid",
      "pvl-v1\\.13\\.0",
    ]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/leak/i);
  });

  it("detects the build host name inside a payload", () => {
    const res = run(makeStaging({ payload: `built on ${hostname()}` }));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/build host name/i);
  });
});
