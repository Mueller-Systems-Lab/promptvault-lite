// Tests for scripts/lan-verify/verify-lan-deployment.mjs (Issue #138).
//
// The harness must be usable while #138 is blocked on owner-provided
// Proxmox/NAS/LAN values: it has to name exactly what is missing, refuse to
// invent or accept a plaintext credential, and render the manual steps with the
// real commands. These tests pin that contract with synthetic inputs only.
//
// The *executable* half of the harness is proven by its own self-test
// (`node scripts/lan-verify/verify-lan-deployment.mjs --self-test`), which runs
// the whole sequence against a local synthetic equivalent and, in the negative
// pass, against a deliberately weakened boundary.
//
// Run: pnpm vitest run scripts/__tests__/lan-verify.test.js
// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  CREDENTIAL_INPUT,
  NAS_PATH_INPUTS,
  REQUIRED_INPUTS,
  inspectInputs,
  manualSteps,
  mountRecipe,
  renderReport,
} from "../lan-verify/verify-lan-deployment.mjs";

const env = (vars) => (k) => vars[k];
const COMPLETE = {
  LXC_ID: "200",
  LXC_IP: "192.0.2.10",
  GATEWAY: "192.0.2.1",
  NAS_PROTOCOL: "smb",
  NAS_SHARE: "prompts",
  [CREDENTIAL_INPUT]: "file:/root/.nas-credentials",
};

describe("inspectInputs — the blocked-state contract", () => {
  it("reports every required input as missing on an empty environment", () => {
    const res = inspectInputs(env({}));
    expect(res.ok).toBe(false);
    const names = res.missing.map((m) => m.name);
    for (const input of REQUIRED_INPUTS) expect(names).toContain(input.name);
    expect(names).toContain("NAS_SHARE|NAS_EXPORT");
    expect(names).toContain(CREDENTIAL_INPUT);
    // every entry explains itself, so the handoff is actionable
    for (const m of res.missing) expect(m.why).toBeTruthy();
  });

  it("accepts a complete non-secret input set", () => {
    const res = inspectInputs(env(COMPLETE));
    expect(res).toEqual({ ok: true, missing: [], invalid: [], credentialRef: COMPLETE[CREDENTIAL_INPUT] });
  });

  it("accepts an nfs export instead of an smb share", () => {
    const res = inspectInputs(
      env({ ...COMPLETE, NAS_PROTOCOL: "nfs", NAS_SHARE: undefined, NAS_EXPORT: "/export/prompts" }),
    );
    expect(res.ok).toBe(true);
  });

  it("rejects an unknown NAS protocol", () => {
    const res = inspectInputs(env({ ...COMPLETE, NAS_PROTOCOL: "ftp" }));
    expect(res.ok).toBe(false);
    expect(res.invalid.map((i) => i.name)).toContain("NAS_PROTOCOL");
  });

  it("rejects a malformed LXC_IP", () => {
    const res = inspectInputs(env({ ...COMPLETE, LXC_IP: "192.0.2" }));
    expect(res.ok).toBe(false);
    expect(res.invalid.map((i) => i.name)).toContain("LXC_IP");
  });

  it("refuses a plaintext credential", () => {
    const res = inspectInputs(env({ ...COMPLETE, NAS_PASSWORD: "hunter2" }));
    expect(res.ok).toBe(false);
    expect(res.invalid.map((i) => i.name)).toContain("NAS_PASSWORD|NAS_TOKEN");
  });

  it("rejects a credential reference without a known scheme", () => {
    const res = inspectInputs(env({ ...COMPLETE, [CREDENTIAL_INPUT]: "hunter2" }));
    expect(res.ok).toBe(false);
    const entry = res.invalid.find((i) => i.name === CREDENTIAL_INPUT);
    expect(entry).toBeTruthy();
    expect(entry.why).toMatch(/reference/i);
  });

  it("accepts each documented credential-reference form", () => {
    for (const ref of ["file:/root/.nas-credentials", "env:NAS_CREDENTIALS", "systemd-cred:nas-credentials"]) {
      expect(inspectInputs(env({ ...COMPLETE, [CREDENTIAL_INPUT]: ref })).ok).toBe(true);
    }
  });

  it("documents exactly one of the two NAS path inputs", () => {
    expect(NAS_PATH_INPUTS).toEqual(["NAS_SHARE", "NAS_EXPORT"]);
  });
});

