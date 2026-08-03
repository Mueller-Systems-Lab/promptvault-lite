# PromptVault Lite

**Local-first desktop app for managing, analyzing and improving prompt collections.**

PromptVault Lite helps you turn messy prompt folders into a structured, searchable and quality-checked local prompt archive — without cloud upload, accounts, telemetry or remote AI calls.

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

## Key Features

- **Local Prompt Archive**
  Recursively scan local folders with `.md`, `.markdown` and `.txt` prompt files (1 MiB limit).

- **Prompt Explorer**
  Browse prompt folders in a clean desktop file tree with search, filters and favorites.

- **Quality Analysis**
  Score prompts across clarity, role definition, goal structure, context quality, output format and reusability.

- **Hygiene Detection**
  Find prompt contamination such as secrets, private paths, logs, OCR residue, foreign project context and evidence clutter.

- **Blueprint Intelligence**
  Detect prompt blueprints, hybrid prompt/spec files and architecture-like agent instructions. Evaluate and optimize blueprint quality across 10 dimensions.

- **Paste Prompt Analyzer**
  Analyze pasted or typed prompt text directly — no file needed, no persistence, fully local.

- **Audio Summary**
  Get an AI-readable text summary of any prompt with optional text-to-speech playback via local Web Speech API.

- **Settings**
  Configure theme (light/dark/auto), export format preferences, developer mode, and keyboard shortcuts via the settings modal.

- **Local Prompt Optimizer**
  Improve prompts in conservative, balanced or aggressive mode — fully local and deterministic.

- **Export Tools**
  Export prompt data and analysis results as JSON, Markdown or ZIP.

- **Direction Profiles & Variants** (opt-in)
  Generate multiple optimization variants in different directions (concise, elaborate, creative, structured, technical). Compare variants side-by-side and save the best result as a new version. Retains original constraints during generation. Enabled via `PROMPTVAULT_DIRECTION_PROFILES=1`.

- **Missing-Info-Gate** (opt-in)
  Dynamic pre-optimization questionnaire that identifies missing information before generating variants. Structured tiered questions (REQUIRED/RECOMMENDED/OPTIONAL) with sanitized answer merging. Enabled via `PROMPTVAULT_MISSING_INFO_GATE=1`.

- **Embeddings (Phase 1 — Mock)**
  Embedding feature flag and mock provider for future semantic search. Disabled by default. No real ML model.

- **Privacy-first Desktop App**
  No cloud backend. No API calls. No telemetry. No account. No prompt upload.

---

## Current Release

**v1.8.0** is the current stable release.

Linux packages (`.deb` and `.rpm`) are available as GitHub Release assets for v1.8.0:

| Platform | Asset |
|---|---|
| Linux (Debian/Ubuntu) | `PromptVault Lite_1.8.0_amd64.deb` |
| Linux (Fedora/RHEL) | `PromptVault Lite-1.8.0-1.x86_64.rpm` |

Windows is supported as a build target but no pre-built v1.8.0 installer is available for this release. Build from source or use a previous release. macOS is not pre-built.

Since v1.7.2, the `master` branch has received these v1.8.0 improvements:

- **Missing-Info-Gate** (#216) — dynamic pre-optimization questionnaire (opt-in, `PROMPTVAULT_MISSING_INFO_GATE=1`)
- **Direction Profiles & Variants** (#215) — multi-direction variant generation and comparison (opt-in, `PROMPTVAULT_DIRECTION_PROFILES=1`)
- **Optimizer fixes** (#289, #291) — gate session guard and sensitive-content optimizer blocking
- **Visual Release Gate** (#152) — Playwright E2E test coverage for layout and theming

---

## Install

### Recommended for Linux users (v1.8.0)

Download and install the `.deb` or `.rpm` package from the latest GitHub Release:

```text
# Debian/Ubuntu
sudo dpkg -i PromptVault Lite_1.8.0_amd64.deb

# Fedora/RHEL
sudo rpm -i PromptVault Lite-1.8.0-1.x86_64.rpm
```

Windows and macOS users: build from source (see below) or use a previous release.

### Developer / source install

```bash
git clone https://github.com/xxammaxx/promptvault-lite.git
cd promptvault-lite
pnpm install
pnpm start
```

---

## Privacy Model

PromptVault Lite is designed as a local-first tool:

- no cloud storage
- no remote LLM calls
- no API-based optimizer
- no telemetry
- no accounts
- no automatic publishing
- prompt files stay on your machine

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
- MkDocs

---

## Project Status

PromptVault Lite is in a stable public release state (v1.8.0).

Master branch contains v1.8.0 release with Missing-Info-Gate (#216), Direction Profiles (#215), optimizer fixes (#289, #291), and visual release gate (#152).

Known limitations:

- unsigned Windows installer (no code signing certificate)
- no auto-updater
- no macOS or Windows pre-built installer for v1.8.0
- Remote-CI is infra-blocked (Issue #154); local CI is authoritative
- Embeddings Phase 1 is mock-only (no real semantic search)
- Direction Profiles and Missing-Info-Gate are opt-in via feature flags (default disabled)
- Docker/Web/LAN deployment is deferred

---

## Best next improvements

- Decide on Direction Profiles default (opt-in vs. standard feature) for v1.8.0
- Create v1.8.0 release with #214/#215/#216/#289/#291
- Embeddings Phase 2: DB schema planning (#199)
- Code signing for Windows installer
- macOS `.dmg` build
