# PVL v1.13.2 — Reliability, Trust-Boundary & Release-Automation Hardening: Verification Contract

- **Date:** 2026-10-09
- **Baseline:** `origin/main` = `5178aa72afc1b98625043dc4eb6f52d0a80eb3ad` (v1.13.1 published 2026-10-09)
- **Scope:** bounded post-v1.13.1 hardening; no v1.14 feature work
- **Purpose:** fix — before implementation — what has to be proven, and then record the real evidence

The contract below was written *before* the corresponding code, and each entry
names the evidence produced afterwards. Nothing in this document is a
prediction.

---

## 1. Release-artifact gate automation (Finding 1)

**Problem.** `scripts/verify-release-artifacts.mjs` existed and correctly
distinguished clean v1.13.1 artifacts from the leaking v1.13.0 set, but it was a
**manual step**. Publication had no machine-enforced gate.

**Where the gate is enforced.** `.github/workflows/release.yml`.

- `build-linux` — checks out `refs/tags/v<version>`, asserts the tag's commit is
  an ancestor of `origin/main`, checks version consistency, builds
  `deb,rpm,appimage`, stages canonical names, runs the verifier with
  `--expect-version --expect-commit --require-full-set`, then uploads the staged
  set as a workflow artifact.
- `publish` — downloads that set, restores the AppImage executable bit,
  **re-runs the verifier on the exact bytes to be published**, refuses to
  proceed if the release already exists, and only then calls
  `gh release create --verify-tag`.

**Who runs it.** Automation. Tag push → fully automatic; `workflow_dispatch`
with `publish: true` → same path.

**What blocks publication.** A failing verifier in *either* job; a tag outside
`origin/main`; a version-consistency failure; an already-existing release.

**How evidence is retained.** The workflow log carries the full verifier output
(G1–G8b per check). The staged set is kept as a workflow artifact for 14 days.

**Fail-closed cases required to be true** (each has a unit test or is enforced
by the workflow):

| Case | Enforced by | Evidence |
| --- | --- | --- |
| known-bad package fails | G5 on the real v1.13.1 AppImage | see §4 |
| known-good package passes | verifier on the locally built v1.13.2 set | see §4 |
| publication cannot bypass the gate | verifier re-run in `publish` | workflow structure |
| artifact missing / extra | staging fails; G8 `--require-full-set` | `release-pipeline-staging.test.js`, `release-artifact-scan.test.js` |
| checksum mismatch | G3, G8b | `release-artifact-scan.test.js` |
| manifest mismatch | G7 (`--expect-version`/`--expect-commit`) | `release-artifact-scan.test.js` |
| tag already exists / retry | `publish` refuses an existing release | workflow structure |
| wrong version in a bundle name | staging rejects it | `release-pipeline-staging.test.js` |

---

## 2. `/api/scan` trust boundary (Finding 2)

**Contract decision.** Arbitrary-path scanning is a *deliberate* desktop-parity
feature (v1.13.1 classified it as such and it is documented). It is therefore
**not** removed. It is narrowed to least privilege by default:

- the requested path must canonicalize to a path **beneath one of the configured
  scan roots**;
- the default root set is **the configured vault** (`PROMPTVAULT_SERVER_VAULT`);
- operators widen it with `PROMPTVAULT_SERVER_SCAN_ROOTS`, or restore the old
  behaviour with the explicit opt-in `PROMPTVAULT_SERVER_SCAN_ROOTS=*`;
- path traversal (malformed `..`) stays **400**; an unauthorized but well-formed
  root is **403**. They are separate problems and remain separate code paths and
  separate status codes.

**Contract tests** (`crates/promptvault-server/tests/server_api.rs`,
`crates/promptvault-server/src/config.rs`): allowed path, subdirectory, sibling
path (`/root` vs `/root-other` — component-wise containment), parent escape,
symlink escape, multiple roots, relative path, malformed path, default-deny,
explicit unrestricted mode, missing/non-absolute scan root. Plus security gate
**G8**, which executes the two config tests that pin the default.

