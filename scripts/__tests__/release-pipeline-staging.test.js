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
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
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
});
