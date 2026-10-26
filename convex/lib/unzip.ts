import { unzipSync } from "fflate";

/** Unpacked, a file we read may be at most this big: a crafted zip can claim gigabytes. */
const MAX_UNPACKED = 25 * 1024 * 1024;

/**
 * Unpack only the parts of a zip (.xlsx) we are going to read, and refuse one
 * whose contents would unpack to more than we'd ever need. The sizes are read from the
 * zip's own directory before anything is inflated.
 */
export function unzipParts(bytes: Uint8Array, wanted: (name: string) => boolean): Record<string, Uint8Array> {
  let total = 0;
  return unzipSync(bytes, {
    filter: (file) => {
      if (!wanted(file.name)) return false;
      total += file.originalSize;
      if (total > MAX_UNPACKED) throw new Error("That file is too large to read. Try a smaller one, or paste the list instead");
      return true;
    },
  });
}
