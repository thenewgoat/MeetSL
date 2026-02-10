"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useWebSocket, ConnectionState } from "@/hooks/useWebSocket";
import { useWebcam } from "@/hooks/useWebcam";
import { useCommitLogic, CommittedToken } from "@/hooks/useCommitLogic";
import { useTTS } from "@/hooks/useTTS";
import { useSpeechToText } from "@/hooks/useSpeechToText";
import { useLLMSuggest, LLMSuggestion, TokenInput } from "@/hooks/useLLMSuggest";
import { Prediction } from "@/lib/commitLogic";

type Mode = "direct" | "assist";

const WS_URL =
  process.env.NEXT_PUBLIC_WS_URL ?? "ws://localhost:8000/ws/session";

interface SessionClientProps {
  sessionId: string;
}

function ConnectionBadge({ state }: { state: ConnectionState }) {
  const colors: Record<ConnectionState, string> = {
    connected: "bg-green-500",
    reconnecting: "bg-yellow-500",
    offline: "bg-red-500",
  };
  return (
    <div className="flex items-center gap-2 text-sm">
      <span className={`inline-block h-2.5 w-2.5 rounded-full ${colors[state]}`} />
      <span className="text-gray-300 capitalize">{state}</span>
    </div>
  );
}

function ConfidenceDot({ confidence }: { confidence: number }) {
  const color = confidence >= 0.85 ? "bg-green-400" : "bg-yellow-400";
  return (
    <span
      className={`inline-block h-2 w-2 rounded-full ${color}`}
      title={`${Math.round(confidence * 100)}%`}
    />
  );
}

function ToggleButton({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${
        active
          ? "bg-blue-600 text-white"
          : "bg-gray-800 text-gray-400 hover:bg-gray-700"
      } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
    >
      {label}
    </button>
  );
}

function UncertaintyBadge({ level }: { level: string }) {
  const colors: Record<string, string> = {
    low: "bg-green-600 text-green-100",
    medium: "bg-yellow-600 text-yellow-100",
    high: "bg-red-600 text-red-100",
  };
  return (
    <span
      className={`px-2 py-0.5 rounded text-xs font-medium ${colors[level] ?? colors.high}`}
    >
      {level}
    </span>
  );
}

function SuggestionPanel({
  suggestion,
  loading,
  onSpeak,
  onReject,
}: {
  suggestion: LLMSuggestion | null;
  loading: boolean;
  onSpeak: () => void;
  onReject: () => void;
}) {
  if (loading) {
    return (
      <div className="w-full max-w-2xl rounded-lg border border-blue-800 bg-blue-950/30 p-4 mb-4">
        <span className="text-xs text-blue-400 uppercase tracking-wider">
          Generating suggestion...
        </span>
      </div>
    );
  }
  if (!suggestion) return null;

  return (
    <div className="w-full max-w-2xl rounded-lg border border-blue-800 bg-blue-950/30 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xs text-blue-400 uppercase tracking-wider">
          Suggested
        </span>
        <UncertaintyBadge level={suggestion.uncertainty_level} />
      </div>
      <p className="text-lg font-semibold mb-2">{suggestion.suggested_text}</p>
      {suggestion.alternatives.length > 0 && (
        <p className="text-sm text-gray-400 mb-3">
          Alt: {suggestion.alternatives.join(" / ")}
        </p>
      )}
      {suggestion.needs_confirmation ? (
        <div className="flex gap-2">
          <button
            onClick={onSpeak}
            className="px-4 py-1.5 rounded bg-green-700 hover:bg-green-600 text-sm font-medium transition-colors"
          >
            Speak
          </button>
          <button
            onClick={onReject}
            className="px-4 py-1.5 rounded bg-gray-700 hover:bg-gray-600 text-sm font-medium transition-colors"
          >
            Reject
          </button>
        </div>
      ) : (
        <span className="text-xs text-green-500">Auto-spoken (low uncertainty)</span>
      )}
    </div>
  );
}

const ASSIST_TRIGGER_COUNT = 2; // Call LLM after every N committed tokens
const ASSIST_IDLE_MS = 3000; // Or after N ms idle since last commit

