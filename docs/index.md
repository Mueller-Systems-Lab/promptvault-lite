---
title: PromptVault Lite Dokumentation
description: Zentrale Dokumentations-Landing-Page für PromptVault Lite.
version: 1.8.0
---

# PromptVault Lite Dokumentation

PromptVault Lite ist ein lokales Desktop-Tool zum Einlesen, Durchsuchen und Bewerten von Markdown-Prompts. Die App scannt einen Ordner rekursiv, zeigt Prompts im Drei-Spalten-Layout an und führt regelbasierte Qualitäts- und Hygieneanalysen lokal aus — ohne Netzwerk, ohne Cloud, ohne Tracking.

## Quick Start

```bash
pnpm install
pnpm tauri dev
```

1. Ordner mit Markdown-Prompts öffnen
2. Prompt im Explorer auswählen
3. Qualitäts- und Hygieneanalyse durchführen

→ Ausführliche Installationsanleitung: `INSTALL.md` _(Dokument noch nicht in MkDocs migriert)_

## Dokumentation

### Tutorials / Einstieg

- [Getting Started](getting-started/index.md) — Erste Schritte mit PromptVault Lite
- Installation (plattformspezifisch): `INSTALL.md` _(noch nicht migriert)_

### How-to Guides

- [How-to Index](how-to/index.md) — Aufgabenübersicht
- Benutzerhandbuch: `USER_GUIDE.md` _(noch nicht migriert)_
- Testing Guide: `TESTING.md` _(noch nicht migriert)_

### Referenz

- [Projektstruktur](reference/project-structure.md) — Vollständige Datei- und Verzeichnisreferenz
- Architektur: `ARCHITECTURE.md` _(noch nicht migriert)_
- Admin Observability: `OBSERVABILITY.md` _(noch nicht migriert)_
- CLI / uv tool: `CLI.md` _(noch nicht migriert)_
- [Glossar](glossary.md) — Fachbegriffe von A bis Z
- Sicherheitsregeln: `SECURITY_GATES.md` _(noch nicht migriert)_
- Changelog: `CHANGELOG.md` _(noch nicht migriert)_

### Erklärungen

- Architekturüberblick: `architecture/overview.md` _(noch nicht in MkDocs migriert)_
- [Dokumentations-Struktur (Diátaxis)](explanation/index.md) — Konzepte und Hintergründe

### Entwicklung

- [Development-Runbook](runbooks/development.md) — Dev-Umgebung, Commands, Workflows
- Testing Guide: `TESTING.md` _(noch nicht migriert)_
- Architekturüberblick: `architecture/overview.md` _(noch nicht in MkDocs migriert)_

### Governance

- AI-Handbuch: `AI_HANDBUCH.md` _(noch nicht migriert)_
- AI Workflow: `AI_WORKFLOW.md` _(noch nicht migriert)_
- Sicherheitsregeln: `SECURITY_GATES.md` _(noch nicht migriert)_
- Evidence Standard: `EVIDENCE_STANDARD.md` _(noch nicht migriert)_
- Context Engineering Standard: `CONTEXT_ENGINEERING_STANDARD.md` _(noch nicht migriert)_
- [Agenten-Regeln](https://github.com/xxammaxx/promptvault-lite/blob/master/AGENTS.md) — Verbindliche Regeln für KI-Agenten

## Navigation

| Bereich     | Pfad                                                |
| ----------- | --------------------------------------------------- |
| Tutorials   | `docs/getting-started/`                             |
| How-to      | `docs/how-to/`                                      |
| Referenz    | `docs/reference/`                                   |
| Erklärungen | `docs/explanation/`                                 |
| Entwicklung | `docs/runbooks/`                                    |
| Governance  | `docs/agent/`, `docs/adr/` _(noch nicht in MkDocs)_ |

## Search

> **Hinweis:** Diese Seite ist für MkDocs mit Suchfunktion ausgelegt. Alternativ die Volltextsuche in der `docs/`-Struktur per `grep -r` oder IDE-Suche.

---

_Zuletzt aktualisiert: 2026-08-12 · Version 1.8.0_
