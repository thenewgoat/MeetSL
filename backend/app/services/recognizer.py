import base64
import io
import logging
from pathlib import Path

import mediapipe as mp
import numpy as np
from mediapipe.tasks import python
from mediapipe.tasks.python import vision
from PIL import Image

logger = logging.getLogger(__name__)

_MODEL_DIR = Path(__file__).resolve().parent.parent / "models"
MODEL_PATH = _MODEL_DIR / "gesture_recognizer_9.task"

_recognizer: vision.GestureRecognizer | None = None


def get_recognizer() -> vision.GestureRecognizer:
    """Lazy-load the MediaPipe gesture recognizer as a singleton."""
    global _recognizer
    if _recognizer is not None:
        return _recognizer

    if not MODEL_PATH.exists():
        raise FileNotFoundError(f"Model file not found: {MODEL_PATH}")

    base_options = python.BaseOptions(model_asset_path=str(MODEL_PATH))
    options = vision.GestureRecognizerOptions(base_options=base_options)
    _recognizer = vision.GestureRecognizer.create_from_options(options)
    logger.info("MediaPipe GestureRecognizer loaded from %s", MODEL_PATH)
    return _recognizer


def recognize_frame(jpg_base64: str) -> tuple[str, float] | None:
    """Run gesture recognition on a base64-encoded JPEG frame.

    Returns (token, confidence) or None if no gesture detected.
    """
    recognizer = get_recognizer()

    raw = base64.b64decode(jpg_base64)
    pil_img = Image.open(io.BytesIO(raw)).convert("RGB")
    rgb_array = np.asarray(pil_img)

    mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=rgb_array)
    results = recognizer.recognize(mp_image)

    if not results.gestures:
        return None

    top = results.gestures[0][0]
    token, confidence = top.category_name, top.score

    # Filter out "None" class which MediaPipe uses for no-gesture
    if token.lower() == "none":
        return None

    return (token, confidence)
