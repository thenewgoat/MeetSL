"use client";

import { useCallback, useRef, useState } from "react";

const API_URL =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";

export interface TokenInput {
  token: string;
  confidence: number;
  ts: number;
}

export interface LLMSuggestion {
  suggested_text: string;
  uncertainty_level: "low" | "medium" | "high";
  alternatives: string[];
  needs_confirmation: boolean;
}

export function useLLMSuggest() {
  const [suggestion, setSuggestion] = useState<LLMSuggestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const suggest = useCallback(
    async (
      tokens: TokenInput[],
      domain: string = "meeting",
      recentSpeech?: string,
    ): Promise<LLMSuggestion | null> => {
      // Abort any in-flight request
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setLoading(true);
      setError(null);

      try {
        const body: Record<string, unknown> = {
          tokens: tokens.map((t) => ({
            token: t.token,
            confidence: t.confidence,
            ts: t.ts,
          })),
          domain,
        };
        if (recentSpeech) {
          body.recent_speech_context = recentSpeech;
        }

        const res = await fetch(`${API_URL}/llm/suggest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const detail = await res.text().catch(() => "Unknown error");
          throw new Error(`LLM suggest failed: ${res.status} ${detail}`);
        }

        const data: LLMSuggestion = await res.json();
        setSuggestion(data);
        setLoading(false);
        return data;
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          return null;
        }
        const msg = err instanceof Error ? err.message : "Unknown error";
        setError(msg);
        setLoading(false);
        return null;
      }
    },
    [],
  );

  const clear = useCallback(() => {
    abortRef.current?.abort();
    setSuggestion(null);
    setError(null);
    setLoading(false);
  }, []);

  return { suggest, suggestion, loading, error, clear };
}
