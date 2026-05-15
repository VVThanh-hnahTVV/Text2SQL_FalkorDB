# =============================================================================
# QueryWeaver — FastAPI + Vite UI, runtime bundled with FalkorDB
# Build: docker build -t queryweaver .
# Run:  docker run --rm -p 5000:5000 -p 6379:6379 -e OPENAI_API_KEY=... queryweaver
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
    FALKORDB_PORT=6379 \
    FALKORDB_URL=redis://localhost:6379/0 \
    UV_SYSTEM_PYTHON=1 \
    PATH="/app/.venv/bin:$PATH"

USER root

# Install OS packages on a clean FalkorDB base *before* layering bookworm Python from
# python:3.12-bookworm; copying /usr/local first can break apt (unmet deps on Render, etc.).
RUN apt-get update \
    && apt-get install -f -y \
    && apt-get install -y --no-install-recommends \
        netcat-openbsd \
        ca-certificates \
        build-essential \
    && rm -rf /var/lib/apt/lists/*

COPY --from=python-base /usr/local /usr/local

RUN ln -sf /usr/local/bin/python3.12 /usr/bin/python3 \
    && ln -sf /usr/local/bin/python3.12 /usr/bin/python

WORKDIR /app

COPY --from=ghcr.io/astral-sh/uv:latest /uv /usr/local/bin/uv

COPY pyproject.toml uv.lock README.md ./
COPY api ./api
COPY --from=frontend /build/dist ./app/dist

RUN uv sync --frozen --no-dev

COPY start.sh /start.sh
# Strip CRLF if the file was saved on Windows — avoids "exec /start.sh: no such file or directory"
RUN sed -i 's/\r$//' /start.sh && chmod +x /start.sh

LABEL org.opencontainers.image.title="QueryWeaver" \
      org.opencontainers.image.description="Text-to-SQL with graph schema (FastAPI + React)"

EXPOSE 5000 6379

# Clear FalkorDB base CMD (redis-server …) so it is not appended as args to our entrypoint (Render/Docker
# would run: bash /start.sh redis-server --loadmodule … otherwise).
ENTRYPOINT ["/bin/bash", "/start.sh"]
CMD []