export default function SessionClient({ sessionId }: SessionClientProps) {
  const tts = useTTS();
  const stt = useSpeechToText();
  const llm = useLLMSuggest();

  // Assist mode state
  const [mode, setMode] = useState<Mode>("direct");
  const modeRef = useRef<Mode>("direct");
  modeRef.current = mode;
  const assistBufferRef = useRef<TokenInput[]>([]);
  const idleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dev metrics: latency tracking
  const pendingFramesRef = useRef<Map<number, number>>(new Map());
  const latencyStatsRef = useRef({ sum: 0, max: 0, count: 0 });
  const droppedRef = useRef(0);
  const statsLogRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [devStats, setDevStats] = useState({ fps: 0, latency: 0, dropped: 0 });

  // Start stats logger once
  if (process.env.NODE_ENV === "development" && !statsLogRef.current) {
    statsLogRef.current = setInterval(() => {
      const s = latencyStatsRef.current;
      const avgLatency = s.count > 0 ? Math.round(s.sum / s.count) : 0;
      const maxLatency = Math.round(s.max);
      const fps = (s.count / 5).toFixed(1);
      const dropped = droppedRef.current;
      console.log(
        `[MeetSL] latency: avg=${avgLatency}ms max=${maxLatency}ms | responses: ${s.count}/5s (${fps}/s) | drops: ${dropped}`,
      );
      setDevStats({ fps: parseFloat(fps), latency: avgLatency, dropped });
      latencyStatsRef.current = { sum: 0, max: 0, count: 0 };
      droppedRef.current = 0;
    }, 5000);
  }

  // Trigger LLM suggestion from buffered tokens
  const triggerSuggest = useCallback(() => {
    const tokens = assistBufferRef.current;
    if (tokens.length === 0) return;
    const snapshot = [...tokens];
    assistBufferRef.current = [];
    llm.suggest(
      snapshot,
      "meeting",
      stt.transcript ? stt.transcript.slice(-200) : undefined,
    ).then((result) => {
      if (result && !result.needs_confirmation && modeRef.current === "assist") {
        tts.speak(result.suggested_text);
      }
    });
  }, [llm.suggest, tts.speak, stt.transcript]);

  // Clean up idle timer on unmount
  useEffect(() => {
    return () => {
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
    };
  }, []);

  const onCommit = useCallback(
    (ct: CommittedToken) => {
      if (modeRef.current === "direct") {
        tts.speak(ct.token);
      } else {
        // Assist mode: buffer tokens, trigger LLM periodically
        assistBufferRef.current.push({
          token: ct.token,
          confidence: ct.confidence,
          ts: ct.ts,
        });

        // Clear existing idle timer
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

        // Trigger on count threshold
        if (assistBufferRef.current.length >= ASSIST_TRIGGER_COUNT) {
          triggerSuggest();
        } else {
          // Or trigger after idle period
          idleTimerRef.current = setTimeout(triggerSuggest, ASSIST_IDLE_MS);
        }
      }
    },
    [tts.speak, triggerSuggest],
  );

  const { hypothesis, committedTokens, addPrediction, clearCommitted } =
    useCommitLogic({ onCommit });

  const onMessage = useCallback(
    (data: unknown) => {
      const msg = data as { type?: string; token?: string; confidence?: number; ts?: number };
      if (msg.type === "sign_pred" && msg.token && msg.confidence != null && msg.ts != null) {
        // Track round-trip latency
        const sendTs = pendingFramesRef.current.get(msg.ts);
        if (sendTs != null) {
          const latency = Date.now() - sendTs;
          latencyStatsRef.current.sum += latency;
          latencyStatsRef.current.max = Math.max(latencyStatsRef.current.max, latency);
          latencyStatsRef.current.count++;
          pendingFramesRef.current.delete(msg.ts);
        }
        // Prune old pending entries (older than 10s)
        const cutoff = Date.now() - 10_000;
        pendingFramesRef.current.forEach((v, k) => {
          if (v < cutoff) pendingFramesRef.current.delete(k);
        });

        const pred: Prediction = {
          token: msg.token,
          confidence: msg.confidence,
          ts: msg.ts,
        };
        addPrediction(pred);
      }
    },
    [addPrediction],
  );

  const { connectionState, send } = useWebSocket({
    url: `${WS_URL}/${sessionId}`,
    onMessage,
  });

  const onFrame = useCallback(
    (jpgBase64: string, ts: number) => {
      const sent = send(
        JSON.stringify({
          type: "frame",
          jpgBase64,
          ts,
        }),
      );
      if (sent) {
        pendingFramesRef.current.set(ts, Date.now());
      } else {
        droppedRef.current++;
      }
    },
    [send],
  );

  const { videoRef, error: webcamError } = useWebcam({
    enabled: connectionState === "connected",
    onFrame,
  });

  const handleSpeak = useCallback(() => {
    if (llm.suggestion) {
      tts.speak(llm.suggestion.suggested_text);
      llm.clear();
    }
  }, [llm.suggestion, tts.speak, llm.clear]);

  const handleReject = useCallback(() => {
    llm.clear();
  }, [llm.clear]);

  const toggleMode = useCallback(() => {
    setMode((prev) => {
      const next = prev === "direct" ? "assist" : "direct";
      if (next === "direct") {
        // Switching back to direct: clear assist state
        assistBufferRef.current = [];
        if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
        llm.clear();
      }
      return next;
    });
  }, [llm.clear]);

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex w-full max-w-2xl items-center justify-between mb-4">
        <h1 className="text-2xl font-bold">MeetSL</h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono">{sessionId}</span>
          <ConnectionBadge state={connectionState} />
          {process.env.NODE_ENV === "development" && devStats.fps > 0 && (
            <span className="text-xs text-gray-600 font-mono">
              {devStats.fps}fps | {devStats.latency}ms
              {devStats.dropped > 0 && ` | ${devStats.dropped}drop`}
            </span>
          )}
        </div>
      </div>

      {/* Controls row */}
      <div className="flex w-full max-w-2xl items-center gap-3 mb-4">
        <ToggleButton
          label={mode === "direct" ? "Direct" : "Assist"}
          active={mode === "assist"}
          onClick={toggleMode}
        />
        <ToggleButton
          label={tts.enabled ? "Speaker ON" : "Speaker OFF"}
          active={tts.enabled}
          onClick={tts.toggle}
          disabled={!tts.supported}
        />
        <ToggleButton
          label={stt.enabled ? "Captions ON" : "Captions OFF"}
          active={stt.enabled}
          onClick={stt.toggle}
          disabled={!stt.supported}
        />
        {!tts.supported && (
          <span className="text-xs text-gray-600">TTS not supported</span>
        )}
        {!stt.supported && (
          <span className="text-xs text-gray-600">STT not supported</span>
        )}
      </div>

      {/* Webcam preview */}
      <div className="relative w-full max-w-2xl aspect-video bg-gray-900 rounded-lg overflow-hidden mb-6">
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="w-full h-full object-cover -scale-x-100"
        />
        {webcamError && (
          <div className="absolute inset-0 flex items-center justify-center bg-gray-900/80">
            <p className="text-red-400 text-sm">
              {webcamError === "not-allowed"
                ? "Camera access denied. Please allow camera permissions."
                : webcamError === "not-found"
                  ? "No camera found."
                  : "Camera error."}
            </p>
          </div>
        )}
      </div>

      {/* Hypothesis (live, unstable) */}
      <div className="w-full max-w-2xl mb-4 min-h-[2rem]">
        {hypothesis && (
          <p className="text-gray-400 text-lg">
            <span className="italic">{hypothesis.token}</span>
            <span className="text-xs text-gray-500 ml-2">
              {Math.round(hypothesis.confidence * 100)}%
            </span>
          </p>
        )}
      </div>

      {/* Committed sign captions */}
      <div className="w-full max-w-2xl rounded-lg border border-gray-700 p-4 min-h-[6rem] mb-4">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Recognized Signs
          </span>
          {committedTokens.length > 0 && (
            <button
              onClick={clearCommitted}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {committedTokens.length === 0 ? (
          <p className="text-gray-600 text-sm">
            Perform signs in front of the camera to see recognized text here.
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {committedTokens.map((ct: CommittedToken, i: number) => (
              <span
                key={`${ct.ts}-${i}`}
                className="inline-flex items-center gap-1.5 text-xl font-bold"
              >
                <ConfidenceDot confidence={ct.confidence} />
                {ct.token}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* LLM Suggestion panel (Assist mode only) */}
      {mode === "assist" && (
        <SuggestionPanel
          suggestion={llm.suggestion}
          loading={llm.loading}
          onSpeak={handleSpeak}
          onReject={handleReject}
        />
      )}

      {/* Speech-to-text captions */}
      <div className="w-full max-w-2xl rounded-lg border border-gray-700 p-4 min-h-[6rem]">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-gray-500 uppercase tracking-wider">
            Speech Captions
          </span>
          {stt.transcript && (
            <button
              onClick={stt.clearTranscript}
              className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
            >
              Clear
            </button>
          )}
        </div>
        {!stt.supported ? (
          <p className="text-gray-600 text-sm">
            Speech recognition is not supported in this browser. Please use Chrome.
          </p>
        ) : stt.error === "not-allowed" ? (
          <p className="text-red-400 text-sm">
            Microphone access denied. Please allow microphone permissions.
          </p>
        ) : !stt.enabled ? (
          <p className="text-gray-600 text-sm">
            Enable &quot;Captions&quot; to see speech-to-text here.
          </p>
        ) : (
          <p className="text-base leading-relaxed">
            <span className="text-white">{stt.transcript}</span>
            {stt.interim && (
              <span className="text-gray-400 italic"> {stt.interim}</span>
            )}
            {!stt.transcript && !stt.interim && (
              <span className="text-gray-600">Listening...</span>
            )}
          </p>
        )}
      </div>
    </main>
  );
}
