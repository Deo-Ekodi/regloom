FROM python:3.12-slim AS base
WORKDIR /app
RUN python -m venv /venv && /venv/bin/pip install --upgrade pip
COPY apps/synth-gen/requirements.txt .
RUN /venv/bin/pip install --no-cache-dir -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=base /venv /venv
ENV PATH="/venv/bin:$PATH"
COPY apps/synth-gen .
CMD ["python", "main.py"]
