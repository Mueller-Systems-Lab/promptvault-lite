# Local-Only TTS Audit

## Scope

Issue [#200](https://github.com/xxammaxx/promptvault-lite/issues/200) — Audio-Kurzbeschreibung

## Superseding implementation note

The follow-up native adapter is implemented in `src-tauri/src/commands/tts.rs`.
Native playback uses fixed executable names and separate argument arrays / stdin
through Tauri IPC; the frontend does **not** invoke the shell plugin with prompt
data. Piper is selected only when both the executable and the manually installed
local model are present. See `LOCAL_NEURAL_TTS_RUN_REPORT.md` for current runtime
evidence and gaps.

## Audit Date

2026-07-05 (native adapter note added 2026-08-13)

---

## Dependencies

### Web Speech API

- **Source:** Browser built-in (Chromium/WebKit)
- **License:** Browser-dependent (Chromium: BSD-style)
- **Network:** None (fully offline)
- **Data collection:** None (local-only)
- **External services:** None

### No External Dependencies

The implementation uses **zero external npm packages** for TTS. No additional dependencies were added to `package.json`.

---

## Network Activity

| Check                    | Result |
| ------------------------ | ------ |
| HTTP requests during TTS | None   |
| WebSocket connections    | None   |
| Cloud API calls          | None   |
| Model downloads          | None   |

---

## Privacy

| Check                         | Result                           |
| ----------------------------- | -------------------------------- |
| Speech data leaves device     | No                               |
| Telemetry                     | No                               |
| Prompt content exposed to TTS | Partial (sanitized summary only) |
| Full prompt content in audio  | Never                            |
| Sensitive data in audio       | Blocked/masked by sanitizer      |

---

## Security

### Sanitizing Layer

The `sanitizeForAudio` function applies 12 regex patterns before any text reaches the audio system:

1. Private keys (PGP/SSH)
2. Code fenced blocks
3. API keys (sk- prefix)
4. URLs with token parameters
5. Email addresses
6. Absolute local paths (Unix + Windows)
7. JSON dumps with sensitive fields
8. Long hex hashes (40+ chars)
9. Stacktrace lines
10. Log/error lines
11. Very long lines (200+ chars)
12. Generic long tokens (32+ chars)

### Blocking Gate

Content is completely blocked from audio when:

- Hygiene status is `critical`
- Contamination status is `BLOCKING_SENSITIVE_CONTENT`

### Shell Injection

No shell commands are executed for TTS. The Web Speech API runs entirely in the
browser sandbox. Native provider detection and synthesis run through the Rust
adapter using `std::process::Command` with fixed executable names and separate
arguments / stdin — no shell, no `which`, no user input interpolated into a
command string.

---

## Provider Detection

| Provider       | Detection Method                         | Risk                               |
| -------------- | ---------------------------------------- | ---------------------------------- |
| Web Speech API | `window.speechSynthesis.getVoices()`     | None (browser built-in)            |
| piper          | Rust `detect_local_tts` (executable `--help` + local model presence) | Low (existence check only) |
| spd-say        | Rust `detect_local_tts` (executable `--version`)            | Low (existence check only) |
| espeak-ng      | Rust `detect_local_tts` (executable `--version`)            | Low (existence check only) |

---

## Conclusion

The implementation is **local-only** and introduces **no external network dependencies, no cloud TTS APIs, no telemetry, and no automatic model downloads**. Sensitive content is **sanitized or blocked** before reaching the audio system. The Web Speech API provides a secure, browser-sandboxed TTS layer without any new vulnerabilities.
