# apps/synth-gen/main.py
# Main entry point for the Synth-Gen microservice.
# Sets up a FastAPI server to expose endpoints for synthetic data generation.
# Integrates GAN-based synthesis with anomaly detection for PII and bias.
# Handles requests from the backend workflow, processes data, logs results,
# and returns synthetic datasets. Production-grade: Error handling, structured logging,
# health checks. Designed for Docker deployment with hot-reload in dev.

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
import pandas as pd
from gan_model import generate_synth
from anomaly_detector import detect_pii, detect_bias
from logger import logger  # Shared structured logger

app = FastAPI(title="RegLoom Synth-Gen", version="0.1.0")


class SynthRequest(BaseModel):
    data: list[dict[str, any]]  # Input data as list of records


@app.get("/health")
async def health():
    logger.debug("Health check endpoint called")
    return {
        "status": "healthy",
        "service": "regloom-synth-gen",
        "version": "0.1.0",
        "uptime": "N/A",  # Can add actual uptime if needed
        "timestamp": pd.Timestamp.now().isoformat(),
    }


@app.post("/synthesize")
async def synthesize(req: SynthRequest):
    logger.info("Synthesize endpoint called", input_records=len(req.data))
    try:
        if not req.data:
            logger.warning("Empty data provided for synthesis")
            raise HTTPException(status_code=400, detail="Input data cannot be empty")

        # Convert to DataFrame
        real_data = pd.DataFrame(req.data)
        logger.debug("Input data converted to DataFrame", shape=real_data.shape, columns=list(real_data.columns))

        # Generate synthetic data
        synth_data = generate_synth(real_data, num_samples=len(real_data) * 2)  # Example: 2x samples
        logger.info("Synthetic data generated", synth_shape=synth_data.shape)

        # Detect PII
        pii_results = detect_pii(synth_data)
        if pii_results:
            logger.warning("PII detected in synthetic data", num_detections=len(pii_results), details=pii_results)
        else:
            logger.info("No PII detected in synthetic data")

        # Detect bias (hardcode sensitive/target if present; customizable)
        sensitive_cols = [col for col in ["age", "gender"] if col in synth_data.columns]
        target_col = "salary" if "salary" in synth_data.columns else None
        if sensitive_cols and target_col:
            bias_results = detect_bias(synth_data, sensitive_cols=sensitive_cols, target_col=target_col)
            if any(score > 0.5 for score in bias_results.values()):  # Arbitrary threshold for warning
                logger.warning("Potential bias detected", scores=bias_results)
            else:
                logger.info("Bias detection results", scores=bias_results)
        else:
            logger.debug("Skipping bias detection: Missing sensitive/target columns", 
                         missing_sensitive=not sensitive_cols, missing_target=not target_col)

        # Return synthetic data as list of dicts
        return synth_data.to_dict(orient="records")

    except Exception as e:
        logger.error("Error in synthesize endpoint", exc_info=True)
        raise HTTPException(status_code=500, detail="Internal server error") from e


if __name__ == "__main__":
    import uvicorn
    logger.info("Starting Synth-Gen service")
    uvicorn.run("main:app", host="0.0.0.0", port=4003, reload=True, log_level="debug")