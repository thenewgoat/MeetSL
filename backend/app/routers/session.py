import asyncio
import json
import logging
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from schemas.ws_messages import FrameMessage, SignPrediction
from services.recognizer import recognize_frame

logger = logging.getLogger(__name__)

router = APIRouter()


@router.websocket("/ws/session/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: str):
    await websocket.accept()
    logger.info("WS connected: session=%s", session_id)

    try:
        while True:
            raw = await websocket.receive_text()
            data = json.loads(raw)

            if data.get("type") != "frame":
                continue

            frame_msg = FrameMessage(**data)

            t0 = time.monotonic()
            result = await asyncio.to_thread(recognize_frame, frame_msg.jpgBase64)
            elapsed_ms = (time.monotonic() - t0) * 1000

            if result is not None:
                token, confidence = result
                pred = SignPrediction(
                    token=token,
                    confidence=round(confidence, 4),
                    ts=frame_msg.ts,
                )
                await websocket.send_text(pred.model_dump_json())
                logger.debug(
                    "session=%s token=%s conf=%.3f latency=%.1fms",
                    session_id, token, confidence, elapsed_ms,
                )
            else:
                logger.debug(
                    "session=%s no_gesture latency=%.1fms",
                    session_id, elapsed_ms,
                )

    except WebSocketDisconnect:
        logger.info("WS disconnected: session=%s", session_id)
    except Exception:
        logger.exception("WS error: session=%s", session_id)
        await websocket.close(code=1011)
