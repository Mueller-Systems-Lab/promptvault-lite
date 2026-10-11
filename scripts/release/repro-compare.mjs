#!/usr/bin/env node
// =============================================================================
// Reproducibility experiment comparison (issue #296).
//
// Compares the package artifacts of two independent clean builds (A and B) of
// the SAME source commit — see .github/workflows/supply-chain-repro.yml — and
// reports, per artifact:
//
//   * sha256 A vs B, size A vs B, byte-identical yes/no;
//   * when they differ: a bounded, best-effort diagnosis of WHICH layer is
//     nondeterministic (payload mtimes in the .deb control/data layers, per-
//     file differences inside the extracted AppImage, ELF build-id drift on
//     the main binary). Diagnosis never patches anything — a difference is
//     reported, not hidden.
//
// The comparison itself exits 0 whether or not the builds match (a divergent
// result is experiment DATA, not a pipeline failure); it exits non-zero only
// when the comparison cannot be performed (missing files, unpack failure).
//
// Usage:
//   node scripts/release/repro-compare.mjs <dirA> <dirB> \
//     [--json <out.json>] [--markdown <out.md>] [--label <run label>]
// =============================================================================
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, relative, resolve } from "node:path";

/** Last `--name value` wins. */
function arg(name) {
  for (let i = process.argv.length - 1; i >= 0; i -= 1) {
    if (process.argv[i] === `--${name}`) return process.argv[i + 1] ?? null;
  }
  return null;
}

const OPTIONS_WITH_VALUE = new Set(["json", "markdown", "label"]);
const positionals = [];
for (let i = 2; i < process.argv.length; i += 1) {
  const token = process.argv[i];
  if (token.startsWith("--")) {
    if (OPTIONS_WITH_VALUE.has(token.slice(2))) i += 1;
    continue;
  }
  positionals.push(token);
}
if (positionals.length !== 2) {
  console.error("usage: repro-compare.mjs <dirA> <dirB> [--json out] [--markdown out]");
  process.exit(2);
}
const jsonOut = arg("json");
const markdownOut = arg("markdown");
const label = arg("label") ?? "two-clean-builds";

const [dirA, dirB] = positionals.map(resolve);

/** Recursively find package files under a root. */
function findPackages(root) {
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, entry.name);
      if (entry.isDirectory()) walk(p);
      else if (/\.(deb|rpm|appimage)$/i.test(entry.name) && entry.isFile()) out.push(p);
    }
  };
  walk(root);
  return out;
}

const sha256 = (p) => createHash("sha256").update(readFileSync(p)).digest("hex");

const aFiles = new Map(findPackages(dirA).map((p) => [basename(p), p]));
const bFiles = new Map(findPackages(dirB).map((p) => [basename(p), p]));

if (aFiles.size === 0 || bFiles.size === 0) {
  console.error(`repro-compare: no packages found under ${aFiles.size === 0 ? dirA : dirB}`);
  process.exit(2);
}

