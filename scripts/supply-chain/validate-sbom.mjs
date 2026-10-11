#!/usr/bin/env node
// =============================================================================
// SBOM validator (supply-chain gate, issue #296).
//
// Deliberately INDEPENDENT of generate-sbom.mjs: no shared module, no shared
// parsing path. It re-derives every structural expectation from the CycloneDX
// 1.6 document itself, so a generator bug cannot be mirrored here as a
// "passing" validator. It is the engine behind verifier gate G9 and runs on
// its own in CI.
//
//   S1  the file is JSON
//   S2  CycloneDX 1.6 envelope (bomFormat/specVersion/version/serialNumber)
//   S3  metadata.timestamp is an ISO-8601 UTC instant
//   S4  root identity: application `promptvault-lite`, correct purl prefix,
//       and — when given — the expected --expect-version
//   S5  promptvault:source_commit matches --expect-commit when given
//   S6  components: non-empty, unique bom-refs, name+version+purl present,
//       purl scheme restricted to npm/cargo/github, bom-ref == purl
//   S7  component count >= --min-components
//   S8  every --require <substring> is present among the refs
//   S9  leak scan over the raw text: private build paths, the private corpus
//       marker, and secret-like tokens fail closed
//   S10 dependency graph has no dangling refs and includes the root
//
// Usage:
//   node scripts/supply-chain/validate-sbom.mjs <sbom.json> \
//     [--expect-version x.y.z] [--expect-commit <40hex>]
//     [--min-components N] [--require <purl-substring>]...
// =============================================================================
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

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
const OPTIONS_WITH_VALUE = new Set(["expect-version", "expect-commit", "min-components", "require"]);
let file = null;
for (let i = 0; i < argv.length; i += 1) {
  const token = argv[i];
  if (token.startsWith("--")) {
    if (OPTIONS_WITH_VALUE.has(token.slice(2))) i += 1; // skip its value
    continue;
  }
  if (file === null) file = token;
}

function option(name) {
  const out = [];
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === `--${name}` && argv[i + 1] && !argv[i + 1].startsWith("--")) {
      out.push(argv[i + 1]);
      i += 1;
    }
  }
  return out;
}

if (!file) {
  console.error("validate-sbom: missing <sbom.json> argument");
  process.exit(2);
}
const expectVersion = option("expect-version")[0] ?? null;
const expectCommit = option("expect-commit")[0] ?? null;
const minComponents = Number(option("min-components")[0] ?? 0);
const requires = option("require");

const raw = readFileSync(resolve(file), "utf8");
let bom = null;

check("S1 file is valid JSON", () => {
  bom = JSON.parse(raw);
  return `${raw.length} bytes`;
});

check("S2 CycloneDX 1.6 envelope", () => {
  if (bom.bomFormat !== "CycloneDX") throw new Error(`bomFormat '${bom.bomFormat}' ≠ 'CycloneDX'`);
  if (bom.specVersion !== "1.6") throw new Error(`specVersion '${bom.specVersion}' ≠ '1.6'`);
  if (!Number.isInteger(bom.version) || bom.version < 1) throw new Error("'version' must be an integer ≥ 1");
  if (!/^urn:uuid:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(bom.serialNumber ?? "")) {
    throw new Error("'serialNumber' must be a urn:uuid:<uuid>");
  }
  return `serial ${bom.serialNumber}`;
});

check("S3 metadata.timestamp is an ISO-8601 UTC instant", () => {
  const ts = bom.metadata?.timestamp;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(ts ?? "")) {
    throw new Error(`not an ISO-8601 UTC instant: ${ts}`);
  }
  return ts;
});

check("S4 root component identity", () => {
  const root = bom.metadata?.component;
  if (!root) throw new Error("no metadata.component (missing root identity)");
  if (root.type !== "application") throw new Error(`root type '${root.type}' ≠ 'application'`);
  if (root.name !== "promptvault-lite") throw new Error(`root name '${root.name}' ≠ 'promptvault-lite'`);
  if (!String(root.purl ?? "").startsWith("pkg:github/Mueller-Systems-Lab/promptvault-lite@")) {
    throw new Error(`root purl '${root.purl}' is not the product purl`);
  }
  if (expectVersion && root.version !== expectVersion) {
    throw new Error(`root version ${root.version} ≠ expected ${expectVersion}`);
  }
  return `v${root.version}`;
});

