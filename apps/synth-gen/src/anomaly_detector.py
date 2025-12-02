import pandas as pd
from presidio_analyzer import AnalyzerEngine, PatternRecognizer
from fairlearn.metrics import demographic_parity_difference
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mutual_info_score
from logger import logger
from typing import List, Dict, Any

def detect_pii(data: pd.DataFrame, language: str = "en") -> List[Dict[str, Any]]:
    """
    Detect Personally Identifiable Information (PII) in the dataset using Presidio.
    
    Args:
        data: Input DataFrame to scan.
        language: Language for analysis (default: 'en').
    
    Returns:
        List of detected PII entities with column, value, and details.
    """
    try:
        logger.info("Starting PII detection", shape=data.shape)
        analyzer = AnalyzerEngine()
        pii_detections = []
        
        for col in data.columns:
            for idx, value in enumerate(data[col]):
                if not isinstance(value, str):
                    continue  # Skip non-text
                results = analyzer.analyze(text=str(value), language=language)
                if results:
                    pii_detections.append({
                        "row": idx,
                        "column": col,
                        "value": value,
                        "entities": [(r.type, r.score) for r in results]
                    })
        
        logger.info("PII detection complete", num_detections=len(pii_detections))
        return pii_detections
    except Exception as e:
        logger.error("Error in PII detection", exc_info=True)
        raise

def detect_bias(data: pd.DataFrame, sensitive_cols: List[str], target_col: str = None) -> Dict[str, float]:
    """
    Detect potential bias/anomalies using mutual information (for proxy bias) and demographic parity (if target provided).
    
    Args:
        data: Input DataFrame.
        sensitive_cols: List of sensitive attribute columns (e.g., ['gender', 'age_group']).
        target_col: Optional target column for supervised bias metrics.
    
    Returns:
        Dict of bias scores (e.g., {'gender-salary': 0.85}).
    """
    try:
        logger.info("Starting bias detection", sensitive_cols=sensitive_cols, target_col=target_col)
        bias_scores = {}
        
        # Encode categoricals for metrics
        encoded_data = data.copy()
        for col in sensitive_cols + ([target_col] if target_col else []):
            if encoded_data[col].dtype == "object":
                encoded_data[col] = LabelEncoder().fit_transform(encoded_data[col].astype(str))
        
        # Mutual info for proxy bias
        for sensitive in sensitive_cols:
            for other_col in data.columns:
                if other_col != sensitive and other_col != target_col:
                    score = mutual_info_score(encoded_data[sensitive], encoded_data[other_col])
                    bias_scores[f"{sensitive}-{other_col}_mi"] = score
        
        # Demographic parity if target provided
        if target_col:
            for sensitive in sensitive_cols:
                dp_score = demographic_parity_difference(
                    encoded_data[target_col],
                    encoded_data[sensitive],
                    sensitive_features=encoded_data[sensitive]
                )
                bias_scores[f"{sensitive}-{target_col}_dp"] = dp_score
        
        logger.info("Bias detection complete", num_scores=len(bias_scores))
        return bias_scores
    except Exception as e:
        logger.error("Error in bias detection", exc_info=True)
        raise