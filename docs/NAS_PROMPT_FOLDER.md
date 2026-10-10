# NAS Markdown Folder Ingestion — Specification

## User Story

Als Nutzer möchte ich einen Ordner auf meinem NAS auswählen oder konfigurieren,
damit PromptVault Lite alle `.md`-Promptdateien darin einliest, bewertet und im Explorer anzeigt.

## Primary Source

Ein gemounteter NAS-Ordner mit Markdown-Dateien. Der Ordner wird vom Betriebssystem,
Proxmox-LXC oder Host als lokaler Pfad gemountet. PromptVault Lite liest diesen
gemounteten Ordner wie einen normalen lokalen Ordner.

## Supported MVP Sources

- Lokaler Ordner
- Gemounteter SMB/CIFS-Ordner
- Gemounteter NFS-Ordner
- Windows UNC-Pfad (sofern Tauri/OS Zugriff erlaubt)
- Später Docker/LXC-Mount unter /data/prompts

## File Scope

- `.md`-Dateien
- `.markdown`-Dateien (seit v1.6.1)
- Keine Binärdateien
- Keine versteckten Systemdateien
- Keine temporären Dateien (`*.tmp`, `~*`, `.*.swp`)
- Keine Dateien außerhalb des gewählten Root-Ordners

## Default Mode

- Read-only: PromptVault Lite liest nur Dateiinhalte
- Keine Schreiboperationen auf dem gemounteten NAS
- Kein Löschen, Verschieben oder Überschreiben von Markdown-Dateien

## Write Mode

Nicht Teil des MVP. Schreibzugriff wird in einem späteren Release geprüft.

## Acceptance Criteria

1. Nutzer kann einen lokalen/gemounteten Ordner über den nativen Dateidialog auswählen
2. Alle `.md`-Dateien im Ordner und Unterordnern werden rekursiv gefunden
3. Nicht-Markdown-Dateien werden ignoriert
4. Dateipfade werden normalisiert (Windows: Backslashes, UNC, Long Paths)
5. Prompt-Dateien werden im Explorer als File-Tree angezeigt
6. Ausgewählter Prompt-Inhalt wird im DetailsPanel geladen
7. Prompt-Analyse funktioniert auf geladene Markdown-Inhalte
8. Fehler bei nicht lesbarem NAS erzeugen einen verständlichen Fehler (kein Crash)
9. Leere Ordner erzeugen einen leeren Explorer (kein Fehler)
10. Fehler bei einzelnen unlesbaren Dateien werden gesammelt, aber brechen den Scan nicht ab

## Security Rules

1. Der ausgewählte Prompt-Root ist die harte Boundary
2. Keine Datei außerhalb dieses Roots wird gelesen
3. Path-Traversal mit `../` wird durch Canonicalize+Containment geblockt
4. Absolute Pfade außerhalb des Prompt-Roots werden geblockt
5. Symlink-Escape wird erkannt und blockiert
6. Null-Bytes im Pfad werden abgewiesen
7. Nicht lesbare Dateien erzeugen Warnungen, keinen Crash
8. Offline-NAS erzeugt verständliche Fehlermeldung
9. Keine NAS-Credentials werden geloggt
10. Keine Rohpfade unnötig in UI/Evidence-Logs veröffentlicht

## Error States

| Zustand                          | Verhalten                                                |
| -------------------------------- | -------------------------------------------------------- |
| Verzeichnis nicht vorhanden      | Fehler: "Verzeichnis existiert nicht: {path}"            |
| Pfad ist kein Verzeichnis        | Fehler: "Pfad ist kein Verzeichnis: {path}"              |
| Kanonischer Pfad nicht auflösbar | Fehler: "Konnte kanonischen Pfad nicht auflösen: {path}" |
| Einzelne Datei nicht lesbar      | Warnung geloggt, Scan wird fortgesetzt                   |
| Symlink außerhalb Vault          | Warnung geloggt, Datei übersprungen                      |
| Leerer Ordner                    | Erfolg mit 0 Prompts                                     |
| NAS offline / Mount getrennt     | Fehler: "Verzeichnis existiert nicht: {path}"            |
| Null-Byte im Pfad                | Fehler vor Scan-Beginn                                   |

## Platform Path Examples

```text
Windows Desktop:
  <DRIVE>:\PromptVault\Prompts
  \\192.168.1.144\<share>\Prompts

Linux / LXC:
  /mnt/promptvault-prompts

Docker (später):
  /data/prompts
```

## NAS Mount Setup (Manual)

### Vorbereitung: Testordner mit Markdown-Dateien

