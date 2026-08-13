# Local Neural TTS Run Report

Status: `GREEN_LOCAL_NEURAL_TTS_INTEGRATED_AND_MERGED`

## What was done

The deferred local neural TTS work was semantically ported onto `master`
(base `392272b`) on the integration branch `feature/local-neural-tts` and then
validated end-to-end against a **real** local Piper runtime and a **real**
German neural voice model on Windows 10 (10.0.19045).

## Runtime chain

The real native chain was proven with zero mocks:

```
real UI action (PromptAudioSummary "Kurz vorlesen")
  → real WebView2 → real frontend TTS action
  → real Tauri IPC → real Rust tts command (synthesize_piper)
  → real Piper process → real German ONNX model (de_DE-thorsten-high)
  → real WAV synthesis → real local playback
```

## Piper (engine)

| Item | Value |
| --- | --- |
| Source | [OHF-Voice/piper1-gpl](https://github.com/OHF-Voice/piper1-gpl) (official) |
| Version | v1.6.0 (`piper-tts==1.6.0`) |
| License | GPL-3.0 (SPDX `GPL-3.0`) |
| Install path | Python console script `piper.exe` (official `pip install piper-tts`) on `PATH` |
| Distribution | Local test / external runtime only — **not** embedded, committed or bundled |

The current official `piper1-gpl` release ships the `piper-tts` Python package
(Windows wheel `piper_tts-1.6.0-cp39-abi3-win_amd64.whl`). Its CLI exposes
`--model` / `--output-file` and reads text from stdin. It has no `--version`
flag, so the Rust detection probe for Piper was switched from `--version` to
`--help` (exit 0). `spd-say`/`espeak-ng` keep the `--version` probe.

## Model

| Item | Value |
| --- | --- |
| Voice | `de_DE-thorsten-high` |
| Language | de_DE |
| Source | official Piper voices repository (`rhasspy/piper-voices` on Hugging Face) |
| Dataset | [Thorsten Voice](https://github.com/thorstenMueller/Thorsten-Voice) |
| Dataset license | CC0 |
| Model card | present |
| Config | `de_DE-thorsten-high.onnx.json` (present) |
| ONNX size | 113895201 bytes (~114 MB) |
| ONNX SHA-256 | `9df1c43c61149ef9b39e618e2b861fbe41e1fcea9390b2dac62e8761573ea4f1` (VERIFIED, matches owner-approval value) |
| Runtime location | `%APPDATA%\dev.promptvault.lite\tts\piper\` (outside the repository) |

## Runtime proof (native E2E — WebdriverIO, real WebView2, Windows)

`e2e-tests/specs/local-tts-piper.native.spec.js` + `e2e-tests/wdio.conf.windows.tts.mjs`:

| Gate | Result |
| --- | --- |
| REAL_NATIVE_APP | PASS |
| PIPER_RUNTIME_DETECTED + GERMAN_MODEL_DETECTED | PASS |
| REAL_TTS_UI_ACTION → REAL_AUDIO_SYNTHESIS | PASS |
| REAL_TTS_CANCELLATION + PROCESS_CLEANUP (second synthesis works) | PASS |
| RUNTIME_SHELL_INJECTION_PROOF | PASS |
| REAL_TTS_OBSERVABILITY (provider=piper, tts.synthesis span) | PASS |
| RAW_TTS_TEXT_IN_DIAGNOSTICS:NO + TTS_PRIVACY_SENTINEL | PASS |
| TTS_OFF_ON_EQUIVALENCE | PASS |

All 8 native E2E tests pass against the real runtime.

## Direct Piper synthesis (sanity)

German text via stdin, `piper --model <model> --output_file <wav>`:

- Exit code: `0`
- Output: valid WAV, 22050 Hz, mono, 16-bit, ~2.98 s (non-empty)
- Special characters (`& | ; quotes newline`) processed as inert data, no shell side effects

## Code changes in this run

1. `src-tauri/src/commands/tts.rs` — Piper detection probe `--version` → `--help`
   (current `piper1-gpl` v1.6.0 CLI has no `--version`).
2. `src/lib/localTts.ts` — Piper playback cancellation now settles the pending
   play promise (previously a cancel could strand the awaiting `speakLocalText`).
3. `src/components/details/PromptAudioSummary.tsx` — sequence guard so a stale
   speak operation's `finally` cannot clobber a newer speak's `isPlaying` state.
4. `e2e-tests/specs/local-tts-piper.native.spec.js` + `wdio.conf.windows.tts.mjs` —
   new native TTS runtime proof.

## Regression gates

| Gate | Result |
| --- | --- |
| `pnpm test` | PASS (1643 passed; 5 pre-existing `harness-contract` failures from Unix shell tools on Windows — UNCHANGED, unrelated to TTS) |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `git diff --check` | PASS |
| `cargo fmt --check --all` | PASS |
| `cargo test --workspace` | PASS (175 passed) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS |
| Native debug build (`tauri build --debug`) | PASS |
| Native E2E (existing admin-observability spec) | PASS (10/10, no regression) |

## Security contract

- Maximum TTS payload: 600 characters (Rust `valid_text` + frontend truncation).
- Summary sanitizer (`sanitizeForAudio`) is the hard boundary, re-applied at the
  speech boundary.
- Rust uses `std::process::Command` with fixed executable names and separate
  argument arrays / stdin. No `sh -c`, `bash -c`, `cmd /C`, `powershell -Command`,
  `eval`, cloud request, telemetry, or automatic model download.
- Stop kills the active native child; cancellation is followed by a successful
  second synthesis (no zombie process, no locked state).
- Piper binary, ONNX model and WAV outputs are **not** committed; model/runtime
  live outside the repository.

## License boundaries (kept separate)

- Engine license (Piper): GPL-3.0
- Voice model config/artifact: from the official Piper voices repository
- Dataset license (Thorsten Voice): CC0

No license claims are extrapolated; Piper is used as an external local runtime
and is **not** bundled with PromptVault.

## Open runtime gaps

`OPEN_RUNTIME_GAPS`: **CLOSED** — real Piper runtime + German neural model
verified end-to-end on Windows.

## Git

| Item | Value |
| --- | --- |
| Committed Piper binary | NO |
| Committed ONNX model | NO |
| Feature branch | `feature/local-neural-tts` |
| Merge target | `master` (base `392272b`) |
| Publication | NO (no release/tag/PyPI) |
