"use client";

import { useCallback, useRef, useState } from "react";
import {
  CommitConfig,
  CommitResult,
  DEFAULT_COMMIT_CONFIG,
  evaluateCommit,
  Prediction,
} from "@/lib/commitLogic";

export interface CommittedToken {
  token: string;
  confidence: number;
  ts: number;
}

export function useCommitLogic(config: CommitConfig = DEFAULT_COMMIT_CONFIG) {
  const [hypothesis, setHypothesis] = useState<Prediction | null>(null);
  const [committedTokens, setCommittedTokens] = useState<CommittedToken[]>([]);
  const windowRef = useRef<Prediction[]>([]);
  const lastCommitTsRef = useRef(0);
  const lastCommittedTokenRef = useRef("");

  const addPrediction = useCallback(
    (pred: Prediction) => {
      setHypothesis(pred);

      // Update rolling window
      const win = windowRef.current;
      win.push(pred);
      if (win.length > config.windowSize) {
        win.shift();
      }

      // Evaluate commit
      const result: CommitResult | null = evaluateCommit(
        win,
        lastCommitTsRef.current,
        config,
      );

      if (result && result.token !== lastCommittedTokenRef.current) {
        lastCommitTsRef.current = result.ts;
        lastCommittedTokenRef.current = result.token;
        windowRef.current = [];
        setHypothesis(null);
        setCommittedTokens((prev) => [
          ...prev,
          {
            token: result.token,
            confidence: result.avgConfidence,
            ts: result.ts,
          },
        ]);
      }
    },
    [config],
  );

  const clearCommitted = useCallback(() => {
    setCommittedTokens([]);
    lastCommittedTokenRef.current = "";
    windowRef.current = [];
    setHypothesis(null);
  }, []);

  return { hypothesis, committedTokens, addPrediction, clearCommitted };
}
