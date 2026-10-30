"use client";

import { useRef, useState } from "react";

/**
 * One before/after pair (Gallery plan, phase B). `slider` lays the After
 * over the Before and lets you drag the divide — the client's hub page and
 * the report. `side` puts them next to each other with labels — the job
 * page on a desk. `auto` = slider on phones, side by side from lg up.
 *
 * Takes plain image URLs so the same card works with the staff route
 * (/api/job-photos/…) and the hub route (/hub/<token>/photos/…).
 */
export default function BeforeAfter({
  beforeSrc,
  afterSrc,
  beforeAlt = "Before",
  afterAlt = "After",
  caption,
  variant = "auto",
  className = "",
}: {
  beforeSrc: string;
  afterSrc: string;
  beforeAlt?: string;
  afterAlt?: string;
  caption?: string | null;
  variant?: "slider" | "side" | "auto";
  className?: string;
}) {
  const slider = (
    <Slider beforeSrc={beforeSrc} afterSrc={afterSrc} beforeAlt={beforeAlt} afterAlt={afterAlt} className={variant === "auto" ? "lg:hidden" : ""} />
  );
  const side = (
    <div className={`grid grid-cols-2 gap-2 ${variant === "auto" ? "hidden lg:grid" : ""}`}>
      {[
        { src: beforeSrc, alt: beforeAlt, tag: "Before" },
        { src: afterSrc, alt: afterAlt, tag: "After" },
      ].map((p) => (
        <figure key={p.tag} className="relative aspect-[4/3] overflow-hidden rounded-lg bg-gray-100">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={p.src} alt={p.alt} loading="lazy" className="h-full w-full object-cover" />
          <figcaption className="absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
            {p.tag}
          </figcaption>
        </figure>
      ))}
    </div>
  );
  return (
    <div className={className} data-before-after>
      {variant !== "side" && slider}
      {variant !== "slider" && side}
      {caption && <p className="mt-1.5 text-xs text-gray-600">{caption}</p>}
    </div>
  );
}

function Slider({ beforeSrc, afterSrc, beforeAlt, afterAlt, className }: { beforeSrc: string; afterSrc: string; beforeAlt: string; afterAlt: string; className: string }) {
  const [pct, setPct] = useState(50);
  const box = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  function setFromPointer(clientX: number) {
    const el = box.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setPct(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  }

  return (
    <div
      ref={box}
      className={`relative aspect-[4/3] select-none overflow-hidden rounded-lg bg-gray-100 touch-none ${className}`}
      onPointerDown={(e) => {
        dragging.current = true;
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
        setFromPointer(e.clientX);
      }}
      onPointerMove={(e) => dragging.current && setFromPointer(e.clientX)}
      onPointerUp={() => (dragging.current = false)}
      onPointerCancel={() => (dragging.current = false)}
      role="slider"
      aria-label="Before and after"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(pct)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowLeft") setPct((v) => Math.max(0, v - 5));
        if (e.key === "ArrowRight") setPct((v) => Math.min(100, v + 5));
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={afterSrc} alt={afterAlt} draggable={false} className="absolute inset-0 h-full w-full object-cover" />
      {/* The Before covers the whole box and is clipped, so the two line up exactly. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={beforeSrc}
        alt={beforeAlt}
        draggable={false}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - pct}% 0 0)` }}
      />
      <span className="pointer-events-none absolute left-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">Before</span>
      <span className="pointer-events-none absolute right-2 top-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">After</span>
      <div className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow" style={{ left: `calc(${pct}% - 1px)` }} />
      <div
        className="pointer-events-none absolute top-1/2 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-gray-700 shadow-md"
        style={{ left: `${pct}%` }}
        aria-hidden
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M15 6l-6 6 6 6" />
        </svg>
      </div>
    </div>
  );
}