function tool(cmd) {
  try {
    execFileSync(cmd, ["--version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
}

/**
 * Bounded diagnosis of WHY two artifacts differ. Best-effort by available
 * tooling; every branch reports facts, never patches anything.
 */
function diagnose(name, fileA, fileB) {
  const findings = [];
  const lower = name.toLowerCase();
  const work = mkdtempSync(join(tmpdir(), "pv-repro-"));
  try {
    if (lower.endsWith(".deb") && tool("dpkg-deb")) {
      const treeA = join(work, "a");
      const treeB = join(work, "b");
      mkdirSync(treeA);
      mkdirSync(treeB);
      execFileSync("dpkg-deb", ["-x", fileA, treeA], { stdio: "ignore" });
      execFileSync("dpkg-deb", ["-x", fileB, treeB], { stdio: "ignore" });
      const filesOf = (root) => {
        const list = [];
        const walk = (d) => {
          for (const e of readdirSync(d, { withFileTypes: true })) {
            const p = join(d, e.name);
            if (e.isDirectory()) walk(p);
            else list.push(relative(root, p));
          }
        };
        walk(root);
        return list.sort();
      };
      const listA = filesOf(treeA);
      const listB = filesOf(treeB);
      if (JSON.stringify(listA) !== JSON.stringify(listB)) {
        findings.push("extracted payload file lists differ (content set, not just metadata)");
        return findings;
      }
      let contentDiffs = 0;
      let mtimeOnly = 0;
      for (const rel of listA) {
        const pa = join(treeA, rel);
        const pb = join(treeB, rel);
        const sameBytes = readFileSync(pa).equals(readFileSync(pb));
        const sameMtime = statSync(pa).mtimeMs === statSync(pb).mtimeMs;
        if (!sameBytes && !sameMtime) contentDiffs += 1;
        else if (!sameBytes && sameMtime) contentDiffs += 1;
        else if (sameBytes && !sameMtime) mtimeOnly += 1;
      }
      findings.push(
        `payload: ${listA.length} files, ${contentDiffs} with differing bytes, ${mtimeOnly} with byte-equal content but differing mtimes` +
          (mtimeOnly > 0 && contentDiffs === 0 ? " → timestamp-only nondeterminism inside the data layer" : ""),
      );
      findings.push(
        "deb control/data archive headers (mtime ordering) are the usual remaining source; compare `dpkg-deb -c` output for per-entry dates",
      );
    } else if (lower.endsWith(".appimage")) {
      chmodSync(fileA, 0o755);
      chmodSync(fileB, 0o755);
      const outA = join(work, "ea");
      const outB = join(work, "eb");
      mkdirSync(outA);
      mkdirSync(outB);
      execFileSync(fileA, ["--appimage-extract"], { cwd: outA, stdio: "ignore" });
      execFileSync(fileB, ["--appimage-extract"], { cwd: outB, stdio: "ignore" });
      const rootA = join(outA, "squashfs-root");
      const rootB = join(outB, "squashfs-root");
      const listA = [];
      const listB = [];
      const walk = (d, list) => {
        for (const e of readdirSync(d, { withFileTypes: true })) {
          const p = join(d, e.name);
          if (e.isDirectory()) walk(p, list);
          else list.push(p);
        }
      };
      walk(rootA, listA);
      walk(rootB, listB);
      if (listA.length !== listB.length) {
        findings.push(`extracted file counts differ (${listA.length} vs ${listB.length})`);
        return findings;
      }
      let bytes = 0;
      let mtimes = 0;
      let byteEqualMtimeDiffer = 0;
      for (const pa of listA) {
        const rel = relative(rootA, pa);
        const pb = join(rootB, rel);
        const same = readFileSync(pa).equals(readFileSync(pb));
        const sameM = statSync(pa).mtimeMs === statSync(pb).mtimeMs;
        if (!same) bytes += 1;
        else if (!sameM) byteEqualMtimeDiffer += 1;
        else mtimes += 1;
      }
      findings.push(
        `squashfs payload: ${listA.length} files, ${bytes} with differing bytes, ${byteEqualMtimeDiffer} byte-equal with differing mtimes, ${mtimes} fully equal`,
      );
      // ELF build-id drift on the main binary, if readelf exists.
      const binA = join(rootA, "usr", "bin");
      const candidates = existsSync(binA) ? readdirSync(binA) : [];
      if (candidates.length > 0 && tool("readelf")) {
        try {
          const noteA = execFileSync("readelf", ["-n", join(binA, candidates[0])], { encoding: "utf8" });
          const noteB = execFileSync("readelf", ["-n", join(rootB, "usr", "bin", candidates[0])], { encoding: "utf8" });
          const idA = /Build ID: ([0-9a-f]+)/.exec(noteA)?.[1];
          const idB = /Build ID: ([0-9a-f]+)/.exec(noteB)?.[1];
          findings.push(
            `ELF build-id of usr/bin/${candidates[0]}: ${idA ?? "?"} vs ${idB ?? "?"} ${idA && idA === idB ? "(identical)" : "(DIFFERENT — compiled code diverged, not just packaging metadata)"}`,
          );
        } catch {
          findings.push("readelf probe of the main binary failed (tooling)");
        }
      }
    } else if (lower.endsWith(".rpm")) {
      findings.push("rpm: layer diagnosis requires rpm tooling not guaranteed on runners; compare sizes/hashes and `7z l -slt` metadata if p7zip is installed");
    }
  } catch (e) {
    findings.push(`diagnosis incomplete: ${e.message.split("\n")[0]}`);
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  return findings;
}

const names = [...new Set([...aFiles.keys(), ...bFiles.keys()])].sort();
const results = names.map((name) => {
  const a = aFiles.get(name) ?? null;
  const b = bFiles.get(name) ?? null;
  if (!a || !b) {
    return { name, present: { a: !!a, b: !!b }, verdict: "MISSING_IN_ONE_BUILD" };
  }
  const sizeA = statSync(a).size;
  const sizeB = statSync(b).size;
  const hashA = sha256(a);
  const hashB = sha256(b);
  const identical = hashA === hashB && sizeA === sizeB;
  return {
    name,
    size: { a: sizeA, b: sizeB },
    sha256: { a: hashA, b: hashB },
    byte_identical: identical,
    verdict: identical ? "BIT_FOR_BIT_IDENTICAL" : "DIVERGENT",
    diagnosis: identical ? [] : diagnose(name, a, b),
  };
});

const allIdentical = results.every((r) => r.verdict === "BIT_FOR_BIT_IDENTICAL");
const report = {
  label,
  generated_at: new Date().toISOString(),
  verdict: allIdentical ? "BIT_FOR_BIT_IDENTICAL" : "DIVERGENT",
  artifacts: results,
};

if (jsonOut) {
  writeFileSync(resolve(jsonOut), `${JSON.stringify(report, null, 2)}\n`);
}
if (markdownOut) {
  const md = [
    `# Reproducibility experiment — ${label}`,
    "",
    `Verdict: **${report.verdict}**`,
    "",
    "| Artifact | size A | size B | byte-identical |",
    "| --- | ---: | ---: | --- |",
    ...results.map(
      (r) =>
        `| ${r.name} | ${r.size?.a ?? "—"} | ${r.size?.b ?? "—"} | ${r.byte_identical === undefined ? "—" : r.byte_identical ? "YES" : "NO"} |`,
    ),
    "",
    ...results.flatMap((r) =>
      r.diagnosis?.length ? [`### ${r.name}`, "", ...r.diagnosis.map((d) => `- ${d}`), ""] : [],
    ),
    "",
    "sha256 (A → B):",
    "",
    ...results.map((r) => `- \`${r.name}\`: \`${r.sha256?.a ?? "—"}\` → \`${r.sha256?.b ?? "—"}\``),
    "",
  ].join("\n");
  writeFileSync(resolve(markdownOut), md);
}

console.log(`REPRO COMPARE (${label}): ${report.verdict}`);
for (const r of results) {
  console.log(
    `  ${r.verdict === "BIT_FOR_BIT_IDENTICAL" ? "✓" : "✗"} ${r.name} ` +
      `${r.sha256 ? `${r.sha256.a.slice(0, 12)}…/${r.sha256.b.slice(0, 12)}…` : ""}`,
  );
  for (const d of r.diagnosis ?? []) console.log(`      · ${d}`);
}
