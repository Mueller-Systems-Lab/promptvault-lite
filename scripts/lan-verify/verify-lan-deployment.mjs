#!/usr/bin/env node
// =============================================================================
// LAN / LXC deployment verification harness (Issue #138, "K2").
//
// Purpose: make the #138 verification sequence executable *now*, and prove the
// parts that need no external infrastructure today.
//
// Issue #138 is blocked on human-provided Proxmox/NAS/LAN details. This harness
// does not invent any of them. It has three modes:
//
//   --check-inputs   Validate which inputs are present and print the exact list
//                    of what is still missing. This is the mode that runs while
//                    the issue is blocked; it exits 3 (BLOCKED) and never
//                    guesses a value.
//
//   --self-test      Run the FULL automated sequence against a locally started
//                    promptvault-server and a synthetic read-only "NAS". Proves
//                    the check logic end to end without any real infrastructure
//                    and without claiming external success.
//
//   (default)        Run the automated sequence against the real environment
//                    described by the provided inputs. Prints the MANUAL steps
//                    (mount read-only proof, restart survival, WAN port scan)
//                    with the exact command and its expected output, because
//                    those cannot be executed from this process.
//
// Secrets: the harness accepts only a *reference* to the read-only NAS
// credential (a file path or an environment-variable name), never a value. It
// never reads the file and never logs it; it only emits it inside the mount
// command template.
//
// That rule also bounds one check: `no_credential_material_in_responses` can
// only prove that the *reference* is not echoed, because the harness never
// possesses a credential to look for. It is labelled PARTIAL in its own output,
// and the `credential_log_review` manual step covers what it cannot.
//
// Usage:
//   node scripts/lan-verify/verify-lan-deployment.mjs --check-inputs
//   node scripts/lan-verify/verify-lan-deployment.mjs --self-test
//   LXC_IP=… LXC_ID=… GATEWAY=… NAS_PROTOCOL=… NAS_SHARE=… \
//     NAS_CREDENTIALS_REF=file:/root/.nas-credentials \
//     node scripts/lan-verify/verify-lan-deployment.mjs --evidence out.md
// =============================================================================
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

// -----------------------------------------------------------------------------
// Input contract
// -----------------------------------------------------------------------------

/** Non-secret inputs required before the real run can execute. */
export const REQUIRED_INPUTS = [
  { name: "LXC_ID", why: "Proxmox container ID (context for the LXC-side steps)" },
  { name: "LXC_IP", why: "IP of the LXC on the LAN; the base URL of the target" },
  { name: "GATEWAY", why: "default gateway of the LXC (network-config check)" },
  { name: "NAS_PROTOCOL", why: "'smb' or 'nfs' (selects the mount recipe)" },
];

/** Exactly one of these must be present, matching NAS_PROTOCOL. */
export const NAS_PATH_INPUTS = ["NAS_SHARE", "NAS_EXPORT"];

/**
 * Optional: the NAS host. Only needed to emit the mount recipe; the issue body
 * names `192.168.1.144` for the NAS, but that value must be confirmed rather
 * than assumed, so it is an input and not a default.
 */
export const OPTIONAL_INPUTS = ["NAS_IP", "LXC_PORT", "NAS_MOUNT_POINT"];

/** Strict IPv4 test (four octets, each 0-255). */
export function isIpv4(value) {
  const parts = String(value).split(".");
  if (parts.length !== 4) return false;
  return parts.every((p) => /^\d{1,3}$/.test(p) && Number(p) <= 255);
}

/** A *reference* to the read-only credential — never the credential itself. */
export const CREDENTIAL_INPUT = "NAS_CREDENTIALS_REF";

const CREDENTIAL_REF_FORMS = [
  { prefix: "file:", example: "file:/root/.nas-credentials (chmod 600, LXC only)" },
  { prefix: "env:", example: "env:NAS_CREDENTIALS (read from the LXC environment)" },
  { prefix: "systemd-cred:", example: "systemd-cred:nas-credentials" },
];

/**
 * Classify the environment. Pure: takes a lookup function so it is testable.
 * Returns `{ ok, missing[], invalid[], credentialRef }` — never throws.
 */
