---
title: Deployment (Web/LAN)
description: promptvault-server in Docker/LXC mit NAS-Vault (Epic #97).
version: 1.13.2
last_updated: 2026-10-09
---

# Deployment — Web/LAN-Server (Epic #97)

Der `promptvault-server` macht die PromptVault-Funktionen (Scan, Analyse,
Favoriten, Export) über HTTP erreichbar — Read-only-Default, LAN-Bind nur
per Opt-in. Die Desktop-App bleibt unverändert offline.

## Architektur in Kürze

- `promptvault-core`: framework-freie Engine (kein Netzwerk)
- `promptvault-server`: axum-HTTP (dieses Deployment) + Auslieferung der
  gebauten Web-UI (same-origin, kein CORS)
- Frontend im Web-Modus: HTTP-Adapter (`src/lib/backend/httpAdapter.ts`)

## I1 — LXC-Setup (Proxmox-Beispiel, Issue #129)

1. Proxmox: LXC-Container (Debian 12) erstellen — 2 vCPU, 2 GB RAM,
   Disk ≥ 4 GB; **unprivilegiert** empfohlen.
2. Docker installieren (official convenience script oder apt-Repository).
3. Repository auf den Container bringen (git clone oder Artefakt-Upload).
4. Deployment: siehe H2 — `docker compose` aus `deploy/`.
5. Erreichbarkeit: `PROMPTVAULT_BIND` ist die **Host-seitige** Publish-
   Angabe — für LAN-Zugriff `127.0.0.1` durch die LAN-IP des Docker-Hosts
   ersetzen (oder Reverse-Proxy mit Auth für Fernzugriff vorziehen).

> **Bewusst außerhalb des Scopes:** konkrete Zugangsdaten, Container-IDs
> und IPs der Proxmox-Instanz des Owners (Issue #97 nennt Zieleinheiten —
> diese gehören in die lokale Umgebung, nie ins Repository).

## I2 — NAS-Mount (Issue #130)

- Mount-Prinzip: NAS-Freigabe **read-only** in den Docker-Host einhängen
  und per Volume (:ro) in den Container reichen — der Container kann damit
  strukturell nie schreiben (J2).
- Beispiel (Host): `mount -t cifs //NAS/share /mnt/nas/prompts -o ro,vers=3.0,credentials=/root/nas.cred`
  — Credentials-Datei ausschließlich auf dem Host, chmod 600, **nie im
  Repository**.
- NFS-Variante: `mount -t nfs -o ro nas:/export/prompts /mnt/nas/prompts`.
- Server-seitig ist der Schreibschutz doppelt abgesichert:
  `PROMPTVAULT_SERVER_READ_ONLY=1` (Default) blockiert Schreib-Endpunkte
  zusätzlich (J2-Tests: favorites/export → 403).
- Mapping in `deploy/.env`: `PROMPTVAULT_VAULT_HOST_PATH=/mnt/nas/prompts`.

## I3 — Deployment-README (Issue #131)

Kurzfassung für den Schnellstart:

```bash
git clone https://github.com/Mueller-Systems-Lab/promptvault-lite.git
cd promptvault-lite
cp deploy/.env.example deploy/.env   # Werte setzen
docker compose -f deploy/docker-compose.yml up -d
curl http://127.0.0.1:8080/api/health  # Default: Publish auf Host-Loopback
```

UI im Browser: `http://<CONTAINER_IP>:8080` (same-origin, kein CORS).

## Sicherheitsregeln (hart)

- Default-Bind `127.0.0.1`; `0.0.0.0` nur im Container (Port-Mapping steuert
  die Exposition).
- Read-only-Default; Write-Endpunkte 403 ohne explizite Freigabe.
- Keine Credentials im Repository; Traversal-/Symlink-Red-Tests (J1) grün.
- `scripts/security-gate.mjs` (J5) prüft diese Invarianten in CI.

## Sicherheitsgrenzen (bewusst, dokumentiert)

- **Keine Authentifizierung.** Der Server ist für ein vertrauenswürdiges LAN
  gedacht, nicht für WAN-Exposition. Für Fernzugriff einen Reverse-Proxy mit
  Auth vorziehen.
- **`POST /api/scan` ist auf konfigurierte Scan-Wurzeln beschränkt**
  (seit v1.13.2). Standard ist **Least Privilege: nur der konfigurierte Vault**
  (`PROMPTVAULT_SERVER_VAULT`), zusätzlich scanbar sind alle Verzeichnisse
  *unterhalb* dieser Wurzel. Der Operator kann die erlaubten Wurzeln explizit
  über `PROMPTVAULT_SERVER_SCAN_ROOTS` setzen (auf Unix `:`-getrennt, Windows
  `;`). **Die Liste ersetzt den Default, sie erweitert ihn nicht:** ist die
  Variable gesetzt und enthält den Vault nicht, ist der Vault selbst nicht mehr
  scanbar. Sie muss ihn also enthalten, z. B.
  `PROMPTVAULT_SERVER_SCAN_ROOTS=/vault:/opt/extra-prompts`.
  Mit dem Sonderwert `PROMPTVAULT_SERVER_SCAN_ROOTS=*` wird die Beschränkung
  bewusst abgeschaltet (uneingeschränktes Scannen — nur für einen
  vertrauenswürdigen Host).
  Ein Request außerhalb der erlaubten Wurzeln wird mit **HTTP 403** abgelehnt.
  Die Prüfung läuft auf dem **kanonischen** Pfad: ein Symlink, der eine erlaubte
  Wurzel verlässt, wird abgelehnt, obwohl seine Textform harmlos aussieht.
  Die erlaubten Wurzeln werden serverseitig geloggt, aber **nicht** an den
  Client zurückgemeldet.
- **`..`-Segmente und nicht existierende Pfade sind eine andere Fehlerklasse**
  als „nicht autorisiert": Syntax-/Existenzfehler ergeben **HTTP 400**, eine
  nicht freigegebene Wurzel ergibt **HTTP 403**. Path-Traversal und
  Wurzel-Autorisierung sind zwei verschiedene Probleme und werden auch so
  behandelt.
  **Im dokumentierten Container-Deployment** ist der Effekt ohnehin auf das
  Container-Dateisystem begrenzt (ein host-seitiger Pfad wie `/home/<user>` ist
  im Container nicht vorhanden und wird mit HTTP 400 abgelehnt); zusätzlich gilt
  die Wurzel-Beschränkung.
- **Vault-Schreibschutz** wird strukturell doppelt abgesichert: read-only
  gemountetes Volume (`:ro`) plus `PROMPTVAULT_SERVER_READ_ONLY=1` (Default).
