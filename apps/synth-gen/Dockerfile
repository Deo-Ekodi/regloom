# BUILDER STAGE
FROM python:3.12-slim AS builder
WORKDIR /app

# Install poetry if needed (fallback to pip)
RUN pip install --no-cache-dir poetry || pip install --no-cache-dir setuptools wheel

# Copy pyproject.toml
COPY apps/synth-gen/pyproject.toml ./apps/synth-gen/
WORKDIR /app/apps/synth-gen
RUN pip install --no-cache-dir . || true  # ignore if no deps

# DEV STAGE — FULL WORKSPACE + LOGGING
FROM python:3.12-slim AS dev
WORKDIR /app

# Critical: Create /logs directory and allow writes
RUN mkdir -p /logs && \
    chown -R nobody:nogroup /logs && \
    chmod 777 /logs

# Use non-root user (standard in slim images)
USER nobody

# Copy full project
COPY --chown=nobody:nogroup . .

# Ensure Python output is unbuffered
ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1

# Keep container alive — command overridden by docker-compose
CMD ["tail", "-f", "/dev/null"]