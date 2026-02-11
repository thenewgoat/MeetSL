# MeetSL

Real-time meeting accessibility bridge that translates sign language to text/speech and speech to text, designed for online meetings and interviews.

## Acknowledgments

Sign recognition model (`gesture_recognizer_9.task`) trained by [AiSL](https://github.com/Vinny0712/AiSL) on the [WLASL](https://dxli94.github.io/WLASL/) dataset. Used with permission.

## How It Works

1. Webcam frames stream to the backend over WebSocket at ~10 fps
2. MediaPipe Gesture Recognizer runs inference on each frame
3. Predictions are sent back to the client with token + confidence
4. Client-side commit logic stabilizes output (rolling window) to prevent jitter
5. Committed signs appear as captions; hypotheses show as live previews
6. **Direct Mode**: committed tokens are spoken immediately via browser TTS
7. **Assist Mode**: tokens are buffered and sent to GPT-4o-mini, which suggests fluent phrasing with uncertainty labeling — medium/high uncertainty requires user confirmation before speaking
8. Browser STT captures meeting audio as live captions, with source labeling (You / Other)

## Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14 + TypeScript + Tailwind CSS |
| Backend | FastAPI (Python) |
| Sign Recognition | MediaPipe Gesture Recognizer |
| Speech-to-Text | Browser Web Speech API |
| Text-to-Speech | Browser SpeechSynthesis (primary) / gTTS (fallback) |
| LLM Post-processor | OpenAI GPT-4o-mini (Assist Mode) |
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
uv run uvicorn main:app --reload
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

Open http://localhost:3000/session/demo in Chrome and grant webcam + microphone access.

- Green dot = connected to backend
- Perform signs in front of the camera
- Gray italic text = live hypothesis (unstable)
- Bold text with colored dots = committed recognition (stable)
- Toggle **Speaker** to hear committed signs via TTS
- Toggle **Captions** to see live speech-to-text from meeting audio
- Toggle **Direct / Assist** to switch between raw token output and LLM-assisted phrasing

## Recognized Vocabulary

The model (`gesture_recognizer_9.task`) recognizes 50 ASL signs trained on WLASL. Recognized signs include:

yes, no, help, call, check, go, change, what, who, why, take, play, cool, computer, family, mother, brother, woman, man, before, thin, cool, drink, go, computer, who, cousin, help, candy, thanksgiving, bed, bowling, tall, accident, short, trade, yes, what, later, man, shirt, change, corn, dark, last, pizza, basketball, call, cold, deaf, no, walk, mother, woman, dog, family, apple, play, letter, thursday, bar, brother, check, laugh, room, take, why, example, far

## Commit Logic

The client prevents jitter with a rolling-window algorithm:

- **Window size:** 10 predictions
- **Stability threshold:** Same token in 4+ of last 10
- **Confidence threshold:** Average confidence >= 0.5
- **Cooldown:** 1.5s between commits
- **Dedup:** Consecutive identical commits are suppressed

## API

| Endpoint | Description |
|----------|-------------|
| `GET /healthz` | Health check |
| `WS /ws/session/{sessionId}` | Frame streaming + sign predictions |
| `POST /tts` | Text-to-speech via gTTS |
| `POST /llm/suggest` | LLM-assisted phrasing (Assist Mode) |

### WebSocket Messages

**Client -> Server (frame):**
```json
{ "type": "frame", "jpgBase64": "<base64>", "ts": 1234567890.123 }
```

**Server -> Client (prediction):**
```json
{ "type": "sign_pred", "token": "yes", "confidence": 0.92, "ts": 1234567890.123 }
```

### LLM Suggest

**POST /llm/suggest:**
```json
{
  "tokens": [{ "token": "help", "confidence": 0.85, "ts": 1234567890 }],
  "domain": "meeting",
  "recent_speech_context": "Can you tell me about yourself?"
}
```

**Response:**
```json
{
  "suggested_text": "I need help",
  "uncertainty_level": "low",
  "alternatives": ["Help me please"],
  "needs_confirmation": false
}
```

## Project Structure

```
backend/
  app/
    main.py              # FastAPI app + CORS
    routers/
      health.py          # GET /healthz
      session.py         # WS /ws/session/{sessionId}
      tts.py             # POST /tts
      llm.py             # POST /llm/suggest
    services/
      recognizer.py      # MediaPipe singleton + recognize_frame()
      llm_service.py     # OpenAI GPT-4o-mini integration
    schemas/
      ws_messages.py     # Pydantic models for WebSocket JSON
      llm_suggest.py     # LLM request/response schemas
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
    useTTS.ts             # Browser SpeechSynthesis wrapper
    useSpeechToText.ts    # Browser Web Speech API (STT)
    useLLMSuggest.ts      # HTTP client for /llm/suggest
  lib/
    commitLogic.ts        # Pure commit evaluation function
docs/
  mvp.md                  # Full spec
  tech-stack.md           # Tech stack documentation
```

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `OPENAI_API_KEY` | Yes (for Assist Mode) | OpenAI API key |
| `NEXT_PUBLIC_WS_URL` | No | WebSocket base URL (auto-detected from window.location) |
| `NEXT_PUBLIC_API_URL` | No | Backend API base URL (auto-detected from window.location) |
