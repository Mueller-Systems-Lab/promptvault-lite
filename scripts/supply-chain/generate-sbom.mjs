#!/usr/bin/env node
// =============================================================================
// Deterministic CycloneDX 1.6 SBOM generator (supply-chain sale-asset work,
// issue #296).
//
// Design contract (test-enforced in scripts/__tests__/supply-chain-sbom.test.js):
//
//   * BYTE-DETERMINISTIC: the SBOM is a pure function of
//       (lockfiles, license-data.json, --version, --commit, --timestamp).
//     No wall clock, no randomness: the serial number is a UUIDv5 of the
//     release identity, and the timestamp comes in as an argument (the
//     release pipeline passes the tagged commit's author date, so the same
//     source state always yields the same bytes).
//   * ZERO new dependencies: hand-rolled strict parsers for the exact
//     machine-generated formats this repository pins (pnpm-lock v9,
//     Cargo.lock v3). Anything unexpected aborts rather than guessing.
//   * COMPLETE: every entry of BOTH lockfiles becomes a component with a
//     package URL; peer-resolved pnpm variants (`pkg@1.2.3(peer@2)`) are
//     deduplicated into one component per (name, version), merging their
//     dependency edges.
//   * BOUND: root identity (pkg:github/...), source commit (metadata
//     property), dependency edges from the lockfile graphs, licenses from
//     the committed metadata cache `scripts/supply-chain/license-data.json`
//     (fetched once from the public registries by fetch-license-metadata.mjs;
//     generation itself is offline).
//
// Usage:
//   node scripts/supply-chain/generate-sbom.mjs \
//     --version 1.13.3 --commit <40-hex> --timestamp <ISO-8601> \
//     [--repo-root .] [--license-data <file>] [--out <file>]
//
// Without --out the SBOM goes to stdout; the summary goes to stderr either way.
// =============================================================================
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

import {
  crateName,
  parseCargoLock,
  parsePnpmLock,
  workspaceMemberDirs,
} from "./lib/lockfiles.mjs";

// --- CLI ----------------------------------------------------------------------

/** Last `--name value` wins. */
function arg(name) {
  for (let i = process.argv.length - 1; i >= 0; i -= 1) {
    if (process.argv[i] === `--${name}`) return process.argv[i + 1] ?? null;
  }
  return null;
}

const version = arg("version");
const commit = arg("commit");
const timestamp = arg("timestamp");
const repoRootArg = arg("repo-root") ?? ".";
const licenseDataArg = arg("license-data");
const out = arg("out");

const repoRoot = resolve(repoRootArg);
const licenseDataPath = licenseDataArg
  ? resolve(licenseDataArg)
  : join(repoRoot, "scripts", "supply-chain", "license-data.json");

function fail(message) {
  console.error(`generate-sbom: FAIL — ${message}`);
  process.exit(2);
}

if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) fail("--version must be x.y.z");
if (!/^[0-9a-f]{40}$/.test(commit ?? "")) fail("--commit must be a 40-character commit SHA");
if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(timestamp ?? "")) {
  fail("--timestamp must be an ISO-8601 UTC instant like 2026-10-11T05:46:04Z");
}

// --- CycloneDX assembly ----------------------------------------------------------

const UUID_V5_DNS = Buffer.from("6ba7b8109dad11d180b400c04fd430c8", "hex");

