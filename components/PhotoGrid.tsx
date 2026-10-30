"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Eye, Globe, ImagePlus, Loader2, MapPin } from "lucide-react";
import EmptyState from "@/components/EmptyState";
import PhotoViewer from "@/components/PhotoViewer";
import PlanRequired from "@/components/PlanRequired";
import { Segment, SegmentedRow } from "@/components/FilterChips";
import { getCapacitor, nativePlatform } from "@/components/NativeShell";
import { resizePhotoPair } from "@/lib/resize-image";
import { stampFor } from "@/lib/photo-capture";
import {
  JOB_STAGE_OPTIONS,
  PHOTO_LIMITS,
  QUOTE_STAGE,
  STAGE_LABEL,
  filterMatches,
  photoSrc,
  type PhotoFilter,
  type PhotoStage,
  type PhotoView,
} from "@/lib/photos-shared";

export type PhotoTargetRef = { kind: "job" | "quote"; id: string };

/**
 * The Photos fold on a job or a quote (Gallery plan, phase A): a grid of
 * thumbnails that opens the full-screen viewer, Take photo / Add photos, and
 * on a job the stage picker + All / Before / After filter. Every shot is
 * stamped with who, when and (for a fresh shot) where before it uploads;
 * images are downscaled in the browser (1600 px + a 400 px thumbnail).
 *
 * `locked` = the Gallery gate is live and this company isn't on it: the
 * fold shows the plan card instead (quotes only; job photos stay free).
 */
