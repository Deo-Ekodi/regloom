import pandas as pd
from ctgan import CTGANSynthesizer
from logger import logger

def generate_synth(real_data: pd.DataFrame, num_samples: int, epochs: int = 100, batch_size: int = 500) -> pd.DataFrame:
    """
    Generate synthetic data using CTGAN (GAN for tabular data).
    
    Args:
        real_data: Input DataFrame with real data to train on.
        num_samples: Number of synthetic samples to generate.
        epochs: Training epochs for the model.
        batch_size: Batch size for training.
    
    Returns:
        Synthetic DataFrame.
    """
    try:
        logger.info("Starting CTGAN synthetic data generation", shape=real_data.shape, num_samples=num_samples, epochs=epochs)
        
        # Initialize and train CTGAN model
        model = CTGANSynthesizer(epochs=epochs, batch_size=batch_size, verbose=True)
        model.fit(real_data)
        
        # Generate synthetic data
        synth_data = model.sample(num_samples)
        
        logger.info("Synthetic data generation complete", synth_shape=synth_data.shape)
        return synth_data
    except Exception as e:
        logger.error("Error in synthetic data generation", exc_info=True)
        raise