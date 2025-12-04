# apps/synth-gen/anomaly_detector.py
# Anomaly detection for synthetic data: PII scanning and bias metrics.
# Uses Presidio for PII (e.g., emails, names) and Fairlearn/Sklearn for bias (demographic parity, mutual info).
# General-purpose: Scans text fields for PII, computes bias if sensitive/target cols provided.
# Production-grade: Handles missing cols gracefully, encodes data, thresholds for warnings.

import pandas as pd
from presidio_analyzer import AnalyzerEngine
from fairlearn.metrics import demographic_parity_difference
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mutual_info_score
from logger import logger
from typing import List, Dict, Any

def detect_pii(data: pd.DataFrame, language: str = "en", confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
    """
    Detect Personally Identifiable Information (PII) in the dataset using Presidio.

    Args:
        data: Input DataFrame to scan.
        language: Language for analysis (default: 'en').
        confidence_threshold: Minimum score for detection (0-1).

    Returns:
        List of detected PII with row, column, value, entities (type, score).

    Raises:
        RuntimeError: If analysis fails.
    """
    try:
        if data.empty:
            logger.debug("Empty DataFrame for PII detection, skipping")
            return []

        logger.info("Starting PII detection", shape=data.shape, language=language, threshold=confidence_threshold)
        
        analyzer = AnalyzerEngine()
        pii_detections: List[Dict[str, Any]] = []
        
        for col in data.columns:
            logger.debug("Scanning column for PII", column=col)
            for idx, value in data[col].items():
                if not isinstance(value, (str, bytes)) or pd.isna(value):
                    continue  # Skip non-text or NaN
                
                text = str(value)
                results = analyzer.analyze(text=text, language=language)
                detected = [(r.type, r.score) for r in results if r.score >= confidence_threshold]
                
                if detected:
                    pii_detections.append({
                        "row": idx,
                        "column": col,
                        "value": text,
                        "entities": detected
                    })
                    logger.debug("PII detected in cell", row=idx, column=col, entities=detected)
        
        logger.info("PII detection complete", num_detections=len(pii_detections))
        return pii_detections
    
    except Exception as e:
        logger.error("Error in PII detection", exc_info=True)
        raise RuntimeError("PII detection failed") from e

def detect_bias(data: pd.DataFrame, sensitive_cols: List[str], target_col: str | None = None) -> Dict[str, float]:
    """
    Detect potential bias using mutual information (proxy) and demographic parity (if target provided).

    Args:
        data: Input DataFrame.
        sensitive_cols: List of sensitive columns (e.g., ['gender', 'age']).
        target_col: Optional target for parity metrics (e.g., 'salary').

    Returns:
        Dict of bias scores (e.g., {'gender-age_mi': 0.2, 'gender-salary_dp': 0.1}).

    Raises:
        ValueError: If no sensitive cols or data issues.
        RuntimeError: If computation fails.
    """
    try:
        if data.empty or not sensitive_cols:
            logger.debug("Skipping bias detection: Empty data or no sensitive columns")
            return {}

        available_sensitive = [col for col in sensitive_cols if col in data.columns]
        if not available_sensitive:
            logger.warning("No sensitive columns found in data", requested=sensitive_cols, columns=list(data.columns))
            raise ValueError("No valid sensitive columns in data")

        logger.info("Starting bias detection", sensitive_cols=available_sensitive, target_col=target_col, shape=data.shape)
        
        # Copy and encode categoricals
        encoded_data = data.copy()
        encode_cols = available_sensitive + ([target_col] if target_col and target_col in data.columns else [])
        for col in encode_cols:
            if encoded_data[col].dtype == "object" or pd.api.types.is_categorical_dtype(encoded_data[col]):
                encoded_data[col] = LabelEncoder().fit_transform(encoded_data[col].astype(str).fillna("UNKNOWN"))
        
        bias_scores: Dict[str, float] = {}
        
        # Mutual information (proxy bias between sensitive and other cols)
        for sensitive in available_sensitive:
            for other_col in data.columns:
                if other_col != sensitive and other_col != target_col:
                    try:
                        score = mutual_info_score(encoded_data[sensitive], encoded_data[other_col])
                        bias_scores[f"{sensitive}-{other_col}_mi"] = score
                        logger.debug("Mutual info computed", pair=f"{sensitive}-{other_col}", score=score)
                    except ValueError as ve:
                        logger.debug("Skipping mutual info for pair due to data issue", pair=f"{sensitive}-{other_col}", error=str(ve))
        
        # Demographic parity if target provided and exists
        if target_col and target_col in data.columns:
            for sensitive in available_sensitive:
                try:
                    dp_score = demographic_parity_difference(
                        encoded_data[target_col],
                        encoded_data[sensitive],
                        sensitive_features=encoded_data[sensitive]
                    )
                    bias_scores[f"{sensitive}-{target_col}_dp"] = dp_score
                    logger.debug("Demographic parity computed", pair=f"{sensitive}-{target_col}", score=dp_score)
                except ValueError as ve:
                    logger.warning("Failed to compute demographic parity", pair=f"{sensitive}-{target_col}", error=str(ve))
        
        logger.info("Bias detection complete", num_scores=len(bias_scores))
        return bias_scores
    
    except ValueError as ve:
        logger.error("Validation error in bias detection", exc_info=True)
        raise
    except Exception as e:
        logger.error("Unexpected error in bias detection", exc_info=True)
        raise RuntimeError("Bias detection failed") from e