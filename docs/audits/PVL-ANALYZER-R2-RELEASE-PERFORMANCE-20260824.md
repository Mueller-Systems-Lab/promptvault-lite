# PVL R2.3 Phase 6 — RELEASE Performance Verification Evidence
Date: 2026-08-24T06:24:40Z
Branch: quality/analyzer-r2-verification-closure
HEAD: 0af4afd3e38abe6aef8c15f13b055cc18a1b68c0
Linux: 4 cpu, MemTotal 12123704 kB, rustc 1.97.1

## 1. Release profile preserved (Cargo.toml:5-10)
```
[profile.release]
panic = "abort"
codegen-units = 1
lto = true
opt-level = "s"
strip = true
```
No changes made. Verified via sha256: 1ec20a00e1f5bf60ebd93d1eefb3852386f9ab37571d1a3ffcf81ceb0712454f (Cargo.toml workspace)
src-tauri/Cargo.toml: no profile override (uses workspace) — sha256 6a0859c5cb4d4d4d4fdc78070019593a4e242042d86d09c401d456969aa56bf2
perf_check.rs sha256 ebda8516d20ef5368bb10b5b63ce1042117ddfd75017481c40ec278725a876ba

## 2. Build release (timeout 700s, CARGO_BUILD_JOBS=1)
Command: `CARGO_BUILD_JOBS=1 cargo build --release` (workspace root, manifest Cargo.toml)
Timeout used: 700000ms (700s) — satisfies requirement >=600s
Previous attempt timed out at 250s — this run succeeded.

Output (build.log):
```
   Compiling promptvault-lite v1.11.1 (/media/xxammaxx/software/promptvault-lite/src-tauri)
    Finished `release` profile [optimized] target(s) in 2m 20s
```
Full /usr/bin/time -v:
- User 131.08s, System 3.69s, Elapsed 2:20.16, Max RSS 1367392 kB, Exit 0
Build duration: 2m20s (140s) wall clock

Second build via `CARGO_BUILD_JOBS=1 cargo test --release --test perf_check -- --ignored --nocapture` compiled test harness:
```
    Finished `release` profile [optimized] target(s) in 7m 02s
     Running tests/perf_check.rs (target/release/deps/perf_check-c2caea0a68445b8c)
```
Wall elapsed for full test command: 7:05.36 (User 378.28s, Max RSS 2158872 kB)

## 3. Perf harness (repo-native)
Harness path: src-tauri/tests/perf_check.rs (authoritative)
Command: `CARGO_BUILD_JOBS=1 cargo test --release --test perf_check -- --ignored --nocapture`
BUILD_MODE=RELEASE verified by `Finished release profile` line
Samples required: >=1 warmup, 5 short, 5 medium, >=3 large, >=3 100K — harness provides exactly 1 warmup (short pre-loop), 5 short, 5 medium, 3 large, 3 100K — PASS sample count

### Raw perf output table (verbatim from log)
```
short p50 (after warmup): 21ms (runs: [21, 21, 21, 25, 28])
medium p50: 29ms (runs: [26, 27, 29, 37, 48])
large p50: 232ms (runs: [231, 232, 258])
100K p50: 512ms (runs: [471, 512, 547])
test perf_check ... ok
test result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out; finished in 2.75s
```

### Per-size stats (nearest-rank P95 = ceil(0.95*n))
| size | samples | MIN ms | MAX ms | P50 ms | P95 ms | mean ms | requirement |
|------|---------|--------|--------|--------|--------|---------|-------------|
| short | 5 | 21 | 28 | 21 | 28 | 23.2 | 1 warmup +5 -> PASS |
| medium | 5 | 26 | 48 | 29 | 48 | 33.4 | 5 -> PASS |
| large | 3 | 231 | 258 | 232 | 258 | 240.3 | >=3 -> PASS (3) |
| 100K | 3 | 471 | 547 | 512 | 547 | 510.0 | >=3 -> PASS (3) |

### 100K verdict inputs
- 100K P50 = 512 ms = 0.512 s
- 100K P95 = 547 ms = 0.547 s
- MIN = 471 ms, MAX = 547 ms
- Samples = 3 (sorted [471,512,547])

Hard target: 100K P95 <=8.0s (8000 ms) — RESULT 547 ms <= 8000 ms PASS
Preferred: P50 <=6.0s (6000 ms) — RESULT 512 ms <= 6000 ms PASS

## 4. Verdict
RELEASE_PERFORMANCE PASS
Formal readiness requires RELEASE_PERFORMANCE PASS — satisfied.
Not blocked: compilation succeeded; no RELEASE_BUILD_RESOURCE_BLOCKED.

Debug evidence may remain supplemental — release evidence now present.

## 5. Evidence path
- /tmp/pvl-evidence/build.log (155B cargo output)
- /tmp/pvl-evidence/perf_check.log (3053B full harness output with warnings)
- /tmp/pvl-evidence/fingerprints.txt (branch, HEAD, hashes, toolchain)
- /tmp/pvl-evidence/perf_stats.md (computed table)
- /tmp/pvl-evidence/EVIDENCE_REPORT.md (this file aggregated)
- Repo copy: docs/audits/PVL-ANALYZER-R2-RELEASE-PERFORMANCE-20260824.md (next step copies this file)
- Raw command logs include timestamps 2026-08-24T06:14:22Z to 06:23:55Z

## 6. Repro command
```
CARGO_BUILD_JOBS=1 cargo test --release --test perf_check -- --ignored --nocapture
```
Alternative direct build:
```
CARGO_BUILD_JOBS=1 cargo build --release
```
Both respect preserved release profile; do not alter profile to accelerate build.

