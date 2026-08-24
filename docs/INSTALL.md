---
title: Installation
description: Installationsanleitung für PromptVault Lite.
version: 1.12.0
last_updated: 2026-08-24
---

# Installation

## Unterstützte Nutzung

- **Entwicklung:** Linux, Windows (getestet auf Linux Mint 22.1 und Windows 10)
- **Release candidate (v1.12.0):** Linux x64 `.deb`, `.rpm` and AppImage are built and checksummed; GitHub asset publication is still blocked from this host
- Windows: the prior `v1.11.1` NSIS release remains available; no new Windows asset was produced in this Linux run
- macOS: Nur Quellbau — kein pre-built Installer verfügbar
- Docker: Nicht als Produktions-Deployment implementiert

## Voraussetzungen

- Rust 1.77 oder neuer
- Node.js (LTS empfohlen)
- pnpm

## Allgemeine Schritte (Quellbau)

```bash
pnpm install
```

Danach kannst du die App im Entwicklungsmodus starten:

```bash
pnpm start
```

Für einen Produktionsbuild:

```bash
pnpm tauri build
```

## Native App (pre-built)

### Linux (v1.12.0)

```text
# Debian/Ubuntu
sudo apt install ./PromptVault.Lite_1.12.0_amd64.deb

# Fedora/RHEL (if using the RPM asset)
sudo rpm -i 'PromptVault Lite-1.12.0-1.x86_64.rpm'
```

Checksummen liegen im Release als `SHA256SUMS.txt` bei.

## CLI / uv tool

`promptvault-lite-manager` (Einstiegspunkt `promptvault`) ist ein separater Windows/NSIS-only Installer-Stream. Die letzte kompatible PyPI-Version ist `1.11.1`:

```bash
uv tool install promptvault-lite-manager

promptvault doctor
promptvault install
promptvault launch
```

Voraussetzungen: Python >= 3.11 und [uv](https://docs.astral.sh/uv/). Vollständige Referenz: `docs/CLI.md`.

## Windows

1. Installiere Rust, Node.js und pnpm.
2. Stelle die nativen Build-Tools bereit, die Rust/Tauri auf Windows benötigt.
3. Öffne ein Terminal im Projektordner.
4. Führe `pnpm install` aus.
5. Starte mit `pnpm start`.

**Pre-built Installer:** Der Windows x64 NSIS-Installer `PromptVault.Lite_1.11.1_x64-setup.exe` ist als [v1.11.1-Release-Asset](https://github.com/xxammaxx/promptvault-lite/releases/tag/v1.11.1) veröffentlicht. Der Installer ist unsigned — Windows SmartScreen zeigt eine Warnung an.

## Linux

1. Installiere Rust, Node.js und pnpm.
2. Stelle sicher, dass die nativen Build-Abhängigkeiten für deine Distribution vorhanden sind.
3. Klone das Projekt und wechsle in das Verzeichnis.
4. Führe `pnpm install` aus.
5. Starte mit `pnpm start`.

## macOS

Quellbau möglich, aber nicht aktiv getestet. Kein pre-built macOS-Installer verfügbar.

1. Installiere Rust, Node.js und pnpm.
2. Stelle die Xcode-/Command-Line-Tools bereit.
3. Klone das Projekt und wechsle in das Verzeichnis.
4. Führe `pnpm install` aus.
5. Starte mit `pnpm start`.

## Troubleshooting

- **`pnpm` oder `cargo` nicht gefunden**: Prüfe, ob die Werkzeuge im PATH sind.
- **App startet nicht**: Führe `pnpm install` erneut aus.
- **Scan findet keine Dateien**: Der Scanner verarbeitet `.md`, `.markdown` und `.txt`-Dateien bis 1 MiB.
- **Export/Favoriten scheinen zu hängen**: Der Vorgang läuft lokal im Rust-Backend; bei großen Prompt-Mengen kann der erste Aufruf mehrere Sekunden dauern.
- **Build-Probleme**: Prüfe die plattformspezifischen Native-Build-Voraussetzungen für Rust/Tauri.
- **`promptvault` nicht gefunden**: CLI-Paket noch nicht installiert — `uv tool install promptvault-lite-manager` (siehe oben).
