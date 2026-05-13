# =============================================================================
# QueryWeaver — FastAPI + Vite UI, runtime bundled with FalkorDB
# Build: docker build -t queryweaver .
# Run:  docker run --rm -p 5000:5000 -p 6380:6380 -e OPENAI_API_KEY=... queryweaver
# =============================================================================

# ---- Frontend (Vite 7 needs Node >= 20.19) ----
FROM node:22-bookworm-slim AS frontend
WORKDIR /build
COPY app/package.json app/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY app/ ./
RUN npm run build

# ---- CPython 3.12 (pyproject: requires-python >=3.12) ----
FROM python:3.12-bookworm AS python-base

# ---- Runtime: FalkorDB + app ----
FROM falkordb/falkordb:latest

ENV PYTHONUNBUFFERED=1 \
    FALKORDB_HOST=localhost \
    FALKORDB_PORT=6380 \
    FALKORDB_URL=redis://localhost:6380/0 \
    UV_SYSTEM_PYTHON=1 \
    PATH="/app/.venv/bin:$PATH"

USER root

COPY --from=python-base /usr/local /usr/local

RUN apt-get update && apt-get install -y --no-install-recommends \
    netcat-openbsd \
    ca-certificates \
    build-essential \
    && rm -rf /var/lib/apt/lists/* \
    && ln -sf /usr/local/bin/python3.12 /usr/bin/python3 \
    && ln -sf /usr/local/bin/python3.12 /usr/bin/python

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock README.md ./
COPY api ./api
COPY --from=frontend /build/dist ./app/dist

RUN uv sync --frozen --no-dev

COPY start.sh /start.sh
RUN chmod +x /start.sh

LABEL org.opencontainers.image.title="QueryWeaver" \
      org.opencontainers.image.description="Text-to-SQL with graph schema (FastAPI + React)"

EXPOSE 5000 6380

ENTRYPOINT ["/start.sh"]
