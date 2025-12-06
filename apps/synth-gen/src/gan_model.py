# apps/synth-gen/src/gan_model.py
# GAN-based synthetic data generation using CTGAN.
# Trains a Conditional GAN on tabular data to produce realistic synthetic samples.
# Handles mixed data types (continuous/categorical). Production-grade: Verbose training,
# configurable epochs/batch, error handling. Integrates with pipeline for weave step.


# Updated: Add metadata-driven fitting (for future SDV/CTGAN if added). 
# Enhance gaussian fallback with PII anonymization (hash sensitive values). No new deps.

import logging
import math
import traceback
from typing import Optional, Dict, Any
import pandas as pd
import numpy as np
import hashlib  # Standard lib for hashing
from .logger import logger

# Local modules
from .auto_schema import profile_dataframe
from .model_selector import pick_model, estimate_hyperparams

# Try to import heavy libs, but gracefully fallback
HAS_CTG = False
HAS_SDV = False
HAS_TORCH = False
try:
    from ctgan import CTGAN
    HAS_CTG = True
except Exception:
    logger.warning("CTGAN not available; will use fallback strategies")

try:
    # sdv offers TVAE, GaussianCopula etc.
    import sdv
    from sdv.single_table import TVAESynthesizer, GaussianCopulaSynthesizer, CTGANSynthesizer  # Updated to new SDV API (assuming v1.0+ if installed)
    HAS_SDV = True
except Exception:
    logger.info("SDV not available; TVAE/Copula models disabled")

try:
    import torch
    HAS_TORCH = True
except Exception:
    pass

# Basic validator utils
from scipy.stats import ks_2samp
from sklearn.neighbors import NearestNeighbors

def _validate_similarity(real: pd.Series, synth: pd.Series) -> float:
    """Numeric validation: return ks p-value (1 means similar)."""
    try:
        r = real.dropna().astype(float)
        s = synth.dropna().astype(float)
        if len(r) < 2 or len(s) < 2:
            return 0.0
        stat = ks_2samp(r, s)
        return float(stat.pvalue)
    except Exception:
        return 0.0

def _duplicate_fraction(real_df: pd.DataFrame, synth_df: pd.DataFrame) -> float:
    """Return fraction of synthetic rows that exactly match a real row (privacy leak)."""
    try:
        # Hash rows for quick exact match
        real_hashes = set(pd.util.hash_pandas_object(real_df, index=False).values)
        synth_hashes = pd.util.hash_pandas_object(synth_df, index=False).values
        dup = sum(1 for h in synth_hashes if h in real_hashes)
        return dup / max(1, len(synth_hashes))
    except Exception:
        return 0.0

def _avg_nn_distance(real_df: pd.DataFrame, synth_df: pd.DataFrame, n_neighbors: int = 1) -> float:
    """Average nearest neighbor distance from synthetic rows into real rows (numeric subset)."""
    try:
        # Use numeric columns only for a conservative privacy check
        reals = real_df.select_dtypes(include=[np.number]).fillna(0).values
        synths = synth_df.select_dtypes(include=[np.number]).fillna(0).values
        if reals.shape[0] < 2 or synths.shape[0] < 1 or reals.shape[1] == 0:
            return float("inf")
        nbrs = NearestNeighbors(n_neighbors=min(n_neighbors, reals.shape[0])).fit(reals)
        dists, _ = nbrs.kneighbors(synths)
        return float(dists.mean())
    except Exception:
        return float("inf")

def _postprocess_dtypes(real_df: pd.DataFrame, synth_df: pd.DataFrame) -> pd.DataFrame:
    """Coerce synth columns to the same general dtypes as real_df."""
    out = synth_df.copy()
    for col in real_df.columns:
        if col not in out.columns:
            continue
        rd = real_df[col]
        if pd.api.types.is_integer_dtype(rd):
            try:
                out[col] = out[col].round().astype("Int64")
            except Exception:
                pass
        elif pd.api.types.is_float_dtype(rd):
            out[col] = pd.to_numeric(out[col], errors="coerce")
        elif pd.api.types.is_bool_dtype(rd):
            out[col] = out[col].astype(bool)
        else:
            out[col] = out[col].astype(str)
    return out

def _anonymize_sensitive(synth_df: pd.DataFrame, metadata: Dict[str, Any]) -> pd.DataFrame:
    """Pseudonymize sensitive columns (hash strings) to prevent PII leaks in fallbacks."""
    sensitive_cols = [col for col, m in metadata["columns"].items() if m["sensitive_by_name"] or m["sensitive_by_content"]]
    logger.info("Anonymizing sensitive columns to prevent leaks", sensitive_cols=sensitive_cols)
    for col in sensitive_cols:
        if synth_df[col].dtype == object or synth_df[col].dtype == "string":
            synth_df[col] = synth_df[col].astype(str).apply(lambda x: hashlib.sha256(x.encode()).hexdigest()[:16] if x else x)
    return synth_df

