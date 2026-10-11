#!/usr/bin/env node
// =============================================================================
// Aggregate dependency-license inventory (issue #296 sale-asset work).
//
// Reads the SAME committed metadata the SBOM is built from
// (scripts/supply-chain/license-data.json + both lockfiles) and classifies
// every dependency structurally:
//
//   PERMISSIVE       MIT/Apache-2.0/BSD/ISC/Zlib/… (no copyleft obligations
//                    beyond attribution/notices for distributed binaries)
//   WEAK_COPYLEFT    LGPL-*, MPL-*, EPL-*, CDDL-1.1 (file/link-level copyleft)
//   STRONG_COPYLEFT  GPL-*, AGPL-*, Sleepycat, OSL-* (whole-program obligations)
//   CUSTOM           registry free text ("SEE LICENSE IN …", "UNLICENSED", …)
//   UNKNOWN          registry had no license metadata
//   MIXED_EXPRESSION OR-combination spanning classes (choice possible but
//                    needs a human decision)
//
// This is a STRUCTURAL classification for triage, not legal advice; every
// non-PERMISSIVE entry is listed for manual review instead of being judged.
//
// Usage:
//   node scripts/supply-chain/license-inventory.mjs [--repo-root .] [--out <file>]
//   node scripts/supply-chain/license-inventory.mjs --check docs/supply-chain/license-inventory.md
//
// --check regenerates the document and exits non-zero on drift (CI gate); it
// also fails when license-data.json no longer covers the lockfiles.
// =============================================================================
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

import { parseCargoLock, parsePnpmLock } from "./lib/lockfiles.mjs";

function arg(name) {
  for (let i = process.argv.length - 1; i >= 0; i -= 1) {
    if (process.argv[i] === `--${name}`) return process.argv[i + 1] ?? null;
  }
  return null;
}

const repoRoot = resolve(arg("repo-root") ?? ".");
const outPath = arg("out");
const checkPath = arg("check");

function fail(message) {
  console.error(`license-inventory: FAIL — ${message}`);
  process.exit(1);
}

const PERMISSIVE = [
  "MIT", "MIT-0", "Apache-2.0", "BSD-2-Clause", "BSD-3-Clause", "BSD-3-Clause-Clear",
  "ISC", "Zlib", "0BSD", "Unlicense", "BSL-1.0", "CC0-1.0", "CC-BY-4.0",
  "Unicode-3.0", "Unicode-DFS-2016", "WTFPL", "BlueOak-1.0.0", "Python-2.0",
  "PostgreSQL", "Brotli", "ADEL-1.0",
];

const WEAK = [/^LGPL-[\d.]+.*$/, /^MPL-[\d.]+.*$/, /^EPL-[\d.]+.*$/, /^CDDL-[\d.]+.*$/, /^CPL-[\d.]+.*$/, /^Artistic-[\d.]+.*$/];
const STRONG = [/^AGPL-[\d.]+.*$/, /^GPL-[\d.]+.*$/, /^Sleepycat$/, /^OSL-[\d.]+.*$/, /^GFDL-[\d.]+.*$/, /^QPL-[\d.]+.*$/];

