#!/usr/bin/env bash
# =============================================================================
# Docker-Smoke-Test (issue #128 / H3, epic #97)
# Baut das Image, startet den Server gegen ein temporäres Vault und prüft
# /api/health. Setzt eine lauffähige Docker-Runtime voraus.
# Usage: scripts/docker-smoke.sh [PORT]
# =============================================================================
set -euo pipefail

PORT="${1:-18080}"
SMOKE_DIR="$(mktemp -d)"
trap 'docker rm -f promptvault-smoke >/dev/null 2>&1 || true; rm -rf "$SMOKE_DIR"' EXIT

mkdir -p "$SMOKE_DIR/vault"
cat > "$SMOKE_DIR/vault/smoke.md" <<'MD'
---
title: "Smoke Fixture"
---
## Rolle
Smoke-Tester.
MD

echo "[smoke] building image..."
docker build -f deploy/Dockerfile -t promptvault-smoke .

echo "[smoke] starting container on :$PORT..."
docker run -d --name promptvault-smoke \
  -p "127.0.0.1:$PORT:8080" \
  -v "$SMOKE_DIR/vault:/vault:ro" \
  promptvault-smoke

for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then break; fi
  sleep 1
done

echo "[smoke] GET /api/health"
curl -fsS "http://127.0.0.1:$PORT/api/health"
echo

echo "[smoke] POST /api/scan (read-only volume)"
SCAN_OUT="$(curl -fsS -X POST "http://127.0.0.1:$PORT/api/scan" \
  -H 'content-type: application/json' \
  -d "{\"path\": \"/vault\"}")"
echo "$SCAN_OUT"
echo "$SCAN_OUT" | grep -q "Smoke Fixture" || {
  echo "[smoke] FAIL: Fixture nicht im Scan-Ergebnis"
  exit 1
}

echo "[smoke] PASS"
