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
//
// Usage:
//   node scripts/verify-release-artifacts.mjs <staging-dir> [--forbid <regex>]...
//
// <staging-dir> must contain the manifest (at <dir>/ or <dir>/checksums/) and
// the packages (at <dir>/ or <dir>/artifacts/). Exit code 0 = all checks pass.
// =============================================================================
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdtempSync, lstatSync, readdirSync, readFileSync, readlinkSync, rmSync, statSync } from "node:fs";
import { tmpdir, homedir, hostname } from "node:os";
import { basename, join, resolve } from "node:path";

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
const stagingDir = resolve(argv.find((a) => !a.startsWith("--")) ?? ".");
const forbidArgs = [];
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--forbid" && argv[i + 1]) forbidArgs.push(argv[i + 1]);
}

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
  ...forbidArgs.map((re) => ({
    label: `forbidden pattern /${re}/`,
    test: (s) => new RegExp(re).test(s),
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

check("G4 artifacts leak no private or ephemeral build path", () => {
  const workDir = mkdtempSync(join(tmpdir(), "pv-scan-"));
  try {
    const hits = [];
    for (const artifact of artifacts) {
      hits.push(...scanBuffer(basename(artifact), readFileSync(artifact)));
      for (const root of unpack(artifact, workDir)) {
        for (const file of walk(root)) {
          const rel = `${basename(artifact)}!${file.slice(root.length)}`;
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
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

console.log("");
if (failures.length) {
  console.error(`RELEASE ARTIFACTS: FAIL (${failures.length})`);
  process.exit(1);
}
console.log("RELEASE ARTIFACTS: PASS");
