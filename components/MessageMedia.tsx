"use client";

import { FileText, Paperclip } from "lucide-react";

/** One attachment as the thread JSON carries it (lib/message-media.ts threadMedia). */
export type ThreadMedia = { id: string; type: string; url: string };

/**
 * The pictures and clips on a message bubble — the same block on the team
 * thread and the client hub. Pictures open full size in a new tab; video and
 * audio play inline; anything else is a download link.
 */
export default function MessageMedia({ media, className = "" }: { media: ThreadMedia[]; className?: string }) {
  if (media.length === 0) return null;
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      {media.map((m) =>
        m.type.startsWith("image/") ? (
          <a key={m.id} href={m.url} target="_blank" rel="noopener noreferrer" className="block overflow-hidden rounded-xl" title="Open full size">
            {/* eslint-disable-next-line @next/next/no-img-element -- the bytes come from our own API, not an optimizable asset */}
            <img src={m.url} alt="" className="block max-h-72 w-auto max-w-full object-contain" loading="lazy" />
          </a>
        ) : m.type.startsWith("video/") ? (
          <video key={m.id} src={m.url} controls playsInline preload="metadata" className="block max-h-72 w-auto max-w-full rounded-xl bg-black" />
        ) : m.type.startsWith("audio/") ? (
          <audio key={m.id} src={m.url} controls preload="metadata" className="block w-full max-w-[16rem]" />
        ) : (
          <a
            key={m.id}
            href={m.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg bg-black/10 px-2.5 py-1.5 text-xs font-semibold underline"
          >
            {m.type.endsWith("vcard") ? <FileText size={13} /> : <Paperclip size={13} />}
            {m.type.endsWith("vcard") ? "Contact card" : "Attachment"}
          </a>
        )
      )}
    </div>
  );
}
