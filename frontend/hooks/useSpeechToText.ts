"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export type STTError = "not-supported" | "not-allowed" | "no-speech" | null;

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

const TRANSCRIPT_MAX_LENGTH = 2000;

export function useSpeechToText() {
  const [enabled, setEnabled] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [interim, setInterim] = useState("");
  const [error, setError] = useState<STTError>(null);
  const recognitionRef = useRef<unknown>(null);
  const enabledRef = useRef(false);
  enabledRef.current = enabled;

  const supported =
    typeof window !== "undefined" &&
    ("webkitSpeechRecognition" in window || "SpeechRecognition" in window);

  const start = useCallback(() => {
    if (!supported) {
      setError("not-supported");
      return;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const SpeechRecognition = (window as any).webkitSpeechRecognition || (window as any).SpeechRecognition;
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
        setTranscript((prev) => {
          const next = prev ? prev + " " + finalText : finalText;
          return next.length > TRANSCRIPT_MAX_LENGTH
            ? next.slice(next.length - TRANSCRIPT_MAX_LENGTH)
            : next;
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
  }, [supported]);

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
    setTranscript("");
    setInterim("");
  }, []);

  return {
    enabled,
    toggle,
    transcript,
    interim,
    supported,
    error,
    clearTranscript,
  };
}
