"use client";

import { useEffect, useRef } from "react";

/**
 * iOS edge-swipe history navigation for the mobile shell (the Safari
 * two-edge pattern). A drag starting on the invisible 20px strip at the
 * LEFT edge tracks the finger — <main> translates live with an edge
 * shadow — and past the commit threshold pops back through the same
 * handler as the header's "‹ Section" control. The RIGHT edge mirrors it:
 * swipe left to go FORWARD to the screen you just swiped away from.
 *
 * The strips exist because WebKit decides whether a touch belongs to native
 * scrolling within the first few moved pixels — before a document-level
 * handler can claim it — so on real iPhones a late preventDefault is
 * ignored. `touch-action: pan-y` on the strips keeps vertical scrolling
 * native (thumbs start scrolls at the edges constantly) while guaranteeing
 * horizontal drags hand to JS. Plain taps are forwarded to whatever sits
 * underneath, so edge-adjacent buttons and list rows keep working.
 *
 * There is no API for "does a forward entry exist", so a committed forward
 * swipe arms a watchdog: if the route hasn't changed shortly after
 * router.forward(), the page springs back (Safari's dead-end tug). The back
 * strip only renders on subpages (enabled); the forward strip is always on.
 * Both sit at z-30, underneath sheet backdrops (z-40) — an open sheet
 * blocks them. Works identically in Safari, the PWA, and the Capacitor App
 * Store shell; no native rebuild needed.
 */
export default function SwipeBack({
  enabled,
  mainRef,
  onBack,
  onForward,
  pathname,
}: {
  enabled: boolean;
  mainRef: React.RefObject<HTMLElement | null>;
  onBack: () => void;
  onForward: () => void;
  pathname: string;
}) {
  const backStripRef = useRef<HTMLDivElement>(null);
  const fwdStripRef = useRef<HTMLDivElement>(null);
  const backRef = useRef(onBack);
  backRef.current = onBack;
  const fwdRef = useRef(onForward);
  fwdRef.current = onForward;
  const watchdogRef = useRef<number | null>(null);

  // Navigation completed — drop any leftover slide instantly (no transition,
  // the incoming page plays its own entrance) and stand down the watchdog.
  useEffect(() => {
    if (watchdogRef.current !== null) {
      window.clearTimeout(watchdogRef.current);
      watchdogRef.current = null;
    }
    const el = mainRef.current;
    if (el) {
      el.style.transition = "";
      el.style.transform = "";
      el.style.boxShadow = "";
    }
  }, [pathname, mainRef]);

  useEffect(() => {
    const springHome = (el: HTMLElement) => {
      el.style.transition = "transform 0.22s cubic-bezier(0.32,0.72,0,1), box-shadow 0.22s ease";
      el.style.transform = "translateX(0)";
      el.style.boxShadow = "";
      window.setTimeout(() => {
        el.style.transition = "";
        el.style.transform = "";
      }, 240);
    };

    // dir +1 = back (drag right from the left edge), -1 = forward
    const attach = (strip: HTMLDivElement, dir: 1 | -1, go: () => void) => {
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
        const dx = (t.clientX - state.startX) * dir; // progress toward commit
        const dy = t.clientY - state.startY;
        if (!state.dragging) {
          if (Math.abs(dx) < 6 && Math.abs(dy) < 6) return;
          // Mostly-vertical or wrong-way movement isn't this gesture
          if (dx <= 0 || Math.abs(dx) < Math.abs(dy)) {
            state.active = false;
            return;
          }
          state.dragging = true;
          el.style.transition = "none";
          el.style.boxShadow =
            dir === 1 ? "-8px 0 24px rgba(0,0,0,0.14)" : "8px 0 24px rgba(0,0,0,0.14)";
        }
        if (e.cancelable) e.preventDefault();
        const x = Math.max(0, dx) * dir;
        const dt = Math.max(1, e.timeStamp - state.lastT);
        state.velocity = ((t.clientX - state.lastX) * dir) / dt;
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
          const dx = (state.lastX - state.startX) * dir;
          const commit = dx > Math.min(96, window.innerWidth * 0.3) || state.velocity > 0.55;
          if (commit) {
            el.style.transition = "transform 0.18s ease-out";
            el.style.transform = `translateX(${window.innerWidth * dir}px)`;
            go();
            // No route change (e.g. forward with no forward entry) → tug back
            watchdogRef.current = window.setTimeout(() => {
              watchdogRef.current = null;
              const m = mainRef.current;
              if (m && m.style.transform) springHome(m);
            }, 650);
          } else {
            springHome(el);
          }
          return;
        }
        // No drag — it was a tap. Forward it to whatever the strip covers
        // (back-control chevron, row chevrons) so the edges stay tappable.
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
    };

    const cleanups: (() => void)[] = [];
    if (backStripRef.current)
      cleanups.push(attach(backStripRef.current, 1, () => backRef.current()));
    if (fwdStripRef.current)
      cleanups.push(attach(fwdStripRef.current, -1, () => fwdRef.current()));
    return () => cleanups.forEach((fn) => fn());
  }, [mainRef, enabled]);

  return (
    <>
      {enabled && (
        <div
          ref={backStripRef}
          aria-hidden
          className="fixed inset-y-0 left-0 z-30 w-5 lg:hidden"
          style={{ touchAction: "pan-y" }}
        />
      )}
      <div
        ref={fwdStripRef}
        aria-hidden
        className="fixed inset-y-0 right-0 z-30 w-5 lg:hidden"
        style={{ touchAction: "pan-y" }}
      />
    </>
  );
}
