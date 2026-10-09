#!/usr/bin/env node
// =============================================================================
// Stage a Linux release set (v1.13.2 release automation).
//
// Turns the Tauri bundle output into the exact, canonical release staging
// layout that `scripts/verify-release-artifacts.mjs` inspects and that the
// release workflow publishes:
//
//   <out>/artifacts/<3 packages, GitHub-safe names, no whitespace>
//   <out>/checksums/promptvault-release-manifest.json
//   <out>/checksums/SHA256SUMS.txt
//
// Why a separate staging step at all: Tauri writes `PromptVault Lite_<v>_amd64.deb`
// — with a space, which GitHub rewrites to a dot on upload (the v1.12.0 asset
// name accident). Staging renames to the canonical hyphenated form, records the
// size/SHA-256 of every file, and refuses to produce a set that is incomplete,
// ambiguous or tagged with the wrong version. The verify step runs afterwards
// and is the gate; this step only guarantees the gate has a well-formed input.
//
// Fail-closed: a missing category, more than one match per category, a file
// whose name does not carry the expected version, or an unexpected extra file
// all abort with a non-zero exit.
//
// Usage:
//   node scripts/release/stage-linux-release.mjs \
//     --bundles <src-tauri/target/release/bundle> \
//     --version 1.13.2 --commit <40-hex> --out <staging-dir>
// =============================================================================
import { createHash } from "node:crypto";
import {
  chmodSync,
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, join, resolve } from "node:path";

/** Last `--name value` wins, so a caller can override an earlier default. */
function arg(name) {
  for (let i = process.argv.length - 1; i >= 0; i -= 1) {
    if (process.argv[i] === `--${name}`) {
      return process.argv[i + 1] ?? null;
    }
  }
  return null;
}

const bundles = arg("bundles");
const version = arg("version");
const commit = arg("commit");
const out = arg("out");

for (const [label, value] of [
  ["--bundles", bundles],
  ["--version", version],
  ["--commit", commit],
  ["--out", out],
]) {
  if (!value) {
    console.error(`stage-linux-release: missing required ${label}`);
    process.exit(2);
  }
}
if (!/^\d+\.\d+\.\d+$/.test(version)) {
  console.error(`stage-linux-release: --version must be x.y.z, got '${version}'`);
  process.exit(2);
}
if (!/^[0-9a-f]{40}$/.test(commit)) {
  console.error("stage-linux-release: --commit must be a 40-character commit SHA");
  process.exit(2);
}

const bundlesDir = resolve(bundles);
const outDir = resolve(out);

/** The canonical, GitHub-safe name for a bundle produced by Tauri. */
function canonicalName(file, category) {
  // Tauri uses the product name verbatim: "PromptVault Lite_1.13.2_amd64.deb".
  // GitHub rewrites whitespace in asset names, so the staged name must not
  // contain any. Replace every run of whitespace with a single hyphen.
  const name = basename(file).replace(/\s+/g, "-");
  if (/\s/.test(name)) throw new Error(`staged name still has whitespace: ${name}`);
  if (!name.includes(version)) {
    throw new Error(
      `${category}: '${name}' does not carry the release version ${version} — ` +
        `version string drift between the bundle and the release`,
    );
  }
  return name;
}

function stageCategory(category, ext) {
  const dir = join(bundlesDir, category);
  let matches;
  try {
    matches = readdirSync(dir).filter((n) => n.toLowerCase().endsWith(ext));
  } catch {
    throw new Error(`${category}: bundle directory not found: ${dir}`);
  }
  if (matches.length === 0) {
    throw new Error(`${category}: no ${ext} bundle in ${dir}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `${category}: expected exactly one ${ext} bundle, found ${matches.length} ` +
        `(${matches.join(", ")}) — a stale build is still present`,
    );
  }
  return join(dir, matches[0]);
}

function sha256(file) {
  return createHash("sha256").update(readFileSync(file)).digest("hex");
}

const categories = [
  { category: "deb", ext: ".deb", type: "deb" },
  { category: "rpm", ext: ".rpm", type: "rpm" },
  { category: "appimage", ext: ".appimage", type: "appimage" },
];

try {
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(outDir, "artifacts"), { recursive: true });
  mkdirSync(join(outDir, "checksums"), { recursive: true });

  const assets = [];
  for (const { category, ext, type } of categories) {
    const source = stageCategory(category, ext);
    const name = canonicalName(source, category);
    const dest = join(outDir, "artifacts", name);
    copyFileSync(source, dest);
    // The AppImage must stay executable: a direct download has to run.
    if (type === "appimage") chmodSync(dest, 0o755);
    const size = statSync(dest).size;
    if (size === 0) throw new Error(`${name}: staged file is empty`);
    assets.push({ filename: name, type, size, sha256: sha256(dest) });
    console.log(`  staged ${name} (${size} bytes)`);
  }

  // Manifest + SHA256SUMS both sorted by file name, matching the published
  // v1.12.0/v1.13.x convention so downstream tooling keeps working.
  assets.sort((a, b) => (a.filename < b.filename ? -1 : a.filename > b.filename ? 1 : 0));

  const manifest = {
    schema_version: 1,
    release_version: version,
    source_commit: commit,
    generated_at: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    platform: "linux",
    architecture: "x86_64",
    assets,
  };
  writeFileSync(
    join(outDir, "checksums", "promptvault-release-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  writeFileSync(
    join(outDir, "checksums", "SHA256SUMS.txt"),
    `${assets.map((a) => `${a.sha256}  ${a.filename}`).join("\n")}\n`,
  );

  console.log(`staged ${assets.length} artifacts for ${version} @ ${commit}`);
} catch (e) {
  console.error(`stage-linux-release: FAIL — ${e.message}`);
  process.exit(1);
}
