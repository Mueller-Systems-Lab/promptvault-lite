---
title: Deployment (Web/LAN)
description: promptvault-server in Docker/LXC mit NAS-Vault (Epic #97).
version: 1.12.0
last_updated: 2026-10-01
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
5. Erreichbarkeit: Container-IP im LAN; Port nur intern freigeben
   (`PROMPTVAULT_BIND=127.0.0.1:8080` im Container-Port-Mapping ersetzen
   durch die Container-IP), Reverse-Proxy mit Auth für Fernzugriff.

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
curl http://<CONTAINER_IP>:8080/api/health
```

UI im Browser: `http://<CONTAINER_IP>:8080` (same-origin, kein CORS).

## Sicherheitsregeln (hart)

- Default-Bind `127.0.0.1`; `0.0.0.0` nur im Container (Port-Mapping steuert
  die Exposition).
- Read-only-Default; Write-Endpunkte 403 ohne explizite Freigabe.
- Keine Credentials im Repository; Traversal-/Symlink-Red-Tests (J1) grün.
- `scripts/security-gate.mjs` (J5) prüft diese Invarianten in CI.
