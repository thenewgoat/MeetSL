"use client";

import { useCallback } from "react";
import { useWebSocket, ConnectionState } from "@/hooks/useWebSocket";
import { useWebcam } from "@/hooks/useWebcam";
import { useCommitLogic, CommittedToken } from "@/hooks/useCommitLogic";
import { Prediction } from "@/lib/commitLogic";

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

export default function SessionClient({ sessionId }: SessionClientProps) {
  const { hypothesis, committedTokens, addPrediction, clearCommitted } =
    useCommitLogic();

  const onMessage = useCallback(
    (data: unknown) => {
      const msg = data as { type?: string; token?: string; confidence?: number; ts?: number };
      if (msg.type === "sign_pred" && msg.token && msg.confidence != null && msg.ts != null) {
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
      send(
        JSON.stringify({
          type: "frame",
          jpgBase64,
          ts,
        }),
      );
    },
    [send],
  );

  const { videoRef, error: webcamError } = useWebcam({
    enabled: connectionState === "connected",
    onFrame,
  });

  return (
    <main className="flex min-h-screen flex-col items-center bg-gray-950 text-white p-6">
      {/* Header */}
      <div className="flex w-full max-w-2xl items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">MeetSL</h1>
        <div className="flex items-center gap-4">
          <span className="text-xs text-gray-500 font-mono">{sessionId}</span>
          <ConnectionBadge state={connectionState} />
        </div>
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

      {/* Committed captions */}
      <div className="w-full max-w-2xl rounded-lg border border-gray-700 p-4 min-h-[6rem]">
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
    </main>
  );
}
