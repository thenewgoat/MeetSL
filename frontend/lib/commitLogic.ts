export interface Prediction {
  token: string;
  confidence: number;
  ts: number;
}

export interface CommitConfig {
  windowSize: number;
  stabilityThreshold: number;
  confidenceThreshold: number;
  cooldownMs: number;
}

export interface CommitResult {
  token: string;
  avgConfidence: number;
  ts: number;
}

export const DEFAULT_COMMIT_CONFIG: CommitConfig = {
  windowSize: 10,
  stabilityThreshold: 6,
  confidenceThreshold: 0.7,
  cooldownMs: 1500,
};

/**
 * Evaluate whether the current prediction window should commit a token.
 *
 * Algorithm:
 * 1. Need at least K predictions in the window
 * 2. Find the mode token (most frequent)
 * 3. Mode must appear >= stabilityThreshold times
 * 4. Average confidence of mode predictions must >= confidenceThreshold
 * 5. Cooldown must have elapsed since last commit
 */
export function evaluateCommit(
  window: Prediction[],
  lastCommitTs: number,
  config: CommitConfig = DEFAULT_COMMIT_CONFIG,
): CommitResult | null {
  if (window.length < config.stabilityThreshold) return null;

  const now = Date.now();
  if (now - lastCommitTs < config.cooldownMs) return null;

  // Count token frequencies
  const counts = new Map<string, number>();
  for (const pred of window) {
    counts.set(pred.token, (counts.get(pred.token) ?? 0) + 1);
  }

  // Find mode token
  let modeToken = "";
  let modeCount = 0;
  counts.forEach((count, token) => {
    if (count > modeCount) {
      modeToken = token;
      modeCount = count;
    }
  });

  if (modeCount < config.stabilityThreshold) return null;

  // Average confidence for mode token
  const modePreds = window.filter((p) => p.token === modeToken);
  const avgConfidence =
    modePreds.reduce((sum, p) => sum + p.confidence, 0) / modePreds.length;

  if (avgConfidence < config.confidenceThreshold) return null;

  return {
    token: modeToken,
    avgConfidence: Math.round(avgConfidence * 1000) / 1000,
    ts: now,
  };
}
