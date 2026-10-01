"use client";

import { useState } from "react";
import { Download, FileText, ImageOff, Loader2, Paperclip } from "lucide-react";

/** One attachment as the thread JSON carries it (lib/message-media.ts threadMedia). */
export type ThreadMedia = { id: string; type: string; url: string; expired?: boolean };

/**
 * The pictures and clips on a message bubble — the same block on the team
 * thread and the client hub. Pictures open full size in a new tab; video and
 * audio play inline; anything else is a download link. Every item carries a
 * Save button: the phone's share sheet (Save Image / Save to Files) where
 * the browser has one, else a plain download. Photos are kept for a week
 * (lib/message-media.ts MESSAGE_MEDIA_DAYS); an expired one says so.
 */
export default function MessageMedia({ media, className = "" }: { media: ThreadMedia[]; className?: string }) {
  if (media.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {media.map((m) =>
        m.expired ? (
          <span key={m.id} className="inline-flex items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs opacity-80">
            <ImageOff size={13} /> {noun(m.type)} expired — photos stay in the thread for a week
          </span>
        ) : (
          <div key={m.id} className="group relative w-fit max-w-full">
            {m.type.startsWith("image/") ? (
              <a href={m.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl" title="Open full size">
                {/* eslint-disable-next-line @next/next/no-img-element -- the bytes come from our own API, not an optimizable asset */}
                <img src={m.url} alt="" className="block max-h-72 w-auto max-w-full object-contain" loading="lazy" />
              </a>
            ) : m.type.startsWith("video/") ? (
              <video src={m.url} controls playsInline preload="metadata" className="block max-h-72 w-auto max-w-full rounded-xl bg-black" />
            ) : m.type.startsWith("audio/") ? (
              <audio src={m.url} controls preload="metadata" className="block w-full max-w-[16rem]" />
            ) : (
              <a
                href={m.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs font-semibold underline"
              >
                {m.type.endsWith("vcard") ? <FileText size={13} /> : <Paperclip size={13} />}
                {noun(m.type)}
              </a>
            )}
            {!m.url.startsWith("blob:") && <SaveButton media={m} />}
          </div>
        )
      )}
    </div>
  );
}

function noun(type: string): string {
  if (type.startsWith("image/")) return "Photo";
  if (type.startsWith("video/")) return "Video";
  if (type.startsWith("audio/")) return "Audio clip";
  if (type.endsWith("vcard")) return "Contact card";
  return "Attachment";
}

const downloadUrl = (url: string) => `${url}${url.includes("?") ? "&" : "?"}download=1`;

/** Save to the device: the share sheet on phones that have one (Save Image / Files), a download everywhere else. */
function SaveButton({ media }: { media: ThreadMedia }) {
  const [busy, setBusy] = useState(false);
  async function save() {
    if (busy) return;
    const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
    // The share sheet needs the bytes as a File; only worth it where files can be shared (iOS 15+, Android Chrome).
    if (typeof nav.share === "function" && typeof nav.canShare === "function") {
      setBusy(true);
      try {
        const res = await fetch(downloadUrl(media.url));
        if (!res.ok) throw new Error(String(res.status));
        const blob = await res.blob();
        const ext = (media.type.split("/")[1] ?? "bin").replace("jpeg", "jpg").replace("quicktime", "mov").replace("x-vcard", "vcf").replace("vcard", "vcf");
        const file = new File([blob], `${noun(media.type).toLowerCase().replace(/ /g, "-")}.${ext}`, { type: media.type });
        if (nav.canShare({ files: [file] })) {
          await nav.share({ files: [file] });
          return;
        }
      } catch (err) {
        // Cancelled share sheets throw AbortError — nothing to do; anything else falls through to the download.
        if (err instanceof Error && err.name === "AbortError") return;
      } finally {
        setBusy(false);
      }
    }
    const a = document.createElement("a");
    a.href = downloadUrl(media.url);
    a.download = "";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }
  return (
    <button
      type="button"
      onClick={save}
      disabled={busy}
      className="absolute right-1.5 top-1.5 flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white opacity-90 shadow transition-opacity hover:opacity-100 disabled:opacity-60 lg:opacity-0 lg:group-hover:opacity-100 lg:focus:opacity-100"
      title={`Save ${noun(media.type).toLowerCase()} to this device`}
      aria-label={`Save ${noun(media.type).toLowerCase()}`}
    >
      {busy ? <Loader2 size={15} className="animate-spin" /> : <Download size={15} />}
    </button>
  );
}
