// Tests for scripts/release/stage-linux-release.mjs.
//
// Staging is the step that turns Tauri's output — `PromptVault Lite_1.13.2_amd64.deb`,
// with a space, which GitHub rewrites on upload — into the canonical released
// set. Everything it accepts becomes the input of the verification gate, so it
// has to be fail-closed: an incomplete, ambiguous or mislabeled bundle set must
// abort rather than produce a beautifully formatted wrong release.
//
// The fixtures are plain files with the bundle file names; staging does not
// read package contents (the verifier does that afterwards).
//
// Run: pnpm vitest run scripts/__tests__/release-pipeline-staging.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(TEST_DIR, "..", "release", "stage-linux-release.mjs");

const VERSION = "1.13.2";
const COMMIT = "0123456789abcdef0123456789abcdef01234567"; // fixture identity

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "pv-stage-"));
  cleanups.push(root);
  return root;
}

/**
 * Build a fake Tauri bundle tree. Each category can be dropped with `false`,
 * replaced with a custom name, or left at its default.
 */
function bundles({ deb, rpm, appimage } = {}) {
  const root = fixture();
  const dirs = {
    deb: join(root, "deb"),
    rpm: join(root, "rpm"),
    appimage: join(root, "appimage"),
  };
  for (const d of Object.values(dirs)) mkdirSync(d, { recursive: true });

  const write = (dir, name, body) => {
    const p = join(dir, name);
    writeFileSync(p, body);
    return p;
  };

  const debName = deb === undefined ? `PromptVault Lite_${VERSION}_amd64.deb` : deb;
  if (debName !== false) write(dirs.deb, debName, "deb-bytes");
  const rpmName = rpm === undefined ? `PromptVault Lite-${VERSION}-1.x86_64.rpm` : rpm;
  if (rpmName !== false) write(dirs.rpm, rpmName, "rpm-bytes");
  const appName = appimage === undefined ? `PromptVault Lite_${VERSION}_amd64.AppImage` : appimage;
  if (appName !== false) {
    chmodSync(write(dirs.appimage, appName, "appimage-bytes"), 0o755);
  }

  return { root, out: join(root, "out") };
}

