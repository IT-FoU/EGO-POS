#!/usr/bin/env bash
# Cloud Agent per-boot start script for EGO POS.
# Ensures the PostgreSQL cluster is running before terminals/dev server start.
set -euo pipefail

PG_VERSION=16

echo "[start] Starting PostgreSQL cluster ${PG_VERSION}/main..."
sudo pg_ctlcluster "${PG_VERSION}" main start 2>/dev/null || true

for _ in $(seq 1 30); do
  if sudo -u postgres pg_isready -q 2>/dev/null; then
    echo "[start] PostgreSQL is ready."
    exit 0
  fi
  sleep 1
done

echo "[start] WARNING: PostgreSQL did not report ready within timeout." >&2
exit 0
