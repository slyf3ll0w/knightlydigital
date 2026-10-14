"use client";

import { useEffect, useMemo } from "react";
import { Film, X } from "lucide-react";

// The queue rules live in lib/pending-files.ts (pure, unit-tested); re-exported
// here so the composers keep one import.
export { MAX_PENDING_FILES, isSendableFile, mergePendingFiles } from "@/lib/pending-files";

/**
 * The strip of thumbnails sitting in the composer before a send (iMessage
 * style): what's been picked, dropped or pasted, each with a remove badge.
 * The words typed under it go out with the first one. The badge reads small;
 * its hit area is the tile's whole top-right 40 px square (the phone
 * touch-target rule).
 */
export default function PendingAttachments({
  files,
  onRemove,
  disabled = false,
}: {
  files: File[];
  onRemove: (index: number) => void;
  disabled?: boolean;
}) {
  const urls = useMemo(() => files.map((f) => URL.createObjectURL(f)), [files]);
  useEffect(() => () => urls.forEach((u) => URL.revokeObjectURL(u)), [urls]);
  if (files.length === 0) return null;
  return (
    <div
      className="mb-2 flex gap-2 overflow-x-auto px-0.5 pt-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      role="list"
      aria-label="Attached, not sent yet"
      data-pending-attachments
    >
      {files.map((f, i) => (
        <div
          key={urls[i]}
          role="listitem"
          className="pending-attachment relative h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-gray-200 bg-gray-100 shadow-sm"
        >
          {f.type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- a local file preview
            <img src={urls[i]} alt="" className="h-full w-full object-cover" />
          ) : (
            <>
              <video src={urls[i]} muted playsInline preload="metadata" className="h-full w-full object-cover" />
              <span className="absolute bottom-1 left-1 inline-flex items-center gap-0.5 rounded-md bg-black/60 px-1 py-0.5 text-[10px] font-semibold text-white">
                <Film size={10} /> Video
              </span>
            </>
          )}
          {!disabled && (
            <button
              type="button"
              onClick={() => onRemove(i)}
              aria-label={`Remove ${f.name}`}
              className="group/remove absolute right-0 top-0 flex h-10 w-10 items-start justify-end p-1"
            >
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-colors group-hover/remove:bg-black/80 group-active/remove:bg-black/80">
                <X size={12} strokeWidth={2.5} />
              </span>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
