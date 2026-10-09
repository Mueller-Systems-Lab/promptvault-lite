// Tests for scripts/lib/release-artifacts-rules.mjs — the pure rules behind the
// new verifier gates (G5 symlink integrity, G6 secret-like files).
//
// These are the rules that make the v1.13.0/v1.13.1 `.DirIcon` defect a hard
// failure: the AppImage stored an *absolute* symlink into the build tree, so
// after extraction it pointed at nothing. G5 runs that rule across a real
// AppImage (proven against the published v1.13.1 artifact); here the rule
// itself is pinned against real symlinks on disk.
//
// Run: pnpm vitest run scripts/__tests__/release-artifact-rules.test.js
// @vitest-environment node
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

import {
  hasPrivateKeyBlock,
  isDanglingSymlink,
  isScannableForSecrets,
  isSecretFileName,
  resolveLinkTarget,
} from "../lib/release-artifacts-rules.mjs";

const cleanups = [];
afterEach(() => {
  for (const dir of cleanups.splice(0)) rmSync(dir, { recursive: true, force: true });
});

function fixtureDir() {
  const dir = mkdtempSync(join(tmpdir(), "pv-rules-"));
  cleanups.push(dir);
  return dir;
}

describe("resolveLinkTarget", () => {
  it("resolves a relative target against the link's own directory", () => {
    expect(resolveLinkTarget("/a/b/link", "icon.png")).toBe("/a/b/icon.png");
    expect(resolveLinkTarget("/a/b/link", "sub/icon.png")).toBe("/a/b/sub/icon.png");
  });

  it("keeps an absolute target verbatim", () => {
    expect(resolveLinkTarget("/a/b/link", "/somewhere/else/icon.png")).toBe(
      "/somewhere/else/icon.png",
    );
  });
});

describe("isDanglingSymlink", () => {
  it("reports a relative symlink to an existing file as intact", () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "icon.png"), "x");
    const link = join(dir, "relative-link");
    symlinkSync("icon.png", link);
    expect(isDanglingSymlink(link)).toBe(false);
  });

  it("reports a relative symlink to a missing file as dangling", () => {
    const dir = fixtureDir();
    const link = join(dir, "broken-relative");
    symlinkSync("does-not-exist.png", link);
    expect(isDanglingSymlink(link)).toBe(true);
  });

  it("reports an absolute symlink into another tree as dangling", () => {
    // This is exactly the v1.13.1 .DirIcon shape.
    const dir = fixtureDir();
    const link = join(dir, ".DirIcon");
    symlinkSync("/mnt/other/pvbuild/release/bundle/appimage/App.AppDir/App.png", link);
    expect(isDanglingSymlink(link)).toBe(true);
  });

  it("reports an absolute symlink to an existing path as intact", () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "target.png"), "x");
    const link = join(dir, ".DirIcon");
    symlinkSync(join(dir, "target.png"), link);
    expect(isDanglingSymlink(link)).toBe(false);
  });

  it("returns false for a path that is not a symlink", () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "plain.png"), "x");
    expect(isDanglingSymlink(join(dir, "plain.png"))).toBe(false);
    expect(isDanglingSymlink(join(dir, "missing.png"))).toBe(false);
  });

  it("follows a chain of relative symlinks", () => {
    const dir = fixtureDir();
    mkdirSync(join(dir, "fak"), { recursive: true });
    writeFileSync(join(dir, "real.png"), "x");
    symlinkSync("../real.png", join(dir, "fak", "one"));
    symlinkSync("one", join(dir, "fak", "two"));
    expect(isDanglingSymlink(join(dir, "fak", "two"))).toBe(false);
  });
});

describe("secret-like files", () => {
  it("recognizes credential file names", () => {
    for (const name of [".env", "id_rsa", "id_ed25519", ".netrc", "credentials.json"]) {
      expect(isSecretFileName(`/opt/app/${name}`)).toBe(true);
    }
    expect(isSecretFileName("/opt/app/promptvault-lite")).toBe(false);
    expect(isSecretFileName("/opt/app/notes.md")).toBe(false);
  });

  it("detects private key blocks by content, not just by name", () => {
    expect(hasPrivateKeyBlock("-----BEGIN PRIVATE KEY-----\nabc\n")).toBe(true);
    expect(hasPrivateKeyBlock("-----BEGIN OPENSSH PRIVATE KEY-----\n")).toBe(true);
    expect(hasPrivateKeyBlock("-----BEGIN RSA PRIVATE KEY-----\n")).toBe(true);
    expect(hasPrivateKeyBlock("-----BEGIN PUBLIC KEY-----\n")).toBe(false);
    expect(hasPrivateKeyBlock("# just a prompt")).toBe(false);
  });

  it("only content-scans plausible credential-sized files", () => {
    const dir = fixtureDir();
    writeFileSync(join(dir, "small.txt"), "x");
    expect(isScannableForSecrets(join(dir, "small.txt"))).toBe(true);

    writeFileSync(join(dir, "empty.txt"), "");
    expect(isScannableForSecrets(join(dir, "empty.txt"))).toBe(false);

    const big = join(dir, "big.bin");
    writeFileSync(big, "x".repeat(200 * 1024));
    expect(isScannableForSecrets(big)).toBe(false);

    expect(isScannableForSecrets(join(dir, "missing"))).toBe(false);
  });
});
