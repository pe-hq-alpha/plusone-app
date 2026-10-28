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
  on: "28 Oct 2026",
  calls: [
    { feature: "readVendorReply", note: "Annam Caterers", model: "muse-spark-1.3", inputTokens: 1_467, outputTokens: 2_848, costUsd: 0.01393775, durationMs: 14_371 },
    { feature: "readVendorReply", note: "Saapadu Kitchen", model: "muse-spark-1.3", inputTokens: 1_415, outputTokens: 1_669, costUsd: 0.008862, durationMs: 7_112 },
    { feature: "readVendorReply", note: "Kaveri Feast Co.", model: "muse-spark-1.3", inputTokens: 1_447, outputTokens: 2_053, costUsd: 0.010534, durationMs: 9_074 },
  ],
};
