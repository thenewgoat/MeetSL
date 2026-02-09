from pydantic import BaseModel


class LLMSuggestRequest(BaseModel):
    """Input to /llm/suggest endpoint."""
    tokens: list[dict]  # [{ "token": str, "confidence": float, "ts": int }]
    domain: str = "meeting"  # "meeting" | "interview"
    recent_speech_context: str | None = None


class LLMSuggestResponse(BaseModel):
    """Output from /llm/suggest endpoint."""
    suggested_text: str
    uncertainty_level: str  # "low" | "medium" | "high"
    alternatives: list[str]
    needs_confirmation: bool
