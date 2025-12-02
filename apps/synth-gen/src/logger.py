import logging
import os
import structlog
from structlog.types import Processor

def setup_logger() -> structlog.BoundLogger:
    log_level_str = os.environ.get("LOG_LEVEL", "info").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)

    service_name = os.environ.get("SERVICE_NAME", "synth-gen")
    log_dir = os.environ.get("LOG_DIR", "/logs")
    is_dev = os.environ.get("NODE_ENV", "production") == "development"  # Align with Node env

    # Ensure log dir exists (container should have perms from Dockerfile)
    try:
        os.makedirs(log_dir, exist_ok=True)
    except OSError as e:
        print(f"Warning: Could not create log dir {log_dir}: {e}")

    filename = os.path.join(log_dir, f"{service_name}-regloom.log" if service_name else "regloom.log")

    # Processors for structlog (Winston-like: timestamp, label, errors, etc.)
    shared_processors: list[Processor] = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.stdlib.PositionalArgumentsFormatter(),
    ]

    if is_dev:
        shared_processors.append(structlog.dev.ConsoleRenderer(colors=True))
    else:
        shared_processors.append(structlog.processors.JSONRenderer())

    structlog.configure(
        processors=shared_processors,
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # Add file handler for persistent logging (JSON in prod)
    file_handler = logging.FileHandler(filename, mode="a")
    file_handler.setLevel(log_level)
    if not is_dev:
        file_handler.setFormatter(logging.Formatter("%(message)s"))  # Structlog handles JSON

    # Console handler (already handled by structlog)
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)

    # Root logger config
    logging.root.setLevel(log_level)
    logging.root.addHandler(file_handler)
    logging.root.addHandler(console_handler)

    logger = structlog.get_logger(service_name)
    logger.info("Logger initialized", mode="development" if is_dev else "production", level=log_level_str, log_file=filename)

    return logger

logger = setup_logger()