/** Classify one license string (id, SPDX expression, or free text). */
function classifyLicense(license) {
  if (!license || license === "UNKNOWN") return "UNKNOWN";
  const token = license.trim();
  if (/^(SEE LICENSE IN|UNLICENSED|NOASSERTION|CUSTOM|PROPRIETARY|COMMERCIAL)/i.test(token)) {
    return "CUSTOM";
  }
  if (/^https?:\/\//i.test(token)) return "CUSTOM";
  // SPDX expressions: classify every branch; OR allows choice, AND forces all.
  const hasOr = /\bOR\b/.test(token);
  const hasAnd = /\bAND\b/.test(token);
  const hasWith = /\bWITH\b/.test(token);
  if (hasOr || hasAnd || hasWith || /[()]/.test(token)) {
    const branchText = token.replace(/[()]/g, " ");
    const branches = branchText.split(/\b(?:OR|AND)\b/).map((b) => b.replace(/\bWITH\b.*$/, "").trim()).filter(Boolean);
    const classes = branches.map((b) => {
      const one = b.split(/\s+/)[0];
      if (PERMISSIVE.includes(one)) return "PERMISSIVE";
      if (WEAK.some((re) => re.test(one))) return "WEAK_COPYLEFT";
      if (STRONG.some((re) => re.test(one))) return "STRONG_COPYLEFT";
      return "UNKNOWN";
    });
    const unique = [...new Set(classes)];
    if (hasAnd) {
      // AND: the most restrictive obligation wins.
      const rank = { STRONG_COPYLEFT: 3, WEAK_COPYLEFT: 2, UNKNOWN: 1, PERMISSIVE: 0 };
      const worst = unique.reduce((a, b) => (rank[b] > rank[a] ? b : a));
      return worst === "UNKNOWN" ? "UNKNOWN" : worst;
    }
    if (unique.length === 1) return unique[0];
    return "MIXED_EXPRESSION";
  }
  if (PERMISSIVE.includes(token)) return "PERMISSIVE";
  if (WEAK.some((re) => re.test(token))) return "WEAK_COPYLEFT";
  if (STRONG.some((re) => re.test(token))) return "STRONG_COPYLEFT";
  if (/^[A-Za-z0-9.()+\-]+$/.test(token)) return "UNKNOWN"; // SPDX-shaped but unrecognized
  return "CUSTOM";
}

// --- inputs --------------------------------------------------------------------

const pnpm = parsePnpmLock(readFileSync(join(repoRoot, "pnpm-lock.yaml"), "utf8"));
const cargo = parseCargoLock(readFileSync(join(repoRoot, "Cargo.lock"), "utf8"));
const dataPath = join(repoRoot, "scripts/supply-chain/license-data.json");
let data;
try {
  data = JSON.parse(readFileSync(dataPath, "utf8"));
} catch (e) {
  fail(`cannot read ${dataPath}: ${e.message}`);
}

const npmIds = [...pnpm.packages.keys()].sort();
const cargoIds = cargo.map((c) => `${c.name}@${c.version}`).sort();

const missing = [
  ...npmIds.filter((id) => !(id in (data.npm ?? {}))),
  ...cargoIds.filter((id) => !(id in (data.cargo ?? {}))),
];
if (missing.length) {
  fail(
    `license-data.json is stale: ${missing.length} lockfile entr(y|ies) missing ` +
      `(first: ${missing.slice(0, 5).join(", ")}) — run scripts/supply-chain/fetch-license-metadata.mjs`,
  );
}

const entries = [
  ...npmIds.map((id) => ({ ecosystem: "npm", id, license: data.npm[id] })),
  ...cargoIds.map((id) => ({ ecosystem: "cargo", id, license: data.cargo[id] })),
];
for (const e of entries) e.klass = classifyLicense(e.license);

// --- report --------------------------------------------------------------------

const lockDigest = (rel) =>
  createHash("sha256").update(readFileSync(join(repoRoot, rel))).digest("hex").slice(0, 16);

const count = (ecosystem, klass) =>
  entries.filter((e) => e.ecosystem === ecosystem && e.klass === klass).length;
const klasses = ["PERMISSIVE", "WEAK_COPYLEFT", "STRONG_COPYLEFT", "MIXED_EXPRESSION", "CUSTOM", "UNKNOWN"];

const lines = [];
lines.push("# PromptVault Lite — Dependency License Inventory");
lines.push("");
lines.push(
  "> Generated by `scripts/supply-chain/license-inventory.mjs` from the committed SBOM license metadata. " +
    "Structural triage classification, **not legal advice**; every non-permissive entry is listed for manual review.",
);
lines.push("");
lines.push(`- npm entries: **${npmIds.length}** (pnpm-lock sha256 \`${lockDigest("pnpm-lock.yaml")}…\`)`);
lines.push(`- cargo entries: **${cargoIds.length}** (Cargo.lock sha256 \`${lockDigest("Cargo.lock")}…\`)`);
lines.push("");
lines.push("| Class | npm | cargo | total |");
lines.push("| --- | ---: | ---: | ---: |");
for (const k of klasses) {
  const n = count("npm", k);
  const c = count("cargo", k);
  lines.push(`| ${k} | ${n} | ${c} | ${n + c} |`);
}
lines.push("");

for (const k of ["STRONG_COPYLEFT", "WEAK_COPYLEFT", "MIXED_EXPRESSION", "CUSTOM", "UNKNOWN"]) {
  const rows = entries.filter((e) => e.klass === k);
  if (rows.length === 0) {
    lines.push(`## ${k}`);
    lines.push("");
    lines.push("_None._");
    lines.push("");
    continue;
  }
  lines.push(`## ${k} — ${rows.length} package(s), manual review`);
  lines.push("");
  lines.push("| purl | license (registry metadata) |");
  lines.push("| --- | --- |");
  for (const e of rows.sort((a, b) => (a.id < b.id ? -1 : 1))) {
    lines.push(`| \`pkg:${e.ecosystem}/${e.id.replace(/^@/, "%40").replace(/@([^@]+)$/, "@$1")}\` | \`${e.license.replace(/\|/g, "\\|")}\` |`);
  }
  lines.push("");
}

lines.push("## PERMISSIVE");
lines.push("");
lines.push(
  `${entries.filter((e) => e.klass === "PERMISSIVE").length} packages carry permissive SPDX metadata (MIT, Apache-2.0, BSD, ISC, …) and are not listed individually. The SBOM carries the per-package licenses.`,
);
lines.push("");

const text = lines.join("\n");

if (checkPath) {
  const expected = readFileSync(resolve(checkPath), "utf8");
  if (expected === text) {
    console.log("LICENSE INVENTORY: PASS (in sync with lockfiles and license-data.json)");
    process.exit(0);
  }
  console.error(
    "LICENSE INVENTORY: FAIL — docs/supply-chain/license-inventory.md is out of date with the lockfiles or license data. Regenerate with:",
  );
  console.error("  node scripts/supply-chain/license-inventory.mjs --out docs/supply-chain/license-inventory.md");
  process.exit(1);
}

if (outPath) {
  mkdirSync(dirname(resolve(outPath)), { recursive: true });
  writeFileSync(resolve(outPath), text);
  console.error(`wrote ${outPath}`);
} else {
  process.stdout.write(text);
}
