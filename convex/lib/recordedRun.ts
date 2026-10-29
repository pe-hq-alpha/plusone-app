/**
 * Real runs of Meta's models on the guest demo's own material, kept so "Under the hood" shows
 * each model at work before a visitor has done anything. Every row is a call that was made
 * and paid for, copied from its cost record or the field notes; the panel labels each run as
 * recorded, with its date and where it ran.
 */
export type RecordedCall = {
  feature: string;
  /** What it was run on, in plain words. */
  note: string;
  provider: "meta" | "spark_open" | "glimmer";
  model: string;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  durationMs: number;
};

export type RecordedRun = { on: string; about: string; calls: RecordedCall[] };

export const RECORDED_RUNS: RecordedRun[] = [
  {
    on: "28 Oct 2026",
    about: "The real run that read this sample event's catering quotes into the lines Compare shows (production, `modelTasks.readDemoQuotes`).",
    calls: [
      { feature: "readVendorReply", note: "Annam Caterers", provider: "meta", model: "muse-spark-1.3", inputTokens: 1_467, outputTokens: 2_848, costUsd: 0.01393775, durationMs: 14_371 },
      { feature: "readVendorReply", note: "Saapadu Kitchen", provider: "meta", model: "muse-spark-1.3", inputTokens: 1_415, outputTokens: 1_669, costUsd: 0.008862, durationMs: 7_112 },
      { feature: "readVendorReply", note: "Kaveri Feast Co.", provider: "meta", model: "muse-spark-1.3", inputTokens: 1_447, outputTokens: 2_053, costUsd: 0.010534, durationMs: 9_074 },
    ],
  },
  {
    on: "29 Oct 2026",
    about: "The real run behind See it on your venue for the sample hall: Muse Spark found the stage and the wall behind it, SAM 3.1 cut both out (production).",
    calls: [
      { feature: "findStage", note: "the sample hall", provider: "meta", model: "muse-spark-1.3", inputTokens: 3_226, outputTokens: 479, costUsd: 0.00606825, durationMs: 4_260 },
      { feature: "venueCutOut", note: "the stage and the wall behind it", provider: "meta", model: "sam-3.1", inputTokens: 0, outputTokens: 0, costUsd: 0.0025, durationMs: 4_045 },
    ],
  },
  {
    on: "29 Oct 2026",
    about: "A real check of a caterer's photo of past work on Muse Glimmer, Meta's open-weights model, on our own GPU: it tagged plated service and serving staff (production).",
    calls: [
      { feature: "vendorPhotoCheck", note: "a caterer's kitchen photo", provider: "glimmer", model: "muse-glimmer-30b", inputTokens: 1_360, outputTokens: 731, costUsd: 0.00775, durationMs: 5_598 },
    ],
  },
  {
    on: "29 Oct 2026",
    about: "A real read of a photographer's shorthand quote on Muse Spark Open, Meta's open-weights model on Baseten: price, hours, crew, photos, weeks and GST all right (a test run).",
    calls: [
      { feature: "sparkOpenQuote", note: "\"Rs.45,000/- … 8 hrs … GST extra\"", provider: "spark_open", model: "meta-models/muse-spark-open-1026", inputTokens: 560, outputTokens: 605, costUsd: 0.00327125, durationMs: 2_757 },
    ],
  },
  {
    on: "29 Oct 2026",
    about: "Muse Wonder's first live vendor checks, as PlusOne Ops runs them before a person verifies a vendor: web search and the vendor's own pages, six findings with sources (production). A made-up caterer came back not found on every check; a real Chennai caterer with its own site, shown here without its name, had its identity, location and website backed by sources, with contact and prices left for a person.",
    calls: [
      { feature: "vendorCheck", note: "a made-up caterer: nothing found", provider: "meta", model: "muse-wonder-1.0", inputTokens: 35_763, outputTokens: 3_689, costUsd: 0.236832, durationMs: 38_507 },
      { feature: "vendorCheck", note: "a real Chennai caterer with its own site", provider: "meta", model: "muse-wonder-1.0", inputTokens: 41_086, outputTokens: 4_102, costUsd: 0.266384, durationMs: 45_228 },
    ],
  },
];
