"""Text-to-speech endpoint using Google TTS."""

import asyncio
import io
import logging

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from gtts import gTTS
from pydantic import BaseModel

logger = logging.getLogger(__name__)

router = APIRouter()


class TTSRequest(BaseModel):
    """Request body for the TTS endpoint."""

    text: str
    lang: str = "en"


def _generate_mp3(text: str, lang: str) -> io.BytesIO:
    """Generate an MP3 audio buffer from text using gTTS."""
    buf = io.BytesIO()
    tts = gTTS(text=text, lang=lang, slow=False)
    tts.write_to_fp(buf)
    buf.seek(0)
    return buf


@router.post("/tts")
async def text_to_speech(req: TTSRequest) -> StreamingResponse:
    """Convert text to speech and return an MP3 audio stream."""
    if not req.text.strip():
        raise HTTPException(status_code=400, detail="text must not be empty")

    try:
        buf = await asyncio.to_thread(_generate_mp3, req.text, req.lang)
    except Exception:
        logger.exception("TTS generation failed")
        raise HTTPException(status_code=500, detail="TTS generation failed")

    return StreamingResponse(buf, media_type="audio/mpeg")
