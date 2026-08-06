"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, ImagePlus, Loader2, Trash2 } from "lucide-react";
import { resizePhotoFile } from "@/lib/resize-image";
import { confirmSheet } from "@/components/ConfirmSheet";
import { getCapacitor, nativePlatform } from "@/components/NativeShell";

type Photo = { id: string; url: string; caption: string | null; type: string };

const TYPE_LABEL: Record<string, string> = {
  BEFORE: "Before",
  AFTER: "After",
  GENERAL: "",
};

/**
 * Photos card body: grid of attached photos plus the add/remove controls.
 * Mobile-first — `capture`-friendly file input so a tech can shoot straight
 * from the job site; images are downscaled client-side before upload.
 */
export default function PhotoUpload({ jobId, photos }: { jobId: string; photos: Photo[] }) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photoType, setPhotoType] = useState<"BEFORE" | "AFTER" | "GENERAL">("GENERAL");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // In the native shell the Camera plugin gives a straight-to-camera button
  // (no chooser sheet). The file input stays for "from library" — WKWebView
  // already presents the native multi-select picker for it.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(!!nativePlatform() && !!getCapacitor()?.Plugins?.Camera);
  }, []);

  async function takePhoto() {
    const camera = getCapacitor()?.Plugins?.Camera;
    if (!camera) return inputRef.current?.click();
    let photo: { base64String?: string; format?: string } | null = null;
    try {
      // base64, not uri: in remote-URL mode the page origin is the live site,
      // so capacitor:// file URLs aren't fetchable — bytes over the bridge are.
      photo = await camera.getPhoto({
        resultType: "base64",
        source: "CAMERA",
        quality: 90,
        correctOrientation: true,
      });
    } catch {
      return; // cancelled or permission denied — the button remains
    }
    if (!photo?.base64String) return;
    const raw = atob(photo.base64String);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ext = photo.format ?? "jpeg";
    await onFiles([
      new File([bytes], `job-photo.${ext}`, { type: `image/${ext === "jpg" ? "jpeg" : ext}` }),
    ]);
  }

  async function onFiles(files: FileList | File[] | null) {
    if (!files || files.length === 0) return;
    setBusy(true);
    setError("");
    try {
      for (const file of Array.from(files).slice(0, 10)) {
        const { blob, filename } = await resizePhotoFile(file);
        const formData = new FormData();
        formData.append("file", new File([blob], filename, { type: "image/jpeg" }));
        formData.append("type", photoType);
        const res = await fetch(`/api/app/jobs/${jobId}/photos`, {
          method: "POST",
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(data?.error ?? "Couldn't upload that photo.");
          break;
        }
      }
    } catch {
      setError("Couldn't process that image — try a different one.");
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  async function removePhoto(photoId: string) {
    if (
      !(await confirmSheet({
        message: "Remove this photo from the job?",
        confirmLabel: "Remove Photo",
        destructive: true,
      }))
    )
      return;
    setBusy(true);
    try {
      await fetch(`/api/app/jobs/${jobId}/photos/${photoId}`, { method: "DELETE" });
    } finally {
      setBusy(false);
      router.refresh();
    }
  }

  return (
    <div>
      {photos.length === 0 ? (
        <div className="px-5 py-8 text-center">
          <Camera size={28} className="text-gray-200 mx-auto mb-2" />
          <p className="text-xs text-gray-400">No photos attached yet</p>
        </div>
      ) : (
        <div className="p-4 grid grid-cols-3 gap-2">
          {photos.map((photo) => (
            <div key={photo.id} className="relative group aspect-square rounded-lg overflow-hidden bg-gray-100">
              <a href={photo.url} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={photo.url}
                  alt={photo.caption ?? TYPE_LABEL[photo.type] ?? "Job photo"}
                  className="w-full h-full object-cover"
                />
              </a>
              {TYPE_LABEL[photo.type] && (
                <span className="absolute bottom-1 left-1 text-[10px] font-semibold px-1.5 py-0.5 rounded-lg bg-black/60 text-white">
                  {TYPE_LABEL[photo.type]}
                </span>
              )}
              <button
                type="button"
                onClick={() => removePhoto(photo.id)}
                disabled={busy}
                className="absolute top-1 right-1 p-1 rounded-full bg-black/50 text-white opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
                aria-label="Remove photo"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          multiple
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <select
          value={photoType}
          onChange={(e) => setPhotoType(e.target.value as "BEFORE" | "AFTER" | "GENERAL")}
          disabled={busy}
          className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-green-500"
        >
          <option value="GENERAL">Photo</option>
          <option value="BEFORE">Before</option>
          <option value="AFTER">After</option>
        </select>
        {native && (
          <button
            type="button"
            onClick={() => void takePhoto()}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 btn-tool-line bg-white rounded-[10px] text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            Take photo
          </button>
        )}
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={busy}
          className="flex items-center gap-1.5 px-3 py-1.5 btn-tool-line bg-white rounded-[10px] text-xs font-medium text-gray-700 hover:bg-gray-50 transition-colors disabled:opacity-50"
        >
          {busy ? <Loader2 size={12} className="animate-spin" /> : native ? <ImagePlus size={12} /> : <Camera size={12} />}
          Add photos
        </button>
        {error && <p className="text-xs text-red-600 w-full">{error}</p>}
      </div>
    </div>
  );
}
