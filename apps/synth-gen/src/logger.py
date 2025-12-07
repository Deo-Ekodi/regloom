# apps/synth-gen/src/logger.py
# Structured logger for Synth-Gen using structlog + contextvars
# FULLY ALIGNED with Node.js Winston + AsyncLocalStorage behavior
# Features:
# • Automatic request_id injection (like AsyncLocalStorage)
# • Custom Renderer to match Node.js log format exactly (HH:mm:ss.SSS [SERVICE] ...)
# • JSON + file logging for production compatibility
# • Zero manual passing needed

import logging
import os
import structlog
from structlog.types import Processor
from contextvars import ContextVar
import uuid
import datetime

# ─────────────────────────────────────────────────────────────────────────────
# Global ContextVar — this is the Python equivalent of AsyncLocalStorage
# ─────────────────────────────────────────────────────────────────────────────
_request_context: ContextVar[dict] = ContextVar('request_context', default={})


def get_request_id() -> str:
    """Get current request ID or generate fallback"""
    ctx = _request_context.get()
    return ctx.get("request_id", f"unknown-{uuid.uuid4().hex[:8]}")


def get_context() -> dict:
    """Get full context (safe fallback)"""
    ctx = _request_context.get()
    if not ctx:
        ctx = {"request_id": f"fallback-{uuid.uuid4().hex[:8]}"}
        _request_context.set(ctx)
    return ctx


# ─────────────────────────────────────────────────────────────────────────────
# Structlog processor: injects request_id from context
# ─────────────────────────────────────────────────────────────────────────────
def inject_request_id(logger, method_name, event_dict):
    """Add request_id to every log entry"""
    request_id = get_request_id()
    event_dict["request_id"] = request_id
    return event_dict


# ─────────────────────────────────────────────────────────────────────────────
# CUSTOM RENDERER: Matches Node.js Format Exactly
# Format: 10:31:29.313 [SERVICE] info: [req-id] Message key=value...
# ─────────────────────────────────────────────────────────────────────────────
def node_style_renderer(logger, name, event_dict):
    # 1. Extract and Format Timestamp (from ISO to HH:mm:ss.SSS)
    timestamp = event_dict.pop("timestamp", "")
    if "T" in str(timestamp):
        # Parse ISO string manually to keep it fast: 2025-12-07T10:31:29.123456Z -> 10:31:29.123
        try:
            time_part = timestamp.split("T")[1].replace("Z", "")
            if "." in time_part:
                # Truncate to 3 decimal places (milliseconds)
                main, ms = time_part.split(".")
                timestamp = f"{main}.{ms[:3]}"
            else:
                timestamp = time_part
        except IndexError:
            pass # Keep original if parse fails

    # 2. Extract standard fields
    level = event_dict.pop("level", "").lower()
    event = event_dict.pop("event", "")
    request_id = event_dict.pop("request_id", None)
    
    # 3. Get Service Name
    service_name = os.environ.get("SERVICE_NAME", "synth-gen").upper()
    
    # 4. Format Request ID (Only show if present and not a generic fallback fallback-*)
    # Node logs: [45d833d6...] 
    req_id_str = ""
    if request_id and not str(request_id).startswith("fallback"):
        req_id_str = f"[{request_id}] "

    # 5. Format Remaining Keys (Contextual info)
    extras = ""
    if event_dict:
        extras = " " + " ".join(f"{k}={v}" for k, v in event_dict.items())

    # 6. Construct Final String
    # Output: 10:31:29.313 [SYNTH-GEN] info: [req-id] Message extras
    return f"{timestamp} [{service_name}] {level}: {req_id_str}{event}{extras}"


# ─────────────────────────────────────────────────────────────────────────────
# Setup logger
# ─────────────────────────────────────────────────────────────────────────────
def setup_logger() -> structlog.BoundLogger:
    log_level_str = os.environ.get("LOG_LEVEL", "info").upper()
    log_level = getattr(logging, log_level_str, logging.INFO)
    service_name = os.environ.get("SERVICE_NAME", "synth-gen")
    log_dir = os.environ.get("LOG_DIR", "/logs")
    is_dev = os.environ.get("NODE_ENV", "production") == "development"

    # Ensure log directory
    try:
        os.makedirs(log_dir, exist_ok=True)
    except OSError as e:
        print(f"Warning: Could not create log dir {log_dir}: {e}")

    filename = os.path.join(log_dir, f"{service_name}-regloom.log")

    # Shared processors (run for both console and file)
    shared_processors: list[Processor] = [
        structlog.stdlib.filter_by_level,
        structlog.stdlib.add_logger_name,
        structlog.stdlib.add_log_level,
        # We use ISO internally for files/JSON, the custom renderer slices it for console
        structlog.processors.TimeStamper(fmt="iso", utc=True), 
        structlog.processors.StackInfoRenderer(),
        structlog.processors.format_exc_info,
        structlog.processors.UnicodeDecoder(),
        structlog.stdlib.PositionalArgumentsFormatter(),
        inject_request_id,  # ← Inject ID from ContextVar
    ]

    # Decide on the final renderer based on environment
    final_renderer = None
    if is_dev:
        # Use our Custom Node-Style Renderer for Dev Console
        final_renderer = node_style_renderer
    else:
        # Use JSON for Production
        shared_processors.append(structlog.processors.dict_tracebacks)
        final_renderer = structlog.processors.JSONRenderer(sort_keys=True)

    # Configure Structlog
    structlog.configure(
        processors=shared_processors + [final_renderer],
        context_class=dict,
        logger_factory=structlog.stdlib.LoggerFactory(),
        wrapper_class=structlog.stdlib.BoundLogger,
        cache_logger_on_first_use=True,
    )

    # --- Stdlib Logging Configuration (Connects Structlog to Python Logging) ---
    
    # 1. File Handler (Always writes plain text or JSON depending on config, usually clean)
    file_handler = logging.FileHandler(filename, mode="a", encoding="utf-8")
    file_handler.setLevel(log_level)
    # We set a simple formatter because Structlog has already rendered the message string/json
    file_handler.setFormatter(logging.Formatter("%(message)s"))

    # 2. Console Handler
    console_handler = logging.StreamHandler()
    console_handler.setLevel(log_level)
    # Important: Set basic formatter, Structlog does the heavy lifting
    console_handler.setFormatter(logging.Formatter("%(message)s"))

    # 3. Root Logger
    root_logger = logging.getLogger()
    root_logger.setLevel(log_level)
    # Clear existing handlers to prevent double logging if uvicorn set them
    root_logger.handlers = [] 
    root_logger.addHandler(file_handler)
    root_logger.addHandler(console_handler)

    logger = structlog.get_logger(service_name)
    logger.info(
        "Logger initialized",
        mode="development" if is_dev else "production",
        level=log_level_str,
        log_file=filename
    )
    return logger


# ─────────────────────────────────────────────────────────────────────────────
# Helper: Run code with request context
# ─────────────────────────────────────────────────────────────────────────────
def run_with_request_context(request_id: str, func, *args, **kwargs):
    """Execute function with request_id context"""
    token = _request_context.set({"request_id": request_id})
    try:
        return func(*args, **kwargs)
    finally:
        _request_context.reset(token)


# ─────────────────────────────────────────────────────────────────────────────
# Initialize logger
# ─────────────────────────────────────────────────────────────────────────────
logger = setup_logger()

# Export helpers
__all__ = ["logger", "get_request_id", "run_with_request_context"]