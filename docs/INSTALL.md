---
title: Installation
description: Installationsanleitung für PromptVault Lite.
version: 1.8.0
last_updated: 2026-07-06
---

# Installation

## Unterstützte Nutzung

- **Entwicklung:** Linux, Windows (getestet auf Linux Mint 22.1 und Windows 10)
- **Pre-built Installer:** Windows x64 (NSIS, unsigned)
- macOS/Linux: Nur Quellbau — keine pre-built Installer verfügbar
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

## Windows

1. Installiere Rust, Node.js und pnpm.
2. Stelle die nativen Build-Tools bereit, die Rust/Tauri auf Windows benötigt.
3. Öffne ein Terminal im Projektordner.
4. Führe `pnpm install` aus.
5. Starte mit `pnpm start`.

**Pre-built Installer:** Ein Windows x64 NSIS-Installer ist als GitHub Release Asset verfügbar.
Der Installer ist derzeit unsigned — Windows SmartScreen zeigt eine Warnung an.
Kein Code-Signing-Zertifikat vorhanden.

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