export default function PhotoGrid({
  target,
  photos: initial,
  canSite = false,
  locked = false,
}: {
  target: PhotoTargetRef;
  photos: PhotoView[];
  canSite?: boolean;
  locked?: boolean;
}) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [photos, setPhotos] = useState(initial);
  useEffect(() => setPhotos(initial), [initial]);

  const isJob = target.kind === "job";
  const [stage, setStage] = useState<PhotoStage>(isJob ? "GENERAL" : QUOTE_STAGE);
  const [filter, setFilter] = useState<PhotoFilter>("ALL");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<number | null>(null);

  // In the native shell the Camera plugin gives a straight-to-camera button
  // (no chooser sheet). The file input stays for "from library" — WKWebView
  // already presents the native multi-select picker for it.
  const [native, setNative] = useState(false);
  useEffect(() => {
    setNative(!!nativePlatform() && !!getCapacitor()?.Plugins?.Camera);
  }, []);

  if (locked) {
    return (
      <div className="p-4">
        <PlanRequired feature="gallery" compact />
      </div>
    );
  }

  async function takePhoto() {
    const camera = getCapacitor()?.Plugins?.Camera;
    if (!camera) return inputRef.current?.click();
    let photo: { base64String?: string; format?: string } | null = null;
    try {
      // base64, not uri: in remote-URL mode the page origin is the live site,
      // so capacitor:// file URLs aren't fetchable — bytes over the bridge are.
      photo = await camera.getPhoto({ resultType: "base64", source: "CAMERA", quality: 90, correctOrientation: true });
    } catch {
      return; // cancelled or permission denied — the button remains
    }
    if (!photo?.base64String) return;
    const raw = atob(photo.base64String);
    const bytes = new Uint8Array(raw.length);
    for (let i = 0; i < raw.length; i++) bytes[i] = raw.charCodeAt(i);
    const ext = photo.format ?? "jpeg";
    await onFiles([new File([bytes], `photo.${ext}`, { type: `image/${ext === "jpg" ? "jpeg" : ext}` })], true);
  }

  async function onFiles(files: FileList | File[] | null, fromCamera = false) {
    if (!files || files.length === 0) return;
    const list = Array.from(files).slice(0, PHOTO_LIMITS.perPick);
    setError("");
    try {
      for (let i = 0; i < list.length; i++) {
        setBusy(list.length > 1 ? `Uploading ${i + 1} of ${list.length}…` : "Uploading…");
        const file = list[i];
        const [stamp, { full, thumb }] = await Promise.all([stampFor(file, fromCamera), resizePhotoPair(file)]);
        const form = new FormData();
        form.append("file", new File([full], "photo.jpg", { type: "image/jpeg" }));
        form.append("thumb", new File([thumb], "thumb.jpg", { type: "image/jpeg" }));
        form.append(isJob ? "jobId" : "quoteId", target.id);
        form.append("type", stage);
        form.append("takenAt", stamp.takenAt.toISOString());
        form.append("clientKey", stamp.clientKey);
        if (stamp.lat !== null && stamp.lng !== null) {
          form.append("lat", String(stamp.lat));
          form.append("lng", String(stamp.lng));
          if (stamp.accuracy !== null) form.append("accuracy", String(stamp.accuracy));
        }
        const res = await fetch("/api/app/photos", { method: "POST", body: form });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          // A plan refusal (402) already became a toast (PlanGateToast).
          if (res.status !== 402) setError(data?.error ?? "Couldn't upload that photo.");
          break;
        }
        const saved = (await res.json()) as PhotoView;
        setPhotos((prev) => (prev.some((p) => p.id === saved.id) ? prev : [...prev, saved]));
      }
    } catch {
      setError("Couldn't process that image — try a different one.");
    } finally {
      setBusy(null);
      if (inputRef.current) inputRef.current.value = "";
      router.refresh();
    }
  }

  const shown = photos.filter((p) => filterMatches(filter, p.stage));
  const counts = {
    BEFORE: photos.filter((p) => filterMatches("BEFORE", p.stage)).length,
    AFTER: photos.filter((p) => filterMatches("AFTER", p.stage)).length,
  };

  return (
    <div>
      {isJob && photos.length > 0 && (counts.BEFORE > 0 || counts.AFTER > 0) && (
        <div className="px-4 pt-4">
          <SegmentedRow>
            {(
              [
                ["ALL", `All ${photos.length}`],
                ["BEFORE", `Before ${counts.BEFORE}`],
                ["AFTER", `After ${counts.AFTER}`],
              ] as const
            ).map(([key, label]) => (
              <Segment key={key} active={filter === key} onClick={() => setFilter(key)}>
                {label}
              </Segment>
            ))}
          </SegmentedRow>
        </div>
      )}

      {photos.length === 0 ? (
        <EmptyState compact title={isJob ? "No photos attached yet" : "No photos from the site visit yet"} />
      ) : shown.length === 0 ? (
        <p className="px-4 py-6 text-center text-sm text-gray-500">Nothing marked {filter === "BEFORE" ? "Before" : "After"} yet.</p>
      ) : (
        <div className="p-4 grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 gap-2" data-photo-grid>
          {shown.map((photo) => (
            <button
              key={photo.id}
              type="button"
              onClick={() => setOpen(photos.indexOf(photo))}
              className="relative aspect-square overflow-hidden rounded-lg bg-gray-100 text-left focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
              aria-label={photo.caption ?? STAGE_LABEL[photo.stage] ?? "Photo"}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={photoSrc(photo.id, photo.hasThumb ? "thumb" : "full")}
                alt={photo.caption ?? STAGE_LABEL[photo.stage] ?? "Photo"}
                loading="lazy"
                className="h-full w-full object-cover"
              />
              {STAGE_LABEL[photo.stage] && (
                <span className="absolute bottom-1 left-1 rounded-lg bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">
                  {STAGE_LABEL[photo.stage]}
                </span>
              )}
              <span className="absolute right-1 top-1 flex items-center gap-1">
                {photo.lat !== null && <MapPin size={11} className="text-white drop-shadow" aria-label="Location saved" />}
                {photo.clientVisible && <Eye size={11} className="text-white drop-shadow" aria-label="Client can see it" />}
                {photo.siteUse && <Globe size={11} className="text-white drop-shadow" aria-label="On your website" />}
              </span>
            </button>
          ))}
        </div>
      )}

      <div className="px-4 pb-4 flex flex-wrap items-center gap-2">
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onFiles(e.target.files)} />
        {isJob && (
          <select
            value={stage}
            onChange={(e) => setStage(e.target.value as PhotoStage)}
            disabled={!!busy}
            aria-label="Photo stage"
            className="px-2 py-1.5 border border-gray-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
          >
            {JOB_STAGE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        {native && (
          <button type="button" onClick={() => void takePhoto()} disabled={!!busy} className="ds-btn ds-btn-outline ds-btn-sm disabled:opacity-50">
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Camera size={12} />}
            Take photo
          </button>
        )}
        <button type="button" onClick={() => inputRef.current?.click()} disabled={!!busy} className="ds-btn ds-btn-outline ds-btn-sm disabled:opacity-50">
          {busy ? <Loader2 size={12} className="animate-spin" /> : native ? <ImagePlus size={12} /> : <Camera size={12} />}
          Add photos
        </button>
        {busy && <span className="text-xs text-gray-500">{busy}</span>}
        {error && <p className="text-xs text-[color:var(--ds-bad)] w-full">{error}</p>}
      </div>

      {open !== null && photos[open] && (
        <PhotoViewer
          photos={photos}
          index={open}
          onIndex={setOpen}
          onClose={() => setOpen(null)}
          canSite={canSite}
          canRestage={isJob}
          onPatched={(p) => setPhotos((prev) => prev.map((x) => (x.id === p.id ? p : x)))}
          onDeleted={(id) => {
            setPhotos((prev) => prev.filter((x) => x.id !== id));
            setOpen((i) => (i === null ? null : Math.max(0, Math.min(i, photos.length - 2))));
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
