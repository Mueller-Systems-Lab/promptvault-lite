# PromptVault CLI (uv tool)

> `promptvault` — lokaler Installer & Manager für die native PromptVault Desktop-App.

---

## Überblick

`promptvault-lite-manager` ist ein Python-CLI-Paket (Executable `promptvault`), das die **native PromptVault Lite Desktop-App** installiert, startet, aktualisiert und entfernt. Es ist als `uv`-Tool installierbar.

Zwei Ebenen sind strikt zu trennen:

| Werkzeug | Verwaltet |
|---|---|
| **uv tool** | das `promptvault-lite-manager`-Paket selbst (Installation/Upgrade/Deinstallation des CLI-Pakets) |
| **PromptVault CLI** (`promptvault`) | die **native PromptVault Desktop-App** |

---

## Publikationsstatus

- **GitHub Release / Tag `v1.9.0`:** `PUBLISHED` — Windows-x64-NSIS-Installer, Release-Manifest und `SHA256SUMS.txt`.
- **PyPI:** `NOT PUBLISHED` — `uv tool install promptvault-lite-manager` funktioniert **noch nicht** aus einem Package Index (Secure-Publish-Auth ausstehend).

Bis zur PyPI-Veröffentlichung wird das CLI-Paket aus einem **lokal gebauten Wheel** installiert (real verfügbarer und getesteter Weg):

```bash
cd tools/promptvault-cli
uv build
uv tool install ./dist/promptvault_lite_manager-1.9.0-py3-none-any.whl
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

Nur Windows. Löst das native Artefakt über das Release-Manifest auf. Das Manifest wird zuerst lokal gesucht (`PROMPTVAULT_MANIFEST` oder CWD/`~/.promptvault/`); fehlt es, wird es deterministisch vom GitHub-Release `v1.9.0` geladen (`promptvault-release-manifest.json`). Das Artefakt wird in einen kontrollierten Cache (`~/.promptvault/downloads/`) heruntergeladen, **SHA-256 und Größe fail-closed** verifiziert und dann still (`/S`) als NSIS-Installer ausgeführt. Bei Integritätsfehlern wird mit `STOP_ARTIFACT_INTEGRITY_FAILED` abgebrochen.

### `launch`

Startet das installierte native Executable und erkennt einen sofortigen Crash (frühes Exit).

### `update`

Vergleicht die installierte native App-Version (`~/.promptvault/installed-version.txt`) mit dem Release-Manifest (lokal oder vom GitHub-Release geladen). Bei verfügbarem Update läuft derselbe verifizierte Install-Pfad.

### `diagnostics`

Verweist auf den **Admin Observability**-Modus in der App selbst (Settings → Admin Observability → ON → 🔍) und listet lokal exportierte Diagnose-Dateien (`promptvault-diagnostics-*.json` in Downloads/Documents) auf.

### `uninstall`

Entfernt die native App über ihren Uninstaller (oder das Installationsverzeichnis). **Vault-Daten (Prompt-Dateien, Analysen) bleiben erhalten.** Die CLI selbst wird dabei nicht entfernt.

---

## CLI vs. Native App — Trennung

| Aktion | Befehl |
|---|---|
| CLI-Paket upgraden | `uv tool upgrade promptvault-lite-manager` |
| Native App aktualisieren | `promptvault update` |
| CLI-Paket entfernen | `uv tool uninstall promptvault-lite-manager` |
| Native App entfernen (Daten bleiben) | `promptvault uninstall` |

Beispiel für vollständige Deinstallation:

```bash
# 1. Native App entfernen (Vault-Daten bleiben erhalten)
promptvault uninstall

# 2. CLI-Paket entfernen
uv tool uninstall promptvault-lite-manager
```

---

## Integrität & Sicherheit

- **SHA-256 + Größen-Verifikation** vor jeder Installation, fail-closed.
- Installer-Typ ist eine strikte Allowlist (`nsis`/`msi`); unbekannte Typen werden abgelehnt.
- Keine Shell-Interpolation, kein `sh -c`/`bash -c` — das Artefakt wird als fester Dateipfad ausgeführt.
- Remote-Manifest und -Artefakt werden deterministisch vom GitHub-Release geladen und lokal verifiziert.

---

## Hinweis zum Windows-Artefakt

Das `v1.9.0`-GitHub-Release enthält den Windows-x64-NSIS-Installer (`PromptVault.Lite_1.9.0_x64-setup.exe`), das Release-Manifest und `SHA256SUMS.txt`. Der CLI-Install-Pfad (`promptvault install`) lädt dieses Manifest und Artefakt deterministisch und installiert nach erfolgreicher SHA-256-Verifikation.