/** RFC 4122 UUIDv5 (SHA-1 name-based, DNS namespace) — deterministic serial. */
function uuidV5(name) {
  const h = createHash("sha1").update(UUID_V5_DNS).update(Buffer.from(name, "utf8")).digest();
  h[6] = (h[6] & 0x0f) | 0x50;
  h[8] = (h[8] & 0x3f) | 0x80;
  const hex = h.subarray(0, 16).toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

const npmPurl = (name, v) =>
  `pkg:npm/${name.split("/").map(encodeURIComponent).join("/")}@${v}`;
const cargoPurl = (name, v) => `pkg:cargo/${name.toLowerCase()}@${v}`;

/** CycloneDX license array from an SPDX id, expression, or free-text name. */
function licenseEntry(license) {
  if (!license || license === "UNKNOWN") return null;
  if (/[() ]/.test(license) || /\b(OR|AND|WITH)\b/.test(license)) {
    return { expression: license };
  }
  if (/^[A-Za-z0-9.()+-]+$/.test(license)) return { license: { id: license } };
  return { license: { name: license } };
}

function component({ purl, name, version, licenses, ecosystem, klass }) {
  const properties = [
    { name: "promptvault:ecosystem", value: ecosystem },
    { name: "promptvault:dependency_class", value: klass },
  ];
  const entry = {
    type: "library",
    "bom-ref": purl,
    name,
    version,
    purl,
  };
  const license = licenseEntry(licenses);
  if (license) entry.licenses = [license];
  entry.properties = properties;
  return entry;
}

// --- assemble -------------------------------------------------------------------

const pkgJson = JSON.parse(readFileSync(join(repoRoot, "package.json"), "utf8"));
if (pkgJson.version !== version) {
  fail(`--version ${version} does not match package.json version ${pkgJson.version}`);
}

let pnpm;
let cargo;
let memberNames;
try {
  pnpm = parsePnpmLock(readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8"));
  cargo = parseCargoLock(readFileSync(join(repoRoot, "Cargo.lock"), "utf8"));
  const workspaceToml = readFileSync(join(repoRoot, "Cargo.toml"), "utf8");
  memberNames = workspaceMemberDirs(workspaceToml).map((member) =>
    crateName(readFileSync(join(repoRoot, member, "Cargo.toml"), "utf8"), member),
  );
} catch (e) {
  fail(e.message);
}
const memberSet = new Set(memberNames);

let licenseData;
try {
  licenseData = JSON.parse(readFileSync(licenseDataPath, "utf8"));
} catch (e) {
  fail(`cannot read license metadata ${licenseDataPath}: ${e.message}`);
}
const npmLicense = (id) => licenseData.npm?.[id];
const cargoLicense = (id) => licenseData.cargo?.[id];

// npm: one component per (name, version); classify direct vs transitive.
const directProd = new Set(pnpm.direct.dependencies);
const directDev = new Set(pnpm.direct.devDependencies);
const npmComponents = new Map(); // id → component
const npmVersionByName = new Map(); // name → Set<version>
for (const [id, pkg] of pnpm.packages) {
  const klass = directProd.has(pkg.name)
    ? "direct-production"
    : directDev.has(pkg.name)
      ? "direct-dev"
      : "transitive";
  npmComponents.set(
    id,
    component({
      purl: npmPurl(pkg.name, pkg.version),
      name: pkg.name,
      version: pkg.version,
      licenses: npmLicense(id),
      ecosystem: "npm",
      klass,
    }),
  );
  if (!npmVersionByName.has(pkg.name)) npmVersionByName.set(pkg.name, new Set());
  npmVersionByName.get(pkg.name).add(pkg.version);
}

// cargo components
const cargoComponents = new Map(); // name@version → component
const cargoVersionsByName = new Map();
for (const crate of cargo) {
  const id = `${crate.name}@${crate.version}`;
  cargoComponents.set(
    id,
    component({
      purl: cargoPurl(crate.name, crate.version),
      name: crate.name,
      version: crate.version,
      licenses: cargoLicense(id),
      ecosystem: "cargo",
      klass: memberSet.has(crate.name) ? "workspace-member" : "transitive",
    }),
  );
  if (!cargoVersionsByName.has(crate.name)) cargoVersionsByName.set(crate.name, new Set());
  cargoVersionsByName.get(crate.name).add(crate.version);
}

// --- dependency edges -------------------------------------------------------------

const rootPurl = `pkg:github/Mueller-Systems-Lab/promptvault-lite@${version}`;

const npmRef = (name, version) => npmPurl(name, version);
const cargoRef = (name, version) => cargoPurl(name, version);

const rootDependsOn = new Set();
for (const name of [...directProd, ...directDev]) {
  for (const v of npmVersionByName.get(name) ?? []) rootDependsOn.add(npmRef(name, v));
}
for (const id of cargoComponents.keys()) {
  const [name] = id.split("@");
  if (memberSet.has(name)) rootDependsOn.add(cargoComponents.get(id).purl);
}

const dependencies = [
  { ref: rootPurl, dependsOn: [...rootDependsOn].sort() },
];

// npm edges (variants merged): name@version → each dependency name resolved
// to the locked version when unambiguous.
for (const [id, pkg] of pnpm.packages) {
  const ref = npmRef(pkg.name, pkg.version);
  const targets = new Set(dependencies.find((d) => d.ref === ref)?.dependsOn ?? []);
  for (const [depName, depVersion] of pkg.deps) {
    if (npmVersionByName.get(depName)?.has(depVersion)) {
      targets.add(npmRef(depName, depVersion));
    } else if ((npmVersionByName.get(depName)?.size ?? 0) === 1) {
      targets.add(npmRef(depName, [...npmVersionByName.get(depName)][0]));
    }
    // ambiguous or missing: skip the edge rather than guess
  }
  const existing = dependencies.find((d) => d.ref === ref);
  if (existing) existing.dependsOn = [...new Set([...existing.dependsOn, ...targets])].sort();
  else dependencies.push({ ref, dependsOn: [...targets].sort() });
}

// cargo edges: lock deps are names ("name" or "name version")
for (const crate of cargo) {
  const ref = cargoRef(crate.name, crate.version);
  const targets = new Set(dependencies.find((d) => d.ref === ref)?.dependsOn ?? []);
  for (const rawDep of crate.deps) {
    const [depName, pinnedVersion] = rawDep.split(" ");
    if (pinnedVersion) {
      if (cargoVersionsByName.get(depName)?.has(pinnedVersion)) {
        targets.add(cargoRef(depName, pinnedVersion));
      }
    } else if ((cargoVersionsByName.get(depName)?.size ?? 0) === 1) {
      targets.add(cargoRef(depName, [...cargoVersionsByName.get(depName)][0]));
    }
    // ambiguous unpinned dep: skip the edge rather than guess
  }
  const existing = dependencies.find((d) => d.ref === ref);
  if (existing) existing.dependsOn = [...new Set([...existing.dependsOn, ...targets])].sort();
  else dependencies.push({ ref, dependsOn: [...targets].sort() });
}

// --- final document ----------------------------------------------------------------

const allComponents = [...npmComponents.values(), ...cargoComponents.values()].sort((a, b) =>
  a["bom-ref"] < b["bom-ref"] ? -1 : a["bom-ref"] > b["bom-ref"] ? 1 : 0,
);
dependencies.sort((a, b) => (a.ref < b.ref ? -1 : a.ref > b.ref ? 1 : 0));

const bom = {
  $schema: "http://cyclonedx.org/schema/bom-1.6.schema.json",
  bomFormat: "CycloneDX",
  specVersion: "1.6",
  serialNumber: `urn:uuid:${uuidV5(`promptvault-lite/sbom/${version}/${commit}`)}`,
  version: 1,
  metadata: {
    timestamp,
    lifecycles: [{ phase: "build" }],
    tools: {
      components: [
        {
          type: "application",
          name: "promptvault-sbom-generator",
          version: "1.0.0",
        },
      ],
    },
    component: {
      type: "application",
      "bom-ref": rootPurl,
      name: "promptvault-lite",
      version,
      purl: rootPurl,
      licenses: [{ license: { id: "MIT" } }],
      supplier: { name: "Mueller-Systems-Lab" },
    },
    properties: [
      { name: "promptvault:source_commit", value: commit },
      { name: "promptvault:release_version", value: version },
    ],
  },
  components: allComponents,
  dependencies,
};

const text = `${JSON.stringify(bom, null, 2)}\n`;

if (out) {
  writeFileSync(out, text);
} else {
  process.stdout.write(text);
}

console.error(
  `generate-sbom: ${allComponents.length} components ` +
    `(npm ${npmComponents.size}, cargo ${cargoComponents.size}), ` +
    `${dependencies.length} dependency nodes, serial ${bom.serialNumber}`,
);