export function inspectInputs(get) {
  const value = (name) => {
    const v = get(name);
    return typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  };
  const missing = [];
  const invalid = [];

  for (const input of REQUIRED_INPUTS) {
    if (!value(input.name)) missing.push({ name: input.name, why: input.why });
  }

  const protocol = value("NAS_PROTOCOL");
  if (protocol && !["smb", "nfs"].includes(protocol.toLowerCase())) {
    invalid.push({ name: "NAS_PROTOCOL", why: `must be 'smb' or 'nfs', got '${protocol}'` });
  }

  const share = value("NAS_SHARE");
  const exportPath = value("NAS_EXPORT");
  if (!share && !exportPath) {
    missing.push({
      name: "NAS_SHARE|NAS_EXPORT",
      why: "the share name (smb) or export path (nfs) to mount",
    });
  }

  const credentialRef = value(CREDENTIAL_INPUT);
  if (!credentialRef) {
    missing.push({
      name: CREDENTIAL_INPUT,
      why: `a *reference* to the read-only credential, never a value: ${CREDENTIAL_REF_FORMS.map((f) => f.prefix).join(" | ")}`,
    });
  } else if (!CREDENTIAL_REF_FORMS.some((f) => credentialRef.startsWith(f.prefix))) {
    invalid.push({
      name: CREDENTIAL_INPUT,
      why: `must be a reference (${CREDENTIAL_REF_FORMS.map((f) => f.prefix).join(" | ")}), not a literal credential`,
    });
  }

  // A literal-looking secret must be refused outright, not quietly accepted.
  const suspicious = value("NAS_PASSWORD") || value("NAS_TOKEN");
  if (suspicious) {
    invalid.push({
      name: "NAS_PASSWORD|NAS_TOKEN",
      why: "the harness never accepts a plaintext credential; pass a reference instead",
    });
  }

  // Every address-like input is validated exactly once, and GATEWAY is
  // validated unconditionally (an earlier version only checked it when it
  // happened to start with a digit, so a hostname-looking gateway passed).
  for (const name of ["LXC_IP", "GATEWAY", "NAS_IP"]) {
    const v = value(name);
    if (v && !isIpv4(v)) {
      invalid.push({ name, why: `not an IPv4 address: '${v}'` });
    }
  }

  return { ok: missing.length === 0 && invalid.length === 0, missing, invalid, credentialRef };
}

// -----------------------------------------------------------------------------
// Mount recipe + manual steps (emitted, never executed against real infra)
// -----------------------------------------------------------------------------

/** The read-only mount recipe for the given protocol, using the reference. */
export function mountRecipe({ protocol, share, exportPath, credentialRef, mountPoint, nasIp }) {
  const p = (protocol || "").toLowerCase();
  // `nasIp` is the NAS host, never the LXC host: mounting is `//<NAS>/<share>`.
  const host = nasIp || "<NAS_IP>";
  if (p === "smb") {
    const ref = (credentialRef || "file:/root/.nas-credentials").replace(/^file:/, "");
    return [
      `sudo mkdir -p ${mountPoint}`,
      `sudo mount -t cifs //${host}/${share} ${mountPoint} \\`,
      `  -o credentials=${ref},iocharset=utf8,ro`,
    ].join("\n");
  }
  if (p === "nfs") {
    return [
      `sudo mkdir -p ${mountPoint}`,
      `sudo mount -t nfs ${host}:${exportPath} ${mountPoint} -o ro`,
    ].join("\n");
  }
  return "# NAS_PROTOCOL must be 'smb' or 'nfs'";
}

