#!/usr/bin/env node
// =============================================================================
// Release-artifact verifier (Linux desktop releases).
//
// Checks a release staging directory for the properties a published release
// must have:
//
//   G1  The release manifest has the LINUX release schema
//       (release_version / source_commit / assets[]).
//       A CLI/Windows manifest (version / artifacts{}) must be rejected — the
//       two documents share a file name, so the schema is the discriminator.
//   G2  No asset file name contains a character GitHub rewrites
//       (whitespace; the v1.12.0 release shipped dot-rewritten names by accident).
//   G3  Every manifest asset exists on disk with the recorded size and SHA-256.
//   G4  No artifact leaks the build user's home directory, the build host name,
//       this project's build-staging directory names, or a caller-supplied
//       marker. Archives are unpacked before scanning, because a compressed
//       payload hides its strings; an artifact that cannot be unpacked is a
//       hard failure, never a silent pass.
//   G5  Every symlink in the extracted AppImage resolves INSIDE the tree. An
//       absolute `.DirIcon` pointing at the build directory (v1.13.0/v1.13.1)
//       is refused even when that path still exists on the verifying host.
//   G6  No secret-like files (.env, id_rsa, private-key blocks) in a payload.
//   G7  The manifest's release_version/source_commit match the release being
//       published, when the caller names them (`--expect-version`,
//       `--expect-commit`).
//   G8  The artifact set matches the manifest exactly and contains no
//       unexpected files; with `--require-full-set` it must also contain
//       deb + rpm + appimage and a staged SHA256SUMS.txt that agrees with the
//       files.
//
// Usage:
//   node scripts/verify-release-artifacts.mjs <staging-dir> [--forbid <literal>]...
//       [--expect-version <x.y.z>] [--expect-commit <40-hex>] [--require-full-set]
//
// Run this on the machine that built the artifacts: two of the default rules
// ("build user", "build host") are evaluated against the scanning host, so on a
// different machine they describe that host instead of the builder. Use
// --forbid (a literal path fragment) for build-staging locations specific to
// your environment.
//
// <staging-dir> must contain the manifest (at <dir>/ or <dir>/checksums/) and
// the packages (at <dir>/ or <dir>/artifacts/). Exit code 0 = all checks pass.
// =============================================================================
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir, hostname } from "node:os";
import { basename, join, resolve } from "node:path";

import {
  hasPrivateKeyBlock,
  isScannableForSecrets,
  isSecretFileName,
  isUnusableSymlink,
} from "./lib/release-artifacts-rules.mjs";

