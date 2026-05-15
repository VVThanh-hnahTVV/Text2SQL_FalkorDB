#!/bin/bash
set -eo pipefail


# Set default values if not set
FALKORDB_HOST="${FALKORDB_HOST:-localhost}"
# Default 6379 matches falkordb/falkordb and plain Redis; override FALKORDB_PORT if you use another port.
FALKORDB_PORT="${FALKORDB_PORT:-6379}"

# Ephemeral / writable dir (Render and minimal containers may restrict default Redis paths)
REDIS_DIR="${REDIS_DIR:-/tmp/queryweaver-redis}"
mkdir -p "$REDIS_DIR"

# Start FalkorDB (no "| cat" pipeline — with set -e, pipeline quirks can abort the script on some hosts).
# --save "" reduces background RDB pressure on small instances; --dir uses a guaranteed-writable path.
redis-server \
  --daemonize yes \
  --dir "$REDIS_DIR" \
  --dbfilename dump.rdb \
  --save "" \
  --appendonly no \
  --port "${FALKORDB_PORT}" \
  --loadmodule /var/lib/falkordb/bin/falkordb.so

# Wait until FalkorDB is ready
echo "Waiting for FalkorDB to start on $FALKORDB_HOST:$FALKORDB_PORT..."

for _ in $(seq 1 120); do
  if nc -z "$FALKORDB_HOST" "$FALKORDB_PORT" 2>/dev/null; then
    break
  fi
  sleep 0.25
done
if ! nc -z "$FALKORDB_HOST" "$FALKORDB_PORT" 2>/dev/null; then
  echo "FalkorDB did not become ready on $FALKORDB_HOST:$FALKORDB_PORT" >&2
  exit 1
fi


echo "FalkorDB is up - launching FastAPI..."
# Reload only when explicitly enabled (never default to "true" — ${VAR:-true} would enable reload when unset).
_fastapi_debug="${FASTAPI_DEBUG:-False}"
if [ "$_fastapi_debug" = "True" ] || [ "$_fastapi_debug" = "true" ] || [ "$_fastapi_debug" = "1" ]; then
  RELOAD_FLAG="--reload"
else
  RELOAD_FLAG=""
fi

echo "FalkorDB is up - launching FastAPI (uvicorn)..."
exec uvicorn api.index:app --host "${HOST:-0.0.0.0}" --port "${PORT:-5000}" $RELOAD_FLAG
