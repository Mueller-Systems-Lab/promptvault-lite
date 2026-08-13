---
title: Benutzerhandbuch
description: Bedienung der Oberfläche, Suche, Analyse und Exportstatus.
version: 1.9.0
---

# Benutzerhandbuch

## Prompt-Ordner öffnen

1. Starte die App.
2. Klicke auf **Ordner öffnen**.
3. Wähle einen lokalen Ordner mit Markdown-Dateien.
4. Die App scannt den Ordner rekursiv und baut den Explorer-Baum auf.

## Drei-Spalten-Layout

### Links: Explorer

- Ordner und Dateien als Baumstruktur
- Datei-Knoten zeigen optional einen Score-Badge
- Favoriten werden mit Stern markiert

### Mitte: Prompt-Details

- Titel und Beschreibung
- **Audio-Kurzbeschreibung** mit "Kurz vorlesen" Button (lokale Sprachausgabe)
- Version, Kategorie, Tags, Pfad und Datumsangaben
- Vollständiger Markdown-Inhalt
- Aktionen: Favorit, Kopieren, Datei öffnen, Analysieren

### Rechts: Analyse

- Qualitätsanalyse mit Gesamt- und Einzelwerten
- Hygieneanalyse mit Status und Artefakten
- Empfehlungen und Warnhinweise

## Suchen und Filtern

- Nutze das Suchfeld im Explorer für Textsuche.
- Filter sind für Kategorie, Hygiene-Status, Tags und Favoriten vorhanden.
- Der Score-Bereich (min–max) wird per Doppel-Slider im FilterPanel eingestellt; beide Werte werden in der Filterlogik (`appStore.filteredPrompts`) berücksichtigt.

## Analyse von Prompts

- Wähle einen Prompt im Explorer aus.
- Klicke auf **Analysieren** in der Detailansicht.
- Alternativ kann die App alle geladenen Prompts der Reihe nach analysieren.

### Qualitätsscore

- Bereich: `0–100`
- Hoher Wert = guter Aufbau, klare Zielsetzung, gute Struktur
- Die Analyse bewertet u. a. Rolle, Ziel, Kontext, Eingaben, Vorgehen, Ausgabeformat, Qualitätsanforderungen, Sicherheitsgrenzen, Klarheit und Wiederverwendbarkeit

### Hygieneanalyse

- Bereich: `0–100`
- Status:
  - `clean`
  - `warning`
  - `critical`
- Erkennt u. a. Projektartefakte, Repo-Referenzen, Dateipfade, Issue-Referenzen, Logzeilen, Stacktraces, Build-Output, JSON-/Code-Dumps, PII und Secrets

## Export

- Export-Commands sind im Backend vollständig implementiert (`export_json`, `export_markdown`, `export_zip`).
- Über den **Exportieren**-Button in der Toolbar wählst du Format (JSON/Markdown/ZIP) und optional „Nur Favoriten".
- Fortschritt wird in der Export-Dialog-Progressbar angezeigt.

## Tastaturkürzel

- **Enter** auf einem fokussierten Ordner: Auf-/Zuklappen
- **Enter** auf einer fokussierten Datei: Prompt auswählen
- Weitere globale Tastaturkürzel:
  - **Strg/Cmd + O** — Ordner öffnen
  - **Strg/Cmd + F** — Suchfeld fokussieren
  - **Strg/Cmd + Shift + A** — Alle Prompts analysieren
  - **Strg/Cmd + E** — Export-Dialog öffnen
  - **Esc** — Filter zurücksetzen / Suchfeld verlassen

## Audio-Kurzbeschreibung (lokal)

PromptVault Lite kann eine kurze deutsche Zusammenfassung des ausgewählten Prompts vorlesen.

- Die Kurzbeschreibung erscheint in der Detailansicht unterhalb der Metadaten.
- Klicke auf **"Kurz vorlesen"**, um die Sprachausgabe zu starten.
- Während der Wiedergabe erscheint ein **"Stoppen"**-Button.
- Die Sprachausgabe stoppt automatisch beim Wechsel des Prompts.

### Lokale TTS (Text-to-Speech)

Die Sprachausgabe ist **vollständig lokal** und benötigt **keine Internetverbindung, keine Cloud-TTS-Dienste und keine API-Keys**.

