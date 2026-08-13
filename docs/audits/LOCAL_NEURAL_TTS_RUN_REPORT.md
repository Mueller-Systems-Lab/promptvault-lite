# Local Neural TTS Run Report

Status: `YELLOW_TTS_RUNTIME_PROOF_REQUIRED`

## What was done

The deferred local neural TTS work was semantically ported onto current
`master` (base `392272b`) on the integration branch `feature/local-neural-tts`.
The preservation commit `c53f53f` was used only as a reference; it was **not**
merged or cherry-picked.

## Implemented path

- Prompt summaries still go through `createPromptAudioSummary` and its
  blocking/sanitizing gates.
- `src-tauri/src/commands/tts.rs` exposes fixed Tauri commands:
  `detect_local_tts`, `synthesize_piper`, `speak_system_tts`, `stop_local_tts`.
- The frontend (`src/lib/localTts.ts`) passes text as an IPC value through
  typed Tauri commands; it does **not** construct shell commands and does **not**
  use the shell plugin for prompt data.
- Piper writes a short WAV into the application temp directory; the frontend
  plays it locally and the file is removed after synthesis.
- Web Speech remains the browser/native fallback when no native provider is
  available or a native provider fails.
- No model is downloaded automatically. The expected manual Piper model
  location is the application data directory under
  `tts/piper/de_DE-thorsten-high.onnx`.
- TTS is instrumented in Admin Observability with metadata-only spans
  (`tts.engine-detection`, `tts.synthesis`, `tts.playback`, `tts.cancel`) and
  reason codes `TTS_ENGINE_NOT_FOUND`, `TTS_PLATFORM_UNSUPPORTED`,
  `TTS_ENGINE_START_FAILED`, `TTS_SYNTHESIS_FAILED`, `TTS_INPUT_REJECTED`,
  `TTS_CANCELLED`. No raw prompt/summary text is stored.

## Provider order

1. Piper with the configured local German neural model
2. Speech Dispatcher (`spd-say`)
3. eSpeak NG
4. Web Speech API
5. Summary only

## Environment evidence (Windows 10 / PowerShell 5.1)

| Item | Result |
| --- | --- |
| Node / pnpm | Available (Node v24.19.0, pnpm 11.21.0) |
| Rust / Cargo | Available (rustc/cargo 1.97.1) |
| Piper | NOT_FOUND (not installed) |
| spd-say | NOT_FOUND (not installed) |
| espeak-ng | NOT_FOUND (not installed) |
| Piper model (`de_DE-thorsten-high.onnx`) | NOT_FOUND (not installed) |
| Windows SAPI voices | Present (`de-DE Microsoft Hedda`, `en-US Microsoft Zira`) — enables Web Speech fallback |
| Native binary build | PASS (`target/debug/promptvault-lite.exe`) |
| Real neural audio smoke test | NOT_RUN — no native engine/model installed |

## Gates (this run)

| Gate | Result |
| --- | --- |
| `pnpm test` | PASS (TTS suites green; 5 pre-existing `harness-contract` failures from Unix shell tools on Windows, unrelated to TTS) |
| `pnpm lint` | PASS |
| `pnpm exec tsc --noEmit` | PASS |
| `pnpm build` | PASS |
| `git diff --check` | PASS |
| `cargo fmt --check --all` | PASS |
| `cargo test --workspace` | PASS (148 passed, incl. 8 TTS tests) |
| `cargo clippy --workspace --all-targets -- -D warnings` | PASS |
| Native debug build | PASS |

## Security contract

- Maximum TTS payload: 600 characters (Rust `valid_text` + frontend truncation).
- The summary sanitizer (`sanitizeForAudio`) remains the hard boundary and is
  re-applied at the speech boundary in the frontend.
- Rust uses `std::process::Command` with fixed executable names and separate
  argument arrays / stdin. No `sh -c`, `bash -c`, `cmd /C`, `powershell -Command`,
  `eval`, free-form shell command, cloud request, telemetry, or automatic model
  download.
- Stop kills the active native child and removes temporary audio output.
- Unit tests cover empty/oversized text, shell metacharacters, quotes/pipes,
  Unicode, and newlines as inert data.

## Model and license

`NOT_VALIDATED`: no Piper model is installed locally, so model revision,
license, hash, size, and perceptual quality are not fabricated.

## Open runtime gaps

1. Install a pinned German Piper model (and its license/hash/size) — requires
   owner approval for any download (`STOP_TTS_MODEL_OWNER_APPROVAL_REQUIRED`).
2. Run a real WAV synthesis → playback → stop smoke test against the run card.
3. Prove `ENGINE_DETECTED` / `PROCESS_STARTED` / `PROCESS_EXIT` / `NO_CLOUD`
   for the neural path.

## Owner action required

- Approve and provide a Piper binary + German neural model
  (`de_DE-thorsten-high.onnx`), or
- Approve the agent to download them (name, source, license, size, checksum), or
- Accept Web-Speech-only (local, non-neural) as the delivered TTS path.

Until a real neural runtime proof exists, the integration is **not** merged to
`master`.
