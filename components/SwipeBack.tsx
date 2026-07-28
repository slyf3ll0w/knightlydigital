"use client";

import { useEffect, useRef } from "react";

/**
 * iOS edge-swipe-back for the mobile shell. A drag starting on the invisible
 * 20px strip pinned to the left edge tracks the finger — the app's <main>
 * translates live with an edge shadow — and past the commit threshold (or
 * with enough velocity) pops back through the same handler as the header's
 * "‹ Section" control.
 *
 * The strip exists because WebKit decides whether a touch belongs to native
 * scrolling within the first few moved pixels — before a document-level
 * handler can claim it — so on real iPhones a late preventDefault is
 * ignored. `touch-action: none` on the strip hands its touches to JS up
 * front. Plain taps on the strip are forwarded to whatever sits underneath,
 * so edge-adjacent buttons and list rows keep working.
 *
 * Only rendered on subpages (enabled = the header shows a back control) and
 * sits at z-30, underneath sheet backdrops (z-40) — an open sheet blocks it.
 * Works identically in Safari, the PWA, and the Capacitor App Store shell;
 * no native rebuild needed.
 */
export default function SwipeBack({
  enabled,
  mainRef,
  onBack,
  pathname,
}: {
  enabled: boolean;
  mainRef: React.RefObject<HTMLElement | null>;
  onBack: () => void;
  pathname: string;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;

  // Navigation completed — drop any leftover slide instantly (no transition,
  // the incoming page plays its own entrance).
  useEffect(() => {
    const el = mainRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.boxShadow = "";
    }
  }, [pathname, mainRef]);

  useEffect(() => {
    const strip = stripRef.current;
    if (!strip) return;

    const state = {
      active: false,
      dragging: false,
      startX: 0,
      startY: 0,
      startT: 0,
      lastX: 0,
      lastT: 0,
      velocity: 0,
    };

    const reset = (el: HTMLElement, animate: boolean) => {
      if (animate) {
        el.style.transition = "transform 0.22s cubic-bezier(0.32,0.72,0,1), box-shadow 0.22s ease";
        el.style.transform = "translateX(0)";
        el.style.boxShadow = "";
        window.setTimeout(() => {
          el.style.transition = "";
          el.style.transform = "";
        }, 240);
      } else {
        el.style.transition = "";
        el.style.transform = "";
        el.style.boxShadow = "";
      }
    };

    const onTouchStart = (e: TouchEvent) => {
      if (e.touches.length !== 1 || window.innerWidth >= 1024) return;
      const t = e.touches[0];
      state.active = true;
      state.dragging = false;
      state.startX = t.clientX;
      state.startY = t.clientY;
      state.startT = e.timeStamp;
      state.lastX = t.clientX;
      state.lastT = e.timeStamp;
      state.velocity = 0;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!state.active) return;
      const el = mainRef.current;
      if (!el) return;
      const t = e.touches[0];
      const dx = t.clientX - state.startX;
      const dy = t.clientY - state.startY;
      if (!state.dragging) {
        if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
        // Mostly-vertical movement isn't a back swipe — let it die (the strip
        // owns the touch either way; nothing scrolls under it).
        if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) {
          state.active = false;
          return;
        }
        state.dragging = true;
        el.style.transition = "none";
        el.style.boxShadow = "-8px 0 24px rgba(0,0,0,0.14)";
      }
      if (e.cancelable) e.preventDefault();
      const x = Math.max(0, dx);
      const dt = Math.max(1, e.timeStamp - state.lastT);
      state.velocity = (t.clientX - state.lastX) / dt;
      state.lastX = t.clientX;
      state.lastT = e.timeStamp;
      el.style.transform = `translateX(${x}px)`;
    };

    const onTouchEnd = (e: TouchEvent) => {
      if (!state.active) return;
      state.active = false;
      const el = mainRef.current;
      if (state.dragging) {
        state.dragging = false;
        if (!el) return;
        const dx = state.lastX - state.startX;
        const commit = dx > Math.min(96, window.innerWidth * 0.3) || state.velocity > 0.55;
        if (commit) {
          el.style.transition = "transform 0.18s ease-out";
          el.style.transform = `translateX(${window.innerWidth}px)`;
          backRef.current();
        } else {
          reset(el, true);
        }
        return;
      }
      // No drag — it was a tap. Forward it to whatever the strip covers
      // (back-control chevron, edge of a list row) so the edge stays tappable.
      if (e.timeStamp - state.startT < 500) {
        const touch = e.changedTouches[0];
        if (!touch) return;
        strip.style.pointerEvents = "none";
        const under = document.elementFromPoint(touch.clientX, touch.clientY);
        strip.style.pointerEvents = "";
        if (under instanceof HTMLElement) under.click();
      }
    };

    strip.addEventListener("touchstart", onTouchStart, { passive: true });
    strip.addEventListener("touchmove", onTouchMove, { passive: false });
    strip.addEventListener("touchend", onTouchEnd, { passive: true });
    strip.addEventListener("touchcancel", onTouchEnd, { passive: true });
    return () => {
      strip.removeEventListener("touchstart", onTouchStart);
      strip.removeEventListener("touchmove", onTouchMove);
      strip.removeEventListener("touchend", onTouchEnd);
      strip.removeEventListener("touchcancel", onTouchEnd);
    };
  }, [mainRef, enabled]);

  if (!enabled) return null;
  return (
    <div
      ref={stripRef}
      aria-hidden
      className="fixed inset-y-0 left-0 z-30 w-5 lg:hidden"
      style={{ touchAction: "none" }}
    />
  );
}
