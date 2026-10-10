#!/usr/bin/env node
// Canonical, fail-closed review-package builder.
//
// Privacy contract (see docs/audits/reviews/README.md):
//   * The default package contains TRACKED repository state ONLY.
//     Every untracked path is excluded by construction — UNTRACKED != SAFE.
//   * A path being inside the repository directory is never permission to
//     package it. Restricted corpora (.aws/, Promps/, .env*, key material,
//     credentials, caches) stay out even when tracked.
//   * Untracked content enters only through an explicit, authorized,
//     exact-path allowlist, and a restricted path is refused even then.
//   * Symlinks that resolve outside the repository root abort the run.
//
// The inventory (metadata) is sanitized. It names only material that is already
// visible, or that the operator explicitly handed over:
//   * included paths, and excluded TRACKED paths — already in the Git tree;
//   * withheld symlink TARGETS are never named (only a category);
//   * UNTRACKED names are counted, never named — the single exception is a path
//     the operator explicitly allowlisted (`allowlisted_untracked`), which is the
//     contract's required explicit authorization, not an automatic disclosure.
//
// Usage:
//   node scripts/create-review-package.mjs [--out DIR] [--json]
//        [--allow-untracked <relpath> --authorized-untracked --purpose <text>]
//
// Exit codes: 0 ok, 1 error (fail-closed), 2 usage error.

import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  realpathSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, isAbsolute, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { validateProjectContext } from "../tools/validate-project-contract.mjs";

const TOOL_VERSION = "1.0.0";
const POLICY_VERSION = "review-package-privacy-v1";
const CONTRACT_RELATIVE = ".agents/project-contract.v1.json";

// Defence in depth: even if the contract's restricted list were narrowed, these
// roots never leave the machine in a review package.
const BASELINE_RESTRICTED = [
  "Promps",
  "Promps/**",
  ".aws",
  ".aws/**",
  ".git/**",
  "node_modules/**",
  "target/**",
  "dist/**",
  "build/**",
  ".playwright-mcp/**",
  "playwright-report/**",
  "test-results/**",
  "coverage/**",
  ".cache/**",
  ".tmp/**",
  ".superpowers/**",
  ".env",
  ".env.*",
  "**/.env",
  "**/.env.*",
  "**/*.pem",
  "**/*.key",
  "**/*.p12",
  "**/*.pfx",
  "**/id_rsa",
  "**/id_rsa.*",
  "**/id_ed25519*",
  "**/credentials",
  "**/credentials.json",
  "**/secrets.json",
  "**/*.db",
  "**/*.sqlite",
  "**/*.sqlite3",
];

// Named private roots reported in the inventory by count only.
const NAMED_PRIVATE_ROOTS = ["Promps", ".aws"];

// Generated metadata entries; a tracked path with one of these names is refused
// (see RESERVED_NAME_COLLISION) rather than silently duplicated.
const RESERVED_ENTRY_NAMES = new Set(["inventory.json", "MANIFEST.sha256"]);

// A tracked placeholder such as `.env.example` carries no secret by convention;
// it is the one `.env*` form that stays packageable, and the inventory labels it.
const EXAMPLE_CONFIG = /^(.*\/)?\.env\.(example|sample|template|dist)$/;

function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function gitZ(args, cwd) {
  const out = execFileSync("git", args, { cwd, stdio: ["ignore", "pipe", "pipe"] });
  return out.toString("utf8").split("\0").filter(Boolean);
}

function within(parent, candidate) {
  const rel = relative(parent, candidate);
  return rel === "" || (!rel.startsWith(`..${sep}`) && rel !== ".." && !isAbsolute(rel));
}

function globToRegExp(glob) {
  let pattern = "^";
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index];
    if (char === "*" && glob[index + 1] === "*") {
      pattern += ".*";
      index += 1;
    } else if (char === "*") pattern += "[^/]*";
    else pattern += char.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
  }
  return new RegExp(`${pattern}$`);
}

export function isExampleConfig(relPath) {
  return EXAMPLE_CONFIG.test(relPath);
}

/**
 * A path that cannot be represented portably (backslash separators, NUL,
 * absolute) is refused rather than silently rewritten: on Linux a backslash is
 * a legal filename character, so normalizing it would alias a different path.
 */
export function isUnrepresentable(relPath) {
  return relPath.includes("\\") || relPath.includes("\0") || isAbsolute(relPath);
}

