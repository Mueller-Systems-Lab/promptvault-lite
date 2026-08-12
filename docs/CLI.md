# PromptVault CLI (uv tool)

> `promptvault` — lokaler Installer & Manager für die native PromptVault Desktop-App.

---

## Überblick

`promptvault-cli` ist ein Python-CLI-Paket, das die **native PromptVault Lite Desktop-App** installiert, startet, aktualisiert und entfernt. Es ist als `uv`-Tool installierbar.

Zwei Ebenen sind strikt zu trennen:

| Werkzeug | Verwaltet |
|---|---|
| **uv tool** | die `promptvault-cli` selbst (Installation/Upgrade/Deinstallation des CLI-Pakets) |
| **PromptVault CLI** (`promptvault`) | die **native PromptVault Desktop-App** |

---

## Publikationsstatus

- **Status:** `READY_FOR_PUBLICATION`
- **PyPI:** `NOT PUBLISHED` — der Befehl `uv tool install promptvault-cli` funktioniert **noch nicht** aus einem Package Index.
- **GitHub Release / Tag:** `NOT PUBLISHED` — es existiert kein `v1.9.0`-Release oder -Tag.

> Die interne Paketversion `1.9.0` ist **kein** Release-Status. `1.9.0` wurde nicht veröffentlicht.

Bis zur Veröffentlichung wird das CLI-Paket aus einem **lokal gebauten Wheel** installiert (real verfügbarer und getesteter Weg):

```bash
cd tools/promptvault-cli
uv build
uv tool install ./dist/promptvault_cli-1.9.0-py3-none-any.whl
```

Voraussetzungen: Python >= 3.11 und [uv](https://docs.astral.sh/uv/).

---

## Kommandos

```text
promptvault --version      # CLI-Version anzeigen
promptvault --help         # Hilfe anzeigen
promptvault doctor         # System- und Installationsstatus prüfen
promptvault install        # native PromptVault-App installieren
promptvault launch         # installierte App starten
promptvault update         # auf App-Updates prüfen (und installieren)
promptvault diagnostics    # Diagnose-/Observability-Status
promptvault uninstall      # native App entfernen (Vault-Daten bleiben erhalten)
```

### `doctor`

Prüft CLI-Version, Python-Version, OS, Architektur, Plattform-Tag, Installationsort der nativen App, vorhandenes Executable sowie den `uv`-Tool-Pfad. Gibt eine `PASS`/`FAIL`/`WARN`-Übersicht aus.

### `install`

Nur Windows. Löst das native Artefakt über ein Release-Manifest auf (`promptvault-release-manifest.json`, per `PROMPTVAULT_MANIFEST` oder CWD/`~/.promptvault/`), verifiziert **SHA-256 und Größe fail-closed** und führt den NSIS-Installer still (`/S`) aus. Bei Integritätsfehlern wird der Installer mit `STOP_ARTIFACT_INTEGRITY_FAILED` abgebrochen.

### `launch`

Startet das installierte native Executable und erkennt einen sofortigen Crash (frühes Exit).

### `update`

Vergleicht die installierte native App-Version (`~/.promptvault/installed-version.txt`) mit dem Release-Manifest; ohne lokales Manifest wird die GitHub-Releases-API **read-only** abgefragt. Bei verfügbarem Update läuft derselbe verifizierte Install-Pfad.

### `diagnostics`

Verweist auf den **Admin Observability**-Modus in der App selbst (Settings → Admin Observability → ON → 🔍) und listet lokal exportierte Diagnose-Dateien (`promptvault-diagnostics-*.json` in Downloads/Documents) auf.

### `uninstall`

Entfernt die native App über ihren Uninstaller (oder das Installationsverzeichnis). **Vault-Daten (Prompt-Dateien, Analysen) bleiben erhalten.** Die CLI selbst wird dabei nicht entfernt.

---

## CLI vs. Native App — Trennung

| Aktion | Befehl |
|---|---|
| CLI-Paket upgraden | `uv tool upgrade promptvault-cli` |
| Native App aktualisieren | `promptvault update` |
| CLI-Paket entfernen | `uv tool uninstall promptvault-cli` |
| Native App entfernen (Daten bleiben) | `promptvault uninstall` |

Beispiel für vollständige Deinstallation:

```bash
# 1. Native App entfernen (Vault-Daten bleiben erhalten)
promptvault uninstall

# 2. CLI-Paket entfernen
uv tool uninstall promptvault-cli
```

---

## Integrität & Sicherheit

- **SHA-256 + Größen-Verifikation** vor jeder Installation, fail-closed.
- Keine Shell-Interpolation, kein `sh -c`/`bash -c` — das Artefakt wird als fester Dateipfad ausgeführt.
- `update` greift nur **read-only** auf die GitHub-Releases-API zu (kein automatischer Download im CLI-Pfad ohne lokales Manifest).

---

## Hinweis zum Windows-Artefakt

Das Repository liefert ein Beispiel-Release-Manifest (`tools/promptvault-cli/promptvault-release-manifest.json`), das auf einen Windows-x64-NSIS-Installer (`PromptVault Lite_1.8.0_x64-setup.exe`) verweist. Das **v1.8.0-GitHub-Release enthält derzeit nur Linux-Artefakte** (`.deb`, `.rpm`, `SHA256SUMS.txt`) — ein öffentliches Windows-Installer-Artefakt für den CLI-Install-Pfad ist noch nicht veröffentlicht. Die Install-Logik ist implementiert und fail-closed; die end-to-end-Veröffentlichung eines Windows-Artefakts bleibt ein separater Release-Schritt.
