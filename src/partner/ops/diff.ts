/** One side of a line-by-line comparison: each line marked when it has no match on the other side. */
export type DiffSide = { text: string; marked: boolean }[];

/**
 * Which lines of a change's before and after match. A line only in "after" is new,
 * one only in "now" is removed; reordered lines still match, so only real edits mark.
 */
export function diffLines(nowText: string | undefined, afterText: string | undefined): { now: DiffSide; after: DiffSide } {
  const now = split(nowText);
  const after = split(afterText);
  const n = now.length;
  const m = after.length;
  const longest: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      longest[i][j] = now[i] === after[j] ? longest[i + 1][j + 1] + 1 : Math.max(longest[i + 1][j], longest[i][j + 1]);
    }
  }
  const keepNow = new Array<boolean>(n).fill(false);
  const keepAfter = new Array<boolean>(m).fill(false);
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (now[i] === after[j]) {
      keepNow[i] = true;
      keepAfter[j] = true;
      i++;
      j++;
    } else if (longest[i + 1][j] >= longest[i][j + 1]) {
      i++;
    } else {
      j++;
    }
  }
  return {
    now: now.map((text, k) => ({ text, marked: !keepNow[k] })),
    after: after.map((text, k) => ({ text, marked: !keepAfter[k] })),
  };
}

function split(text: string | undefined): string[] {
  if (!text) return [];
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
