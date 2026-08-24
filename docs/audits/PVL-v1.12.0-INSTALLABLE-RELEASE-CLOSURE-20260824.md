# PromptVault Lite v1.12.0 — Installable Release Closure

Date: 2026-08-24  
Release candidate source: `ab242f74853469cf3360d870678883fe39412f74`  
Tag: `v1.12.0` (annotated tag dereferences to the same commit)

## Decision

`AMBER_PROMPTVAULT_RELEASE_BUILD_COMPLETE_PUBLICATION_BLOCKED`

The Linux production release was built, installed from the generated Debian
package, launched, and exercised through the installed Tauri/WebDriver path.
Publication could not be completed from this host because `gh` is unavailable,
no authenticated GitHub token is present, and the enabled GitHub connector has
no release-create or release-asset-upload operation. The public GitHub API
confirmed that tag `v1.12.0` exists but its release lookup currently returns
HTTP 404.

No Windows execution was attempted or represented by a v1.12.0 asset.

## Version and source identity

| Field | Value |
| --- | --- |
| Previous immutable release | v1.11.1 |
| New release candidate | 1.12.0 |
| Version reason | v1.11.1 is immutable; final master materially postdates it with the bounded Analyzer/product integration |
| Master | `ab242f74853469cf3360d870678883fe39412f74` |
| origin/master | `ab242f74853469cf3360d870678883fe39412f74` |
| Tag commit | `ab242f74853469cf3360d870678883fe39412f74` |
| Analyzer changed for this release | NO |

Desktop version sources are `1.12.0` (package.json, Tauri config and Rust
crate). The existing Windows/NSIS-only CLI stream remains internally
consistent at `1.11.1`; no mismatched CLI/PyPI release was published.

## Native assets

Built with:

```text
RUSTFLAGS='--remap-path-prefix=/home/xxammaxx/.cargo=/rust/cargo --remap-path-prefix=/media/xxammaxx/software/promptvault-lite=/promptvault' pnpm tauri build --bundles deb,rpm,appimage
```

| Asset | Size | SHA-256 | Platform | Type |
| --- | ---: | --- | --- | --- |
| `PromptVault Lite_1.12.0_amd64.deb` | 3,830,330 | `02a295bc6765e827fe0a8f4b8ad9ae500c8c3c21e5a7affa4a6ccb67131d636b` | Linux x86_64 | deb |
| `PromptVault Lite-1.12.0-1.x86_64.rpm` | 3,831,764 | `9f132cc5aea0379f8a5af65f1452d5705ff884b55ae3e68abb0ef70791a98281` | Linux x86_64 | rpm |
| `PromptVault Lite_1.12.0_amd64.AppImage` | 79,501,816 | `ef5d1a272d80c1054adcb1f1067ba59136f2c0598aeb991b830c2f1f7991f9c9` | Linux x86_64 | AppImage |

Generated release metadata contains `release_version`, `source_commit`,
`generated_at` and an `assets[]` entry for every package. The generated
`SHA256SUMS.txt` and `promptvault-release-manifest.json` are retained in the
release staging directory for publication.

## Verification evidence

| Gate | Result |
| --- | --- |
| Frontend tests | PASS — 1,734/1,734 |
| Lint | PASS |
| TypeScript | PASS |
| Frontend build | PASS |
| Rust tests | PASS — 248 passed, 1 ignored; all integration suites passed |
| Rust fmt | PASS |
| Rust clippy | PASS |
| Chromium E2E | PASS — 3/3 |
| Native production build | PASS — deb, rpm, AppImage |
| Clean Debian extraction/install | PASS |
| Installed launch | PASS — process remained alive under Xvfb |
| Installed Golden Journey | PASS — restore, discovery, analysis, score, hygiene and recommendations |
| Production IPv4/IPv6 network connections | 0 observed during launch/use |
| Runtime private-path/secret scan | PASS; compiler paths remapped |
| Version consistency | PASS — separate desktop and CLI release streams |
| External semantic study | Not part of release gate; remains incomplete 86/176 |
| GitHub release publication | BLOCKED — missing authenticated release upload path |

The first parallel Rust run showed a timing failure in the existing large-prompt
performance assertion under host contention; the serial authoritative rerun
passed without changing Analyzer code or test thresholds.

## Required next action

Use an authenticated GitHub release-capable client to create the public
non-draft, non-prerelease release `v1.12.0`, upload the three native assets plus
`SHA256SUMS.txt` and `promptvault-release-manifest.json`, then download the
published Debian asset and repeat hash/install verification. Do not create a
new version or rerun semantic research.
