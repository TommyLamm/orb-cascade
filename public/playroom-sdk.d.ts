export const Playroom: {
  ready(): Promise<{ available: boolean; mode: 'authenticated' | 'guest' | 'preview' | 'standalone' }>;
  /** Admin diagnostic previews return a temporary run ID; no account record is created. */
  startRun(): Promise<{ runId: string } | null>;
  /** Diagnostic preview validates the score but always returns null, never saved: true. */
  finishRun(result: { runId: string; score: number }): Promise<{
    saved: true; runId: string; score: number; finishedAt: string;
  } | null>;
};
