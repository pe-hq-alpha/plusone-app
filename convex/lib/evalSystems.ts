/**
 * Another way the missing-charge evaluation is run, set against the pipeline: the sheet's
 * keywords on the raw text with no model at all. Pure helper; the calls are in convex/evals.ts.
 */

import type { Sheet } from "./standardSheet";

/** No model: a charge counts as settled when its keyword appears anywhere in the quote. */
export function keywordFlags(text: string, sheet: Sheet): string[] {
  return sheet.lines.filter((line) => !line.match.test(text)).map((line) => line.key);
}
