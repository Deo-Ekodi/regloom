# apps/synth-gen/anomaly_detector.py
# Anomaly detection for synthetic data: PII scanning and bias metrics.
# Uses Presidio for PII (e.g., emails, names) and Fairlearn/Sklearn for bias (demographic parity, mutual info).
# General-purpose: Scans text fields for PII, computes bias if sensitive/target cols provided.
# Production-grade: Handles missing cols gracefully, encodes data, thresholds for warnings.

import pandas as pd
import numpy as np
from .logger import logger

# Try heavy libs
HAS_PRESIDIO = False
HAS_FAIRLEARN = False
try:
    from presidio_analyzer import AnalyzerEngine
    HAS_PRESIDIO = True
except Exception:
    logger.info("Presidio not installed; using lightweight PII heuristics")

try:
    from fairlearn.metrics import demographic_parity_difference
    HAS_FAIRLEARN = True
except Exception:
    logger.info("Fairlearn not installed; using mutual info heuristics")

from typing import List, Dict, Any
from sklearn.preprocessing import LabelEncoder
from sklearn.metrics import mutual_info_score
import re

SIMPLE_PII_PATTERNS = {
    "email": re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    "phone": re.compile(r"\+?\d{7,15}"),
    "ssn": re.compile(r"\d{3}-\d{2}-\d{4}")
}

def detect_pii(data: pd.DataFrame, language: str = "en", confidence_threshold: float = 0.5) -> List[Dict[str, Any]]:
    pii_detections: List[Dict[str, Any]] = []
    if data.empty:
        return pii_detections

    if HAS_PRESIDIO:
        try:
            engine = AnalyzerEngine()
            for col in data.columns:
                for idx, val in data[col].dropna().items():
                    if not isinstance(val, str):
                        continue
                    res = engine.analyze(text=val, language=language)
                    for r in res:
                        if getattr(r, "score", 1.0) >= confidence_threshold:
                            pii_detections.append({"row": int(idx), "column": col, "value": val, "entity": r.type, "score": getattr(r, "score", 1.0)})
            return pii_detections
        except Exception as e:
            logger.warning("Presidio detection failed, falling back", exc_info=True)

    # Lightweight regex fallback
    for col in data.columns:
        if data[col].dtype == object or data[col].dtype == "string":
            for idx, val in data[col].dropna().astype(str).items():
                for name, pat in SIMPLE_PII_PATTERNS.items():
                    if pat.search(val):
                        pii_detections.append({"row": int(idx), "column": col, "value": val, "entity": name, "score": 1.0})
                        break
    return pii_detections

def detect_bias(data: pd.DataFrame, sensitive_cols: List[str], target_col: str | None = None) -> Dict[str, float]:
    if data.empty or not sensitive_cols:
        return {}
    available = [c for c in sensitive_cols if c in data.columns]
    if not available:
        return {}

    results = {}
    try:
        # Encode needed columns
        enc = {}
        for c in available + ([target_col] if target_col and target_col in data.columns else []):
            if c is None or c not in data.columns:
                continue
            if data[c].dtype == object or data[c].dtype.name == "category":
                le = LabelEncoder()
                enc[c] = le.fit_transform(data[c].astype(str).fillna("UNKNOWN"))
            else:
                enc[c] = data[c].fillna(0).astype(float).values

        # mutual info between sensitive and others
        for s in available:
            for other in data.columns:
                if other == s:
                    continue
                try:
                    mi = mutual_info_score(enc[s], enc.get(other, data[other].astype(str)))
                    results[f"{s}-{other}_mi"] = float(mi)
                except Exception:
                    continue

        # demographic parity if possible
        if target_col and target_col in data.columns and HAS_FAIRLEARN:
            for s in available:
                try:
                    dp = demographic_parity_difference(enc[target_col], enc[s], sensitive_features=enc[s])
                    results[f"{s}-{target_col}_dp"] = float(dp)
                except Exception:
                    continue

    except Exception:
        logger.exception("Bias detection failed")
    return results
