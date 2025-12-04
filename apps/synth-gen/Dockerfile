# # syntax=docker/dockerfile:1.7
# # BuildKit REQUIRED — this is nuclear-grade

# # ─────────────────────────────────────
# # Base: shared setup
# FROM python:3.12-slim AS base
# RUN apt-get update && apt-get install -y --no-install-recommends \
#     curl git ca-certificates \
#     && rm -rf /var/lib/apt/lists/*

# WORKDIR /app

# # Persistent cache dirs (survive reboots, CI, Railway)
# RUN mkdir -p /logs /root/.cache/pip /root/.cache/pypoetry && \
#     chown -R nobody:nogroup /logs /root/.cache

# # ─────────────────────────────────────
# # Fetcher: Download ALL deps ONCE — cached forever
# FROM base AS fetcher

# # 1. Install Poetry 2.x
# RUN pip install --no-cache-dir poetry==2.2.1

# # 2. CRITICAL FIX: Install the export plugin (Required for Poetry 2.x)
# RUN poetry self add poetry-plugin-export

# # 3. Max resilience settings
# RUN poetry config virtualenvs.create false && \
#     poetry config installer.max-workers 4 && \
#     poetry config installer.parallel true

# # Copy only lockfiles — this layer is cached forever if unchanged
# COPY apps/synth-gen/pyproject.toml apps/synth-gen/poetry.lock* ./apps/synth-gen/

# # ── PROD deps: cached forever, with retry logic
# # We use 'poetry export' to generate requirements.txt, then pip to install.
# # This is more robust against network timeouts than 'poetry install'.
# RUN --mount=type=cache,id=pip-cache,target=/root/.cache/pip \
#     --mount=type=cache,id=pypoetry-cache,target=/root/.cache/pypoetry \
#     cd apps/synth-gen && \
#     echo "Exporting prod requirements..." && \
#     poetry export -f requirements.txt --without-hashes --only main > /tmp/requirements-prod.txt && \
#     echo "Installing prod deps with retry..." && \
#     for i in 1 2 3; do \
#         pip install --no-cache-dir --timeout 100 --target=/install-prod -r /tmp/requirements-prod.txt && break || \
#         echo "Retry $i failed, waiting 10s..." && sleep 10; \
#     done

# # ── DEV deps: also cached forever
# RUN --mount=type=cache,id=pip-cache,target=/root/.cache/pip \
#     --mount=type=cache,id=pypoetry-cache,target=/root/.cache/pypoetry \
#     cd apps/synth-gen && \
#     echo "Exporting dev requirements..." && \
#     poetry export -f requirements.txt --without-hashes --with dev > /tmp/requirements-dev.txt && \
#     echo "Installing dev deps with retry..." && \
#     for i in 1 2 3; do \
#         pip install --no-cache-dir --timeout 100 --target=/install-dev -r /tmp/requirements-dev.txt && break || \
#         echo "Retry $i failed, waiting 10s..." && sleep 10; \
#     done

# # ─────────────────────────────────────
# # Prod image — tiny, offline, perfect
# FROM python:3.12-slim AS prod
# RUN mkdir -p /logs && chown -R nobody:nogroup /logs && chmod 777 /logs
# WORKDIR /app/apps/synth-gen

# # Copy ONLY prod packages
# COPY --from=fetcher /install-prod /usr/local/lib/python3.12/site-packages

# # Copy source
# COPY apps/synth-gen/. .

# ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
#     PATH="/usr/local/lib/python3.12/site-packages/bin:$PATH"

# USER nobody
# EXPOSE 4003
# HEALTHCHECK CMD curl -f http://localhost:4003/health || exit 1
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003"]

# # ─────────────────────────────────────
# # Dev image — hot reload, FULLY OFFLINE after first build
# FROM python:3.12-slim AS dev
# RUN apt-get update && apt-get install -y --no-install-recommends git curl && rm -rf /var/lib/apt/lists/*

# WORKDIR /app/apps/synth-gen

# # Copy ALL deps (prod + dev) from fetcher — 100% offline
# COPY --from=fetcher /install-dev /usr/local/lib/python3.12/site-packages

# # Note: Source code is NOT copied here because it is mounted via volume in docker-compose
# # But we allow copying it as a fallback
# COPY apps/synth-gen/. .

# ENV PYTHONUNBUFFERED=1 PYTHONDONTWRITEBYTECODE=1 \
#     PATH="/usr/local/lib/python3.12/site-packages/bin:$PATH"

# USER nobody
# EXPOSE 4003
# CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003", "--reload", "--log-level", "debug"]



# syntax=docker/dockerfile:1.7

###############################################################
# BASE (shared)
###############################################################
FROM python:3.12-slim AS base

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

RUN apt-get update && apt-get install -y --no-install-recommends \
    curl git ca-certificates && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

RUN mkdir -p /root/.cache/pip /root/.cache/pypoetry /logs && \
    chown -R nobody:nogroup /logs

###############################################################
# FETCHER (single download pass)
###############################################################
FROM base AS fetcher

# Install Poetry (build stage only)
RUN pip install --no-cache-dir poetry==2.2.1
RUN poetry self add poetry-plugin-export

RUN poetry config virtualenvs.create false && \
    poetry config installer.max-workers 6 && \
    poetry config installer.parallel true

# Copy lockfiles ONLY (max layer cache)
COPY apps/synth-gen/pyproject.toml apps/synth-gen/poetry.lock ./apps/synth-gen/

WORKDIR /app/apps/synth-gen

# ----- 1 EXPORT ONLY ONCE -----
RUN poetry export -f requirements.txt --without-hashes --with dev > /tmp/requirements-all.txt

# ----- SINGLE INSTALL -----
RUN --mount=type=cache,id=pip-cache,target=/root/.cache/pip \
    pip install --no-cache-dir --timeout 200 \
        --target=/install-all \
        -r /tmp/requirements-all.txt

# ----- SPLIT PROD -----
RUN mkdir -p /install-prod && \
    python - <<'EOF'
import pkgutil, shutil, pathlib

src = pathlib.Path("/install-all")
dst = pathlib.Path("/install-prod")

# dev packages to exclude
exclude = {
    "black","pytest","mypy","ruff"
}

for pkg in pkgutil.iter_modules([str(src)]):
    if pkg.name not in exclude:
        p = src / pkg.name
        dest = dst / pkg.name
        if p.is_dir():
            shutil.copytree(p, dest, dirs_exist_ok=True)
        else:
            shutil.copy2(p, dest)
EOF

###############################################################
# PROD IMAGE (no Poetry here)
###############################################################
FROM python:3.12-slim AS prod

RUN mkdir -p /logs && chmod 777 /logs
WORKDIR /app/apps/synth-gen

# Copy ONLY prod deps
COPY --from=fetcher /install-prod /usr/local/lib/python3.12/site-packages

# Copy source code
COPY apps/synth-gen/. .

USER nobody
EXPOSE 4003
HEALTHCHECK CMD curl -f http://localhost:4003/health || exit 1

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003"]

###############################################################
# DEV IMAGE (hot reload, fully offline)
###############################################################
FROM python:3.12-slim AS dev

RUN apt-get update && apt-get install -y --no-install-recommends git curl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/synth-gen

# Copy all deps (prod + dev)
COPY --from=fetcher /install-all /usr/local/lib/python3.12/site-packages

# Copy source (fallback — compose overrides it)
COPY apps/synth-gen/. .

USER nobody
EXPOSE 4003

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003", "--reload", "--log-level", "debug"]