export function isRestrictedPath(relPath, restrictedGlobs) {
  if (isExampleConfig(relPath)) return false;
  // Normalize backslashes for *matching only*: this can only widen matches, so
  // it is fail-closed (`Promps\private.md` is caught just like `Promps/private.md`).
  const normalized = relPath.replaceAll("\\", "/").replace(/^\.\//, "");
  return restrictedGlobs.some((glob) => globToRegExp(glob).test(normalized));
}

/**
 * Pure, side-effect-free classification of candidate paths.
 * Exported so the privacy boundary can be probed directly by tests.
 *
 * @returns {{included: string[], excluded: {path: string, reason: string}[]}}
 */
export function classifyPaths({ tracked = [], untracked = [], restrictedGlobs = [], allowUntracked = [] }) {
  const included = [];
  const excluded = [];
  const allowSet = new Set(allowUntracked.map((p) => p.replace(/^\.\//, "")));

  for (const path of tracked) {
    if (isUnrepresentable(path)) excluded.push({ path, reason: "unrepresentable-path" });
    else if (isRestrictedPath(path, restrictedGlobs)) excluded.push({ path, reason: "restricted-tracked" });
    else included.push(path);
  }
  for (const path of untracked) {
    if (isUnrepresentable(path)) excluded.push({ path, reason: "unrepresentable-path" });
    else if (isRestrictedPath(path, restrictedGlobs)) excluded.push({ path, reason: "restricted-untracked" });
    else if (allowSet.has(path)) included.push(path);
    else excluded.push({ path, reason: "untracked-excluded-by-default" });
  }
  return { included, excluded };
}

/** The nearest existing ancestor must resolve inside the repository root. */
function assertAncestorContained(root, relPath) {
  const abs = resolve(root, relPath);
  let probe = dirname(abs);
  while (!existsSync(probe)) {
    const parent = dirname(probe);
    if (parent === probe) throw new Error(`PATH_HAS_NO_EXISTING_ANCESTOR: ${relPath}`);
    probe = parent;
  }
  const realAncestor = realpathSync(probe);
  if (!within(root, realAncestor) && realAncestor !== root) {
    throw new Error(`SYMLINK_ESCAPES_REPOSITORY: ${relPath} (ancestor resolves to ${realAncestor})`);
  }
  return abs;
}

/**
 * Classify a symlink WITHOUT following it. Returns the target's repo-relative
 * path (never the target's content, never a local absolute path), or throws
 * when the link escapes the root.
 */
function resolveSymlink(root, relPath) {
  const abs = resolve(root, relPath);
  const linkTarget = readlinkSync(abs); // the path string only — never file content
  const resolvedTarget = resolve(dirname(abs), linkTarget);
  if (!within(root, resolvedTarget)) {
    throw new Error(`SYMLINK_ESCAPES_REPOSITORY: ${relPath} -> ${linkTarget}`);
  }
  if (existsSync(resolvedTarget)) {
    const realTarget = realpathSync(resolvedTarget);
    if (!within(root, realTarget)) {
      throw new Error(`SYMLINK_ESCAPES_REPOSITORY: ${relPath} -> ${realTarget}`);
    }
  }
  // Record the repo-relative target so the archive never discloses the local
  // absolute layout, and so it matches what `included` holds.
  return { targetRel: relative(root, resolvedTarget).split(sep).join("/") };
}

// ── deterministic ustar writer ────────────────────────────────────────────
function octal(value, width) {
  return value.toString(8).padStart(width - 1, "0") + "\0";
}

/**
 * Split a path into ustar `prefix`/`name` (max 155/100 bytes). Fails closed —
 * a path that cannot be represented exactly is refused, never truncated, so the
 * archive can never disagree with `inventory.json` / `MANIFEST.sha256`.
 */
export function splitTarName(name) {
  if (Buffer.byteLength(name) <= 100) return { prefix: "", name };
  for (let index = name.length - 1; index > 0; index -= 1) {
    if (name[index] !== "/") continue;
    const prefix = name.slice(0, index);
    const rest = name.slice(index + 1);
    if (Buffer.byteLength(rest) <= 100 && Buffer.byteLength(prefix) <= 155) return { prefix, name: rest };
  }
  throw new Error(`TAR_NAME_TOO_LONG: cannot represent '${name}' exactly in ustar`);
}

function tarHeader({ name, size, typeflag, linkname = "" }) {
  const block = Buffer.alloc(512);
  const { prefix, name: shortName } = splitTarName(name);
  if (typeflag === "2" && Buffer.byteLength(linkname) > 100) {
    // ustar has no prefix field for the link target: a longer target is
    // unrepresentable, so refuse rather than emit a truncated (dangling) link
    // that would also disagree with MANIFEST.sha256.
    throw new Error(`TAR_NAME_TOO_LONG: symlink target not representable: ${linkname}`);
  }
  block.write(shortName, 0, 100, "utf8");
  block.write(octal(typeflag === "5" ? 0o755 : 0o644, 8), 100, 8, "ascii");
  block.write(octal(0, 8), 108, 8, "ascii");
  block.write(octal(0, 8), 116, 8, "ascii");
  block.write(octal(size, 12), 124, 12, "ascii");
  block.write(octal(0, 12), 136, 12, "ascii"); // mtime 0 → deterministic
  block.write("        ", 148, 8, "ascii"); // checksum placeholder
  block.write(typeflag, 156, 1, "ascii");
  block.write(linkname.slice(0, 100), 157, 100, "utf8");
  block.write("ustar\0", 257, 6, "ascii");
  block.write("00", 263, 2, "ascii");
  block.write(prefix, 345, 155, "utf8");
  let sum = 0;
  for (const byte of block) sum += byte;
  block.write(sum.toString(8).padStart(6, "0") + "\0 ", 148, 8, "ascii");
  return block;
}

export function buildTar(entries) {
  const chunks = [];
  for (const entry of [...entries].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (entry.typeflag === "2") {
      chunks.push(tarHeader({ name: entry.name, size: 0, typeflag: "2", linkname: entry.linkname }));
      continue;
    }
    const content = Buffer.isBuffer(entry.content) ? entry.content : Buffer.from(entry.content);
    chunks.push(tarHeader({ name: entry.name, size: content.length, typeflag: "0" }));
    chunks.push(content);
    const pad = (512 - (content.length % 512)) % 512;
    if (pad) chunks.push(Buffer.alloc(pad));
  }
  chunks.push(Buffer.alloc(1024)); // two zero blocks terminate the archive
  return Buffer.concat(chunks);
}

// ── package build ─────────────────────────────────────────────────────────
export function loadRestrictedGlobs(root) {
  let fromContract = [];
  try {
    const contract = JSON.parse(readFileSync(join(root, CONTRACT_RELATIVE), "utf8"));
    fromContract = contract?.writePolicy?.restricted ?? [];
  } catch {
    fromContract = [];
  }
  return [...new Set([...fromContract, ...BASELINE_RESTRICTED])].filter(Boolean);
}

export function createReviewPackage({ cwd = process.cwd(), outDir, allowUntracked = [], authorizedUntracked = false, purpose = null, now = new Date() } = {}) {
  const context = validateProjectContext({ cwd });
  const root = context.root;
  const restrictedGlobs = loadRestrictedGlobs(root);

  const tracked = gitZ(["ls-files", "-z"], root).filter(Boolean);
  const untracked = gitZ(["ls-files", "-z", "--others", "--exclude-standard"], root).filter(Boolean);
  const statusLines = git(["status", "--porcelain=v1"], root).split("\n").filter(Boolean);

  if (allowUntracked.length && !authorizedUntracked) {
    throw new Error("UNTRACKED_INCLUSION_NOT_AUTHORIZED: --allow-untracked requires --authorized-untracked and --purpose");
  }
  if (allowUntracked.length && !purpose) {
    throw new Error("UNTRACKED_INCLUSION_NOT_AUTHORIZED: --purpose is required with --allow-untracked");
  }
  for (const raw of allowUntracked) {
    const path = raw.replace(/^\.\//, "");
    if (isRestrictedPath(path, restrictedGlobs)) {
      throw new Error(`RESTRICTED_PATH_REFUSED: ${path} is restricted and can never be packaged`);
    }
    if (isUnrepresentable(path)) {
      throw new Error(`ALLOWLIST_PATH_UNREPRESENTABLE: ${path} cannot be represented portably`);
    }
    if (!untracked.includes(path)) {
      throw new Error(`ALLOWLIST_PATH_NOT_UNTRACKED: ${path}`);
    }
  }

  const { included, excluded } = classifyPaths({ tracked, untracked, restrictedGlobs, allowUntracked });
  const excludedTracked = excluded.filter((e) => e.reason === "restricted-tracked");
  const includedSet = new Set(included);
  const trackedSet = new Set(tracked);

  // Fail-closed on any symlink escaping the repository root (tracked or allowed).
  // A symlink is recorded by its repo-relative TARGET PATH — never the target's
  // content — and only when its target is itself a packaged REGULAR file. Links
  // to restricted paths, to non-packaged paths, and to other symlinks (chains)
  // are dropped, so the archive never contains a dangling or leaking link.
  const regularNames = new Set();
  const symlinkCandidates = [];
  for (const relPath of included) {
    const abs = assertAncestorContained(root, relPath);
    if (lstatSync(abs).isSymbolicLink()) symlinkCandidates.push(relPath);
    else regularNames.add(relPath);
  }
  const entries = [...regularNames].map((relPath) => ({ name: relPath, content: readFileSync(resolve(root, relPath)) }));
  const symlinkExcluded = [];
  for (const relPath of symlinkCandidates) {
    const { targetRel } = resolveSymlink(root, relPath);
    if (isRestrictedPath(targetRel, restrictedGlobs) || !regularNames.has(targetRel) || !includedSet.has(targetRel)) {
      // The link PATH is an ordinary tracked repository path (listable, like any
      // other included path). The TARGET is withheld: it can name restricted or
      // private material, and a name must never be emitted to prove exclusion.
      symlinkExcluded.push({
        path: relPath,
        target_kind: isRestrictedPath(targetRel, restrictedGlobs) ? "restricted" : "not-packaged",
      });
      continue;
    }
    entries.push({ name: relPath, typeflag: "2", linkname: targetRel });
  }

  const includedSorted = entries.map((e) => e.name).sort();

  // The archive carries two generated metadata entries. A tracked path with the
  // same name would produce a duplicate entry and make file_count disagree with
  // the archive — refuse instead of silently overwriting either one.
  const collision = includedSorted.find((name) => RESERVED_ENTRY_NAMES.has(name));
  if (collision) {
    throw new Error(`RESERVED_NAME_COLLISION: tracked path '${collision}' collides with generated package metadata`);
  }

  const manifest = includedSorted
    .map((name) => {
      const entry = entries.find((e) => e.name === name);
      const bytes = entry.typeflag === "2" ? Buffer.from(entry.linkname) : entry.content;
      return `${createHash("sha256").update(bytes).digest("hex")}  ${name}`;
    })
    .join("\n");

  const restrictedUntracked = NAMED_PRIVATE_ROOTS.map((rootName) => ({
    root: `${rootName}/`,
    // Both numbers are reported: an untracked-only count would read as "nothing
    // here" for a root that is excluded *because it is tracked*.
    untracked_count: untracked.filter((p) => p === rootName || p.startsWith(`${rootName}/`)).length,
    tracked_excluded_count: excludedTracked.filter((e) => e.path === rootName || e.path.startsWith(`${rootName}/`)).length,
    included: false,
  }));

  const inventory = {
    policy_version: POLICY_VERSION,
    tool_version: TOOL_VERSION,
    tool: "scripts/create-review-package.mjs",
    // Deterministic state timestamp (the packaged commit's own time) — the
    // archive must be byte-identical for identical input. The wall-clock build
    // time lives in the sidecar written alongside the archive.
    head_commit_time: git(["show", "-s", "--format=%cI", "HEAD"], root),
    repository: context.identity,
    remote_kind: "canonical",
    contract_version: context.contractVersion,
    default_branch: context.defaultBranch,
    branch: git(["rev-parse", "--abbrev-ref", "HEAD"], root),
    head: git(["rev-parse", "HEAD"], root),
    workspace: {
      dirty: statusLines.length > 0,
      tracked_modified_paths: statusLines
        .filter((line) => !line.startsWith("??"))
        .map((line) => line.slice(3).trim())
        .sort(),
      untracked_path_count: untracked.length,
      restricted_untracked: restrictedUntracked,
      excluded_untracked_count: excluded.filter((e) => e.reason === "untracked-excluded-by-default").length,
    },
    package: {
      file_count: entries.length,
      included: includedSorted,
      excluded_restricted_tracked: excludedTracked.map((e) => e.path).sort(),
      excluded_unrepresentable: excluded.filter((e) => e.reason === "unrepresentable-path" && trackedSet.has(e.path)).map((e) => e.path).sort(),
      // An unrepresentable UNTRACKED path is counted, not named (see the header contract).
      excluded_unrepresentable_untracked_count: excluded.filter((e) => e.reason === "unrepresentable-path" && !trackedSet.has(e.path)).length,
      symlink_excluded_count: symlinkExcluded.length,
      symlink_excluded: symlinkExcluded.slice().sort((a, b) => (a.path < b.path ? -1 : 1)),
      example_config_classified: includedSorted.filter(isExampleConfig),
      allowlisted_untracked: allowUntracked.map((p) => p.replace(/^\.\//, "")).sort(),
      purpose: purpose ?? null,
    },
  };

  const archiveEntries = [
    { name: "inventory.json", content: `${JSON.stringify(inventory, null, 2)}\n` },
    { name: "MANIFEST.sha256", content: `${manifest}\n` },
    ...entries,
  ];
  const tar = buildTar(archiveEntries);
  const gz = gzipSync(tar, { level: 9 });
  const archiveSha256 = createHash("sha256").update(gz).digest("hex");

  const out = outDir ? resolve(outDir) : join(tmpdir(), "pvl-review-package");
  mkdirSync(out, { recursive: true });
  const archiveName = `promptvault-review-${inventory.head.slice(0, 7)}-${archiveSha256.slice(0, 12)}.tar.gz`;
  const archivePath = join(out, archiveName);
  writeFileSync(archivePath, gz);

  // Sidecar: the same sanitized inventory plus the wall-clock generation time
  // and the archive hash. Kept OUTSIDE the archive so the archive stays
  // byte-deterministic and cannot contain its own hash.
  const sidecarPath = `${archivePath}.inventory.json`;
  writeFileSync(
    sidecarPath,
    `${JSON.stringify({ ...inventory, generated_at: now.toISOString(), archive: { name: archiveName, path: archivePath, sha256: archiveSha256 } }, null, 2)}\n`
  );

  return { archivePath, sidecarPath, archiveSha256, inventory, excludedTracked, restrictedGlobs };
}

function cli(argv) {
  let outDir;
  let json = false;
  const allowUntracked = [];
  let authorizedUntracked = false;
  let purpose = null;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--out") outDir = argv[++index];
    else if (arg === "--json") json = true;
    else if (arg === "--allow-untracked") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--allow-untracked requires a repository-relative path");
      allowUntracked.push(value);
    } else if (arg === "--authorized-untracked") authorizedUntracked = true;
    else if (arg === "--purpose") {
      purpose = argv[++index];
      if (!purpose || purpose.startsWith("--")) throw new Error("--purpose requires a description");
    } else throw new Error(`Unknown argument: ${arg}`);
  }

  const result = createReviewPackage({ outDir, allowUntracked, authorizedUntracked, purpose });
  if (json) {
    console.log(JSON.stringify({ ...result.inventory, archive: { path: result.archivePath, sha256: result.archiveSha256 } }, null, 2));
    return;
  }
  console.log(`REVIEW_PACKAGE=${result.archivePath}`);
  console.log(`ARCHIVE_SHA256=${result.archiveSha256}`);
  console.log(`PACKAGE_FILE_COUNT=${result.inventory.package.file_count}`);
  console.log(`UNTRACKED_PATHS_EXCLUDED=${result.inventory.workspace.untracked_path_count}`);
  for (const entry of result.inventory.workspace.restricted_untracked) {
    console.log(`RESTRICTED_ROOT=${entry.root} untracked_count=${entry.untracked_count} tracked_excluded_count=${entry.tracked_excluded_count} included=${entry.included}`);
  }
  console.log(`WORKSPACE_DIRTY=${result.inventory.workspace.dirty}`);
  if (result.excludedTracked.length) {
    console.warn(`WARNING: ${result.excludedTracked.length} restricted TRACKED path(s) excluded: ${result.excludedTracked.map((e) => e.path).join(", ")}`);
  }
}

const invoked = process.argv[1] ? resolve(process.argv[1]) : "";
if (invoked === fileURLToPath(import.meta.url)) {
  try {
    cli(process.argv.slice(2));
  } catch (error) {
    console.error(`REVIEW_PACKAGE_FAILED: ${error.message}`);
    process.exitCode = error.message.startsWith("Unknown argument") || error.message.includes("requires") ? 2 : 1;
  }
}
