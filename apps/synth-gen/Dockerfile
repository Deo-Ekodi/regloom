# Builder stage for dependencies (used in prod)
FROM python:3.12-slim AS builder

# Install build essentials for any native deps (e.g., TF might need)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ pkg-config libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app/apps/synth-gen

# Install poetry globally in builder
RUN pip install --no-cache-dir poetry==2.2.1

# Copy only dependency files for caching (paths relative to root context)
COPY apps/synth-gen/pyproject.toml apps/synth-gen/poetry.lock* /app/apps/synth-gen/

# Export to requirements.txt and install to /packages (avoids venv for slim prod image)
RUN poetry export -f requirements.txt --output requirements.txt --without dev --without-hashes && \
    pip install --no-cache-dir --target /packages -r requirements.txt

# Prod stage: Slim, no build tools
FROM python:3.12-slim AS prod

# Create /logs and set permissions (runs as nobody)
RUN mkdir -p /logs && \
    chown -R nobody:nogroup /logs && \
    chmod -R 777 /logs

WORKDIR /app/apps/synth-gen

# Copy installed packages from builder
COPY --from=builder /packages /usr/local/lib/python3.12/site-packages

# Copy source code (contents of apps/synth-gen from context)
COPY apps/synth-gen/. /app/apps/synth-gen/

# Env vars for Python
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/usr/local/lib/python3.12/site-packages/bin:${PATH}"

# Run as non-root
USER nobody

# Default command (override in compose for specific runs)
CMD ["python", "main.py"]

# Dev stage: Full dev tools, poetry install, hot reload ready
FROM python:3.12-slim AS dev

# Install build essentials for dev (e.g., native compiles)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential gcc g++ pkg-config libhdf5-dev \
    && rm -rf /var/lib/apt/lists/*

# Create /logs and set permissions
RUN mkdir -p /logs && \
    chown -R nobody:nogroup /logs && \
    chmod -R 777 /logs

WORKDIR /app/apps/synth-gen

# Install poetry globally
RUN pip install --no-cache-dir poetry==2.2.1

# Copy only deps files first (cache deps install if unchanged; paths from root context)
COPY apps/synth-gen/pyproject.toml apps/synth-gen/poetry.lock* /app/apps/synth-gen/

# Install deps with dev (caches if pyproject/lock unchanged; no venv for container consistency)
RUN poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --sync --with dev

# Now copy full project contents (volumes override in compose for hot reload; code changes don't bust deps cache)
COPY apps/synth-gen/. /app/apps/synth-gen/

# Env vars
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Run as non-root
USER nobody

# Keep alive for dev (override in compose if needed)
CMD ["tail", "-f", "/dev/null"]