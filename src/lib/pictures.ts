/**
 * A picture made ready to upload: phone photos are often 5–12 MB and far larger than a
 * Space ever shows, so anything big is redrawn at most 2,000 px on its long side as a
 * JPEG. GIFs keep their animation and go up as they are; a picture the browser can't
 * decode (an iPhone HEIC on some browsers) also goes up as it is.
 */
export async function readyToUpload(file: File, maxSide = 2000): Promise<Blob> {
  if (file.type === "image/gif") return file;
  const bitmap = await createImageBitmap(file).catch(() => null);
  if (!bitmap) return file;
  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
  if (scale === 1 && file.size <= 1_500_000) {
    bitmap.close();
    return file;
  }
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const g = canvas.getContext("2d");
  if (!g) return file;
  g.fillStyle = "#ffffff"; // transparent PNGs get a white ground, not black, as JPEGs
  g.fillRect(0, 0, canvas.width, canvas.height);
  g.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.86));
  return blob && blob.size < file.size ? blob : file;
}

/** Pictures among dropped or pasted files, SVGs left out. */
export function picturesIn(files: FileList | File[] | null | undefined): File[] {
  return [...(files ?? [])].filter((f) => f.type.startsWith("image/") && f.type !== "image/svg+xml");
}
