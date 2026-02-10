"use client";

import { useCallback, useRef, useState } from "react";

export function useTTS() {
  const [enabled, setEnabled] = useState(false);
  const supported =
    typeof window !== "undefined" && "speechSynthesis" in window;
  const speakingRef = useRef(false);

  const speak = useCallback(
    (text: string) => {
      if (!enabled || !supported) return;

      // Cancel any in-progress speech to prevent queue buildup
      window.speechSynthesis.cancel();

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = 1.0;
      utterance.onstart = () => {
        speakingRef.current = true;
      };
      utterance.onend = () => {
        speakingRef.current = false;
      };
      utterance.onerror = () => {
        speakingRef.current = false;
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

  return { speak, enabled, toggle, supported };
}