const failures = [];
const check = (name, fn) => {
  try {
    const detail = fn();
    console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ""}`);
  } catch (e) {
    failures.push(`${name}: ${e.message}`);
    console.error(`  ✗ ${name}: ${e.message}`);
  }
};

const argv = process.argv.slice(2);

// Options that consume the following token. The positional staging directory is
// located by walking the arguments and skipping these values, so
// `verify.mjs --forbid /home/x staging` cannot mistake the forbid value for the
// staging directory (which `argv.find((a) => !a.startsWith("--"))` would).
const OPTIONS_WITH_VALUE = new Set(["forbid", "expect-version", "expect-commit"]);
let stagingArg = null;
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (token.startsWith("--")) {
    if (OPTIONS_WITH_VALUE.has(token.slice(2))) i += 1; // skip its value
    continue;
  }
  if (stagingArg === null) stagingArg = token;
}
const stagingDir = resolve(stagingArg ?? ".");

const forbidArgs = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--forbid" && argv[i + 1]) forbidArgs.push(argv[i + 1]);
}

/** Value of a `--name value` option, or null. */
function option(name) {
  const i = argv.indexOf(`--${name}`);
  return i !== -1 && argv[i + 1] && !argv[i + 1].startsWith("--") ? argv[i + 1] : null;
}

/** True when a boolean `--name` flag is present. */
function flag(name) {
  return argv.includes(`--${name}`);
}

// Expectations supplied by the release workflow. When present they make the
// gate meaningful for THIS release, not just for "some well-formed release":
// a manifest whose version or commit does not match the tag being published is
// a hard failure.
const expectVersion = option("expect-version");
const expectCommit = option("expect-commit");

// --- discovery ---------------------------------------------------------------

function firstExisting(candidates) {
  for (const c of candidates) {
    try {
      if (statSync(c).isFile()) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

function firstExistingDir(candidates) {
  for (const c of candidates) {
    try {
      if (statSync(c).isDirectory()) return c;
    } catch {
      /* keep looking */
    }
  }
  return null;
}

const manifestPath = firstExisting([
  join(stagingDir, "checksums", "promptvault-release-manifest.json"),
  join(stagingDir, "promptvault-release-manifest.json"),
]);
const artifactsDir = firstExistingDir([join(stagingDir, "artifacts")]) ?? stagingDir;

// --- G1: manifest schema -----------------------------------------------------

let manifest = null;
check("G1 release manifest uses the Linux release schema", () => {
  if (!manifestPath) throw new Error("no promptvault-release-manifest.json found");
  manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

  // Reject the CLI/Windows shape explicitly: same file name, different schema.
  if ("artifacts" in manifest || ("version" in manifest && !("release_version" in manifest))) {
    throw new Error(
      "this looks like the CLI/Windows manifest (version/artifacts), not a Linux release manifest",
    );
  }
  if (typeof manifest.release_version !== "string") {
    throw new Error("missing string 'release_version'");
  }
  if (typeof manifest.source_commit !== "string" || !/^[0-9a-f]{40}$/.test(manifest.source_commit)) {
    throw new Error("'source_commit' must be a 40-character commit SHA");
  }
  if (!Array.isArray(manifest.assets) || manifest.assets.length === 0) {
    throw new Error("'assets' must be a non-empty array");
  }
  return `release_version=${manifest.release_version} assets=${manifest.assets.length}`;
});

// --- G2: asset names ---------------------------------------------------------

const artifacts = readdirSync(artifactsDir)
  .map((n) => join(artifactsDir, n))
  .filter((p) => statSync(p).isFile());

check("G2 no asset file name needs rewriting by GitHub", () => {
  const bad = artifacts
    .map((p) => basename(p))
    .filter((n) => /\s/.test(n) || n.includes("?") || n.includes("#"));
  if (bad.length) throw new Error(`unsafe asset name(s): ${bad.join(", ")}`);
  return `${artifacts.length} artifact(s)`;
});

// --- G3: manifest ↔ files ----------------------------------------------------

check("G3 manifest assets match the files on disk", () => {
  if (!manifest?.assets) throw new Error("manifest not usable (see G1)");
  const problems = [];
  for (const asset of manifest.assets) {
    const p = join(artifactsDir, asset.filename);
    let stat;
    try {
      stat = statSync(p);
    } catch {
      problems.push(`${asset.filename}: missing`);
      continue;
    }
    if (stat.size !== asset.size) problems.push(`${asset.filename}: size ${stat.size} ≠ ${asset.size}`);
    const digest = createHash("sha256").update(readFileSync(p)).digest("hex");
    if (digest !== asset.sha256) problems.push(`${asset.filename}: sha256 mismatch`);
  }
  if (problems.length) throw new Error(problems.join("; "));
  return `${manifest.assets.length} asset(s) verified`;
});

// --- G4: prohibited paths ----------------------------------------------------

// Deliberately precise rules: generic markers such as "/media/" or "/tmp/"
// also occur inside bundled system libraries (GLib ships removable-media mount
// paths), so a substring rule on those produces false positives. Matching the
// *build user*, the *build host* and this project's own staging directory
// naming avoids that while still catching a leaked build path from a removable
// media mount or from a Windows user profile directory.
const buildUser = basename(homedir());
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const userInBuildPath = new RegExp(`/(home|media|mnt|opt|Users)/${escapeRe(buildUser)}`);
const forbidden = [
  { label: "build user home directory", test: (s) => s.includes(homedir()) },
  { label: "build user in a build path", test: (s) => userInBuildPath.test(s) },
  { label: "build host name", test: (s) => s.includes(hostname()) },
  { label: "Windows user profile", test: (s) => /[A-Za-z]:\\Users\\/.test(s) },
  // This project's worktree/staging directory convention (pvl-*). A release
  // built from such a directory embeds it in the AppImage, which is exactly the
  // v1.13.0 leak: build from a neutral target directory instead. Note that
  // "promptvault-*" is deliberately NOT a rule: the product's own crate
  // directories (crates/promptvault-core, crates/promptvault-server) appear in
  // shipped binaries as legitimate relative source paths, so that pattern
  // cannot distinguish a leak. Pass --forbid for any other staging path.
  //
  // The pattern needs a hyphen and a trailing separator, so a marker that ends
  // the string (…/pvl-v1.13.0 with no further component) or a `pvl_` spelling is
  // not matched — use --forbid for staging names outside this convention.
  { label: "project staging directory", test: (s) => /\/[A-Za-z0-9._-]*pvl-[A-Za-z0-9._-]+\//.test(s) },
  // --forbid takes a literal string (a staging path), not a regex: escaping it
  // keeps a path with `.` or `+` from over-matching unrelated bytes.
  ...forbidArgs.map((literal) => ({
    label: `forbidden literal ${JSON.stringify(literal)}`,
    test: (s) => s.includes(literal),
  })),
];

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    // A symlink is scanned for its *target string*: the AppImage .DirIcon leak
    // is an absolute symlink, so the payload hides in the link, not the file.
    if (entry.isSymbolicLink()) out.push(p);
    else if (entry.isDirectory()) walk(p, out);
    else if (entry.isFile()) out.push(p);
  }
  return out;
}

function scanBuffer(where, buf) {
  const text = buf.toString("latin1");
  const hits = [];
  for (const rule of forbidden) {
    if (rule.test(text)) hits.push(`${where}: ${rule.label}`);
  }
  return hits;
}

// --- unpacking (shared by G4/G5/G6) -----------------------------------------

/** Unpack an archive so its (compressed) payload can be scanned. */
function unpack(artifact, workDir) {
  const name = basename(artifact);
  const lower = name.toLowerCase();
  const dest = join(workDir, `${name}.d`);
  const kinds = [
    {
      match: lower.endsWith(".deb"),
      what: "Debian package (dpkg-deb)",
      run: () => execFileSync("dpkg-deb", ["-x", artifact, dest], { stdio: "ignore" }),
      roots: () => [dest],
    },
    {
      match: lower.endsWith(".appimage"),
      what: "AppImage (--appimage-extract)",
      run: () => execFileSync(artifact, ["--appimage-extract"], { cwd: workDir, stdio: "ignore" }),
      roots: () => [join(workDir, "squashfs-root")],
    },
    {
      match: lower.endsWith(".rpm"),
      what: "RPM package (7z)",
      run: () => execFileSync("7z", ["x", "-y", `-o${dest}`, artifact], { stdio: "ignore" }),
      roots: () => [dest],
    },
  ];
  const kind = kinds.find((k) => k.match);
  if (!kind) return []; // not an archive type we know: raw bytes were already scanned
  try {
    kind.run();
  } catch (e) {
    // Fail closed: a release gate must not pass an artifact it cannot inspect.
    // This also triggers when the unpack tool is missing on the scanning host.
    throw new Error(
      `${name}: could not unpack for scanning via ${kind.what} — ` +
        `${e.message.split("\n")[0]}. A gate must not pass what it cannot inspect.`,
    );
  }
  return kind.roots();
}

// Unpack everything ONCE. G4/G5/G6 all inspect the extracted payloads, and a
// failure to unpack must fail every one of them — never silently skip a gate.
const workDir = mkdtempSync(join(tmpdir(), "pv-scan-"));
let unpackError = null;
const extracted = [];
try {
  for (const artifact of artifacts) {
    extracted.push({
      name: basename(artifact),
      isAppImage: artifact.toLowerCase().endsWith(".appimage"),
      roots: unpack(artifact, workDir),
    });
  }
} catch (e) {
  unpackError = e.message;
}

// --- G4: prohibited paths ----------------------------------------------------

check("G4 artifacts leak no private or ephemeral build path", () => {
  if (unpackError) throw new Error(unpackError);
  const hits = [];
  for (const { name, roots } of extracted) {
    hits.push(...scanBuffer(name, readFileSync(join(artifactsDir, name))));
    for (const root of roots) {
      for (const file of walk(root)) {
        const rel = `${name}!${file.slice(root.length)}`;
        if (lstatSync(file).isSymbolicLink()) {
          hits.push(...scanBuffer(`${rel} ->`, Buffer.from(readlinkSync(file), "latin1")));
        } else {
          hits.push(...scanBuffer(rel, readFileSync(file)));
        }
      }
    }
  }
  if (hits.length) throw new Error(`${hits.length} hit(s): ${hits.slice(0, 6).join("; ")}`);
  return `${artifacts.length} artifact(s) clean`;
});

// --- G5: symlink integrity in the AppImage -----------------------------------

// An AppImage is a *self-contained* directory tree: every symlink in it has to
// resolve INSIDE the tree. A link that points at the build machine's filesystem
// is wrong even when that path still exists on the verifying host — which is
// exactly why this gate must not be satisfied by "the target happens to exist
// here". The v1.13.0/v1.13.1 `.DirIcon` was such an absolute link.
//
// Scope: the AppImage only. A .deb/.rpm legitimately ships absolute symlinks
// into system paths (`/lib/...`) that live outside the payload, so the rule
// would be a false-positive generator there.
check("G5 AppImage symlinks resolve inside the extracted tree", () => {
  if (unpackError) throw new Error(unpackError);
  const appimages = extracted.filter((e) => e.isAppImage);
  if (appimages.length === 0) return "no AppImage in this set";
  const broken = [];
  for (const { name, roots } of appimages) {
    for (const root of roots) {
      for (const file of walk(root)) {
        if (!lstatSync(file).isSymbolicLink()) continue;
        if (isUnusableSymlink(file, root)) {
          broken.push(`${name}!${file.slice(root.length)} -> ${readlinkSync(file)}`);
        }
      }
    }
  }
  if (broken.length) {
    throw new Error(
      `${broken.length} symlink(s) in the AppImage do not resolve inside the tree: ` +
        `${broken.slice(0, 6).join("; ")}`,
    );
  }
  return "all symlinks resolve inside the tree";
});

// --- G6: secret-like files in the payload ------------------------------------

// File-name based, so it cannot trip over a bundled library that merely
// contains the word "secret". These names have no business in a desktop bundle.
check("G6 payloads contain no secret-like files", () => {
  if (unpackError) throw new Error(unpackError);
  const hits = [];
  for (const { name, roots } of extracted) {
    for (const root of roots) {
      for (const file of walk(root)) {
        const rel = `${name}!${file.slice(root.length)}`;
        if (isSecretFileName(file)) {
          hits.push(`${rel}: secret-like file name`);
          continue;
        }
        // Only small files are content-scanned; a bundled multi-MB library is
        // not a plausible key store.
        if (isScannableForSecrets(file) && hasPrivateKeyBlock(readFileSync(file).toString("latin1"))) {
          hits.push(`${rel}: private key block`);
        }
      }
    }
  }
  if (hits.length) throw new Error(`${hits.length} hit(s): ${hits.slice(0, 6).join("; ")}`);
  return "no secret-like files";
});

// --- G7: manifest identity vs the release being published --------------------

// Only enforced when the caller names the expected identity. The release
// workflow passes both, which is what turns "a well-formed manifest" into "the
// manifest for THIS tag".
check("G7 manifest identity matches the release being published", () => {
  if (!manifest?.release_version) throw new Error("manifest not usable (see G1)");
  if (!expectVersion && !expectCommit) {
    return "no expectation given (--expect-version/--expect-commit)";
  }
  const problems = [];
  if (expectVersion && manifest.release_version !== expectVersion) {
    problems.push(`release_version ${manifest.release_version} ≠ ${expectVersion}`);
  }
  if (expectCommit && manifest.source_commit !== expectCommit) {
    problems.push(`source_commit ${manifest.source_commit} ≠ ${expectCommit}`);
  }
  if (problems.length) throw new Error(problems.join("; "));
  return `version=${manifest.release_version} commit=${manifest.source_commit.slice(0, 12)}`;
});

// --- G8: exact asset set + checksum file -------------------------------------

// The published release must be exactly the expected packages — an extra file
// in the staging directory is either a stale build or an accidental upload, and
// both must stop the release rather than be published.
//
// Two independent comparisons, because either alone is escapable:
//   - the on-disk set against the *manifest* (so a manifest that under-lists
//     the files on disk is caught);
//   - the on-disk set against the expected package extensions (so an extra
//     file with a package extension — e.g. a second `.deb` — is caught too,
//     which a suffix test alone would miss).
//
// The *completeness* half (all three package types present) is opt-in via
// `--require-full-set`, which the release workflow always passes. The verifier
// is also used against partial sets (single-package fixtures, a CLI-only
// release), and demanding an AppImage there would make it unusable. Under
// `--require-full-set` a staged SHA256SUMS.txt is mandatory: the published
// `sha256sum -c` has to be backed by something the gate checked.
const EXPECTED_SUFFIXES = [".deb", ".rpm", ".appimage"];
check("G8 asset set matches the manifest and holds no unexpected files", () => {
  const names = artifacts.map((p) => basename(p)).sort();
  if (names.length === 0) throw new Error("no artifacts found");
  const unexpected = names.filter(
    (n) => !EXPECTED_SUFFIXES.some((s) => n.toLowerCase().endsWith(s)),
  );
  if (unexpected.length) throw new Error(`unexpected asset(s): ${unexpected.join(", ")}`);

  if (!manifest?.assets) throw new Error("manifest not usable (see G1)");
  const inManifest = manifest.assets.map((a) => a.filename).sort();
  const onlyOnDisk = names.filter((n) => !inManifest.includes(n));
  const onlyInManifest = inManifest.filter((n) => !names.includes(n));
  if (onlyOnDisk.length) throw new Error(`on disk but not in the manifest: ${onlyOnDisk.join(", ")}`);
  if (onlyInManifest.length) {
    throw new Error(`in the manifest but not on disk: ${onlyInManifest.join(", ")}`);
  }
  // A manifest that lists the same file twice would let the set above pass with
  // a duplicate on disk.
  if (new Set(inManifest).size !== inManifest.length) {
    throw new Error("manifest lists the same asset twice");
  }

  if (flag("require-full-set")) {
    const missing = EXPECTED_SUFFIXES.filter((s) => !names.some((n) => n.toLowerCase().endsWith(s)));
    if (missing.length) throw new Error(`missing package type(s): ${missing.join(", ")}`);
  }
  return names.join(", ");
});

// The published `sha256sum -c SHA256SUMS.txt` must be backed by the gate.
check("G8b SHA256SUMS.txt agrees with the artifacts", () => {
  const sums = firstExisting([
    join(stagingDir, "checksums", "SHA256SUMS.txt"),
    join(stagingDir, "SHA256SUMS.txt"),
  ]);
  if (!sums) {
    if (flag("require-full-set")) {
      throw new Error("no SHA256SUMS.txt staged (required with --require-full-set)");
    }
    return "no SHA256SUMS.txt staged";
  }
  const onDisk = new Map(
    artifacts.map((p) => [basename(p), createHash("sha256").update(readFileSync(p)).digest("hex")]),
  );
  const listed = new Map();
  for (const line of readFileSync(sums, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const m = /^([0-9a-f]{64})\s+\*?(.+)$/.exec(trimmed);
    if (!m) throw new Error(`unparsable line in SHA256SUMS.txt: ${trimmed}`);
    listed.set(m[2], m[1]);
  }
  if (listed.size === 0) throw new Error("SHA256SUMS.txt is empty");
  const problems = [];
  for (const [name, digest] of listed) {
    if (!onDisk.has(name)) problems.push(`${name}: listed but not staged`);
    else if (onDisk.get(name) !== digest) problems.push(`${name}: sha256 mismatch`);
  }
  for (const name of onDisk.keys()) {
    if (!listed.has(name)) problems.push(`${name}: staged but not listed`);
  }
  if (problems.length) throw new Error(problems.join("; "));
  return `${listed.size} checksum(s) verified`;
});

// Extracted trees were only needed for the gates above.
rmSync(workDir, { recursive: true, force: true });

console.log("");
if (failures.length) {
  console.error(`RELEASE ARTIFACTS: FAIL (${failures.length})`);
  process.exit(1);
}
console.log("RELEASE ARTIFACTS: PASS");
