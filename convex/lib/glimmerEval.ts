import { z } from "zod";
import type { photoCheckSchema } from "../marketplace/photos";
import { keepKnownTags, tagsFor } from "./photoTags";

/**
 * Scoring for the Glimmer photo-check evaluation: the same photos through Muse Glimmer
 * and Muse Spark, set against a hand-marked key. Counts, not judgements: a failed answer
 * is a miss on every field, so a system cannot look good by failing quietly.
 */

type Answer = z.infer<typeof photoCheckSchema>;

/** One photo's hand-marked truth: what is in it and which tags describe it. */
export type PhotoKey = {
  name: string;
  /** A category name `tagsFor` understands, so the key's tags are checked against the trade's list. */
  trade: string;
  profileName: string;
  realWork: boolean;
  stock: boolean;
  watermark: boolean;
  faces: boolean;
  unsafe: boolean;
  /** Tag keys a person marked as right. */
  tags: string[];
};

export type SystemAnswer =
  | { ok: true; answer: Answer; ms: number; costUsd: number }
  | { ok: false; error: string; ms: number; costUsd: number };

export const PHOTO_FIELDS = ["realWork", "stock", "watermark", "faces", "unsafe"] as const;
export type PhotoField = (typeof PHOTO_FIELDS)[number];

export type Confusion = {
  tp: number;
  fp: number;
  fn: number;
  tn: number;
  /** Answers that failed, counted here as well as in the summary. */
  failed: number;
  precision: number | null;
  recall: number | null;
};

/** One field's confusion table. Photos with no answer for this system are skipped, not scored. */
export function confusion(keys: PhotoKey[], answers: readonly (SystemAnswer | undefined)[], field: PhotoField): Confusion {
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  let failed = 0;
  for (let i = 0; i < keys.length; i++) {
    const answer = answers[i];
    if (!answer) continue;
    const expected = keys[i][field];
    if (!answer.ok) {
      // A failure predicts nothing, so it is wrong either way: a miss when the key says
      // yes, a false alarm when it says no.
      failed++;
      if (expected) fn++;
      else fp++;
      continue;
    }
    const got = answer.answer[field];
    if (got && expected) tp++;
    else if (got) fp++;
    else if (expected) fn++;
    else tn++;
  }
  const predicted = tp + fp;
  const actual = tp + fn;
  return {
    tp,
    fp,
    fn,
    tn,
    failed,
    precision: predicted === 0 ? null : tp / predicted,
    recall: actual === 0 ? null : tp / actual,
  };
}

export type TagScores = { precision: number | null; recall: number | null; f1: number | null; failed: number };

/** Micro precision, recall and F1 over the photos. Tags off the trade's list score neither side. */
export function tagScores(keys: PhotoKey[], answers: readonly (SystemAnswer | undefined)[]): TagScores {
  let matched = 0;
  let predicted = 0;
  let keyed = 0;
  let failed = 0;
  for (let i = 0; i < keys.length; i++) {
    const answer = answers[i];
    if (!answer) continue;
    if (!answer.ok) failed++;
    // The check may only choose from the trade's list; anything else is its own
    // invention, dropped before scoring, as production drops it before showing.
    const allowed = tagsFor([keys[i].trade]);
    const expected = new Set(keepKnownTags(keys[i].tags, allowed));
    const got = answer.ok ? keepKnownTags(answer.answer.tags, allowed) : [];
    for (const tag of got) {
      predicted++;
      if (expected.has(tag)) matched++;
    }
    keyed += expected.size;
  }
  const precision = predicted === 0 ? null : matched / predicted;
  const recall = keyed === 0 ? null : matched / keyed;
  return {
    precision,
    recall,
    f1: precision === null || recall === null || precision + recall === 0 ? null : (2 * precision * recall) / (precision + recall),
    failed,
  };
}

/** The share of photos where both systems answered a field the same way. Two failures agree; one does not. */
export function agreement(
  a: readonly (SystemAnswer | undefined)[],
  b: readonly (SystemAnswer | undefined)[],
  field: PhotoField,
): number | null {
  let same = 0;
  let both = 0;
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i];
    const y = b[i];
    if (!x || !y) continue;
    both++;
    if ((x.ok ? x.answer[field] : null) === (y.ok ? y.answer[field] : null)) same++;
  }
  return both === 0 ? null : same / both;
}

export type SystemSummary = {
  confusion: Record<PhotoField, Confusion>;
  tags: TagScores;
  failed: number;
  medianMs: number | null;
  p95Ms: number | null;
  totalCostUsd: number;
};

export type EvalSummary = {
  glimmer: SystemSummary;
  spark: SystemSummary;
  agreement: Record<PhotoField, number | null>;
};

function median(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function p95(sorted: number[]): number | null {
  if (sorted.length === 0) return null;
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)];
}

function summariseOne(keys: PhotoKey[], answers: (SystemAnswer | undefined)[]): SystemSummary {
  const present = answers.filter((a): a is SystemAnswer => a !== undefined);
  const ms = present.map((a) => a.ms).sort((x, y) => x - y);
  return {
    confusion: Object.fromEntries(PHOTO_FIELDS.map((field) => [field, confusion(keys, answers, field)])) as Record<
      PhotoField,
      Confusion
    >,
    tags: tagScores(keys, answers),
    failed: present.filter((a) => !a.ok).length,
    medianMs: median(ms),
    p95Ms: p95(ms),
    totalCostUsd: present.reduce((sum, a) => sum + a.costUsd, 0),
  };
}

/** Plain data for the README's tables: each system on its own, then where they agree. */
export function summarise(
  keys: PhotoKey[],
  answersByPhoto: Record<string, { glimmer?: SystemAnswer; spark?: SystemAnswer }>,
): EvalSummary {
  const pick = (system: "glimmer" | "spark") => keys.map((key) => answersByPhoto[key.name]?.[system]);
  const glimmer = pick("glimmer");
  const spark = pick("spark");
  return {
    glimmer: summariseOne(keys, glimmer),
    spark: summariseOne(keys, spark),
    agreement: Object.fromEntries(PHOTO_FIELDS.map((field) => [field, agreement(glimmer, spark, field)])) as Record<
      PhotoField,
      number | null
    >,
  };
}
