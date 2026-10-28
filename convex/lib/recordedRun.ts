/**
 * A real Muse Spark run on the guest demo's own quotes, kept so "Under the hood" shows Meta
 * at work in the demo before a visitor has typed anything. Each row is a call that was made
 * and paid for (`claude.readDemoQuotes` on production, logged in the field notes), copied
 * from the cost record; the panel labels them as recorded, with the date.
 */
export type RecordedCall = {
  feature: string;
  /** Whose reply was read, in plain words. */
  note: string;
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

export const RECORDED_RUN: { on: string; calls: RecordedCall[] } = {
  on: "",
  calls: [],
};
