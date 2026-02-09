from pydantic import BaseModel


class FrameMessage(BaseModel):
    """Client -> Server: webcam frame for recognition."""
    type: str = "frame"
    jpgBase64: str
    ts: float


class SignPrediction(BaseModel):
    """Server -> Client: sign prediction result."""
    type: str = "sign_pred"
    token: str
    confidence: float
    ts: float
