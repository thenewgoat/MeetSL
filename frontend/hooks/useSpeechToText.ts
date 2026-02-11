"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTError = "not-supported" | "not-allowed" | "no-speech" | null;

export type CaptionSource = "user" | "other";

export interface CaptionSegment {
  text: string;
  source: CaptionSource;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

const MAX_SEGMENTS = 200;

interface UseSpeechToTextOptions {
  isTTSActive?: () => boolean;
}

export function useSpeechToText({ isTTSActive }: UseSpeechToTextOptions = {}) {
  const [enabled, setEnabled] = useState(false);
  const [segments, setSegments] = useState<CaptionSegment[]>([]);
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<STTError>(null);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<unknown>(null);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;
  const isTTSActiveRef = useRef(isTTSActive);
  isTTSActiveRef.current = isTTSActive;

  useEffect(() => {
    setSupported(
      "webkitSpeechRecognition" in window || "SpeechRecognition" in window,
    );
  }, []);

  const start = useCallback(() => {
    // Check support at call time to avoid stale closure over `supported` state
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
    if (!SpeechRecognition) {
      setError("not-supported");
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let finalText = "";
      let interimText = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        if (result.isFinal) {
          finalText += result[0].transcript;
        } else {
          interimText += result[0].transcript;
        }
      }
      if (finalText) {
        const source: CaptionSource = isTTSActiveRef.current?.() ? "user" : "other";
        setSegments((prev) => {
          const next = [...prev, { text: finalText, source }];
          return next.length > MAX_SEGMENTS ? next.slice(next.length - MAX_SEGMENTS) : next;
        });
        setInterim("");
      } else {
        setInterim(interimText);
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "not-allowed") {
        setError("not-allowed");
        setEnabled(false);
      } else if (event.error === "no-speech") {
        // Silence detected — will auto-restart via onend
        setError(null);
      }
    };

    recognition.onend = () => {
      // Auto-restart if still enabled (Web Speech API stops after silence)
      if (enabledRef.current) {
        try {
          recognition.start();
        } catch {
          // Already started or other error — ignore
        }
      }
    };

    try {
      recognition.start();
      recognitionRef.current = recognition;
      setError(null);
    } catch {
      setError("not-supported");
    }
  }, []);

  const stop = useCallback(() => {
    const recognition = recognitionRef.current as { stop: () => void } | null;
    if (recognition) {
      recognition.stop();
      recognitionRef.current = null;
    }
    setInterim("");
  }, []);

  useEffect(() => {
    if (enabled) {
      start();
    } else {
      stop();
    }
    return stop;
  }, [enabled, start, stop]);

  const toggle = useCallback(() => {
    setEnabled((prev) => !prev);
  }, []);

  const clearTranscript = useCallback(() => {
    setSegments([]);
    setInterim("");
  }, []);

  // Plain text transcript for passing to LLM context
  const transcript = segments.map((s) => s.text).join(" ");

  return {
    enabled,
    toggle,
    segments,
    transcript,
    interim,
    supported,
    error,
    clearTranscript,
  };
}