describe("mountRecipe", () => {
  it("builds a read-only cifs mount and strips the file: scheme from the ref", () => {
    const recipe = mountRecipe({
      protocol: "smb",
      share: "prompts",
      credentialRef: "file:/root/.nas-credentials",
      mountPoint: "/mnt/promptvault-prompts",
      ip: "192.0.2.144",
    });
    expect(recipe).toContain("-t cifs");
    expect(recipe).toContain("//192.0.2.144/prompts");
    expect(recipe).toContain("credentials=/root/.nas-credentials");
    expect(recipe).toContain("ro");
    expect(recipe).not.toContain("file:/root/.nas-credentials");
  });

  it("builds a read-only nfs mount", () => {
    const recipe = mountRecipe({
      protocol: "nfs",
      exportPath: "/export/prompts",
      mountPoint: "/mnt/promptvault-prompts",
      ip: "192.0.2.144",
    });
    expect(recipe).toContain("-t nfs");
    expect(recipe).toContain("192.0.2.144:/export/prompts");
    expect(recipe).toContain("-o ro");
  });

  it("never emits a credential value, only a reference path", () => {
    const recipe = mountRecipe({ protocol: "smb", share: "s", credentialRef: "env:NAS_CREDENTIALS", mountPoint: "/mnt/x", ip: "192.0.2.1" });
    // env: form falls back to a file path placeholder; no secret is printed
    expect(recipe).not.toMatch(/password|token|secret/i);
  });
});

describe("manualSteps", () => {
  const steps = manualSteps({ mountPoint: "/mnt/promptvault-prompts", ip: "192.0.2.10", port: 8080 });

  it("covers every acceptance criterion that needs host access", () => {
    expect(steps.map((s) => s.id).sort()).toEqual(
      ["nas_mount_readonly", "nas_write_rejected", "restart_survives", "second_lan_device", "wan_not_exposed"].sort(),
    );
  });

  it("gives each step a runnable command and an expected result", () => {
    for (const s of steps) {
      expect(s.command).toBeTruthy();
      expect(s.expect).toBeTruthy();
      expect(s.why).toBeTruthy();
    }
  });

  it("interpolates the target and the mount point", () => {
    const byId = Object.fromEntries(steps.map((s) => [s.id, s]));
    expect(byId.nas_mount_readonly.command).toContain("/mnt/promptvault-prompts");
    expect(byId.restart_survives.command).toContain("192.0.2.10:8080");
    expect(byId.wan_not_exposed.expect).toMatch(/closed|filtered/i);
  });
});

describe("renderReport", () => {
  const report = renderReport({
    inputs: { LXC_IP: "192.0.2.10", [CREDENTIAL_INPUT]: "file:/root/.nas-credentials" },
    results: [
      { id: "health", ok: true, detail: "HTTP 200", ms: 12 },
      { id: "scan_unauthorized_root_rejected", ok: false, detail: "HTTP 200 (expected 403)" },
    ],
    manual: manualSteps({ mountPoint: "/mnt/p", ip: "192.0.2.10" }),
  });

  it("is a markdown evidence document with the inputs, results and manual steps", () => {
    expect(report).toContain("# LAN deployment verification (Issue #138) — evidence");
    expect(report).toContain("| LXC_IP | 192.0.2.10 |");
    expect(report).toContain("| health | PASS | HTTP 200 | 12 |");
    expect(report).toContain("| scan_unauthorized_root_rejected | FAIL |");
    expect(report).toContain("Automated: 1/2 PASS");
    expect(report).toContain("Steps that must be run manually");
  });

  it("never contains a credential value", () => {
    expect(report).not.toMatch(/password\s*[:=]\s*\S/i);
  });
});