Erstelle einen Testordner mit 5–20 `.md`-Dateien auf dem NAS:

```bash
mkdir -p /mnt/nas-test/prompts
mkdir -p /mnt/nas-test/prompts/sub

# Titel mit Sonderzeichen
cat > /mnt/nas-test/prompts/01-einleitung.md << 'EOF'
---
title: "Einleitung"
category: general
tags: [start, overview]
---
# Projekt-Einleitung

Dies ist eine Beispiel-Prompt-Datei.
EOF

cat > /mnt/nas-test/prompts/02-analyse.md << 'EOF'
---
title: "Code-Analyse"
category: coding
tags: [rust, review]
---
# Code-Analyse Prompt

## Rolle
Du bist ein erfahrener Rust-Entwickler.

## Ziel
Analysiere den folgenden Code auf Sicherheitslücken.
EOF

# Datei mit Umlauten im Dateinamen
cat > "/mnt/nas-test/prompts/03-Übersicht.md" << 'EOF'
---
title: "Projekt-Übersicht"
category: management
---
# Projektübersicht

Alle Komponenten im Überblick.
EOF

# Datei in Unterordner
cat > /mnt/nas-test/prompts/sub/04-details.md << 'EOF'
---
title: "Technische Details"
category: coding
---
# Architektur-Details
EOF

# .markdown extension
cat > /mnt/nas-test/prompts/05-notes.markdown << 'EOF'
---
title: "Entwickler-Notizen"
category: notes
---
# Wichtige Notizen
EOF
```

### SMB/CIFS Mount (Linux/LXC)

```bash
# Pfad-Platzhalter:
# NAS_IP=192.168.1.144
# NAS_SHARE=<share_name>
# LOCAL_MOUNT=/mnt/promptvault-prompts

sudo mkdir -p /mnt/promptvault-prompts

# Read-only mount (empfohlen)
sudo mount -t cifs //192.168.1.144/<share_name> /mnt/promptvault-prompts \
  -o credentials=/root/.nas-credentials,iocharset=utf8,ro

# Credential-Datei (NIE in Git committen!)
# /root/.nas-credentials:
# username=<user>
# password=<pass>
# domain=<domain>
```

### NFS Mount (Linux/LXC)

```bash
sudo mkdir -p /mnt/promptvault-prompts

# Read-only mount
sudo mount -t nfs 192.168.1.144:/<export_path> /mnt/promptvault-prompts -o ro
```

### Windows Desktop

```text
Netzlaufwerk verbinden:
  \\192.168.1.144\<share_name>\<folder_with_md_files>

Beispiel:
  <DRIVE>:\PromptVault\Prompts
```

Oder direkt über den nativen Tauri-Dateidialog navigieren:

- Dieser PC → Netzlaufwerk auswählen
- Der Pfad wird vom Dialog als UNC-Pfad oder Laufwerksbuchstabe zurückgegeben

### Testschritte

1. **NAS-Mount vorbereiten:** Mounte den NAS-Ordner read-only wie oben beschrieben
2. **PromptVault Lite starten:** `pnpm tauri dev` oder Release-Build
3. **Ordner auswählen:** `Strg+O` oder "Ordner öffnen"-Button im Explorer
4. **Erwartetes Ergebnis:**
   - Explorer zeigt File-Tree mit Ordnern und `.md`-Dateien
   - Nicht-`.md`-Dateien werden ignoriert
   - `.markdown`-Dateien werden ebenfalls erkannt
   - Klick auf Datei zeigt Inhalt im DetailsPanel
   - "Alle analysieren" funktioniert auf geladenen Prompts
5. **Offline-Test:** NAS-Mount trennen, App neustarten, Ordner erneut wählen
   - Erwartet: Verständliche Fehlermeldung "Verzeichnis existiert nicht"
6. **Leeren Ordner testen:** Leeren Mount erstellen und wählen
   - Erwartet: Explorer zeigt leeren State (kein Fehler)

### Wichtige Sicherheitshinweise

- **Keine echten Credentials in Git committen**
- **NAS-Mount zuerst read-only testen**
- **Testordner mit 5–20 Markdown-Dateien verwenden**
- **Mindestens eine Datei mit Umlauten im Dateinamen testen**
- **Mindestens eine Datei in einem Unterordner testen**
- **Keine Schreiboperationen auf dem NAS-Mount ausführen**

## Out of Scope

- Docker-Deployment
- LXC-Erstellung
- Proxmox-Konfiguration
- NAS-Credential-Management
- promptvault-server
- Web/LAN-Backend-Adapter
- Schreibzugriff auf NAS
- Blueprint-Feature
- Agentic Browser