/** Steps that cannot be executed from this process, with expected results. */
export function manualSteps({ mountPoint, ip, port = 8080 }) {
  return [
    {
      id: "nas_mount_readonly",
      command: `findmnt -no SOURCE,OPTIONS ${mountPoint}`,
      expect: "the option list contains `ro` (and the NAS source)",
      why: "proves the NAS is mounted read-only at the OS level, independent of the server",
    },
    {
      id: "nas_write_rejected",
      command: `touch ${mountPoint}/__pvl_write_probe && echo WRITABLE || echo READ_ONLY_REJECTED`,
      expect: "`READ_ONLY_REJECTED`",
      why: "the issue's red test: a write to the NAS must fail",
    },
    {
      id: "restart_survives",
      command: `cd <repo>/deploy && docker compose restart && sleep 5 && curl -fsS http://${ip}:${port}/api/health`,
      expect: "`{\"status\":\"ok\",…}` after the restart",
      why: "acceptance: the service comes back without manual repair",
    },
    {
      id: "credential_log_review",
      command:
        `cd <repo>/deploy && docker compose logs | grep -iE 'password|passwd|secret|token' || echo NO_CREDENTIAL_MATERIAL_IN_LOGS`,
      expect:
        "`NO_CREDENTIAL_MATERIAL_IN_LOGS`, or at most the credential *path* — never a value",
      why:
        "the automated check can only prove that the reference is not echoed; a leaked password cannot be detected by a harness that never receives one, so this review is what closes the issue's 'no credentials visible in UI, logs, responses' criterion",
    },
    {
      id: "wan_not_exposed",
      command: `nmap -Pn -p ${port} <public-ip-of-the-site>`,
      expect: "`closed` or `filtered` — 8080 must NOT be reachable from WAN",
      why: "the issue's red test; must be run from OUTSIDE the LAN",
    },
    {
      id: "second_lan_device",
      command: `curl -fsS http://${ip}:${port}/api/health   # from a second LAN device`,
      expect: "same health document as from the first device",
      why: "acceptance: verified from at least two different LAN devices",
    },
  ];
}

// -----------------------------------------------------------------------------
// Automated checks
// -----------------------------------------------------------------------------

const DEFAULT_TIMEOUT_MS = 10_000;

async function httpJson(url, { method = "GET", body, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  const started = Date.now();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method,
      headers: body === undefined ? undefined : { "content-type": "application/json" },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller.signal,
    });
    const text = await res.text();
    let json = null;
    try {
      json = JSON.parse(text);
    } catch {
      /* not JSON: keep the raw text for the report */
    }
    return { status: res.status, json, text, ms: Date.now() - started };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * The full automated sequence. Every check returns
 * `{ id, ok, detail, ms? }`; a failing check never throws.
 */
