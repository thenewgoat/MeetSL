# MeetSL

Real-time meeting accessibility bridge that translates sign language to text/speech and speech to text, designed for online meetings and interviews.

Built on [AiSL](https://github.com/Vinny0712/AiSL) and refactored for live streaming.

## How It Works

1. Webcam frames stream to the backend over WebSocket at ~10 fps
2. MediaPipe Gesture Recognizer runs inference on each frame
3. Predictions are sent back to the client with token + confidence
4. Client-side commit logic stabilizes output (rolling window) to prevent jitter
5. Committed signs appear as captions; hypotheses show as live previews

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Sign Recognition | MediaPipe Gesture Recognizer |
| Speech-to-Text | Browser Web Speech API (planned) |
| Text-to-Speech | Google TTS / browser TTS (planned) |
| Transport | WebSocket |

## Prerequisites

- Python 3.12+
- Node.js 18+
- Yarn

## Quick Start

### Backend

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cd app
uvicorn main:app --reload
```

The backend runs on http://localhost:8000. Verify with:

```bash
curl http://localhost:8000/healthz
# {"status":"ok"}
```

### Frontend

```bash
cd frontend
yarn
yarn dev
```

The frontend runs on http://localhost:3000.

### Use It

Open http://localhost:3000/session/demo in Chrome and grant webcam access.

- Green dot = connected to backend
- Perform signs in front of the camera
- Gray italic text = live hypothesis (unstable)
- Bold text with colored dots = committed recognition (stable)

## Recognized Vocabulary

The model (`gesture_recognizer_9.task`) recognizes 50 ASL signs trained on WLASL. Meeting-relevant signs include:

**yes, no, help, call, check, go, change, what, who, why, take, play, cool, computer, family, mother, brother, woman, man**

Full list: before, thin, cool, drink, go, computer, who, cousin, help, candy, thanksgiving, bed, bowling, tall, accident, short, trade, yes, what, later, man, shirt, change, corn, dark, last, pizza, basketball, call, cold, deaf, no, walk, mother, woman, dog, family, apple, play, letter, thursday, bar, brother, check, laugh, room, take, why, example, far

## Commit Logic

The client prevents jitter with a rolling-window algorithm:

- **Window size:** 10 predictions
- **Stability threshold:** Same token in 6+ of last 10
- **Confidence threshold:** Average confidence >= 0.7
- **Cooldown:** 1.5s between commits
- **Dedup:** Consecutive identical commits are suppressed

## API

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Health check |
| `WS /ws/session/{sessionId}` | Frame streaming + sign predictions |
| `POST /tts` | Text-to-speech (planned) |
| `POST /llm/suggest` | LLM assist mode (planned) |

### WebSocket Messages

**Client -> Server (frame):**
```json
{ "type": "frame", "jpgBase64": "<base64>", "ts": 1234567890.123 }
```

**Server -> Client (prediction):**
```json
{ "type": "sign_pred", "token": "yes", "confidence": 0.92, "ts": 1234567890.123 }
```

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app + CORS
    routers/
      health.py          # GET /healthz
      session.py         # WS /ws/session/{sessionId}
      tts.py             # POST /tts (planned)
      llm.py             # POST /llm/suggest (planned)
    services/
      recognizer.py      # MediaPipe singleton + recognize_frame()
    schemas/
      ws_messages.py      # Pydantic models for WebSocket JSON
    models/
      gesture_recognizer_9.task  # MediaPipe model file
frontend/
  app/
    session/[sessionId]/
      page.tsx            # Server component wrapper
      SessionClient.tsx   # Main client component (wires hooks)
  hooks/
    useWebSocket.ts       # WebSocket with reconnect + backpressure
    useWebcam.ts          # Frame capture + throttling
    useCommitLogic.ts     # React state for commit logic
  lib/
    commitLogic.ts        # Pure commit evaluation function
docs/
  mvp.md                  # Full spec
  phase2-summary.md       # Current implementation status
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `NEXT_PUBLIC_WS_URL` | `ws://localhost:8000/ws/session` | WebSocket base URL |

## Current Status

**Phase 2 complete** — real-time sign recognition with streaming and commit logic.

- [x] WebSocket frame streaming
- [x] MediaPipe inference
- [x] Client-side commit/stabilization
- [x] Reconnect with exponential backoff
- [ ] Text-to-Speech (Phase 3)
- [ ] Speech-to-Text (Phase 3)
- [ ] LLM Assist Mode (Phase 4)
