"use client";

import Image from "next/image";
import { useState } from "react";
import { Play } from "lucide-react";

/**
 * A video that shows its poster and one big play button until it is
 * pressed (the browser's control bar over the cover looked unfinished),
 * then plays with normal controls.
 */
export default function WBVideo({ src, poster, label, caption }: { src: string; poster: string; label: string; caption?: string }) {
  const [playing, setPlaying] = useState(false);

  if (playing) {
    return (
      <video
        className="aspect-video w-full bg-[#0A1428]"
        src={src}
        poster={poster}
        controls
        autoPlay
        playsInline
        aria-label={label}
      />
    );
  }

  return (
    <button type="button" onClick={() => setPlaying(true)} className="group relative block aspect-video w-full overflow-hidden bg-[#0A1428]" aria-label={`Play: ${label}`}>
      <Image src={poster} alt="" fill sizes="(min-width: 1024px) 640px, 100vw" className="object-cover transition-transform duration-700 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-[1.02]" />
      <span className="absolute inset-0 bg-gradient-to-t from-[#0A1428]/45 via-transparent to-transparent" />
      <span className="absolute left-1/2 top-1/2 flex h-[76px] w-[76px] -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white shadow-[0_1px_2px_rgba(10,20,40,0.2),0_18px_40px_-12px_rgba(10,20,40,0.6)] transition-transform duration-200 ease-[cubic-bezier(0.2,0.8,0.2,1)] group-hover:scale-105 group-active:scale-95">
        <Play className="ml-1 h-7 w-7 fill-[#F86A0A] text-[#F86A0A]" />
      </span>
      {caption && <span className="absolute bottom-4 left-5 text-[14px] font-bold text-white/95">{caption}</span>}
    </button>
  );
}
