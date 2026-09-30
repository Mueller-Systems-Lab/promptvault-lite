---
title: PromptVault Lite (archiviert)
description: Archivierte Projektübersicht (Stand v1.9.0) — kanonisch sind README.md (Repo-Root) und docs/index.md.
version: 1.9.0
archived: 2026-09-30
archive_reason: "Issue #42: veraltete Duplikat-Übersicht archiviert"
---

# PromptVault Lite (archivierte Übersicht)

> **Archiviert (2026-09-30, Issue #42).** Diese Datei ist eine veraltete
> Duplikat-Übersicht (Stand v1.9.0) und war bereits vor der Archivierung aus
> der MkDocs-Navigation ausgeschlossen (`exclude_docs` in `mkdocs.yml`).
> Kanonische Übersichten: [`README.md`](../../README.md) (Repo-Root) und
> [`docs/index.md`](../index.md). Der historische Inhalt folgt unverändert.

## Historischer Inhalt (v1.9.0)

PromptVault Lite ist ein lokales Desktop-Tool zum Einlesen, Durchsuchen und Bewerten von Markdown-Prompts. Die App scannt einen Ordner rekursiv, zeigt Prompts im Drei-Spalten-Layout an und führt regelbasierte Qualitäts- und Hygieneanalysen lokal aus.

## Features

- Rekursiver Scan von `.md`/`.markdown`/`.txt`-Dateien (1 MiB-Limit)
- Drei-Spalten-UI: Explorer, Details, Analyse
- Frontmatter-Parsing mit Fallbacks für fehlende Felder
- Volltextsuche und Filter im Explorer
- Qualitätsanalyse mit Score 0–100
- Hygieneanalyse mit Score 0–100 und Artefakterkennung
- Blueprint-Erkennung und -Optimierung
- Prompt-Optimierung (conservative/balanced/aggressive)
- Missing-Info-Gate und Direction Profiles (opt-in)
- Admin Observability (Trace/Span-Diagnose, read-only)
- promptvault CLI (install/launch/update/uninstall)
- Lokale Persistenz-Module für SQLite und JSON-Cache

## Quick Start

```bash
pnpm install
pnpm start
```

1. Starte die App.
2. Klicke auf **Ordner öffnen**.
3. Wähle einen lokalen Ordner mit Markdown-Prompts.
4. Wähle einen Prompt im Explorer aus.
5. Lies Metadaten, Inhalt und Analyse rechts in der App.

## Screenshots

> Screenshots folgen — siehe Issue #27 für die geplante README-Überarbeitung mit aktuellem Bildmaterial.

## Tech Stack

- Frontend: React, TypeScript, Vite, Zustand, react-markdown
- Backend: Rust, Tauri 2
- Persistenz: SQLite, JSON-Cache
- Analyse: Regex- und heuristikbasierte lokale Auswertung
- Desktop-Plugins: Dialog, Clipboard, Shell, Filesystem

## Weitere Dokumente

- [Installation](INSTALL.md)
- [Architektur](ARCHITECTURE.md)
- [Admin Observability](OBSERVABILITY.md)
- [CLI / uv tool](CLI.md)
- [Benutzerhandbuch](USER_GUIDE.md)
- [Tests](TESTING.md)
- [Changelog](CHANGELOG.md)
