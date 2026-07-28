"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";
import { hapticImpact } from "@/lib/haptics";

/**
 * iOS pull-to-refresh for the mobile shell. Dragging down while <main> sits
 * at scrollTop 0 translates the content with resistance and reveals a brand-
 * accent spinner in the canvas behind it (main is transparent — the paper
 * shows through). Past the threshold, release re-renders the page's server
 * data via router.refresh().
 *
 * Renders as a zero-height flex sibling between the header and <main>, so the
 * spinner is anchored exactly where the content edge parts from the header.
 */
const THRESHOLD = 58;
const MAX_PULL = 84;

export default function PullToRefresh({
  mainRef,
}: {
  mainRef: React.RefObject<HTMLElement | null>;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [refreshing, setRefreshing] = useState(false);
  const spinnerRef = useRef<HTMLDivElement>(null);
  const refreshingRef = useRef(false);
  const pendingRef = useRef(isPending);
  pendingRef.current = isPending;

  // Refresh finished — settle the content back up (min hold so it never blinks)
  useEffect(() => {
    if (!isPending && refreshing) {
      const el = mainRef.current;
      const done = () => {
        refreshingRef.current = false;
        setRefreshing(false);
        if (el) {
          el.style.transition = "transform 0.24s cubic-bezier(0.32,0.72,0,1)";
          el.style.transform = "";
          window.setTimeout(() => {
            el.style.transition = "";
          }, 260);
        }
        if (spinnerRef.current) spinnerRef.current.style.opacity = "0";
      };
      const t = window.setTimeout(done, 250);
      return () => window.clearTimeout(t);
    }
  }, [isPending, refreshing, mainRef]);

  useEffect(() => {
    const state = { tracking: false, pulling: false, startX: 0, startY: 0, pull: 0 };

    const spinnerStyle = (pull: number) => {
      const s = spinnerRef.current;
      if (!s) return;
      const p = Math.min(1, pull / THRESHOLD);
      s.style.opacity = String(p);
      s.style.transform = `rotate(${p * 270}deg)`;
    };

    const onTouchStart = (e: TouchEvent) => {
      const el = mainRef.current;
      if (!el || refreshingRef.current) return;
      if (window.innerWidth >= 1024) return;
      if (el.scrollTop > 0) return;
      const t = e.touches[0];
      if (e.touches.length !== 1) return;
      if (!(e.target instanceof Node) || !el.contains(e.target)) return;
      // Left edge belongs to swipe-back
      if (t.clientX <= 24) return;
      state.tracking = true;
      state.pulling = false;
      state.startX = t.clientX;
      state.startY = t.clientY;
      state.pull = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.tracking) return;
      const el = mainRef.current;
      if (!el) return;
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (!state.pulling) {
        if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
        // Downward and clearly vertical, still pinned to the top
        if (dy <= 0 || Math.abs(dy) < Math.abs(dx) * 1.2 || el.scrollTop > 0) {
          state.tracking = false;
          return;
        }
        state.pulling = true;
        el.style.transition = "none";
      }
      e.preventDefault();
      state.pull = Math.min(MAX_PULL, dy * 0.42);
      el.style.transform = `translateY(${state.pull}px)`;
      spinnerStyle(state.pull);
    };

    const onTouchEnd = () => {
      if (!state.tracking) return;
      const el = mainRef.current;
      state.tracking = false;
      if (!el || !state.pulling) return;
      state.pulling = false;
      if (state.pull >= THRESHOLD) {
        refreshingRef.current = true;
        setRefreshing(true);
        hapticImpact("LIGHT");
        el.style.transition = "transform 0.2s ease-out";
        el.style.transform = `translateY(${THRESHOLD - 6}px)`;
        if (spinnerRef.current) spinnerRef.current.style.opacity = "1";
        startTransition(() => router.refresh());
      } else {
        el.style.transition = "transform 0.24s cubic-bezier(0.32,0.72,0,1)";
        el.style.transform = "";
        window.setTimeout(() => {
          el.style.transition = "";
        }, 260);
        if (spinnerRef.current) spinnerRef.current.style.opacity = "0";
      }
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd, { passive: true });
    document.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mainRef, router, startTransition]);

  return (
    <div aria-hidden className="relative z-0 h-0 overflow-visible lg:hidden">
      <div
        ref={spinnerRef}
        className="absolute left-1/2 top-4 -ml-3 opacity-0"
        style={{ transition: "opacity 0.15s ease" }}
      >
        <Loader2
          size={24}
          className={refreshing ? "animate-spin" : ""}
          style={{ color: "var(--wb-accent, #0B57D8)" }}
        />
      </div>
    </div>
  );
}