function run(root, out, extra = []) {
  try {
    const stdout = execFileSync(
      "node",
      [SCRIPT, "--bundles", root, "--version", VERSION, "--commit", COMMIT, "--out", out, ...extra],
      { encoding: "utf8" },
    );
    return { code: 0, out: stdout };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

describe("stage-linux-release", () => {
  it("produces canonical GitHub-safe names, manifest and SHA256SUMS", () => {
    const { root, out } = bundles();
    const res = run(root, out);
    expect(res.code).toBe(0);

    const names = ["PromptVault-Lite_1.13.2_amd64.deb", "PromptVault-Lite-1.13.2-1.x86_64.rpm", "PromptVault-Lite_1.13.2_amd64.AppImage"];
    for (const n of names) {
      expect(statSync(join(out, "artifacts", n)).isFile()).toBe(true);
      expect(n).not.toMatch(/\s/);
    }

    const manifest = JSON.parse(
      readFileSync(join(out, "checksums", "promptvault-release-manifest.json"), "utf8"),
    );
    expect(manifest.release_version).toBe(VERSION);
    expect(manifest.source_commit).toBe(COMMIT);
    expect(manifest.platform).toBe("linux");
    expect(manifest.assets.map((a) => a.filename)).toEqual([...names].sort());
    for (const asset of manifest.assets) {
      expect(asset.sha256).toBe(sha256(join(out, "artifacts", asset.filename)));
      expect(asset.size).toBe(statSync(join(out, "artifacts", asset.filename)).size);
    }

    const sums = readFileSync(join(out, "checksums", "SHA256SUMS.txt"), "utf8").trim().split("\n");
    expect(sums).toHaveLength(3);
    for (const line of sums) {
      const [digest, name] = line.split(/\s+/);
      expect(digest).toBe(sha256(join(out, "artifacts", name)));
    }
  });

  it("keeps the staged AppImage executable", () => {
    const { root, out } = bundles();
    expect(run(root, out).code).toBe(0);
    const mode = statSync(join(out, "artifacts", "PromptVault-Lite_1.13.2_amd64.AppImage")).mode;
    expect(mode & 0o111).not.toBe(0);
  });

  it("fails when a package type is missing", () => {
    const { root, out } = bundles({ rpm: false });
    const res = run(root, out);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/rpm/);
  });

  it("fails when a bundle directory is absent entirely", () => {
    const root = fixture();
    mkdirSync(join(root, "deb"), { recursive: true });
    writeFileSync(join(root, "deb", `PromptVault Lite_${VERSION}_amd64.deb`), "x");
    const res = run(root, join(root, "out"));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/appimage|rpm/);
  });

  it("fails when a category holds a stale second bundle", () => {
    const { root, out } = bundles();
    writeFileSync(join(root, "deb", `PromptVault Lite_1.13.1_amd64.deb`), "stale");
    const res = run(root, out);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/exactly one/i);
  });

  it("fails when a bundle name carries the wrong version", () => {
    const { root, out } = bundles({ deb: "PromptVault Lite_1.13.1_amd64.deb" });
    const res = run(root, out);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/version/i);
  });

  it("fails on an empty artifact", () => {
    const root = fixture();
    for (const [d, n] of [
      ["deb", `PromptVault Lite_${VERSION}_amd64.deb`],
      ["rpm", `PromptVault Lite-${VERSION}-1.x86_64.rpm`],
      ["appimage", `PromptVault Lite_${VERSION}_amd64.AppImage`],
    ]) {
      mkdirSync(join(root, d), { recursive: true });
      writeFileSync(join(root, d, n), d === "deb" ? "" : "x");
    }
    const res = run(root, join(root, "out"));
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/empty/i);
  });

  it("rejects a malformed version or commit before touching anything", () => {
    const { root, out } = bundles();
    expect(run(root, out, ["--version", "1.13"]).code).not.toBe(0);
    expect(run(root, out, ["--commit", "short"]).code).not.toBe(0);
  });

  // --- supply-chain staging (--sbom) -----------------------------------------

  /** A minimal, structurally valid CycloneDX 1.6 SBOM for the fixture identity. */
  function sbomBytes(version = VERSION) {
    return `${JSON.stringify(
      {
        bomFormat: "CycloneDX",
        specVersion: "1.6",
        serialNumber: "urn:uuid:0f14d0ab-9605-4a62-a9e4-5ed26688389b",
        version: 1,
        metadata: {
          timestamp: "2026-10-11T05:46:04Z",
          component: {
            type: "application",
            "bom-ref": `pkg:github/Mueller-Systems-Lab/promptvault-lite@${version}`,
            name: "promptvault-lite",
            version,
            purl: `pkg:github/Mueller-Systems-Lab/promptvault-lite@${version}`,
          },
          properties: [{ name: "promptvault:source_commit", value: COMMIT }],
        },
        components: [],
        dependencies: [
          {
            ref: `pkg:github/Mueller-Systems-Lab/promptvault-lite@${version}`,
            dependsOn: [],
          },
        ],
      },
      null,
      2,
    )}\n`;
  }

  it("stages the SBOM and records it hash-bound in the manifest with --sbom", () => {
    const { root, out } = bundles();
    const sbomInput = join(root, "generated-sbom.cdx.json");
    writeFileSync(sbomInput, sbomBytes());
    const res = run(root, out, ["--sbom", sbomInput]);
    expect(res.code).toBe(0);

    const stagedName = `promptvault-lite-${VERSION}-sbom.cdx.json`;
    const staged = join(out, "sbom", stagedName);
    expect(statSync(staged).isFile()).toBe(true);

    const manifest = JSON.parse(
      readFileSync(join(out, "checksums", "promptvault-release-manifest.json"), "utf8"),
    );
    expect(manifest.sbom).toEqual({
      filename: stagedName,
      type: "cyclonedx-json",
      spec_version: "1.6",
      size: statSync(staged).size,
      sha256: sha256(staged),
    });

    // SHA256SUMS keeps describing the packages only (published download
    // verification contract unchanged).
    const sums = readFileSync(join(out, "checksums", "SHA256SUMS.txt"), "utf8").trim().split("\n");
    expect(sums).toHaveLength(3);
    expect(sums.join("\n")).not.toContain("sbom");
  });

  it("produces no sbom entry or directory without --sbom (backwards compatible)", () => {
    const { root, out } = bundles();
    expect(run(root, out).code).toBe(0);
    const manifest = JSON.parse(
      readFileSync(join(out, "checksums", "promptvault-release-manifest.json"), "utf8"),
    );
    expect(manifest.sbom).toBeUndefined();
    expect(existsSync(join(out, "sbom"))).toBe(false);
  });

  it("fails closed when --sbom points at a missing or malformed file", () => {
    const { root, out } = bundles();
    expect(run(root, out, ["--sbom", join(root, "does-not-exist.json")]).code).not.toBe(0);
    const malformed = join(root, "malformed.cdx.json");
    writeFileSync(malformed, "{ not json");
    expect(run(root, out, ["--sbom", malformed]).code).not.toBe(0);
    const notCyclone = join(root, "wrong-format.cdx.json");
    writeFileSync(notCyclone, JSON.stringify({ bomFormat: "SPDX", specVersion: "2.3" }));
    expect(run(root, out, ["--sbom", notCyclone]).code).not.toBe(0);
  });
});
