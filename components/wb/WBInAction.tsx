"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, Play } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import { WB_VIDEOS, type WBVideo } from "@/lib/wb-videos";

/**
 * "WorkBench in action": short silent clips laid out like "A day on the job"
 * — a frame per clip with the time pill in the corner, a bold title and one
 * line under it. A click swaps the poster for the playing video in place
 * (muted, so browsers allow it); only one plays at a time. Phones get the
 * 9:16 cuts in a swipe row. The list is lib/wb-videos.ts — add an entry and
 * the row grows.
 */

const clock = (s: number) => `0:${String(s).padStart(2, "0")}`;

function Clip({ v, phone, playing, onPlay }: { v: WBVideo; phone: boolean; playing: boolean; onPlay: () => void }) {
  const src = phone ? v.srcVertical : v.src;
  const poster = phone ? v.posterVertical : v.poster;
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-[#0A1428] ${phone ? "aspect-[9/16]" : "aspect-[16/9]"}`}>
      {playing ? (
        <video
          key={src}
          className="absolute inset-0 h-full w-full"
          src={src}
          poster={poster}
          controls
          autoPlay
          muted
          playsInline
          aria-label={`${v.title}: ${v.blurb}`}
        />
      ) : (
        <button type="button" onClick={onPlay} className="group absolute inset-0 h-full w-full" aria-label={`Play: ${v.title}`}>
          {/* eslint-disable-next-line @next/next/no-img-element -- poster frames are already sized */}
          <img src={poster} alt="" loading="lazy" className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]" />
          {/* bottom-left: the empty corner of every poster (captions sit mid-left, the device right) */}
          <span className="absolute bottom-3 left-3 flex items-center gap-2 rounded-full bg-white py-1.5 pl-1.5 pr-4 text-[13.5px] font-extrabold text-gray-900 shadow-[0_8px_20px_rgba(10,20,40,0.3)] transition-transform duration-200 group-hover:scale-105">
            <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[#0B57D8]">
              <Play className="ml-0.5 h-3.5 w-3.5 text-white" strokeWidth={2.5} fill="currentColor" />
            </span>
            Play
          </span>
        </button>
      )}
      {!playing && (
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-[#F86A0A] px-3 py-1 text-[12.5px] font-extrabold tracking-wide text-white shadow-sm">
          {clock(v.seconds)}
        </span>
      )}
    </div>
  );
}

export default function WBInAction() {
  const [playing, setPlaying] = useState<string | null>(null);
  const [phone, setPhone] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setPhone(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  return (
    <div className="-mx-5 flex snap-x snap-mandatory gap-5 overflow-x-auto px-5 pb-2 md:mx-0 md:grid md:snap-none md:grid-cols-3 md:gap-6 md:overflow-visible md:px-0 md:pb-0 lg:gap-10">
      {WB_VIDEOS.map((v, i) => (
        <AnimateIn key={v.key} delay={i * 160} className="w-[72vw] max-w-[300px] flex-none snap-center md:w-auto md:max-w-none">
          <Clip v={v} phone={phone} playing={playing === v.key} onPlay={() => setPlaying(v.key)} />
          <p className="mt-5 text-[17px] font-extrabold text-gray-900">{v.title}</p>
          <p className="mt-2 text-[15px] leading-relaxed text-gray-600">{v.blurb}</p>
          {v.guide && (
            <Link href={v.guide} className="mt-3 inline-flex items-center gap-1.5 text-[14.5px] font-bold text-[#0B57D8] hover:underline">
              How it works
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          )}
        </AnimateIn>
      ))}
    </div>
  );
}
