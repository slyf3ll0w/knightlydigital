/**
 * Client-side image downscaling (canvas-based, no server dependencies).
 * Lets users upload any reasonably sized image; we ship an optimized version
 * so client-facing pages stay fast.
 */

export async function resizeImageFile(
  file: File,
  maxDimension = 1000
): Promise<{ blob: Blob; filename: string }> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  // JPEG sources have no transparency to preserve — recompress as JPEG.
  // Everything else exports as PNG to keep transparent backgrounds intact.
  const isJpeg = file.type === "image/jpeg";
  const type = isJpeg ? "image/jpeg" : "image/png";

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image processing failed"))),
      type,
      isJpeg ? 0.85 : undefined
    );
  });

  return { blob, filename: isJpeg ? "logo.jpg" : "logo.png" };
}

/**
 * Job-site photos: always recompress to JPEG (no transparency to preserve,
 * and phone camera PNGs/HEIC-converted files are enormous). 1600px is plenty
 * for before/after documentation while keeping DB rows a few hundred KB.
 */
export async function resizePhotoFile(
  file: File,
  maxDimension = 1600
): Promise<{ blob: Blob; filename: string }> {
  const bitmap = await createImageBitmap(file);

  const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error("Image processing failed"))),
      "image/jpeg",
      0.82
    );
  });

  return { blob, filename: "photo.jpg" };
}