export async function runAutomatedChecks({
  baseUrl,
  allowedRoot,
  unauthorizedRoot,
  credentialRef,
  listBudgetMs = 500,
  scanBudgetMs = 2000,
  log = () => {},
}) {
  const results = [];
  const record = (id, ok, detail, ms) => {
    results.push({ id, ok, detail, ...(ms === undefined ? {} : { ms }) });
    log(`${ok ? "PASS" : "FAIL"} ${id} — ${detail}`);
  };

  // 1. reachability + version + read-only default
  let health;
  try {
    health = await httpJson(`${baseUrl}/api/health`);
  } catch (e) {
    record("health", false, `unreachable: ${e.message}`);
    return results; // nothing else can be evaluated
  }
  const version = health.json?.version;
  record(
    "health",
    health.status === 200 && health.json?.status === "ok",
    `HTTP ${health.status}, status=${health.json?.status}, version=${version ?? "?"}, read_only=${health.json?.read_only}`,
  );

  // 2. read-only semantics must be on (issue: NAS read-only enforcement)
  record(
    "read_only_default",
    health.json?.read_only === true,
    `read_only=${health.json?.read_only} (must be true; the vault is a read-only mount)`,
  );

  // 3. the allowed vault is scannable, and within the scan budget
  let scan;
  try {
    scan = await httpJson(`${baseUrl}/api/scan`, { method: "POST", body: { path: allowedRoot } });
  } catch (e) {
    record("scan_allowed_root", false, `request failed: ${e.message}`);
    scan = null;
  }
  if (scan) {
    const count = Array.isArray(scan.json) ? scan.json.length : -1;
    record(
      "scan_allowed_root",
      scan.status === 200 && count > 0,
      `HTTP ${scan.status}, ${count} prompt(s) from the allowed root`,
      scan.ms,
    );
    record(
      "scan_latency",
      scan.ms <= scanBudgetMs,
      `${scan.ms} ms (budget ${scanBudgetMs} ms)`,
      scan.ms,
    );
  }

  // 4. an unauthorized root must be rejected (v1.13.2 boundary)
  const outside = await httpJson(`${baseUrl}/api/scan`, { method: "POST", body: { path: unauthorizedRoot } });
  record(
    "scan_unauthorized_root_rejected",
    outside.status === 403,
    `HTTP ${outside.status} (expected 403), code=${outside.json?.error?.code ?? "-"}`,
  );

  // 5. traversal must be rejected as a *shape* error, not a permission error
  const traversal = await httpJson(`${baseUrl}/api/scan`, {
    method: "POST",
    body: { path: `${allowedRoot}/../../etc` },
  });
  record(
    "scan_traversal_rejected",
    traversal.status === 400,
    `HTTP ${traversal.status} (expected 400), code=${traversal.json?.error?.code ?? "-"}`,
  );

  // 6. listing within budget
  const list = await httpJson(`${baseUrl}/api/prompts`);
  record(
    "list_prompts",
    list.status === 200 && Array.isArray(list.json),
    `HTTP ${list.status}, ${Array.isArray(list.json) ? list.json.length : "?"} item(s)`,
    list.ms,
  );
  record("list_latency", list.ms <= listBudgetMs, `${list.ms} ms (budget ${listBudgetMs} ms)`, list.ms);

  // 7. writes are refused in read-only mode
  const toggle = await httpJson(`${baseUrl}/api/favorites/__probe__/toggle`, { method: "POST" });
  record(
    "write_refused_read_only",
    toggle.status === 403,
    `favorites toggle -> HTTP ${toggle.status} (expected 403 in read-only mode)`,
  );
  const exportRes = await httpJson(`${baseUrl}/api/export`, { method: "POST", body: { format: "json" } });
  record(
    "export_refused_read_only",
    exportRes.status === 403,
    `export -> HTTP ${exportRes.status} (expected 403 in read-only mode)`,
  );

  // 8. no credential material may appear in any response
  const bodies = [health, scan, outside, traversal, list, toggle, exportRes]
    .filter(Boolean)
    .map((r) => r.text ?? "");
  const secretNeedle = (credentialRef || "").replace(/^(file|env|systemd-cred):/, "");
  const leak =
    secretNeedle &&
    secretNeedle.length > 3 &&
    bodies.some((b) => b.includes(secretNeedle));
  record(
    "no_credential_material_in_responses",
    !leak,
    leak
      ? "the credential reference value appears in a response body"
      : "PARTIAL: the credential reference is not echoed in any response; a leaked password cannot be detected here, because the harness never receives one — see the credential_log_review manual step",
  );

  // 9. the server must not disclose the allowed roots to an unauthenticated client
  const denialBody = outside.text ?? "";
  const disclosesRoots = allowedRoot && denialBody.includes(allowedRoot);
  record(
    "denial_does_not_disclose_roots",
    !disclosesRoots,
    disclosesRoots ? "the 403 body echoes the configured scan root" : "the 403 body names the env var only",
  );

  return results;
}

// -----------------------------------------------------------------------------
// Self-test: a local synthetic equivalent of the deployed shape
// -----------------------------------------------------------------------------

/**
 * Start a local promptvault-server against a synthetic vault and run the whole
 * automated sequence. Requires only the built server binary (and a free port);
 * makes no external claim.
 */
export async function selfTest({ serverBinary, port = 18099, scanRoots, log = console.log } = {}) {
  const work = mkdtempSync(join(tmpdir(), "pvl-lan-selftest-"));
  const vault = join(work, "vault");
  const outside = join(work, "outside");
  mkdirSync(join(vault, "sub"), { recursive: true });
  mkdirSync(outside, { recursive: true });
  writeFileSync(
    join(vault, "alpha.md"),
    "---\ntitle: Alpha\ncategory: demo\ntags: [a]\n---\n\n# Rolle\nTester.\n",
  );
  writeFileSync(join(vault, "sub", "beta.md"), "# Beta\n\nInhalt.\n");
  writeFileSync(join(outside, "secret.md"), "# Secret\n\nOutside the scan root.\n");

  const env = {
    ...process.env,
    PROMPTVAULT_SERVER_VAULT: vault,
    PROMPTVAULT_SERVER_PORT: String(port),
    PROMPTVAULT_SERVER_HOST: "127.0.0.1",
    PROMPTVAULT_SERVER_READ_ONLY: "1",
  };
  // `scanRoots: "*"` deliberately weakens the boundary, so the negative
  // self-test can prove the boundary check actually fires.
  if (scanRoots !== undefined) env.PROMPTVAULT_SERVER_SCAN_ROOTS = scanRoots;
  const child = spawnDetached(serverBinary, env);
  try {
    const baseUrl = `http://127.0.0.1:${port}`;
    await waitForHealth(baseUrl, 15_000);
    const results = await runAutomatedChecks({
      baseUrl,
      allowedRoot: vault,
      unauthorizedRoot: outside,
      credentialRef: "file:/root/.nas-credentials",
      log,
    });
    return { results, work, vault, outside };
  } finally {
    stopProcess(child);
    rmSync(work, { recursive: true, force: true });
  }
}