check("S5 source commit binding", () => {
  const prop = (bom.metadata?.properties ?? []).find(
    (p) => p?.name === "promptvault:source_commit",
  );
  if (!prop) throw new Error("no promptvault:source_commit property in metadata");
  if (!/^[0-9a-f]{40}$/.test(prop.value)) throw new Error("source_commit is not a 40-hex SHA");
  if (expectCommit && prop.value !== expectCommit) {
    throw new Error(`source_commit ${prop.value} ≠ expected ${expectCommit}`);
  }
  return prop.value.slice(0, 12);
});

let components = [];
check("S6 components are well-formed and uniquely referenced", () => {
  components = bom.components ?? [];
  if (components.length === 0) throw new Error("components is empty");
  const refs = new Set();
  for (const c of components) {
    if (typeof c["bom-ref"] !== "string" || c["bom-ref"] === "") throw new Error("component without bom-ref");
    if (refs.has(c["bom-ref"])) throw new Error(`duplicate bom-ref ${c["bom-ref"]}`);
    refs.add(c["bom-ref"]);
    if (typeof c.name !== "string" || typeof c.version !== "string") {
      throw new Error(`${c["bom-ref"]}: missing name/version`);
    }
    if (!/^pkg:(npm|cargo|github)\//.test(c.purl ?? "")) {
      throw new Error(`${c["bom-ref"]}: purl '${c.purl}' uses an unexpected scheme`);
    }
    if (c.purl !== c["bom-ref"]) {
      throw new Error(`${c["bom-ref"]}: bom-ref must equal purl (repository convention)`);
    }
  }
  return `${components.length} components`;
});

check("S7 component count meets the minimum", () => {
  if (components.length < minComponents) {
    throw new Error(`${components.length} < --min-components ${minComponents}`);
  }
  return `${components.length} ≥ ${minComponents}`;
});

check("S8 required components are present", () => {
  const refs = components.map((c) => c.purl).join("\n");
  const missing = requires.filter((r) => !refs.includes(r));
  if (missing.length) throw new Error(`missing: ${missing.join(", ")}`);
  return requires.length ? `${requires.length} requirement(s) met` : "no --require given";
});

check("S9 no private paths or secret-like material in the document", () => {
  const PLACEHOLDERS = "user|username|you|example|someone|alice|bob";
  const rules = [
    {
      label: "private home path",
      re: new RegExp(String.raw`/(home|Users)/(?!(${PLACEHOLDERS})/)[A-Za-z0-9_.-]+/`),
    },
    { label: "host mount path", re: /\/mnt\// },
    { label: "Windows profile path", re: /[A-Za-z]:\\Users\\/ },
    { label: "private corpus marker", re: /\bPromps\b/ },
    { label: "GitHub token", re: /ghp_[A-Za-z0-9]{16,}|github_pat_[A-Za-z0-9_]{20,}/ },
    { label: "AWS key id", re: /AKIA[0-9A-Z]{16}/ },
    { label: "private key block", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  ];
  const hits = rules.filter((r) => r.re.test(raw)).map((r) => r.label);
  if (hits.length) throw new Error(`${hits.length} leak(s): ${hits.join(", ")}`);
  return "clean";
});

check("S10 dependency graph is closed and includes the root", () => {
  const deps = bom.dependencies ?? [];
  if (!Array.isArray(deps) || deps.length === 0) throw new Error("dependencies is empty");
  const refs = new Set(components.map((c) => c["bom-ref"]));
  const rootRef = bom.metadata?.component?.["bom-ref"];
  if (!deps.some((d) => d.ref === rootRef)) throw new Error("root has no dependency entry");
  const dangling = [];
  for (const d of deps) {
    if (d.ref !== rootRef && !refs.has(d.ref)) dangling.push(d.ref);
    for (const t of d.dependsOn ?? []) {
      if (t !== rootRef && !refs.has(t)) dangling.push(`${d.ref} → ${t}`);
    }
  }
  if (dangling.length) throw new Error(`${dangling.length} dangling ref(s): ${dangling.slice(0, 4).join("; ")}`);
  return `${deps.length} dependency nodes`;
});

console.log("");
if (failures.length) {
  console.error(`SBOM VALID: FAIL (${failures.length})`);
  process.exit(1);
}
console.log("SBOM VALID: PASS");
