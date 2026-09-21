/**
 * Browser-only: shrink a photo before it travels (estimate tools' photo
 * fill-in). Phones shoot 12 MP; the model reads a 1280 px JPEG just as well
 * and the upload goes from ~4 MB to ~200 KB. Returns base64 WITHOUT the
 * data: prefix plus the mime, matching lib/estimator-assist.ts.
 */
export type AssistPhoto = { base64: string; mime: string; previewUrl: string; name: string };

export async function fileToAssistPhoto(file: File, maxPx = 1280): Promise<AssistPhoto | null> {
  if (!file.type.startsWith("image/")) return null;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("bad image"));
      i.src = url;
    });
    const scale = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
    const w = Math.max(1, Math.round(img.naturalWidth * scale));
    const h = Math.max(1, Math.round(img.naturalHeight * scale));
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
    return { base64, mime: "image/jpeg", previewUrl: dataUrl, name: file.name };
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(url);
  }
}
