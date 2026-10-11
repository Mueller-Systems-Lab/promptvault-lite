// Tests for the SBOM half of scripts/verify-release-artifacts.mjs (gate G9)
// and its fail-closed interaction with `--require-sbom`.
//
// A release that ships an SBOM must ship one whose bytes are bound to the
// manifest (size + sha256) and whose content passes the structural validator
// against the release identity. Every mutation below must stop the gate.
//
// Like release-artifact-scan.test.js, the fixtures are REAL minimal .deb
// archives, so the surrounding verifier gates keep passing and G9 alone
// decides the outcome.
//
// Run: pnpm vitest run scripts/__tests__/release-verifier-sbom.test.js
// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";

const TEST_DIR = dirname(fileURLToPath(import.meta.url));
const SCRIPT = resolve(TEST_DIR, "..", "verify-release-artifacts.mjs");

const VERSION = "1.13.1";
const COMMIT = "bd001f48d162612b38af608684083fe639aecb66";
const SBOM_NAME = `promptvault-lite-${VERSION}-sbom.cdx.json`;

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

function buildDeb(destDir, name) {
  const root = join(destDir, `${name}.tree`);
  mkdirSync(join(root, "DEBIAN"), { recursive: true });
  writeFileSync(
    join(root, "DEBIAN", "control"),
    "Package: promptvault-fixture\nVersion: 1.13.1\nArchitecture: amd64\n" +
      "Maintainer: test <test@example.invalid>\nDescription: fixture\n",
  );
  writeFileSync(join(root, "payload.txt"), "clean payload");
  const file = join(destDir, name);
  execFileSync("dpkg-deb", ["--build", root, file], { stdio: "ignore" });
  return file;
}

/** A minimal, structurally valid CycloneDX SBOM for the fixture identity. */
function sbomBytes({ version = VERSION, commit = COMMIT, extra = (bom) => bom } = {}) {
  const bom = {
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
      properties: [{ name: "promptvault:source_commit", value: commit }],
    },
    components: [
      {
        type: "library",
        "bom-ref": "pkg:npm/react@18.3.1",
        name: "react",
        version: "18.3.1",
        purl: "pkg:npm/react@18.3.1",
      },
    ],
    dependencies: [
      {
        ref: `pkg:github/Mueller-Systems-Lab/promptvault-lite@${version}`,
        dependsOn: ["pkg:npm/react@18.3.1"],
      },
    ],
  };
  return `${JSON.stringify(extra(bom), null, 2)}\n`;
}

/**
 * Build a staging dir with one real .deb, checksums, and (unless `omitSbom`)
 * a staged SBOM recorded in the manifest.
 */
function makeStaging({ omitSbom = false, sbomContent = sbomBytes(), manifestOverrides } = {}) {
  const dir = mkdtempSync(join(tmpdir(), "pv-sbom-gate-"));
  cleanups.push(dir);
  mkdirSync(join(dir, "artifacts"));
  mkdirSync(join(dir, "checksums"));
  const debName = "PromptVault-Lite_1.13.1_amd64.deb";
  const deb = buildDeb(join(dir, "artifacts"), debName);

  const manifest = {
    schema_version: 1,
    release_version: VERSION,
    source_commit: COMMIT,
    platform: "linux",
    architecture: "x86_64",
    assets: [
      { filename: debName, type: "deb", size: readFileSync(deb).length, sha256: sha256(deb) },
    ],
    ...(manifestOverrides ? {} : {}),
  };
  if (!omitSbom) {
    mkdirSync(join(dir, "sbom"));
    const sbomFile = join(dir, "sbom", SBOM_NAME);
    writeFileSync(sbomFile, sbomContent);
    manifest.sbom = {
      filename: SBOM_NAME,
      type: "cyclonedx-json",
      spec_version: "1.6",
      size: readFileSync(sbomFile).length,
      sha256: sha256(sbomFile),
    };
  }
  writeFileSync(
    join(dir, "checksums", "promptvault-release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  return { dir, manifest };
}

function applyManifest(dir, mutate) {
  const path = join(dir, "checksums", "promptvault-release-manifest.json");
  const manifest = JSON.parse(readFileSync(path, "utf8"));
  mutate(manifest);
  writeFileSync(path, `${JSON.stringify(manifest, null, 2)}\n`);
}

function run(stagingDir, extra = []) {
  try {
    const out = execFileSync("node", [SCRIPT, stagingDir, ...extra], { encoding: "utf8" });
    return { code: 0, out };
  } catch (e) {
    return { code: e.status ?? 1, out: `${e.stdout ?? ""}${e.stderr ?? ""}` };
  }
}

describe("verify-release-artifacts — G9 SBOM gate", () => {
  it("passes a staged, hash-bound, structurally valid SBOM with --require-sbom", () => {
    const { dir } = makeStaging();
    const res = run(dir, ["--require-sbom"]);
    expect(res.out).toContain("RELEASE ARTIFACTS: PASS");
    expect(res.code).toBe(0);
    expect(res.out).toMatch(/G9.*SBOM/i);
  });

  it("fails closed when --require-sbom is given but the manifest has no sbom entry", () => {
    const { dir } = makeStaging({ omitSbom: true });
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/sbom/i);
  });

  it("still accepts a legacy manifest without an sbom entry when --require-sbom is absent", () => {
    const { dir } = makeStaging({ omitSbom: true });
    const res = run(dir);
    expect(res.code).toBe(0);
    expect(res.out).toContain("RELEASE ARTIFACTS: PASS");
  });

  it("fails when the recorded SBOM hash does not match the staged file", () => {
    const { dir } = makeStaging();
    writeFileSync(join(dir, "sbom", SBOM_NAME), sbomBytes().replace("react", "reactjs"));
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/sha256/i);
  });

  it("fails when the manifest records an SBOM but the file is not staged", () => {
    const { dir } = makeStaging();
    rmSync(join(dir, "sbom", SBOM_NAME));
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/not staged|missing/i);
  });

  it("fails when the staged SBOM is structurally invalid (wrong root version)", () => {
    const { dir } = makeStaging({ sbomContent: sbomBytes({ version: "9.9.9" }) });
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/version/i);
  });

  it("fails when the staged SBOM binds a different source commit", () => {
    const { dir } = makeStaging({ sbomContent: sbomBytes({ commit: "0".repeat(40) }) });
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/source_commit/i);
  });

  it("fails when the staged SBOM leaks a private path", () => {
    const { dir } = makeStaging({
      sbomContent: sbomBytes({
        extra: (bom) => {
          bom.components.push({
            type: "library",
            "bom-ref": "pkg:npm/leaky@1.0.0",
            name: "leaky",
            version: "1.0.0",
            purl: "pkg:npm/leaky@1.0.0",
            description: "from /home/xxammaxx/secret-build",
          });
          return bom;
        },
      }),
    });
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/private path|leak/i);
  });

  it("fails when the manifest sbom entry is malformed (missing sha256)", () => {
    const { dir } = makeStaging();
    applyManifest(dir, (m) => {
      delete m.sbom.sha256;
    });
    const res = run(dir, ["--require-sbom"]);
    expect(res.code).not.toBe(0);
    expect(res.out).toMatch(/sbom/i);
  });
});
