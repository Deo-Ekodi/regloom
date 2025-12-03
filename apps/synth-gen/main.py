# /apps/synth-gen/main.py
import pandas as pd
from gan_model import generate_synth
from anomaly_detector import detect_pii, detect_bias
from logger import logger

if __name__ == "__main__":
    try:
        logger.info("Starting synth-gen service stub")
        
        # Mock real data for testing (replace with ingestion in full flow)
        mock_data = pd.DataFrame({
            "age": [25, 30, 35, 40, 45],
            "name": ["Alice Smith", "Bob Johnson", "Charlie Brown", "Dana White", "Eve Black"],
            "salary": [50000, 60000, 70000, 80000, 90000],
            "gender": ["F", "M", "M", "F", "F"],
            "email": ["alice@example.com", "bob@example.com", "charlie@example.com", "dana@example.com", "eve@example.com"]
        })
        
        # Generate synthetic data
        synth_data = generate_synth(mock_data, num_samples=20, epochs=50)
        
        # Detect anomalies (PII and bias)
        pii_results = detect_pii(synth_data)
        bias_results = detect_bias(synth_data, sensitive_cols=["age", "gender"], target_col="salary")
        
        # Log results (in full flow, integrate with weave/orchestration)
        logger.debug("Synthetic data sample", head=synth_data.head().to_dict())
        logger.info("Detected PII", results=pii_results)
        logger.info("Detected bias scores", scores=bias_results)
        
        logger.info("Synth-gen stub complete")
    except Exception as e:
        logger.critical("Fatal error in main", exc_info=True)