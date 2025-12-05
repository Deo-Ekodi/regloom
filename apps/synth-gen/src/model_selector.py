# apps/synth-gen/src/model_selector.py
from typing import Dict, Any, Tuple

def estimate_hyperparams(nrows: int, ncols: int) -> Dict[str, int]:
    """
    Very light rule-based hyperparam estimator.
    """
    # epochs: larger datasets need fewer epochs per-row; small datasets need more epochs
    base_epochs = 300
    if nrows < 500:
        epochs = min(2000, base_epochs * 2)
    elif nrows < 5000:
        epochs = min(1000, base_epochs)
    else:
        # for large datasets, fewer epochs but larger batches
        epochs = max(100, int(base_epochs * (5000 / max(5000, nrows))))
    # batch size heuristic
    if nrows < 1000:
        batch_size = 64
    elif nrows < 10_000:
        batch_size = 256
    else:
        batch_size = 1024

    # clamp
    epochs = max(50, min(epochs, 2000))
    batch_size = max(32, min(batch_size, 2048))

    return {"epochs": epochs, "batch_size": batch_size}

def pick_model(metadata: Dict[str, Any]) -> Tuple[str, str]:
    """
    Decide model family and a subtype string. Returns (family, reason).
    family ∈ {"ctgan","tvae","copula","gaussian_copula","tabtransformer"}
    """
    cols = metadata["columns"]
    nrows = metadata["nrows"]
    ncols = metadata["ncols"]

    text_cols = [c for c, m in cols.items() if m["is_text"]]
    high_card_cols = [c for c, m in cols.items() if m["nunique"] > max(50, 0.02 * nrows)]
    many_categoricals = sum(1 for c, m in cols.items() if m["is_categorical"])

    # Heuristics:
    if len(text_cols) >= max(1, 0.2 * ncols):
        return ("tvae", "text-heavy -> TVAE/embedding approach recommended")
    if nrows < 200:
        return ("gaussian_copula", "tiny dataset -> gaussian copula fallback (stable)")
    if many_categoricals > max(1, 0.3 * ncols):
        return ("ctgan", "many categoricals/high-cardinality -> CTGAN")
    if len(high_card_cols) > 0 and nrows < 20000:
        return ("ctgan", "high-cardinality categorical columns")
    # default
    return ("ctgan", "default: mixed types and balanced heuristics")
