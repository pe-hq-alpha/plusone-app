import { describe, expect, test } from "vitest";
import {
  agreement,
  confusion,
  summarise,
  tagScores,
  type PhotoKey,
  type SystemAnswer,
} from "./glimmerEval";

const key = (over: Partial<PhotoKey> = {}): PhotoKey => ({
  name: "lunch.jpg",
  trade: "Catering",
  profileName: "Kalyana Saapadu Co.",
  realWork: true,
  stock: false,
  watermark: false,
  faces: false,
  unsafe: false,
  tags: ["banana-leaf-service"],
  ...over,
});

const good = (over: Partial<Extract<SystemAnswer, { ok: true }>> = {}): SystemAnswer => ({
  ok: true,
  answer: {
    realWork: true,
    stock: false,
    watermark: false,
    faces: false,
    unsafe: false,
    shows: "A banana-leaf lunch laid out for a large group",
    tags: ["banana-leaf-service"],
    ...over.answer,
  },
  ms: 1000,
  costUsd: 0.01,
  ...over,
});

const bad = (ms = 2000): SystemAnswer => ({ ok: false, error: "Glimmer didn't answer in time", ms, costUsd: 0.02 });

describe("the photo-check evaluation scoring", () => {
  test("a perfect system scores full marks", () => {
    const keys = [key(), key({ name: "stage.jpg", realWork: false, stock: true, tags: ["buffet", "live-counter"] })];
    const answers = [
      good(),
      good({ answer: { realWork: false, stock: true, watermark: false, faces: false, unsafe: false, shows: "A buffet line with a live dosa counter", tags: ["buffet", "live-counter"] } }),
    ];
    expect(confusion(keys, answers, "realWork")).toMatchObject({ tp: 1, fp: 0, fn: 0, tn: 1, failed: 0, precision: 1, recall: 1 });
    expect(confusion(keys, answers, "stock")).toMatchObject({ tp: 1, tn: 1, precision: 1, recall: 1 });
    expect(tagScores(keys, answers)).toMatchObject({ precision: 1, recall: 1, f1: 1, failed: 0 });
  });

  test("a system that always says yes collects false positives and misses the negatives", () => {
    const keys = [key(), key({ name: "stage.jpg", realWork: false, stock: true, tags: [] })];
    const yes = good({ answer: { realWork: true, stock: true, watermark: true, faces: true, unsafe: true, shows: "Something on a table", tags: [] } });
    const answers = [yes, yes];
    expect(confusion(keys, answers, "realWork")).toMatchObject({ tp: 1, fp: 1, fn: 0, tn: 0, precision: 0.5, recall: 1 });
    expect(confusion(keys, answers, "watermark")).toMatchObject({ tp: 0, fp: 2, precision: 0 });
  });

  test("a failed answer is a miss on every field and counts as failed", () => {
    const keys = [key(), key({ name: "stage.jpg", realWork: false, tags: ["buffet"] })];
    const answers = [good(), bad()];
    // The failure misses the yes on realWork and alarms on the no.
    expect(confusion(keys, answers, "realWork")).toMatchObject({ tp: 1, fp: 1, fn: 0, failed: 1 });
    expect(confusion(keys, answers, "watermark")).toMatchObject({ fp: 1, failed: 1 });
    // The key's buffet tag goes unmatched, halving recall.
    expect(tagScores(keys, answers)).toMatchObject({ failed: 1, precision: 1, recall: 0.5 });
  });

  test("a field with no positives in the key reports recall null, not zero", () => {
    const keys = [key(), key({ name: "stage.jpg" })];
    const answers = [good(), good()];
    expect(confusion(keys, answers, "unsafe")).toMatchObject({ tp: 0, fp: 0, fn: 0, tn: 2, failed: 0, recall: null });
  });

  test("tags outside the trade's list are dropped before scoring", () => {
    const keys = [key({ tags: ["banana-leaf-service", "not-a-tag"] })];
    const answers = [good({ answer: { realWork: true, stock: false, watermark: false, faces: false, unsafe: false, shows: "Lunch", tags: ["banana-leaf-service", "made-up"] } })];
    // Both inventions vanish; what is left matches exactly.
    expect(tagScores(keys, answers)).toMatchObject({ precision: 1, recall: 1, f1: 1 });
  });

  test("an empty set scores nothing and reports nulls", () => {
    expect(confusion([], [], "realWork")).toMatchObject({ tp: 0, fp: 0, fn: 0, tn: 0, failed: 0, precision: null, recall: null });
    expect(tagScores([], [])).toMatchObject({ precision: null, recall: null, f1: null, failed: 0 });
    expect(agreement([], [], "realWork")).toBeNull();
    const summary = summarise([], {});
    expect(summary.glimmer).toMatchObject({ failed: 0, medianMs: null, p95Ms: null, totalCostUsd: 0 });
    expect(summary.agreement.realWork).toBeNull();
  });

  test("agreement is the share of photos where both systems answered alike", () => {
    const a = [good(), good(), bad()];
    const b = [good(), good({ answer: { realWork: false, stock: false, watermark: false, faces: false, unsafe: false, shows: "Lunch", tags: [] } }), bad()];
    // Same, different, and both failed on realWork.
    expect(agreement(a, b, "realWork")).toBeCloseTo(2 / 3);
  });

  test("the summary carries times and cost per system plus agreement per field", () => {
    const keys = [key(), key({ name: "stage.jpg" })];
    const answersByPhoto = {
      "lunch.jpg": { glimmer: good({ ms: 1000, costUsd: 0.01 }), spark: good({ ms: 4000, costUsd: 0.004 }) },
      "stage.jpg": { glimmer: good({ ms: 2000, costUsd: 0.02 }), spark: bad(5000) },
    };
    const summary = summarise(keys, answersByPhoto);
    expect(summary.glimmer).toMatchObject({ failed: 0, medianMs: 1500, p95Ms: 2000 });
    expect(summary.glimmer.totalCostUsd).toBeCloseTo(0.03);
    expect(summary.spark).toMatchObject({ failed: 1, medianMs: 4500, p95Ms: 5000 });
    expect(summary.spark.totalCostUsd).toBeCloseTo(0.024);
    expect(summary.spark.confusion.realWork.failed).toBe(1);
    expect(summary.agreement.realWork).toBe(0.5);
  });
});
