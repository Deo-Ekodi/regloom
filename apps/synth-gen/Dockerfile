# BUILDER STAGE: Handle dependencies (cache layer)
FROM python:3.12-slim AS builder
WORKDIR /app
# Install build tools
RUN pip install poetry || pip install setuptools wheel
# Copy dependency files only
COPY apps/synth-gen/pyproject.toml /app/apps/synth-gen/
# Install dependencies from pyproject.toml (will succeed even if empty)
# Use a temporary directory to treat it as an installable package
WORKDIR /app/apps/synth-gen
RUN pip install --no-cache-dir .

# DEV STAGE: Full environment for development
FROM builder AS dev
WORKDIR /app
# Copy the entire workspace structure
COPY . . 
# Set environment variable for unbuffered output
ENV PYTHONUNBUFFERED=1
# Use a placeholder command, actual run command is in docker-compose.override.yml
CMD ["tail", "-f", "/dev/null"] 

# PROD STAGE: Minimal runtime (defined for completeness)
FROM dev AS prod
# FIX: Use tail -f /dev/null here as well, unless a proper server is implemented
CMD ["tail", "-f", "/dev/null"]
