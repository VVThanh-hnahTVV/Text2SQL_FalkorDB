#!/bin/bash
set -e


# Set default values if not set
FALKORDB_HOST="${FALKORDB_HOST:-localhost}"
# Default 6379 matches falkordb/falkordb and plain Redis; override FALKORDB_PORT if you use another port.
FALKORDB_PORT="${FALKORDB_PORT:-6379}"

# Start FalkorDB Redis server in background (bind must match FALKORDB_PORT for nc below)
redis-server --port "${FALKORDB_PORT}" --loadmodule /var/lib/falkordb/bin/falkordb.so | cat &

# Wait until FalkorDB is ready
echo "Waiting for FalkorDB to start on $FALKORDB_HOST:$FALKORDB_PORT..."

while ! nc -z "$FALKORDB_HOST" "$FALKORDB_PORT"; do
  sleep 0.5
done


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
