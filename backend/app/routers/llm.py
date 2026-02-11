"""LLM suggestion endpoint for Assist Mode."""

import logging

from fastapi import APIRouter, HTTPException
from schemas.llm_suggest import LLMSuggestRequest, LLMSuggestResponse
from services.llm_service import suggest

logger = logging.getLogger(__name__)

router = APIRouter()


@router.post("/llm/suggest", response_model=LLMSuggestResponse)
async def llm_suggest(req: LLMSuggestRequest) -> LLMSuggestResponse:
    """Suggest a fluent phrase from recognized sign tokens via LLM."""
    if not req.tokens:
        raise HTTPException(status_code=400, detail="At least one token is required")

    logger.info(
        "LLM suggest: domain=%s tokens=%d",
        req.domain,
        len(req.tokens),
    )

    try:
        result = await suggest(
            tokens=req.tokens,
            domain=req.domain,
            recent_speech_context=req.recent_speech_context,
        )
    except Exception:
        logger.exception("LLM suggest endpoint error")
        raise HTTPException(status_code=500, detail="LLM suggestion failed")

    logger.info(
        "LLM result: uncertainty=%s needs_confirmation=%s text=%r",
        result.uncertainty_level,
        result.needs_confirmation,
        result.suggested_text[:80],
    )

    return result
