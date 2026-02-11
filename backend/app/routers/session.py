"""WebSocket session endpoint for real-time sign recognition."""

import asyncio
import json
import logging
import re
import time

from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from schemas.ws_messages import FrameMessage, SignPrediction
from services.recognizer import recognize_frame

logger = logging.getLogger(__name__)

router = APIRouter()

SESSION_ID_RE = re.compile(r"^[a-zA-Z0-9\-]{1,64}$")
STATS_INTERVAL = 10  # Log latency stats every N frames


@router.websocket("/ws/session/{session_id}")
async def websocket_session(websocket: WebSocket, session_id: str) -> None:
    """Accept webcam frames and stream back sign predictions.

    Args:
        websocket: The WebSocket connection.
        session_id: Alphanumeric session identifier.
    """
    # Validate session_id before accepting
    if not SESSION_ID_RE.match(session_id):
        await websocket.accept()
        await websocket.close(code=4400, reason="Invalid session ID")
        return

    await websocket.accept()
    logger.info("WS connected: session=%s", session_id)

    frame_count = 0
    latency_window: list[float] = []

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

            frame_count += 1
            latency_window.append(elapsed_ms)

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

            # Periodic INFO logging every STATS_INTERVAL frames
            if frame_count % STATS_INTERVAL == 0:
                avg_ms = sum(latency_window) / len(latency_window)
                max_ms = max(latency_window)
                logger.info(
                    "session=%s frames=%d avg_latency=%.1fms max_latency=%.1fms",
                    session_id, frame_count, avg_ms, max_ms,
                )
                latency_window.clear()

    except WebSocketDisconnect:
        logger.info("WS disconnected: session=%s frames=%d", session_id, frame_count)
    except Exception:
        logger.exception("WS error: session=%s", session_id)
        await websocket.close(code=1011)
