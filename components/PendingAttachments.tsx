"use client";

import { useEffect, useMemo } from "react";
import { Film, X } from "lucide-react";
import { isComposerFile } from "@/lib/media-types";

/** How many photos or clips one send can carry (each goes out as its own message). */
export const MAX_PENDING_FILES = 10;

/**
 * The server's own list (lib/media-types.ts), not "anything image/* or
 * video/*": a .webm screen recording or a .bmp used to stage with a
 * thumbnail and then fail at Send with "Photos and videos can be sent".
 */
export function isSendableFile(f: File) {
  return isComposerFile(f.type);
}

/**
 * Add picked, dropped or pasted files to the composer's queue: photos and
 * videos only, up to the cap. `skipped` = something wasn't a photo or video,
 * `full` = the cap cut the batch short.
 */
export function mergePendingFiles(current: File[], incoming: File[], max = MAX_PENDING_FILES) {
  const sendable = incoming.filter(isSendableFile);
  const room = Math.max(0, max - current.length);
  return {
    next: room > 0 ? [...current, ...sendable.slice(0, room)] : current,
    skipped: sendable.length < incoming.length,
    full: sendable.length > room,
  };
}

/**
 * The strip of thumbnails sitting in the composer before a send (iMessage
 * style): what's been picked, dropped or pasted, each with a remove badge.
 * The words typed under it go out with the first one.
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
              className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-black/60 text-white shadow-sm transition-colors hover:bg-black/80 active:bg-black/80"
            >
              <X size={12} strokeWidth={2.5} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