- **Keine Cloud-Abhängigkeit:** Alle Verarbeitung erfolgt lokal.
- **Keine vollständigen Prompt-Inhalte:** Es wird nur eine kurze Zusammenfassung vorgelesen (maximal ca. 500 Zeichen).
- **Sensible Inhalte werden maskiert:** API-Keys, Tokens, E-Mail-Adressen, Pfade und Code-Blöcke werden automatisch erkannt und nicht vorgelesen.
- **Sicherheitsblockierung:** Inhalte mit kritischen Hygiene-Warnungen werden nicht vorgelesen.

### TTS-Provider

PromptVault Lite erkennt automatisch verfügbare lokale TTS-Provider in dieser Reihenfolge:

1. **Piper** — lokale neuronale Stimme (erfordert separat installiertes Piper-Binary und deutsches Modell; auf Windows mit `de_DE-thorsten-high` verifiziert)
2. **spd-say** (Speech Dispatcher) — `sudo apt install speech-dispatcher`
3. **espeak-ng** — `sudo apt install espeak-ng`
4. **Web Speech API** — im Browser/WebView integriert (Fallback)

Fehlt ein nativer Provider, wird die Web-Speech-API genutzt. Die Kurzbeschreibung bleibt auch ohne TTS-Provider sichtbar — nur die Audioausgabe ist dann deaktiviert. Es wird **kein** Modell automatisch heruntergeladen. Piper ist eine **externe lokale Runtime** (nicht mit PromptVault ausgeliefert); Details unter `docs/audits/LOCAL_NEURAL_TTS_RUN_REPORT.md`.

## Direktanalyse — Prompt ohne Datei analysieren

Die Direktanalyse erlaubt es, einen Prompt-Text einzufügen und sofort zu analysieren, ohne eine Datei im Vault anzulegen.

1. Klicke in der Toolbar auf **📝 Direktanalyse**.
2. Füge den Prompt-Text manuell in das Textfeld ein oder klicke auf **📋 Aus Zwischenablage einfügen**.
3. Klicke auf **🔍 Analysieren**.
4. Die Ergebnisse zeigen Klassifikation, Qualität, Hygiene, Blueprint-Bewertung und Context-Engineering-Scores.
5. Mit **🗑️ Leeren** wird die Eingabe zurückgesetzt.

### Sicherheit

- Der eingefügte Text wird **nicht gespeichert** und bleibt nur im lokalen UI-State.
- Die Zwischenablage wird ausschließlich nach expliziter Nutzeraktion gelesen (Button-Klick).
- Keine Cloud-API, kein Remote-LLM, keine Telemetrie.
- Zurück zum Dateimodus: Auf **📁 Dateien** klicken.

## Admin Observability — Verarbeitung nachvollziehen

Admin Observability ist ein **lesender Diagnosemodus**. Er zeigt Schritt für Schritt, was PromptVault bei der Verarbeitung eines Prompts tatsächlich tut — welcher Schritt erfolgreich war, welcher übersprungen oder blockiert wurde und warum.

### Wann benutze ich es?

Zum Beispiel, wenn **eine Analyse falsch aussieht** — ein Schritt fehlt, ein Score wirkt unerklärlich, eine Optimierung liefert „nichts“.

### So gehst du vor

1. **Einstellungen** öffnen (⚙️).
2. Unter **Entwickler-Werkzeuge** den Schalter **Admin Observability** aktivieren.
3. In der Toolbar erscheint ein 🔍-Button → **Diagnostics Panel** öffnen.
4. Die Verarbeitung erneut ausführen (z. B. Prompt analysieren).
5. Im Panel den **fehlgeschlagenen oder übersprungenen Schritt** ansehen (Status + Reason Code).
6. Bei Bedarf die Diagnose **kopieren** oder als **redigiertes JSON exportieren** und weitergeben.

Es sind **keine Entwicklerkenntnisse nötig**. Standardmäßig enthält die Diagnose weder vollständige Prompttexte noch Secrets — nur Metadaten, Status, Reason Codes und Laufzeiten. Es gibt keine Cloud-Übertragung; alles bleibt lokal.

Mehr Details: `docs/OBSERVABILITY.md`.

## PromptVault CLI (optional)

Die App lässt sich zusätzlich über die Kommandozeile verwalten (`promptvault`). Installation über PyPI: `uv tool install promptvault-lite-manager` (siehe `docs/CLI.md`):

```text
promptvault doctor       # Status prüfen
promptvault install      # native App installieren
promptvault launch       # App starten
promptvault update       # auf Updates prüfen
promptvault diagnostics  # Diagnose-/Observability-Hinweis
promptvault uninstall    # App entfernen (Vault-Daten bleiben erhalten)
```