**Live evidence.** A real server binary on 127.0.0.1:18091: health 1.13.2; scan
of the vault → 200; subdirectory → 200; outside the root → 403 with the German
message and a server-side log line naming the allowed roots; `..` → 400;
relative → 400; `/api/prompts` → 200; favorites and export in read-only mode →
403; clean SIGTERM shutdown. Docker smoke additionally scans `/vault` (the
configured root) successfully inside the container.

---

## 3. Performance gate (Finding 3)

**What `test_large_prompt` was actually asserting.** Not an SLA — a catastrophic
slowdown net. Measured baseline: ~0.25 s for a ~100 KB prompt, against an 8 s
bound. The single failure happened under a concurrent compile.

**Contract.**

1. Correctness keeps running in the normal (debug) CI, **without** a wall-clock
   assertion.
2. Performance is verified in a dedicated isolated release lane and must
   (a) detect a genuine super-linear regression and (b) not fail under ambient
   host load.

**Measured reality that shaped the design** (release, `best_of(3)`):

```text
   64 KiB -> 0.115 s    256 KiB -> 0.169 s
 1024 KiB -> 0.168 s   4096 KiB -> 0.172 s   16384 KiB -> 0.166 s
```

The cost is flat in input size, so a pure ratio bound is weak (a 15x incremental
regression can still show a total ratio of 2.6). The gate therefore reports only
a growth that is *both* proportionally large (ratio ≥ 1.5 at 4x input) *and*
absolutely large (growth ≥ 0.20 s), plus a 5 s catastrophe ceiling.

**Evidence.**

| Probe | Result |
| --- | --- |
| baseline, 3 consecutive runs | ratio 0.99 / 1.01 / 1.01 → PASS |
| 12 CPU hogs, measurements inflated 4x (651 ms / 619 ms) | ratio 0.95 → **PASS** (load-invariant) |
| injected super-linear term (`O(n²/4096)`) | ratio 2.76, growth 0.32 s → **FAIL** (detected) |
| correctness test under 12x load | PASS, no timing dependency |

---

## 4. AppImage `.DirIcon` (Finding 4)

**Root cause (not a string to hide).** `@tauri-apps/cli` ≤ 2.11.2 wrote the
AppDir `.DirIcon` (and `.desktop`) as an **absolute** symlink into the build
tree: `/mnt/nvme-data/pvbuild/release/bundle/appimage/PromptVault Lite.AppDir/PromptVault Lite.png`.
After extraction the link points at nothing. Upstream fixed exactly this in
PR tauri-apps/tauri#15596 (released in tauri-bundler 2.9.4 / CLI 2.11.4) by
writing **relative** symlinks.

**Fix by construction.** The dependency is raised to `@tauri-apps/cli ^2.11.4`
(lock resolves 2.12.1); no artifact is hand-patched.

**Contract / evidence.**

| Check | Result |
| --- | --- |
| verifier G5 on the **published v1.13.1** AppImage | **FAIL** — `/.DirIcon -> /mnt/nvme-data/pvbuild/.../PromptVault Lite.png` (the known defect, exactly one site) |
| verifier G5 on the **v1.13.2** AppImage built with 2.12.1 | see the release evidence |
| `.DirIcon` resolves after extraction | see the release evidence |
| no user/host/project staging path in the AppImage | G4 on both sets: clean |
| package launches | see the release evidence |

---

## 5. Small adjacent defects

| Defect | Fix |
| --- | --- |
| `docs/CHANGELOG.md` still said v1.13.1 = RELEASE CANDIDATE although it is published | status set to RELEASED with tag + commit |
| README release badge was a static string that had already drifted (`v1.13.0 published · v1.13.1 RC` while v1.13.1 was released) | badge now reads the live latest release |
| `docs/PROJECT_STATUS.md` "Next Steps" had two items numbered `4.` | renumbered |
| `scripts/*` allowlist | `scripts/release/` added so the new tooling is committable |
| `stage-linux-release.mjs` `--name value` parsing | last occurrence wins, so an override actually overrides |

---

## 6. Gates run (all local, evidence in the PR)

frontend vitest · eslint · tsc · vite build · project contract · security gate
(G1–G8) · `cargo fmt --check` · `cargo clippy -D warnings` ·
`cargo test --workspace --locked` · CLI pytest · version consistency · Docker
build + docker-smoke · live Web/LAN API regression · release-artifact verifier
(known-bad and known-good) · performance lane.
