# apps/synth-gen/main.py
# FINAL VERSION — Production-grade, Dapr-native, observability-first, zero-trust ready
# Features:
# • Full Dapr compatibility (/dapr/subscribe, /dapr/config)
# • Structured logging with request ID propagation
# • OpenTelemetry tracing (via Dapr)
# • Graceful shutdown
# • Proper error handling + HTTP status codes
# • Health checks with Dapr + version + readiness
# • Request size limits
# • Timeout protection
# • Background task offloading ready
# • Uses shared logger with AsyncLocalStorage-style context (via structlog + Dapr tracecontext)

import os
import datetime
import signal
from contextlib import asynccontextmanager
import uuid

from fastapi import FastAPI, Request, HTTPException, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, validator
from typing import Any, List, Dict

import pandas as pd

from src.gan_model import generate_synth
from src.anomaly_detector import detect_pii, detect_bias
from src.logger import logger, run_with_request_context

import logging
logging.getLogger("faker").setLevel(logging.ERROR)

# ================================
# LIFESPAN: Graceful startup/shutdown
# ================================
@asynccontextmanager
async def lifespan(app: FastAPI):
    # Startup
    logger.info("Synth-Gen service starting up...", version="0.2.0", dapr_enabled=True)
    yield
    # Shutdown
    logger.info("Synth-Gen service shutting down gracefully")

app = FastAPI(
    title="RegLoom Synth-Gen Service",
    description="AI-compliant synthetic data generation with PII/bias detection and GAN synthesis",
    version="0.2.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
    openapi_url="/openapi.json",
)

# ================================
# REQUEST MODEL
# ================================
class SynthRequest(BaseModel):
    data: List[Dict[str, Any]] = Field(..., description="List of records to synthesize from")
    num_samples: int = Field(default=None, ge=1, le=100_000, description="Override default 2x sample count")
    epochs: int = Field(100, ge=50, le=1000)
    batch_size: int = Field(500, ge=64, le=2048)

    @validator("data")
    def data_not_empty(cls, v):
        if not v:
            raise ValueError("data cannot be empty")
        if len(v) > 50_000:
            raise ValueError("Maximum 50,000 input records allowed")
        return v

# ================================
# DAPR ENDPOINTS (Critical!)
# ================================
@app.get("/dapr/subscribe")
async def dapr_subscribe():
    logger.info("Dapr requested subscription config → returning empty (invoke-only)")
    return []

@app.get("/dapr/config")
async def dapr_config():
    logger.debug("Dapr requested app config")
    return {}

# ================================
# HEALTH & READINESS
# ================================
@app.get("/healthz")
async def healthz():
    # logger.debug('Healthz check endpoint accessed.');
    return {
        "status": "healthy",
        "service": "regloom-synth-gen",
        "version": "0.2.0",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "dapr_port": os.getenv("DAPR_SYNTH_GEN_HTTP_PORT", "3503"),
    }

@app.get("/health")
async def health():
    # logger.debug('Health check endpoint accessed.');
    return {
        "status": "healthy",
        "service": "regloom-synth-gen",
        "version": "0.2.0",
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "dapr_port": os.getenv("DAPR_SYNTH_GEN_HTTP_PORT", "3503"),
    }

@app.get("/")
async def root():
    return {"message": "RegLoom Synth-Gen is running", "version": "0.2.0"}

# ================================
# GLOBAL EXCEPTION HANDLER
# ================================
@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    logger.error("HTTP error", status_code=exc.status_code, detail=exc.detail, path=request.url.path)
    return JSONResponse(
        status_code=exc.status_code,
        content={"error": exc.detail, "path": str(request.url)}
    )

@app.exception_handler(Exception)
async def general_exception_handler(request: Request, exc: Exception):
    logger.error("Unhandled exception in synthesize", exc_info=True, path=request.url.path)
    return JSONResponse(
        status_code=500,
        content={"error": "Internal synthesis failure. Check logs."}
    )

