---
title: How-to-Index
description: Übersicht über typische Aufgaben in PromptVault Lite mit Verweisen auf die passenden Anleitungen.
version: 1.8.0
---

# How-to-Index

> Praktische Anleitungen für häufige Aufgaben in PromptVault Lite.

## Anwendung

### Wie öffne ich einen Vault?

1. Klicke auf **Ordner öffnen** in der Toolbar.
2. Wähle einen lokalen Ordner mit Markdown-Dateien.
3. Die App scannt den Ordner rekursiv (maximal 50 Ebenen).

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#prompt-ordner-offnen` _(noch nicht migriert)_

### Wie suche und filtere ich Prompts?

- **Textsuche:** Strg/Cmd + F → Suchfeld fokussieren → Eingabe
- **Kategorie-Filter:** Dropdown im FilterPanel
- **Score-Range:** Doppel-Slider (min/max)
- **Hygiene-Status:** Dropdown (clean/warning/critical)
- **Tags:** Komma-separierte Eingabe
- **Favoriten:** Toggle "Nur Favoriten"

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#suchen-und-filtern` _(noch nicht migriert)_

### Wie analysiere ich die Qualität eines Prompts?

1. Prompt im Explorer auswählen.
2. Klicke auf **Analysieren** in der Detailansicht.
3. Der Qualitätsscore (0–100) und 10 Kriterien werden rechts im AnalysisPanel angezeigt.
4. Alternativ: Strg/Cmd + Shift + A analysiert alle geladenen Prompts.

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#analyse-von-prompts` _(noch nicht migriert)_

### Wie exportiere ich Prompts?

- **Export-Dialog öffnen:** Strg/Cmd + E oder Button in der Toolbar
- **Formate:** JSON, Markdown (einzelne Dateien), ZIP (Archiv)
- **Option:** Nur Favoriten exportieren
- Fortschritt wird im Dialog angezeigt

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#export` _(noch nicht migriert)_

### Wie verwende ich Favoriten?

- Stern-Icon in der Detailansicht klicken (optimistisches UI-Update)
- Favoriten bleiben über Neustarts hinweg bestehen (SQLite-Persistenz)
- Im FilterPanel kann auf "Nur Favoriten" eingeschränkt werden
- ★-Symbol im FileTree zeigt favorisierte Prompts an

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#drei-spalten-layout` _(noch nicht migriert)_

### Wie diagnostiziere ich eine Analyse mit Admin Observability?

1. **Einstellungen** → **Entwickler-Werkzeuge** → **Admin Observability** aktivieren.
2. In der Toolbar den 🔍-Button (Diagnostics Panel) öffnen.
3. Die Verarbeitung erneut ausführen (Prompt analysieren).
4. Im Panel den fehlgeschlagenen/übersprungenen Schritt samt Reason Code ansehen.
5. Bei Bedarf Diagnose kopieren oder als redigiertes JSON exportieren.

→ Detail: `../OBSERVABILITY.md` _(noch nicht migriert)_

### Wie verwalte ich die App über die CLI?

```text
promptvault doctor       # Status prüfen
promptvault install      # native App installieren
promptvault launch       # App starten
promptvault update       # auf Updates prüfen
promptvault uninstall    # App entfernen (Vault-Daten bleiben)
```

→ Detail: `../CLI.md` _(noch nicht migriert)_ — CLI-Paket noch nicht auf PyPI (`READY_FOR_PUBLICATION`).

### Welche Tastaturkürzel gibt es?

| Kürzel               | Aktion                                   |
| -------------------- | ---------------------------------------- |
| Strg/Cmd + O         | Ordner öffnen                            |
| Strg/Cmd + F         | Suchfeld fokussieren                     |
| Strg/Cmd + Shift + A | Alle Prompts analysieren                 |
| Strg/Cmd + E         | Export-Dialog öffnen                     |
| Esc                  | Filter zurücksetzen / Suchfeld verlassen |
| Enter (auf Datei)    | Prompt auswählen                         |
| Enter (auf Ordner)   | Auf-/Zuklappen                           |

→ Detail: Benutzerhandbuch `../USER_GUIDE.md#tastaturkurzel` _(noch nicht migriert)_

## Entwicklung

### Wie richte ich die Entwicklungsumgebung ein?

→ [Development-Runbook](../runbooks/development.md#dev-umgebung-einrichten)

### Wie führe ich Tests aus?

```bash
# Frontend-Tests
pnpm test

# Rust-Tests
cargo test --manifest-path src-tauri/Cargo.toml

# TypeScript-Prüfung
tsc --noEmit

# Linting
pnpm lint
cargo clippy
```

→ Testing Guide: `../TESTING.md` _(noch nicht migriert)_

### Wie füge ich ein neues Tauri-Command hinzu?

→ [Development-Runbook — Neue Tauri-Commands](../runbooks/development.md#neue-tauri-commands-hinzufugen)

### Wie füge ich eine neue Frontend-Komponente hinzu?

→ [Development-Runbook — Neue Frontend-Komponenten](../runbooks/development.md#neue-frontend-komponenten-hinzufugen)

## Fehlende Anleitungen (TODOs)

> Die folgenden Anleitungen existieren noch nicht und sollten bei Bedarf ergänzt werden:

- **TODO:** Wie installiere ich die App auf Linux (DEB/RPM)?
- **TODO:** Wie installiere ich die App auf macOS (DMG)?
- **TODO:** Wie installiere ich die App auf Windows (MSI)?
- **TODO:** Wie konfiguriere ich den File-Watcher?
- **TODO:** Wie strukturiere ich einen guten Prompt?
- **TODO:** Wie interpretiere ich die Hygiene-Ergebnisse?
- **TODO:** Wie migriere ich von einem anderen Tool?