def generate_synth(real_data: pd.DataFrame, num_samples: int, epochs: int = 100, batch_size: int = 500) -> pd.DataFrame:
    """
    Orchestrator: auto-detect schema, choose model, train, sample, validate, fallback.
    Keeps the same signature as before.
    Updated: Use SDV metadata if available; anonymize on fallback.
    """
    try:
        if not isinstance(real_data, pd.DataFrame):
            raise ValueError("real_data must be a pandas DataFrame")

        if real_data.empty:
            raise ValueError("Input DataFrame cannot be empty")

        # Cap memory blowups
        num_samples = int(min(num_samples, max(10_000, len(real_data)*10)))

        logger.info("AutoSynth: profiling data")
        metadata = profile_dataframe(real_data)

        logger.info("AutoSynth: selecting model")
        family, reason = pick_model(metadata)
        logger.info("AutoSynth: picked model", model=family, reason=reason)

        # Estimate hyperparams tuned to size if user didn't pass large values
        est = estimate_hyperparams(metadata["nrows"], metadata["ncols"])
        # Respect user-provided epochs/batch_size if they are meaningful (>0)
        epochs = epochs or est["epochs"]
        batch_size = batch_size or est["batch_size"]
        # bound sanity
        epochs = max(10, min(epochs, 5000))
        batch_size = max(8, min(batch_size, 8192))

        logger.info("AutoSynth: hyperparams", epochs=epochs, batch_size=batch_size, samples=num_samples)

        synth_df = None
        last_error = None

        # Try model families in priority: selected family -> fallbacks
        candidates = []
        if family == "tvae":
            candidates = ["tvae", "ctgan", "gaussian_copula"]
        elif family == "ctgan":
            candidates = ["ctgan", "copula_gan", "gaussian_copula"]
        elif family == "copula" or family == "gaussian_copula":
            candidates = ["gaussian_copula", "ctgan"]
        else:
            candidates = [family, "ctgan", "gaussian_copula"]

        sdv_metadata = None
        if HAS_SDV:
            from sdv.metadata import SingleTableMetadata
            sdv_metadata = SingleTableMetadata()
            sdv_metadata.detect_from_dataframe(real_data)
            logger.debug("SDV metadata detected for model fitting")

        for cand in candidates:
            try:
                logger.info("AutoSynth: attempting candidate", candidate=cand)
                if cand == "ctgan":
                    if HAS_SDV:
                        model = CTGANSynthesizer(metadata=sdv_metadata, epochs=epochs, batch_size=batch_size)
                        model.fit(real_data)
                        synth_df = model.sample(num_samples)
                    elif HAS_CTG:
                        discrete = [col for col, m in metadata["columns"].items() if m["is_categorical"] or m["is_text"] or m["is_datetime"]]
                        model = CTGAN(epochs=epochs, batch_size=batch_size, verbose=True, discrete_columns=discrete)
                        model.fit(real_data)
                        synth_df = model.sample(num_samples)
                    else:
                        raise RuntimeError("CTGAN not available")
                elif cand == "tvae":
                    if HAS_SDV:
                        model = TVAESynthesizer(metadata=sdv_metadata, epochs=epochs, batch_size=batch_size)
                        model.fit(real_data)
                        synth_df = model.sample(num_samples)
                    else:
                        raise RuntimeError("TVAE not available")
                elif cand == "gaussian_copula":
                    if HAS_SDV:
                        model = GaussianCopulaSynthesizer(metadata=sdv_metadata)
                        model.fit(real_data)
                        synth_df = model.sample(num_samples)
                    else:
                        # fallback: simple resample with noise injection
                        logger.info("Fallback gaussian: resample + gaussian noise")
                        synth_df = real_data.sample(n=num_samples, replace=True).reset_index(drop=True)
                        # inject tiny Gaussian noise into numeric columns
                        for c in synth_df.select_dtypes(include=[np.number]).columns:
                            std = real_data[c].std() if real_data[c].std() > 0 else 1.0
                            noise = np.random.normal(scale=0.01*std, size=len(synth_df))
                            synth_df[c] = synth_df[c].astype(float) + noise
                        # Anonymize to prevent leaks
                        synth_df = _anonymize_sensitive(synth_df, metadata)
                else:
                    raise RuntimeError(f"Unknown candidate model {cand}")

                # If we produced a DataFrame, postprocess and validate
                if isinstance(synth_df, pd.DataFrame):
                    logger.info("AutoSynth: postprocessing types")
                    synth_df = _postprocess_dtypes(real_data, synth_df)

                    # Basic validation
                    logger.info("AutoSynth: validating similarity and privacy")
                    col_scores = {}
                    for col in real_data.select_dtypes(include=[np.number]).columns:
                        try:
                            pval = _validate_similarity(real_data[col], synth_df[col])
                            col_scores[col] = pval
                        except Exception:
                            col_scores[col] = 0.0
                    avg_pval = float(sum(col_scores.values()) / max(1, len(col_scores)))
                    dup_frac = _duplicate_fraction(real_data, synth_df)
                    avg_nn = _avg_nn_distance(real_data, synth_df)

                    logger.info("AutoSynth: validation results",
                                avg_numeric_pvalue=avg_pval,
                                duplicate_fraction=dup_frac,
                                avg_numeric_nn_distance=avg_nn)

                    # Accept or reject based on simple rules
                    if dup_frac > 0.01:
                        # too many exact duplicates -> privacy failure
                        raise RuntimeError(f"Privacy check failed: duplicate fraction {dup_frac:.4f}")
                    if avg_pval < 0.01 and family != "gaussian_copula":
                        # distributions are very different for numeric columns -> try fallback
                        raise RuntimeError(f"Low similarity (avg p={avg_pval:.4f}) for model {cand}")

                    # Success
                    logger.info("AutoSynth: candidate succeeded", candidate=cand)
                    return synth_df.reset_index(drop=True)

            except Exception as e:
                last_error = e
                logger.warning("AutoSynth: candidate failed", candidate=cand, error=str(e))
                # try next candidate
                continue

        # If reached here, no candidate produced acceptable results
        raise RuntimeError(f"All model candidates failed. last_error={last_error}")

    except Exception as e:
        logger.error("generate_synth failed", exc_info=True)
        raise RuntimeError("Synthetic generation failed") from e