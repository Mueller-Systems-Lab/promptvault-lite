// Strict subset parsers for the machine-generated lockfile formats this
// repository pins (pnpm-lock v9, Cargo.lock v3, workspace Cargo.toml).
// Shared by generate-sbom.mjs, fetch-license-metadata.mjs and
// license-inventory.mjs so all three read identical graphs.
//
// Every parser throws on anything unexpected instead of guessing.

/** Strip single/double quotes around a YAML key or value. */
export function stripQuotes(s) {
  return s.startsWith("'") || s.startsWith('"') ? s.slice(1, -1) : s;
}

/** Split a pnpm package key `@scope/name@1.2.3(peer@1)` into name/version. */
export function splitPnpmKey(key) {
  const withoutPeers = key.replace(/\([^)]*\)/g, "");
  const at = withoutPeers.lastIndexOf("@");
  if (at <= 0) return null;
  const name = withoutPeers.slice(0, at);
  const version = withoutPeers.slice(at + 1);
  if (!name || !/^[0-9A-Za-z.\-+/~]+$/.test(version)) return null;
  return { name, version };
}

/** Strip a peer suffix from a version value: `18.3.1(react@18.3.1)` → `18.3.1`. */
export function stripPeerSuffix(value) {
  return value.replace(/\([^)]*\)/g, "");
}

/**
 * Parse pnpm-lock.yaml (lockfileVersion '9.0').
 * Returns { direct: {dependencies: string[], devDependencies: string[]},
 *           packages: Map<'name@version', {name, version, deps: Map<string,string>}> }.
 * Resolutions come from the `packages:` section; the dependency EDGES live in
 * the `snapshots:` section pnpm ≥9.7 emits (peer-resolved keys there are
 * deduplicated into one entry per (name, version), merging their edges).
 */
export function parsePnpmLock(text) {
  const lines = text.split("\n");
  const lockVersion = /^lockfileVersion: '?(9\.0)'?/.exec(lines[0] ?? "")?.[1];
  if (lockVersion !== "9.0") {
    throw new Error(
      `unsupported pnpm-lock.yaml lockfileVersion '${lockVersion ?? "missing"}' — this parser supports exactly '9.0'`,
    );
  }

  const direct = { dependencies: [], devDependencies: [] };
  const packages = new Map();

  let mode = "root"; // root | importers | importer-dot | packages
  let currentDepSection = null;
  let currentPackage = null;
  let packageDepMode = false;

  for (const rawLine of lines) {
    if (rawLine.trim() === "" || rawLine.trim().startsWith("#")) continue;
    const indent = rawLine.length - rawLine.trimStart().length;
    const line = rawLine.trimEnd();

    if (indent === 0) {
      mode =
        line === "importers:"
          ? "importers"
          : line === "packages:" || line === "snapshots:"
            ? "packages"
            : "root";
      currentDepSection = null;
      currentPackage = null;
      packageDepMode = false;
      continue;
    }

    if (mode === "importers") {
      if (indent === 2) {
        const key = stripQuotes(line.slice(2).replace(/:$/, ""));
        currentDepSection = null;
        if (key === ".") {
          mode = "importer-dot";
          continue;
        }
        continue;
      }
      continue;
    }

    if (mode === "importer-dot") {
      if (indent === 4 && /^(dependencies|devDependencies):$/.test(line.trim())) {
        currentDepSection = line.trim().slice(0, -1);
      } else if (currentDepSection && indent === 6) {
        const name = stripQuotes(line.trim().replace(/:$/, ""));
        direct[currentDepSection].push(name);
      } else if (indent <= 2) {
        mode = "importers";
        currentDepSection = null;
      }
      continue;
    }

    if (mode === "packages") {
      if (indent === 2) {
        const key = stripQuotes(line.slice(2).replace(/:$/, ""));
        const split = splitPnpmKey(key);
        packageDepMode = false;
        if (!split) {
          currentPackage = null;
          continue;
        }
        const id = `${split.name}@${split.version}`;
        if (!packages.has(id)) packages.set(id, { ...split, deps: new Map() });
        currentPackage = packages.get(id);
      } else if (
        currentPackage &&
        indent === 4 &&
        /^(dependencies|optionalDependencies):$/.test(line.trim())
      ) {
        packageDepMode = true;
      } else if (currentPackage && packageDepMode && indent === 6) {
        const m = /^'([^']+)':\s*(.+)$/.exec(line.trim()) ?? /^([^:]+):\s*(.+)$/.exec(line.trim());
        if (m) currentPackage.deps.set(stripQuotes(m[1]), stripPeerSuffix(m[2].trim()));
      } else if (indent === 4) {
        packageDepMode = false;
      }
    }
  }

  if (packages.size === 0) throw new Error("pnpm-lock.yaml contains no packages");
  return { direct, packages };
}

/**
 * Parse Cargo.lock (`version = 3`).
 * Returns [{name, version, deps: string[]}] where deps entries are the raw
 * lock forms ("name" or "name version").
 */
export function parseCargoLock(text) {
  if (!/^version = 3$/m.test(text)) {
    throw new Error("unsupported Cargo.lock — expected `version = 3` header");
  }
  const blocks = text.split(/^\[\[package\]\]$/m).slice(1);
  const crates = [];
  for (const block of blocks) {
    const name = /^name = "([^"]+)"$/m.exec(block)?.[1];
    const version = /^version = "([^"]+)"$/m.exec(block)?.[1];
    if (!name || !version) {
      throw new Error("Cargo.lock package block without name/version — refusing to guess");
    }
    const depsBlock = /^dependencies = \[\n([^\]]*)\]$/m.exec(block)?.[1] ?? "";
    const deps = [...depsBlock.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
    crates.push({ name, version, deps });
  }
  if (crates.length === 0) throw new Error("Cargo.lock contains no packages");
  return crates;
}

/** Workspace member directory paths from the root Cargo.toml. */
export function workspaceMemberDirs(text) {
  const membersLine = /^members\s*=\s*\[(.*)\]$/m.exec(text)?.[1];
  if (!membersLine) throw new Error("Cargo.toml has no workspace members list");
  return [...membersLine.matchAll(/"([^"]+)"/g)].map((m) => m[1]);
}

/** `[package] name` of a member manifest. */
export function crateName(manifestText, label) {
  const name = /^name = "([^"]+)"$/m.exec(manifestText)?.[1];
  if (!name) throw new Error(`${label}: cannot read [package] name`);
  return name;
}
