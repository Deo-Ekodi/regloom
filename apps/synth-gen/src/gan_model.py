# apps/synth-gen/gan_model.py
# GAN-based synthetic data generation using CTGAN.
# Trains a Conditional GAN on tabular data to produce realistic synthetic samples.
# Handles mixed data types (continuous/categorical). Production-grade: Verbose training,
# configurable epochs/batch, error handling. Integrates with pipeline for weave step.

import pandas as pd
from ctgan import CTGANSynthesizer
from logger import logger

def generate_synth(real_data: pd.DataFrame, num_samples: int, epochs: int = 100, batch_size: int = 500) -> pd.DataFrame:
    """
    Generate synthetic data using CTGAN.

    Args:
        real_data: Input DataFrame with real data to train on.
        num_samples: Number of synthetic samples to generate.
        epochs: Training epochs for the model.
        batch_size: Batch size for training.

    Returns:
        Synthetic DataFrame with same columns as input.

    Raises:
        ValueError: If input data is empty or invalid.
        RuntimeError: If model training fails.
    """
    try:
        if real_data.empty:
            logger.warning("Empty DataFrame provided for synthesis")
            raise ValueError("Input data cannot be empty")

        logger.info("Starting CTGAN synthetic data generation", 
                    input_shape=real_data.shape, 
                    columns=list(real_data.columns), 
                    num_samples=num_samples, 
                    epochs=epochs, 
                    batch_size=batch_size)
        
        # Initialize CTGAN model
        model = CTGANSynthesizer(epochs=epochs, batch_size=batch_size, verbose=True)
        
        # Train model
        logger.debug("Fitting CTGAN model")
        model.fit(real_data)
        logger.debug("CTGAN model fitted successfully")
        
        # Generate synthetic data
        synth_data = model.sample(num_samples)
        logger.info("Synthetic data generation complete", synth_shape=synth_data.shape)
        
        # Basic validation: Same columns
        if set(synth_data.columns) != set(real_data.columns):
            logger.error("Synthetic data columns mismatch", 
                         real_columns=list(real_data.columns), 
                         synth_columns=list(synth_data.columns))
            raise RuntimeError("Generated data has mismatched columns")
        
        return synth_data
    
    except ValueError as ve:
        logger.error("Validation error in synthetic generation", exc_info=True)
        raise
    except Exception as e:
        logger.error("Unexpected error in synthetic generation", exc_info=True)
        raise RuntimeError("Failed to generate synthetic data") from e