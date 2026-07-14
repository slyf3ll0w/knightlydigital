/**
 * Client-side image downscaling (canvas-based, no server dependencies).
 * Lets users upload any reasonably sized image; we ship an optimized version
 * so client-facing pages stay fast.
 */

/**
 * Bounding box of the actual artwork: pixels that are neither transparent
 * nor (within tolerance) the border color sampled from the corners. Trims
 * the dead padding people export around logos so they render at their true
 * size in the sidebar tile and client-facing headers. Returns null when
 * nothing would be trimmed (or the whole image matches the border — e.g. a
 * photo where all four corners differ, or a fully blank canvas).
 */
function artworkBounds(ctx: CanvasRenderingContext2D, width: number, height: number) {
  const { data } = ctx.getImageData(0, 0, width, height);
  const px = (x: number, y: number) => {
    const i = (y * width + x) * 4;
    return [data[i], data[i + 1], data[i + 2], data[i + 3]] as const;
  };

  // Border color = the corner color, but only if all four corners agree —
  // otherwise only transparency counts as padding (never trim into a photo).
  const corners = [px(0, 0), px(width - 1, 0), px(0, height - 1), px(width - 1, height - 1)];
  const TOL = 16;
  const same = (a: readonly number[], b: readonly number[]) =>
    Math.abs(a[0] - b[0]) <= TOL &&
    Math.abs(a[1] - b[1]) <= TOL &&
    Math.abs(a[2] - b[2]) <= TOL &&
    Math.abs(a[3] - b[3]) <= TOL;
  const border = corners.every((c) => same(c, corners[0])) ? corners[0] : null;

  const isPadding = (x: number, y: number) => {
    const p = px(x, y);
    if (p[3] <= 8) return true; // transparent
    return border !== null && border[3] > 8 && same(p, border);
  };

  let top = 0, bottom = height - 1, left = 0, right = width - 1;
  const rowIsPadding = (y: number) => {
    for (let x = 0; x < width; x++) if (!isPadding(x, y)) return false;
    return true;
  };
  const colIsPadding = (x: number) => {
    for (let y = top; y <= bottom; y++) if (!isPadding(x, y)) return false;
    return true;
  };
  while (top < bottom && rowIsPadding(top)) top++;
  while (bottom > top && rowIsPadding(bottom)) bottom--;
  while (left < right && colIsPadding(left)) left++;
  while (right > left && colIsPadding(right)) right--;

  const w = right - left + 1;
  const h = bottom - top + 1;
  // Nothing trimmed, or degenerate result (all padding / a sliver) — keep as-is.
  if ((left === 0 && top === 0 && w === width && h === height) || w < 8 || h < 8) return null;
  return { left, top, width: w, height: h };
}

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

  // Crop away the padding baked into the export (transparent margins, or a
  // uniform solid border) so the logo fills the space we give it.
  let out = canvas;
  const bounds = artworkBounds(ctx, width, height);
  if (bounds) {
    const cropped = document.createElement("canvas");
    cropped.width = bounds.width;
    cropped.height = bounds.height;
    const cctx = cropped.getContext("2d");
    if (cctx) {
      cctx.drawImage(
        canvas,
        bounds.left, bounds.top, bounds.width, bounds.height,
        0, 0, bounds.width, bounds.height
      );
      out = cropped;
    }
  }

  // JPEG sources have no transparency to preserve — recompress as JPEG.
  // Everything else exports as PNG to keep transparent backgrounds intact.
  const isJpeg = file.type === "image/jpeg";
  const type = isJpeg ? "image/jpeg" : "image/png";

  const blob = await new Promise<Blob>((resolve, reject) => {
    out.toBlob(
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
