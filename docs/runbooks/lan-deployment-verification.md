# Runbook — LAN/LXC deployment verification (Issue #138)

Status: **BLOCKED_EXTERNAL_OWNER_INPUT.** The verification contract, the harness
and the evidence template are complete; only the non-secret environment values
and one credential *reference* are missing. Nothing here invents a Proxmox, NAS
or LAN value.

The harness is `scripts/lan-verify/verify-lan-deployment.mjs` (no dependencies
beyond Node's standard library).

---

## 1. What is already proven (no external infrastructure needed)

```bash
# Names exactly what is still missing; exits 3 while the issue is blocked.
node scripts/lan-verify/verify-lan-deployment.mjs --check-inputs

# Runs the whole automated sequence against a local synthetic equivalent
# (a real promptvault-server + a synthetic vault) and then against a
# deliberately weakened boundary, to show the checks can also fail.
cargo build -p promptvault-server
node scripts/lan-verify/verify-lan-deployment.mjs --self-test
```

The self-test asserts the same acceptance criteria #138 will assert, against a
local stand-in:

| Check | Asserted property |
| --- | --- |
| `health` | `/api/health` answers `status: ok` and reports a version |
| `read_only_default` | `read_only: true` — the vault is a read-only mount |
| `scan_allowed_root` | the configured root scans and yields prompts |
| `scan_latency` | scan within the issue's 2 s budget |
| `scan_unauthorized_root_rejected` | a path outside the roots is **403** (v1.13.2 boundary) |
| `scan_traversal_rejected` | `..` is **400** — a shape error, not a permission error |
| `list_prompts` / `list_latency` | listing works within the issue's 500 ms budget |
| `write_refused_read_only` / `export_refused_read_only` | mutating endpoints are 403 |
| `no_credential_material_in_responses` | **partial by design**: the credential *reference* string does not appear in any response body. The harness never possesses the credential, so a leaked password cannot be detected here — see the note under §4. |
| `denial_does_not_disclose_roots` | the 403 body names the env var, never the configured root |

The negative pass sets `PROMPTVAULT_SERVER_SCAN_ROOTS=*` and requires
`scan_unauthorized_root_rejected` to **fail**; a green result there would mean
the check is vacuous.

## 2. What the owner must provide

Exactly six required inputs — **five non-secret values plus one credential
reference**. Never a password or token in issue text, in this repository, or in
a command line. `--check-inputs` prints the same six line items.

| Input | What it is | Example shape |
| --- | --- | --- |
| `LXC_ID` | Proxmox container ID | `200` |
| `LXC_IP` | LAN IP of the LXC (the target base URL) | `192.0.2.10` |
| `GATEWAY` | default gateway of the LXC | `192.0.2.1` |
| `NAS_PROTOCOL` | `smb` or `nfs` | `smb` |
| `NAS_SHARE` *(smb)* or `NAS_EXPORT` *(nfs)* | share name or export path | `prompts` / `/export/prompts` |
| `NAS_CREDENTIALS_REF` | **reference** to the read-only credential, created in the LXC only, `chmod 600` | `file:/root/.nas-credentials` or `env:NAS_CREDENTIALS` or `systemd-cred:nas-credentials` |

Optional: `NAS_IP` (the NAS host — only needed to emit the mount recipe; the
issue body names `192.168.1.144`, but that has to be confirmed rather than
assumed, so the harness prints a `<NAS_IP>` placeholder when it is absent),
`LXC_PORT` (default 8080), `NAS_MOUNT_POINT` (default
`/mnt/promptvault-prompts`).

The harness **refuses to run** and refuses `NAS_PASSWORD`/`NAS_TOKEN`
altogether — a plaintext credential is reported as an input error rather than
accepted.

## 3. Bounded verification sequence

Run once the six values are available. Everything is a command with an expected
result; there is no "looks fine".

```bash
export LXC_ID=…  LXC_IP=…  GATEWAY=…  NAS_PROTOCOL=…  NAS_SHARE=…   # or NAS_EXPORT
export NAS_CREDENTIALS_REF=file:/root/.nas-credentials

# 1. inputs complete?
node scripts/lan-verify/verify-lan-deployment.mjs --check-inputs        # expect exit 0

# 2. automated checks from a LAN client (prints MANUAL steps too)
node scripts/lan-verify/verify-lan-deployment.mjs --evidence lan-evidence.md
```

Then the steps that need host access (the harness prints them with the real
values interpolated):

| Step | Command | Expected |
| --- | --- | --- |
| NAS mounted read-only | `findmnt -no SOURCE,OPTIONS /mnt/promptvault-prompts` | options contain `ro` |
| write to NAS rejected | `touch /mnt/promptvault-prompts/__pvl_write_probe` | fails (`READ_ONLY_REJECTED`) |
| restart survives | `docker compose restart && curl -fsS http://<LXC_IP>:8080/api/health` | health document after the restart |
| not exposed to WAN | `nmap -Pn -p 8080 <public-ip>` **from outside the LAN** | `closed`/`filtered` |
| second LAN device | `curl -fsS http://<LXC_IP>:8080/api/health` from a second device | same health document |

Mount recipe (read-only, credential by reference):

```bash
# smb
sudo mount -t cifs //<NAS_IP>/<share> /mnt/promptvault-prompts \
  -o credentials=/root/.nas-credentials,iocharset=utf8,ro
# nfs
sudo mount -t nfs <NAS_IP>:/<export> /mnt/promptvault-prompts -o ro
```

Deployment itself is unchanged from `docs/DEPLOYMENT.md`; the Compose file
already pins the scan boundary to the mounted vault
(`PROMPTVAULT_SERVER_SCAN_ROOTS=${PROMPTVAULT_SERVER_SCAN_ROOTS:-/vault}`).

## 4. Acceptance mapping (#138)

| #138 acceptance criterion | Covered by |
| --- | --- |
| App reachable at `http://<LXC_IP>:8080` from another LAN device | `health`, `second_lan_device` |
| NAS prompts accessible and scannable | `scan_allowed_root` |
| NAS mounted read-only (verified) | `nas_mount_readonly`, `nas_write_rejected`, `read_only_default` |
| All core features work from a remote LAN device | `scan_*`, `list_prompts`, `write_/export_refused_read_only` |
| Response times acceptable (<2 s scan, <500 ms list) | `scan_latency`, `list_latency` |
| No credentials visible in UI, logs, responses | `no_credential_material_in_responses` |
| Only on LAN, not from WAN | `wan_not_exposed` (from outside the LAN) |

Red tests from the issue: WAN access blocked (`wan_not_exposed`), NAS write
rejected (`nas_write_rejected`), invalid credentials must not leak details.

**Limit of `no_credential_material_in_responses`.** It proves that the reference
string (a path or a variable name) is never echoed. It cannot prove that a
*password* is never echoed, because the harness deliberately never receives one —
that is the same rule that keeps this handoff free of plaintext secrets. Checking
for an actual credential leak therefore remains a manual review of the LXC logs
and the browser session during the real run; the automated check is a regression
guard, not full coverage.

## 5. Rollback

```bash
cd <repo>/deploy && docker compose down
sudo umount /mnt/promptvault-prompts
```

## 6. Evidence

`--evidence <path>` writes a markdown document containing the non-secret inputs,
every automated result with its measured latency, the read-only mount recipe for
the given protocol, and the manual steps with their expected output. The
credential-leak check is reported as *partial* there as well, with the same
reason as in §4. Attach it to #138 together with the manual command
outputs. The harness never writes the credential reference's *content* — only its
scheme and path, which are not secret.

## 7. Why the issue stays open until then

The acceptance criteria are all statements about a real Proxmox LXC, a real NAS
mount and a real second LAN device. None of them can be satisfied from this
machine, and none of them will be asserted without that evidence.
