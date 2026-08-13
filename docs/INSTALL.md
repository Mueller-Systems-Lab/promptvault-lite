---
title: Installation
description: Installationsanleitung für PromptVault Lite.
version: 1.9.0
last_updated: 2026-08-12
---

# Installation

## Unterstützte Nutzung

- **Entwicklung:** Linux, Windows (getestet auf Linux Mint 22.1 und Windows 10)
- **Pre-built Installer (v1.9.0):** Windows x64 NSIS-Installer als GitHub-Release-Asset
- **Pre-built Installer (v1.8.0):** Linux `.deb` und `.rpm` als GitHub-Release-Assets
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

### Windows (v1.9.0)

Lade `PromptVault Lite_1.9.0_x64-setup.exe` aus dem [v1.9.0 GitHub Release](https://github.com/xxammaxx/promptvault-lite/releases/tag/v1.9.0) herunter und führe es aus. Der Installer ist derzeit **unsigned** — Windows SmartScreen zeigt eine Warnung an.

Checksummen liegen im Release als `SHA256SUMS.txt` bei.

### Linux (v1.8.0)

```text
# Debian/Ubuntu
sudo dpkg -i PromptVault.Lite_1.8.0_amd64.deb

# Fedora/RHEL
sudo rpm -i PromptVault.Lite-1.8.0-1.x86_64.rpm
```

Checksummen liegen im Release als `SHA256SUMS.txt` bei.

## CLI / uv tool

`promptvault-cli` (Einstiegspunkt `promptvault`) installiert und verwaltet die native Desktop-App. **PyPI-Publikation noch ausstehend** (Secure-Publish-Auth erforderlich); bis dahin aus lokalem Wheel installieren:

```bash
cd tools/promptvault-cli
uv build
uv tool install ./dist/promptvault_cli-1.9.0-py3-none-any.whl

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

**Pre-built Installer:** Ein Windows x64 NSIS-Installer (`PromptVault Lite_1.9.0_x64-setup.exe`) ist als v1.9.0-Release-Asset veröffentlicht. Der Installer ist derzeit unsigned — Windows SmartScreen zeigt eine Warnung an. Kein Code-Signing-Zertifikat vorhanden.

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
- **`promptvault` nicht gefunden**: CLI-Paket ist noch nicht veröffentlicht — aus lokalem Wheel installieren (siehe oben).
