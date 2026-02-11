"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export function useTTS() {
  const [enabled, setEnabled] = useState(false);
  const [supported, setSupported] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const lastSpokeAtRef = useRef(0);

  useEffect(() => {
    setSupported("speechSynthesis" in window);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !supported) return;

      // Cancel any in-progress speech to prevent queue buildup
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.onstart = () => {
        setIsSpeaking(true);
      };
      utterance.onend = () => {
        setIsSpeaking(false);
        lastSpokeAtRef.current = Date.now();
      };
      utterance.onerror = () => {
        setIsSpeaking(false);
        lastSpokeAtRef.current = Date.now();
      };
      window.speechSynthesis.speak(utterance);
    },
    [enabled, supported],
  );

  const toggle = useCallback(() => {
    setEnabled((prev) => {
      if (prev) {
        // Turning off — cancel any in-progress speech
        window.speechSynthesis?.cancel();
      }
      return !prev;
    });
  }, []);

  const spokeRecently = useCallback(
    (graceMs: number = 2000) =>
      isSpeaking || Date.now() - lastSpokeAtRef.current < graceMs,
    [isSpeaking],
  );

  return { speak, enabled, toggle, supported, isSpeaking, spokeRecently };
}