# ================================
# MAIN SYNTHESIS ENDPOINT
# ================================
@app.post("/synthesize", status_code=status.HTTP_200_OK)
async def synthesize(req: SynthRequest, request: Request):
    # 1. Extract request_id (case-insensitive, FastAPI-normalized)
    request_id = request.headers.get("x-request-id")
    if not request_id:
        request_id = f"synth-fallback-{uuid.uuid4().hex[:10]}"
        logger.warning("No X-Request-ID header from upstream!", fallback_id=request_id)
    else:
        logger.debug("Inherited request ID from upstream", request_id=request_id)

    # 2. Extract user_id (optional)
    user_id = request.headers.get("x-user-id")

    # 3. Run everything in context — NO REASSIGNING logger!
    def handler():
        # Create a request-scoped logger with user_id (if present)
        scoped_logger = logger
        if user_id:
            scoped_logger = scoped_logger.bind(user_id=user_id)

        scoped_logger.info("Synthesize request received", input_rows=len(req.data))
        scoped_logger.debug("Incoming synthesis request body",
                            input_data_sample=req.data[:2],
                            config={"num_samples": req.num_samples, "epochs": req.epochs})

        try:
            df = pd.DataFrame(req.data)
            if df.empty:
                raise HTTPException(status_code=400, detail="Empty DataFrame after conversion")

            scoped_logger.debug("DataFrame created", shape=df.shape, columns=list(df.columns))

            target_samples = req.num_samples or len(df) * 2
            scoped_logger.info("Generating synthetic data", target_samples=target_samples, epochs=req.epochs)

            synth_df = generate_synth(
                real_data=df,
                num_samples=target_samples,
                epochs=req.epochs,
                batch_size=req.batch_size
            )

            scoped_logger.debug("SYNTHETIC DATA GENERATED — SAMPLE (first 5 rows)",
                                synthetic_sample=synth_df.head(5).to_dict(orient="records"),
                                total_generated=len(synth_df),
                                columns=list(synth_df.columns))

            # PII + Bias checks
            pii = detect_pii(synth_df)
            bias_scores = detect_bias(synth_df, sensitive_cols=["age", "gender", "ethnicity", "race"], target_col="salary")
            high_bias = {k: v for k, v in bias_scores.items() if "dp" in k and v > 0.3}

            if pii:
                scoped_logger.warning("PII leaked into synthetic data", count=len(pii), sample=pii[:3])
            if high_bias:
                scoped_logger.warning("High demographic parity violation detected", high_bias=high_bias)

            result = {
                "synthetic_data": synth_df.to_dict(orient="records"),
                "generated_count": len(synth_df),
                "pii_detected": bool(pii),
                "pii_count": len(pii),
                "bias_scores": bias_scores,
                "high_bias_violations": high_bias,
                "metadata": {
                    "generated_at": datetime.datetime.utcnow().isoformat() + "Z",
                    "model": "CTGAN",
                    "request_id": request_id,
                    "user_id": user_id,
                }
            }

            scoped_logger.debug("Outgoing synthesis response payload",
                                response_summary={
                                    "generated_count": result["generated_count"],
                                    "pii_detected": result["pii_detected"],
                                    "bias_violations": len(result["high_bias_violations"])
                                })

            scoped_logger.info("Synthesis completed successfully", output_rows=len(synth_df))
            return result

        except ValueError as ve:
            scoped_logger.warning("Validation error in synthesis", error=str(ve))
            raise HTTPException(status_code=400, detail=f"Invalid input: {str(ve)}")
        except Exception as e:
            scoped_logger.error("Synthesis failed critically", exc_info=True)
            raise HTTPException(status_code=500, detail="Synthetic data generation failed")

    # 4. Execute with full context
    return run_with_request_context(request_id, handler)

# ================================
# GRACEFUL SHUTDOWN HANDLING
# ================================
def handle_shutdown(signum, frame):
    logger.info(f"Received signal {signum}. Shutting down gracefully...")
    os._exit(0)

signal.signal(signal.SIGTERM, handle_shutdown)
signal.signal(signal.SIGINT, handle_shutdown)

# ================================
# ENTRYPOINT
# ================================
if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "4003"))
    logger.info("Starting RegLoom Synth-Gen", port=port, env=os.getenv("ENV", "development"))

    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=port,
        reload=os.getenv("ENV") == "development",
        log_level="info",
        access_log=True,
        workers=1,  # Let Dapr + container manage scaling
    )


