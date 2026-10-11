# PVL #296 — Two-Clean-Build Reproducibility Report (frozen evidence)

- Date: 2026-10-11
- Source commit: `6ede3103904c3a0d9badac1493b559454997f589` (PR #348)
- Host: Linux Mint 22.2, kernel 6.11.0-17-generic; pnpm 9.15.9, Node v24.11.1, rustc 1.92.0
- Method: two fresh clones (`/mnt/nvme-data/pvl-repro-a`, `-b`), per-build empty `target/`, frozen lockfiles, serial builds, identical RUSTFLAGS remapping to the release pipeline. Full narrative: `docs/supply-chain/README.md`.

# Reproducibility experiment — two-clean-local-builds @ 6ede3103904c3a0d9badac1493b559454997f589

Verdict: **DIVERGENT**

| Artifact | size A | size B | byte-identical |
| --- | ---: | ---: | --- |
| PromptVault Lite-1.13.3-1.x86_64.rpm | 3937118 | 3937118 | NO |
| PromptVault Lite_1.13.3_amd64.AppImage | 84142584 | 84142584 | NO |
| PromptVault Lite_1.13.3_amd64.deb | 3935840 | 3935836 | NO |

### PromptVault Lite-1.13.3-1.x86_64.rpm

- rpm: layer diagnosis requires rpm tooling not guaranteed on runners; compare sizes/hashes and `7z l -slt` metadata if p7zip is installed

### PromptVault Lite_1.13.3_amd64.AppImage

- squashfs payload: 814 files, 0 with differing bytes, 372 byte-equal with differing mtimes, 442 fully equal
- ELF build-id of usr/bin/promptvault-lite: ? vs ? (build-id not extracted — the payload byte comparison above is the authoritative signal)

### PromptVault Lite_1.13.3_amd64.deb

- payload: 7 files, 0 with differing bytes, 7 with byte-equal content but differing mtimes → timestamp-only nondeterminism inside the data layer
- deb control/data archive headers (mtime ordering) are the usual remaining source; compare `dpkg-deb -c` output for per-entry dates


sha256 (A → B):

- `PromptVault Lite-1.13.3-1.x86_64.rpm`: `d6a186de05d69e63ab4976e5b525fcbb05ad008c81e53cb30f8f07192311f003` → `3908f40876a2c09e08752ad03e803fe0477a35296f98bd69604489c2a1b1bb2b`
- `PromptVault Lite_1.13.3_amd64.AppImage`: `f53fcf6f0e9fb4ba5091a6118f7b362a958e506e5f0bb07083be841b0761e90c` → `965ad5868d70efe9ba583058c604d83fad620455e82e06af562fcc2a94d2651e`
- `PromptVault Lite_1.13.3_amd64.deb`: `467276814ee113d9f332a3e23d79caa5abfe8d0627d32fec2db4ae32b6bffab9` → `25362d766fb5e6166ea9ecfd1f14f14cc9f95a8ae7db9c8959ee1d84a39394b7`

## Direct post-run measurement (added after independent review nit D3)

The `usr/bin/promptvault-lite` binary was extracted from **both** AppImages
after the run and hashed directly (outside repro-compare.mjs):

```
8b792c4648cb401d440836f3e22d3e506f53e8196725eee20d0b5f3842e1cbff  build A
8b792c4648cb401d440836f3e22d3e506f53e8196725eee20d0b5f3842e1cbff  build B
```

Identical — the compiled main binary is bit-for-bit reproducible across the
two clean builds; the package divergence is packaging-layer mtimes only
(review finding D4 also correctly notes that the frozen report above was
produced with the post-fix repro-compare.mjs from commit 895f895: the
`positionals.map(resolve)` bug made the script unrunnable at the originally
reviewed head 6ede310).
