---
title: Installation
description: Installationsanleitung für PromptVault Lite.
version: 1.13.0
last_updated: 2026-10-09
---

# Installation

## Unterstützte Nutzung

- **Entwicklung:** Linux, Windows (getestet auf Linux Mint 22.1 und Windows 10)
- **Linux x64 (v1.12.0 published, v1.13.0 in Vorbereitung):** `.deb`, `.rpm` und AppImage inklusive `SHA256SUMS.txt` und Source-Identity-Manifest
- Windows: the prior `v1.11.1` NSIS release remains available; no new Windows asset was produced in this Linux run
- macOS: Nur Quellbau — kein pre-built Installer verfügbar
- Docker: Web/LAN-Server über `deploy/Dockerfile` und `deploy/docker-compose.yml` (Read-only-Default, Vault `:ro`)

## Voraussetzungen

- Rust 1.77 oder neuer
- Node.js (LTS empfohlen)
- pnpm

## Native Abhängigkeiten je Plattform (Issue #43)

Der Quellbau der Tauri-2-App benötigt pro Plattform unterschiedliche native
Systembibliotheken. Die Paketinstallation (`.deb`/`.rpm`/NSIS) benötigt keine
dieser Build-Abhängigkeiten — sie gelten nur für `pnpm tauri build` /
`pnpm start` aus dem Quellcode.

### Linux (Debian/Ubuntu/Mint)

```bash
sudo apt update
sudo apt install libwebkit2gtk-4.1-dev \
  build-essential \
  curl \
  wget \
  file \
  libxdo-dev \
  libssl-dev \
  libayatana-appindicator3-dev \
  librsvg2-dev
```

- Verifiziert auf Linux Mint 22.1 (Kernel 6.8): `pkg-config` meldet
  `webkit2gtk-4.1`, `gtk+-3.0` und `libsoup-3.0` als vorhanden — der
  Rust-Workspace (`cargo test`, `cargo clippy`, `pnpm build`) läuft grün.
- Fedora/RHEL: Paketnamen unterscheiden sich
  (`webkit2gtk4.1-devel`, `libxdo-devel`, `openssl-devel`,
  `libayatana-appindicator3-devel`, `librsvg2-devel`).

### Windows (10/11)

- **Microsoft Visual Studio C++ Build Tools** (MSVC-Toolchain `x86_64-pc-windows-msvc`)
- **WebView2 Runtime** — unter Windows 10/11 vorinstalliert; sonst über den
  Evergreen-Installer von Microsoft nachziehen
- Keine weiteren nativen Bibliotheken erforderlich

### macOS

- **Xcode Command Line Tools** (`xcode-select --install`)
- WebView (WKWebView) ist Teil des Betriebssystems — keine zusätzliche Bibliothek

Referenz: Tauri-2-Prerequisites-Dokumentation. Bei reinem
Frontend-Entwicklung ohne Rust-Backend (`pnpm dev`) sind keine nativen
Abhängigkeiten nötig.

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

### Linux (v1.12.0 published, v1.13.0 candidate)

```text
# Debian/Ubuntu
sudo apt install ./PromptVault-Lite_1.13.0_amd64.deb

# Fedora/RHEL (if using the RPM asset)
sudo dnf install ./PromptVault-Lite-1.13.0-1.x86_64.rpm

# AppImage (portable)
chmod +x PromptVault-Lite_1.13.0_amd64.AppImage && ./PromptVault-Lite_1.13.0_amd64.AppImage
```

Verify the download against `SHA256SUMS.txt` before installing.

Hinweis zur Benennung: GitHub ersetzt Leerzeichen in Release-Asset-Namen durch
Punkte. Deshalb erscheinen die veröffentlichten v1.12.0-Pakete als
`PromptVault.Lite_1.12.0_amd64.deb`, während die v1.13.0-Pakete ohne Leerzeichen
(hypheniert) veröffentlicht werden, damit GitHub die Namen nicht umschreibt.

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

**Pre-built Installer:** Der Windows x64 NSIS-Installer `PromptVault.Lite_1.11.1_x64-setup.exe` ist als [v1.11.1-Release-Asset](https://github.com/Mueller-Systems-Lab/promptvault-lite/releases/tag/v1.11.1) veröffentlicht. Der Installer ist unsigned — Windows SmartScreen zeigt eine Warnung an.

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
