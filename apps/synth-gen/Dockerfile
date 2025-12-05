# syntax=docker/dockerfile:1
# /apps/synth-gen/Dockerfile
#################################################################
# BASE – Shared OS environment
#################################################################
FROM python:3.12-slim AS base
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PATH="/usr/local/bin:${PATH}"

# ⚡ OPTIMIZATION: usage of sharing=locked prevents the "held by process 0" error
# We separate /var/cache/apt and /var/lib/apt to ensure total caching without corruption
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && \
    apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    git \
    build-essential \
    libpq-dev && \
    rm -f /etc/apt/apt.conf.d/docker-clean

    # Unify user with Node services (uid/gid 1000) for shared /logs perms
RUN addgroup --gid 1000 node && \
    adduser --uid 1000 --gid 1000 --disabled-password --gecos "" node

    # Create /logs with unified perms (helps if volume empty)
RUN mkdir -p /logs && \
    chown -R node:node /logs && \
    chmod -R 777 /logs
WORKDIR /app

#################################################################
# FETCHER – The Heavy Lifter (Cached & Offline)
#################################################################
FROM base AS fetcher

# Install poetry efficiently
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install poetry==2.2.1 && \
    poetry self add poetry-plugin-export && \
    poetry config virtualenvs.create false

    # Copy ONLY necessary files for dependency resolution
COPY --link apps/synth-gen/pyproject.toml apps/synth-gen/poetry.lock /app/apps/synth-gen/
WORKDIR /app/apps/synth-gen

# 1. Export requirements (fast)
RUN poetry export -f requirements.txt --without-hashes --with dev > /tmp/requirements-all.txt && \
    poetry export -f requirements.txt --without-hashes --only main > /tmp/requirements-prod.txt

# 2. Build Wheels (SAVES CPU LATER)
# This step utilizes CPU cores to compile C-extensions now, so we just "unzip" them later.
RUN --mount=type=cache,target=/root/.cache/pip \
    mkdir -p /wheelhouse && \
    pip wheel --wheel-dir=/wheelhouse -r /tmp/requirements-all.txt

#################################################################
# PROD IMAGE
#################################################################
FROM base AS prod
WORKDIR /app

# 1. Install Dependencies from Wheels (FAST & OFFLINE)
# We bind mount the wheelhouse so we don't actually copy the heavy tarballs, just install them.
RUN --mount=type=bind,from=fetcher,source=/wheelhouse,target=/wheelhouse \
    --mount=type=bind,from=fetcher,source=/tmp/requirements-prod.txt,target=/tmp/requirements.txt \
    pip install --no-index --find-links=/wheelhouse -r /tmp/requirements.txt


# 1B. Install spaCy model for Presidio (CACHED + SAFE)
RUN python -m spacy download en_core_web_lg
    
# 2. Copy Source Code
COPY --link apps/synth-gen /app

# 3. Permissions
# We set ownership to 'node' (unified uid 1000)
RUN chown -R node:node /app
USER node

# 4. Runtime Config
ENV PORT=4003
EXPOSE 4003
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
    CMD curl -f http://localhost:4003/health || exit 1
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003", "--workers", "4"]

#################################################################
# DEV IMAGE
#################################################################
FROM base AS dev

# Dev tooling (git, curl already in base, but ensuring robust dev env)
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    apt-get update && apt-get install -y --no-install-recommends \
    openssh-client \
    vim

# Install Poetry for dev interactions
RUN --mount=type=cache,target=/root/.cache/pip \
    pip install poetry==2.2.1
WORKDIR /app

# Install ALL dependencies (Dev + Prod) from Wheels
RUN --mount=type=bind,from=fetcher,source=/wheelhouse,target=/wheelhouse \
    --mount=type=bind,from=fetcher,source=/tmp/requirements-all.txt,target=/tmp/requirements.txt \
    pip install --no-index --find-links=/wheelhouse -r /tmp/requirements.txt

# Copy source (will be shadowed by volume in docker-compose, but exists for standalone run)
RUN python -m spacy download en_core_web_lg

COPY --link apps/synth-gen /app

# Ensure logs dir is writable by the user we switch to
RUN chown -R node:node /app /logs
USER node
EXPOSE 4003
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "4003", "--reload", "--log-level", "debug"]