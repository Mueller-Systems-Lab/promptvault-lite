# PromptVault Lite

**Local-first desktop app for managing, analyzing and improving prompt collections.**

PromptVault Lite turns messy prompt folders into a structured, searchable and quality-checked local prompt archive — without cloud upload, accounts, telemetry or remote AI calls. Everything runs on your machine.

![Release](https://img.shields.io/badge/release-v1.8.0-blue)
![Platform](https://img.shields.io/badge/platform-Windows%20%7C%20Linux-lightgrey)
![Privacy](https://img.shields.io/badge/privacy-local--first-green)
![Stack](https://img.shields.io/badge/stack-Tauri%20%7C%20React%20%7C%20Rust-4444ff)
![License](https://img.shields.io/badge/license-MIT-blue)

---

## What it does

PromptVault Lite scans local `.md`, `.markdown` and `.txt` prompt files, shows them in a desktop explorer, evaluates their quality and hygiene, detects blueprint-style prompts, and helps you optimize prompt structure in a deterministic, offline workflow.

It is built for people who collect, write and refine many prompts — especially agent prompts, project prompts, workflow prompts and reusable prompt blueprints.

---

## Highlights

- **Local Prompt Archive** — recursively scan local folders (`.md`, `.markdown`, `.txt`, 1 MiB limit)
- **Quality & Hygiene Analysis** — score prompts across clarity, role, goal, context, output format and reusability; detect contamination such as secrets, private paths and evidence clutter
- **Prompt Context Evaluation** — measure how well a prompt carries its own context
- **Blueprint Detection** — detect prompt blueprints, hybrids and architecture-like agent instructions (10-dimension quality evaluation)
- **Missing Info Gate** — dynamic pre-optimization questionnaire (opt-in, `PROMPTVAULT_MISSING_INFO_GATE=1`)
- **Direction Profiles** — generate optimization variants in different directions (opt-in, `PROMPTVAULT_DIRECTION_PROFILES=1`)
- **Prompt Optimization** — deterministic local optimization (conservative/balanced/aggressive)
- **Admin Observability** — read-only runtime diagnostics with trace/span correlation and reason codes
- **Local TTS** — local speech output for prompt summaries (Piper neural / spd-say / espeak-ng / Web Speech fallback), no cloud TTS
- **Native Tauri Desktop App** — React + TypeScript frontend, Rust backend
- **Local Privacy Architecture** — no cloud, no telemetry, no prompt upload
- **PromptVault CLI** — `promptvault` command-line installer and manager (`doctor`, `install`, `launch`, `update`, `diagnostics`, `uninstall`)

---

## Current Release & Publication Status

**v1.8.0** is the current stable release (published 2026-08-03).

Linux packages are available as GitHub Release assets for v1.8.0:

| Platform | Asset |
|---|---|
| Linux (Debian/Ubuntu) | `PromptVault.Lite_1.8.0_amd64.deb` |
| Linux (Fedora/RHEL) | `PromptVault.Lite-1.8.0-1.x86_64.rpm` |
| Checksums | `SHA256SUMS.txt` |

Windows is supported as a build target; no pre-built v1.8.0 Windows installer is published in this release. macOS is not pre-built.

The `master` branch additionally contains work that has **not yet been released**:

- **Admin Observability** — runtime diagnostics with trace/span correlation (integrated)
- **PromptVault CLI** — `promptvault` management CLI, implemented and verified
- **Native observability proof on Windows** — WebdriverIO native E2E
- **Local TTS adapter** — native Rust TTS commands (Piper/spd-say/espeak-ng) ported; real neural runtime proof pending engine install

> **`promptvault-cli` is technically READY_FOR_PUBLICATION, but is not yet available on a package index.** It is not on PyPI, and no `v1.9.0` release or tag exists. Package version (`1.9.0`) is not a release status.

---

## Install

### Native App

**Linux (v1.8.0):** download and install the `.deb` or `.rpm` from the latest GitHub Release.

```text
# Debian/Ubuntu
sudo dpkg -i PromptVault.Lite_1.8.0_amd64.deb

# Fedora/RHEL
sudo rpm -i PromptVault.Lite-1.8.0-1.x86_64.rpm
```

**Windows:** build from source (see below). No pre-built v1.8.0 Windows installer is published.

### Developer / source build

```bash
git clone https://github.com/xxammaxx/promptvault-lite.git
cd promptvault-lite
pnpm install
pnpm start          # development mode
pnpm tauri build    # production build
```

### CLI / uv tool

`promptvault-cli` is a Python CLI that installs and manages the **native** PromptVault Desktop App. It is implemented and verified, but **not yet published** to a package index. Until publication, install it from a locally built wheel:

```bash
# Build the wheel from source
cd tools/promptvault-cli
uv build

# Install the CLI as a uv tool from the local wheel
uv tool install ./dist/promptvault_cli-1.9.0-py3-none-any.whl

# Then manage the native app
promptvault doctor
promptvault install
promptvault launch
```

The command `uv tool install promptvault-cli` is **not available yet** — it will become valid only after a real package-index publication.

See [`docs/CLI.md`](docs/CLI.md) for the full CLI reference.

---

## Quick Start

1. Start PromptVault Lite
2. Choose a prompt folder (**Ordner öffnen**)
3. Analyze a prompt (**Analysieren**)
4. Review quality, hygiene and context results
5. Optional: optimize the prompt
6. Optional: enable **Admin Observability** (Settings → Entwickler-Werkzeuge) to inspect the processing pipeline

CLI quick start (once the CLI is installed):

```text
promptvault doctor
promptvault install
promptvault launch
```

---

## Admin Observability

Admin Observability is a **read-only** runtime diagnostics mode. It records the real processing of a prompt as a correlated trace of spans (pipeline stages), each with a status, reason code and duration — without exposing prompt content.

It is **separate from Developer Mode**: Developer Mode is a capability/action gate; Admin Observability is a diagnostics gate and never unlocks write actions.

Example pipeline:

```text
Analyze Prompt
  ✓ Prompt resolved
  ✓ Quality
  ✓ Hygiene
  ✓ Context
  ✓ Tauri IPC
  ✓ Rust Analysis
  ⊘ Missing Info Gate
      FEATURE_DISABLED
```

Enable it via **Settings → Entwickler-Werkzeuge → Admin Observability**, then open the **Diagnostics Panel** (🔍). You can export a redacted JSON bundle or copy a sanitized debug summary.

See [`docs/OBSERVABILITY.md`](docs/OBSERVABILITY.md) for the full documentation.

---

## Local TTS

PromptVault Lite can read a short summary of the selected prompt aloud — fully
locally, without cloud TTS.

- **Local-only** — no cloud TTS, no external speech API, no network.
- **Providers** (in order): Piper (neural, with a manually installed German
  model), Speech Dispatcher (`spd-say`), eSpeak NG, then the browser Web Speech
  API as fallback.
- **What is spoken** — only a short, sanitized summary (max ~500 chars), never
  the full prompt content; secrets, keys, paths and code blocks are masked.
- **Stop/Cancel** — a "Stoppen" button cancels playback and any active native
  engine process.
- **Known limitation** — the neural path requires a locally installed Piper
  engine and model (no automatic download). On hosts without a native engine,
  the Web Speech fallback is used. See
  [`docs/audits/LOCAL_NEURAL_TTS_RUN_REPORT.md`](docs/audits/LOCAL_NEURAL_TTS_RUN_REPORT.md).

---

## Privacy & Security

PromptVault Lite is local-first:

- no cloud storage, no remote LLM calls, no API-based optimizer
- no telemetry — including from Admin Observability (local, in-process, no network)
- default diagnostic export contains no full prompt text, secrets, tokens or private absolute paths (redaction before export)
- content/result correlation via non-secret fingerprints
- installer integrity: SHA-256 verification, fail-closed
- prompt files stay on your machine

No exaggerated security guarantees are made; see `docs/ARCHITECTURE.md` for the documented security boundaries.

---

## Testing & Quality

Frontend (Vitest), Rust (`cargo test`, `cargo clippy`, `cargo fmt`) and native E2E (Playwright, WebdriverIO on Windows) suites are verified locally. Remote-CI (GitHub Actions) is currently infrastructure-blocked (Issue #154); local CI gates are authoritative. See `docs/TESTING.md`.

> Exact test counts change frequently and are intentionally not hard-coded here. Run the local gates to reproduce current numbers.

---

## Built With

- Tauri 2
- React 18
- TypeScript
- Rust
- Zustand
- SQLite
- Vite
- Vitest
- Playwright / WebdriverIO (E2E)
- MkDocs (documentation)

---

## Documentation

- [Admin Observability](docs/OBSERVABILITY.md)
- [CLI / uv tool](docs/CLI.md)
- [Installation](docs/INSTALL.md)
- [User Guide](docs/USER_GUIDE.md)
- [Architecture](docs/ARCHITECTURE.md)
- [Testing](docs/TESTING.md)
- [Project Status](docs/PROJECT_STATUS.md)
- [Roadmap](docs/ROADMAP.md)
- [Changelog](docs/CHANGELOG.md)

---

## Project Status

Stable public release (v1.8.0). Admin Observability and the PromptVault CLI are integrated on `master` but not yet released. See `docs/PROJECT_STATUS.md` and `docs/ROADMAP.md`.

## License

MIT
