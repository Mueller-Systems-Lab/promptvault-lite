---
title: Erste Schritte
description: Schnelleinstieg in PromptVault Lite — Installation, erster Scan, Navigation.
version: 1.9.0
---

# Erste Schritte

> Tutorials für den schnellen Einstieg in PromptVault Lite.

## Voraussetzungen

- Installation: `../INSTALL.md` — Plattformspezifische Anleitung (Linux, Windows, macOS) _(noch nicht migriert)_

## Quickstart

```bash
# Repository klonen
git clone https://github.com/xxammaxx/promptvault-lite.git
cd promptvault-lite

# Abhängigkeiten installieren
pnpm install

# Tauri-App im Entwicklungsmodus starten
pnpm tauri dev
```

**Hinweis:** Beim ersten Start lädt Tauri WebView-Komponenten. Dies kann einige Sekunden dauern.

## Erster Durchlauf

### 1. Vault öffnen

- Klicke auf **Ordner öffnen** in der Toolbar.
- Wähle einen lokalen Ordner, der Markdown-Dateien (`.md`) enthält.
- Die App scannt den Ordner rekursiv — bis zu 50 Ebenen tief.

> **Tipp:** Noch keine Prompts? Lege ein paar `.md`-Dateien mit YAML-Frontmatter an. Beispiel:
>
> ```markdown
> ---
> title: Beispiel-Prompt
> category: coding
> tags: [python, testing]
> ---
>
> Erstelle eine Python-Funktion für ...
> ```

### 2. Explorer erkunden

Nach dem Scan siehst du links die **Explorer-Ansicht**:

- **Ordner** lassen sich auf- und zuklappen (Enter-Taste)
- **Dateien** zeigen Titel und ggf. einen Score-Badge
- **Favoriten** werden mit einem ★-Symbol markiert
- **Suche** (Strg/Cmd + F) filtert nach Titel, Kategorie, Tags und Inhalt
- **Filter** im FilterPanel grenzen die Auswahl weiter ein (Kategorie, Score, Hygiene-Status, Tags)

### 3. Prompt analysieren

- Wähle eine Datei im Explorer aus → Details erscheinen in der Mitte
- Klicke auf **Analysieren** → rechts erscheinen die Ergebnisse
- **Qualitätsscore** (0–100): Bewertung von Aufbau, Zielsetzung, Struktur
- **Hygienescore** (0–100): Status und erkannte Artefakte (PII, Secrets, Logs, etc.)

### 4. Exportieren und Favoriten

- **Favoriten-Toggle:** Stern-Icon in der Detailansicht (optimistisches UI-Update)
- **Export** (Strg/Cmd + E): JSON, Markdown oder ZIP — wahlweise nur Favoriten
- **Tastaturkürzel:** Siehe vollständige Liste im Benutzerhandbuch `../USER_GUIDE.md` _(noch nicht migriert)_

## Nächste Schritte

| Thema                          | Link                                                   |
| ------------------------------ | ------------------------------------------------------ |
| Benutzerhandbuch (vollständig) | `../USER_GUIDE.md` _(noch nicht migriert)_             |
| Testing                        | `../TESTING.md` _(noch nicht migriert)_                |
| Architektur verstehen          | `../architecture/overview.md` _(noch nicht in MkDocs)_ |
| Entwickeln & Beitragen         | [Development-Runbook](../runbooks/development.md)      |
| Fachbegriffe nachschlagen      | [Glossar](../glossary.md)                              |
