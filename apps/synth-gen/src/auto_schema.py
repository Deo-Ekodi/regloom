# apps/synth-gen/src/auto_schema.py
from typing import Dict, Any
import pandas as pd
import numpy as np
import re

SENSITIVE_NAME_KEYWORDS = [
    "ssn", "social", "dob", "birth", "email", "phone", "mobile", "address",
    "name", "surname", "first_name", "last_name", "id", "passport", "tax"
]

PII_SIMPLE_REGEX = {
    "email": r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}",
    "phone": r"\+?\d{7,15}",
    "ssn": r"\d{3}-\d{2}-\d{4}"
}

def simple_name_sensitive(col: str) -> bool:
    n = col.lower()
    for k in SENSITIVE_NAME_KEYWORDS:
        if k in n:
            return True
    return False

def simple_regex_detect(text: str) -> bool:
    for _, pat in PII_SIMPLE_REGEX.items():
        if re.search(pat, text):
            return True
    return False

def profile_dataframe(df: pd.DataFrame, max_sample_rows: int = 5000) -> Dict[str, Any]:
    """
    Returns metadata per column used to auto-select models and hyperparams.
    """
    meta: Dict[str, Any] = {}
    nrows = len(df)
    sample_df = df if nrows <= max_sample_rows else df.sample(max_sample_rows, random_state=0)

    for col in df.columns:
        col_series = sample_df[col]
        non_null = col_series.dropna()
        nunique = int(non_null.nunique(dropna=True)) if len(non_null) > 0 else 0
        unique_frac = nunique / max(1, len(non_null))
        dtype = str(col_series.dtype)
        is_text = False
        is_categorical = False
        is_datetime = False

        try:
            # detect datetime
            if pd.api.types.is_datetime64_any_dtype(col_series):
                is_datetime = True
            else:
                # heuristic: many strings or mixed types
                if col_series.map(lambda x: isinstance(x, str)).mean() > 0.5:
                    is_text = True
                if col_series.map(lambda x: isinstance(x, (int, float, bool, np.number))).mean() > 0.6:
                    # numeric-like
                    is_text = False
                # cardinality => categorical if unique fraction small
                is_categorical = unique_frac < 0.05 or nunique < 50
        except Exception:
            pass

        # simple pii heuristics
        sensitive_by_name = simple_name_sensitive(col)
        sensitive_by_content = False
        if is_text and len(non_null) > 0:
            sample_text = non_null.astype(str).head(20).tolist()
            for txt in sample_text:
                if simple_regex_detect(txt):
                    sensitive_by_content = True
                    break

        # basic stats
        stats = {}
        if not non_null.empty:
            try:
                if not is_text and not is_datetime:
                    stats["mean"] = float(non_null.astype(float).mean())
                    stats["std"] = float(non_null.astype(float).std())
                    stats["min"] = float(non_null.astype(float).min())
                    stats["max"] = float(non_null.astype(float).max())
                stats["missing_frac"] = float(col_series.isna().mean())
            except Exception:
                stats["missing_frac"] = float(col_series.isna().mean())

        meta[col] = {
            "dtype": dtype,
            "nunique": nunique,
            "unique_frac": unique_frac,
            "is_text": bool(is_text),
            "is_categorical": bool(is_categorical),
            "is_datetime": bool(is_datetime),
            "sensitive_by_name": bool(sensitive_by_name),
            "sensitive_by_content": bool(sensitive_by_content),
            "stats": stats
        }

    summary = {
        "nrows": nrows,
        "ncols": df.shape[1],
        "columns": meta
    }
    return summary