function spawnDetached(binary, env) {
  return spawn(binary, [], { env, stdio: "ignore" });
}

function stopProcess(child) {
  try {
    child.kill("SIGTERM");
  } catch {
    /* already gone */
  }
}

async function waitForHealth(baseUrl, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    try {
      const r = await httpJson(`${baseUrl}/api/health`, { timeoutMs: 1000 });
      if (r.status === 200) return true;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`server did not answer /api/health within ${timeoutMs} ms`);
}

// -----------------------------------------------------------------------------
// Reporting
// -----------------------------------------------------------------------------

export function renderReport({ inputs, results, manual, recipe }) {
  const lines = [];
  lines.push("# LAN deployment verification (Issue #138) — evidence");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Inputs (non-secret)");
  lines.push("");
  lines.push("| Input | Value |");
  lines.push("| --- | --- |");
  for (const [k, v] of Object.entries(inputs)) lines.push(`| ${k} | ${v ?? "—"} |`);
  lines.push("");
  lines.push("## Automated checks");
  lines.push("");
  lines.push("| Check | Result | Detail | ms |");
  lines.push("| --- | --- | --- | --- |");
  for (const r of results) {
    lines.push(`| ${r.id} | ${r.ok ? "PASS" : "FAIL"} | ${r.detail} | ${r.ms ?? ""} |`);
  }
  lines.push("");
  const failed = results.filter((r) => !r.ok);
  lines.push(`Automated: ${results.length - failed.length}/${results.length} PASS`);
  lines.push("");
  if (recipe) {
    lines.push("## Mount recipe (read-only, credential by reference)");
    lines.push("");
    lines.push("```bash");
    lines.push(recipe);
    lines.push("```");
    lines.push("");
    lines.push(
      recipe.includes("<NAS_IP>")
        ? "`NAS_IP` was not supplied, so the recipe shows a placeholder."
        : "`NAS_IP` supplied by the operator.",
    );
    lines.push("");
  }
  lines.push("## Steps that must be run manually (host access required)");
  lines.push("");
  for (const s of manual) {
    lines.push(`### ${s.id}`);
    lines.push("");
    lines.push("```bash");
    lines.push(s.command);
    lines.push("```");
    lines.push(`Expected: ${s.expect}`);
    lines.push(`Why: ${s.why}`);
    lines.push("");
  }
  return lines.join("\n");
}

// -----------------------------------------------------------------------------
// CLI
// -----------------------------------------------------------------------------

function argValue(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i !== -1 && process.argv[i + 1] && !process.argv[i + 1].startsWith("--")
    ? process.argv[i + 1]
    : null;
}

