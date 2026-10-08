#!/usr/bin/env bash
# =============================================================================
# Docker-Smoke-Test (issue #128 / H3, epic #97)
# Baut das Image, startet den Server gegen ein temporäres Vault und prüft
# /api/health. Setzt eine lauffähige Docker-Runtime voraus.
# Usage: scripts/docker-smoke.sh [PORT]
# =============================================================================
set -euo pipefail

PORT="${1:-18080}"
RUN_ID="$(date +%s)-$$"
IMAGE_NAME="promptvault-smoke-${RUN_ID}"
CONTAINER_NAME="promptvault-smoke-${RUN_ID}"
if docker container inspect "$CONTAINER_NAME" >/dev/null 2>&1 || docker image inspect "$IMAGE_NAME" >/dev/null 2>&1; then
  echo "[smoke] FAIL: task-scoped Docker name already exists; refusing to replace it" >&2
  exit 1
fi
SMOKE_DIR="$(mktemp -d)"
trap 'docker rm -f "$CONTAINER_NAME" >/dev/null 2>&1 || true; docker image rm "$IMAGE_NAME" >/dev/null 2>&1 || true; rm -rf "$SMOKE_DIR"' EXIT

mkdir -p "$SMOKE_DIR/vault"
chmod 755 "$SMOKE_DIR/vault"
cat > "$SMOKE_DIR/vault/smoke.md" <<'MD'
---
title: "Smoke Fixture"
---
## Rolle
Smoke-Tester.
MD
chmod 644 "$SMOKE_DIR/vault/smoke.md"

echo "[smoke] building image..."
docker build -f deploy/Dockerfile -t "$IMAGE_NAME" .

echo "[smoke] starting container on :$PORT..."
docker run -d --name "$CONTAINER_NAME" \
  -p "127.0.0.1:$PORT:8080" \
  -e PROMPTVAULT_SERVER_VAULT=/vault \
  -v "$SMOKE_DIR/vault:/vault:ro" \
  "$IMAGE_NAME"

HEALTHY=0
for i in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/api/health" >/dev/null 2>&1; then
    HEALTHY=1
    break
  fi
  sleep 1
done
if [[ "$HEALTHY" -ne 1 ]]; then
  docker logs "$CONTAINER_NAME" >&2
  echo "[smoke] FAIL: /api/health did not respond within 30 seconds"
  exit 1
fi

VAULT_WRITABLE="$(docker inspect "$CONTAINER_NAME" --format '{{range .Mounts}}{{if eq .Destination "/vault"}}{{.RW}}{{end}}{{end}}')"
[[ "$VAULT_WRITABLE" == "false" ]] || {
  echo "[smoke] FAIL: /vault mount is writable"
  exit 1
}

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
