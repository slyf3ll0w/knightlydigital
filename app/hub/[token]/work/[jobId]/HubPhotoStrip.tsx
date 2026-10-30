"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, X } from "lucide-react";

/**
 * The client's photo grid on the report page: thumbnails that open a plain
 * full-screen view with swipe / arrows. No editing — that is the crew's
 * viewer (components/PhotoViewer.tsx).
 */
export default function HubPhotoStrip({ photos }: { photos: { id: string; src: string; thumb: string; label: string }[] }) {
  const [open, setOpen] = useState<number | null>(null);
  const [start, setStart] = useState<number | null>(null);

  useEffect(() => {
    if (open === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(null);
      if (e.key === "ArrowRight") setOpen((i) => (i === null ? null : Math.min(photos.length - 1, i + 1)));
      if (e.key === "ArrowLeft") setOpen((i) => (i === null ? null : Math.max(0, i - 1)));
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, photos.length]);

  const current = open === null ? null : photos[open];

  return (
    <>
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
        {photos.map((p, i) => (
          <button key={p.id} type="button" onClick={() => setOpen(i)} className="relative aspect-square overflow-hidden rounded-lg bg-gray-100" aria-label={p.label || "Photo"}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={p.thumb} alt={p.label || "Photo"} loading="lazy" className="h-full w-full object-cover" />
            {p.label && <span className="absolute bottom-1 left-1 max-w-[90%] truncate rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold text-white">{p.label}</span>}
          </button>
        ))}
      </div>

      {current && (
        <div
          className="fixed inset-0 z-[90] flex flex-col bg-black text-white"
          role="dialog"
          aria-modal="true"
          aria-label="Photo"
          onPointerDown={(e) => setStart(e.clientX)}
          onPointerUp={(e) => {
            if (start === null) return;
            const dx = e.clientX - start;
            setStart(null);
            if (Math.abs(dx) > 48) setOpen((i) => (i === null ? null : Math.max(0, Math.min(photos.length - 1, i + (dx < 0 ? 1 : -1)))));
          }}
        >
          <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),8px)] pb-2">
            <button type="button" onClick={() => setOpen(null)} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
              <X size={22} />
            </button>
            <span className="text-sm text-white/80">
              {open! + 1} of {photos.length}
            </span>
            <span className="w-10" />
          </div>
          <div className="relative flex-1 overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={current.src} alt={current.label || "Photo"} draggable={false} className="absolute inset-0 m-auto max-h-full max-w-full object-contain" />
            {open! > 0 && (
              <button type="button" onClick={() => setOpen(open! - 1)} className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 lg:block" aria-label="Previous photo">
                <ChevronLeft size={22} />
              </button>
            )}
            {open! < photos.length - 1 && (
              <button type="button" onClick={() => setOpen(open! + 1)} className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 lg:block" aria-label="Next photo">
                <ChevronRight size={22} />
              </button>
            )}
          </div>
          {current.label && <p className="px-4 pb-[max(env(safe-area-inset-bottom),12px)] pt-3 text-center text-sm text-white/80">{current.label}</p>}
        </div>
      )}
    </>
  );
}