async function main() {
  const mode = process.argv.includes("--self-test")
    ? "self-test"
    : process.argv.includes("--check-inputs")
      ? "check-inputs"
      : "real";

  const inputs = inspectInputs((k) => process.env[k]);

  if (mode === "check-inputs") {
    console.log("Issue #138 — required owner inputs");
    console.log("");
    if (inputs.missing.length) {
      console.log("MISSING:");
      for (const m of inputs.missing) console.log(`  - ${m.name} — ${m.why}`);
    }
    if (inputs.invalid.length) {
      console.log("INVALID:");
      for (const m of inputs.invalid) console.log(`  - ${m.name} — ${m.why}`);
    }
    if (!inputs.ok) {
      console.log("");
      console.log("STATUS: BLOCKED_EXTERNAL_OWNER_INPUT");
      process.exitCode = 3;
      return;
    }
    console.log("All required inputs are present.");
    console.log("Next: node scripts/lan-verify/verify-lan-deployment.mjs --evidence <path>");
    return;
  }

  if (mode === "self-test") {
    const binary = argValue("server-binary") || resolve("target/debug/promptvault-server");
    if (!existsSync(binary) || !statSync(binary).isFile()) {
      console.error(
        `self-test needs a built server binary; not found: ${binary}\n` +
          "Build it first: cargo build -p promptvault-server",
      );
      process.exitCode = 2;
      return;
    }

    console.log("--- positive: default boundary (scan restricted to the vault) ---");
    const { results } = await selfTest({ serverBinary: binary, port: Number(argValue("port") || 18099) });
    const failed = results.filter((r) => !r.ok);

    console.log("");
    console.log("--- negative: boundary deliberately weakened (SCAN_ROOTS=*) ---");
    console.log("    the unauthorized-root check MUST fail here; a green run would mean the check is vacuous");
    const neg = await selfTest({
      serverBinary: binary,
      port: Number(argValue("port-2") || 18100),
      scanRoots: "*",
    });
    const negBoundary = neg.results.find((r) => r.id === "scan_unauthorized_root_rejected");
    const negativeProvesCheck = negBoundary !== undefined && negBoundary.ok === false;

    console.log("");
    console.log(`self-test positive: ${results.length - failed.length}/${results.length} PASS`);
    console.log(
      `self-test negative: boundary check fired = ${negativeProvesCheck} ` +
        `(${negBoundary ? negBoundary.detail : "check missing"})`,
    );
    const ok = failed.length === 0 && negativeProvesCheck;
    console.log(ok ? "self-test: OK (checks pass on a correct deployment and fail on a broken one)" : "self-test: FAIL");
    process.exitCode = ok ? 0 : 1;
    return;
  }

  // real mode
  if (!inputs.ok) {
    console.error("Refusing to run: the external environment is not described yet.");
    for (const m of inputs.missing) console.error(`  MISSING ${m.name} — ${m.why}`);
    for (const m of inputs.invalid) console.error(`  INVALID ${m.name} — ${m.why}`);
    console.error("");
    console.error("STATUS: BLOCKED_EXTERNAL_OWNER_INPUT");
    process.exitCode = 3;
    return;
  }

  const ip = process.env.LXC_IP;
  const port = Number(argValue("port") || process.env.LXC_PORT || 8080);
  const mountPoint = argValue("mount-point") || process.env.NAS_MOUNT_POINT || "/mnt/promptvault-prompts";
  const baseUrl = `http://${ip}:${port}`;
  const results = await runAutomatedChecks({
    baseUrl,
    allowedRoot: mountPoint,
    unauthorizedRoot: "/etc",
    credentialRef: inputs.credentialRef,
    log: (m) => console.log(m),
  });
  const manual = manualSteps({ mountPoint, ip, port });
  const recipe = mountRecipe({
    protocol: process.env.NAS_PROTOCOL,
    share: process.env.NAS_SHARE,
    exportPath: process.env.NAS_EXPORT,
    credentialRef: inputs.credentialRef,
    mountPoint,
    nasIp: process.env.NAS_IP,
  });
  const report = renderReport({
    inputs: {
      LXC_ID: process.env.LXC_ID,
      LXC_IP: ip,
      GATEWAY: process.env.GATEWAY,
      NAS_PROTOCOL: process.env.NAS_PROTOCOL,
      NAS_SHARE: process.env.NAS_SHARE,
      NAS_EXPORT: process.env.NAS_EXPORT,
      [CREDENTIAL_INPUT]: inputs.credentialRef,
      NAS_MOUNT_POINT: mountPoint,
    },
    results,
    manual,
    recipe,
  });
  const out = argValue("evidence");
  if (out) {
    writeFileSync(out, `${report}\n`);
    console.log(`\nevidence written: ${out}`);
  } else {
    console.log(`\n${report}`);
  }
  const failed = results.filter((r) => !r.ok);
  console.log(`automated: ${results.length - failed.length}/${results.length} PASS; ${manual.length} manual step(s) remain`);
  process.exitCode = failed.length ? 1 : 0;
}

// Only run the CLI when executed directly (the module is imported by tests).
const invokedDirectly =
  process.argv[1] && resolve(process.argv[1]).endsWith("verify-lan-deployment.mjs");
if (invokedDirectly) {
  main().catch((e) => {
    console.error(`verify-lan-deployment: FAIL — ${e.message}`);
    process.exitCode = 1;
  });
}
