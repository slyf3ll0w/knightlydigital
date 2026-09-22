"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, Pause, Play } from "lucide-react";

/**
 * In-app voicemail player. The native <audio controls> element carried the
 * browser's own overflow menu (download / playback speed) — Windows chrome
 * inside a WorkBench card — so this is a small custom one: play/pause,
 * a scrubbable progress bar, elapsed / total, and a speed toggle. The audio
 * element stays hidden and points at /api/app/calls/[id]/voicemail, which
 * 302s to Telnyx's short-lived MP3 URL; nothing is fetched until play.
 */
export default function VoicemailPlayer({ callId, seconds }: { callId: string; /** Recorded length, shown before the file has loaded. */ seconds: number | null }) {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [state, setState] = useState<"idle" | "loading" | "playing" | "paused" | "error">("idle");
  const [t, setT] = useState(0);
  const [dur, setDur] = useState<number | null>(seconds);
  const [rate, setRate] = useState<1 | 1.5 | 2>(1);

  useEffect(() => {
    const a = audio.current;
    if (!a) return;
    const onTime = () => setT(a.currentTime);
    const onMeta = () => Number.isFinite(a.duration) && setDur(a.duration);
    const onPlay = () => setState("playing");
    const onPause = () => setState(a.ended ? "idle" : "paused");
    const onEnded = () => {
      setState("idle");
      setT(0);
    };
    const onWaiting = () => setState((s) => (s === "playing" ? "loading" : s));
    const onError = () => setState("error");
    a.addEventListener("timeupdate", onTime);
    a.addEventListener("loadedmetadata", onMeta);
    a.addEventListener("durationchange", onMeta);
    a.addEventListener("playing", onPlay);
    a.addEventListener("pause", onPause);
    a.addEventListener("ended", onEnded);
    a.addEventListener("waiting", onWaiting);
    a.addEventListener("error", onError);
    return () => {
      a.removeEventListener("timeupdate", onTime);
      a.removeEventListener("loadedmetadata", onMeta);
      a.removeEventListener("durationchange", onMeta);
      a.removeEventListener("playing", onPlay);
      a.removeEventListener("pause", onPause);
      a.removeEventListener("ended", onEnded);
      a.removeEventListener("waiting", onWaiting);
      a.removeEventListener("error", onError);
    };
  }, []);

  const toggle = async () => {
    const a = audio.current;
    if (!a) return;
    if (state === "playing" || state === "loading") {
      a.pause();
      return;
    }
    setState("loading");
    try {
      a.playbackRate = rate;
      await a.play();
    } catch {
      setState("error");
    }
  };

  const seek = (e: React.MouseEvent<HTMLDivElement>) => {
    const a = audio.current;
    if (!a || !dur) return;
    const r = e.currentTarget.getBoundingClientRect();
    const frac = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    a.currentTime = frac * dur;
    setT(a.currentTime);
  };

  const cycleRate = () => {
    const next: 1 | 1.5 | 2 = rate === 1 ? 1.5 : rate === 1.5 ? 2 : 1;
    setRate(next);
    if (audio.current) audio.current.playbackRate = next;
  };

  const fmt = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
  const pct = dur ? Math.min(100, (t / dur) * 100) : 0;
  const busy = state === "loading";

  return (
    <div className="mt-3 flex items-center gap-3 rounded-[10px] border border-blue-100 bg-blue-50/50 px-3 py-2">
      <audio ref={audio} preload="none" src={`/api/app/calls/${callId}/voicemail`} />
      <button
        type="button"
        onClick={toggle}
        disabled={state === "error"}
        aria-label={state === "playing" ? "Pause voicemail" : "Play voicemail"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-blue-600 text-white shadow-sm transition-colors hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <Loader2 size={16} className="animate-spin" /> : state === "playing" ? <Pause size={16} /> : <Play size={16} className="ml-0.5" />}
      </button>
      <div className="min-w-0 flex-1">
        <div
          role="slider"
          aria-label="Voicemail position"
          aria-valuemin={0}
          aria-valuemax={dur ?? 0}
          aria-valuenow={t}
          onClick={seek}
          className="group relative h-6 cursor-pointer"
        >
          <div className="absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-blue-200/70">
            <div className="h-full rounded-full bg-blue-600 transition-[width] duration-150" style={{ width: `${pct}%` }} />
          </div>
          <div
            className="absolute top-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-600 bg-white shadow-sm opacity-0 transition-opacity group-hover:opacity-100"
            style={{ left: `${pct}%`, opacity: state !== "idle" ? 1 : undefined }}
          />
        </div>
        {state === "error" && <p className="text-[11px] text-red-600">Couldn&apos;t load this recording. It may have expired at Telnyx.</p>}
      </div>
      <span className="numeral-ledger shrink-0 text-xs tabular-nums text-gray-600">
        {fmt(t)}
        <span className="text-gray-400"> / {dur ? fmt(dur) : "–:––"}</span>
      </span>
      <button
        type="button"
        onClick={cycleRate}
        className="shrink-0 rounded-full border border-blue-200 bg-white px-2 py-0.5 text-[11px] font-semibold text-blue-700 hover:bg-blue-50"
        aria-label="Playback speed"
        title="Playback speed"
      >
        {rate}×
      </button>
    </div>
  );
}
