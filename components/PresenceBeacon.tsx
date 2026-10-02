"use client";

import { useEffect } from "react";

/**
 * Tells the server "someone is looking at the app" (POST /api/app/presence)
 * every 45 s while this page is VISIBLE, and right away when it comes back to
 * the front. A hidden tab or a phone app in the background sends nothing, so
 * the platform console's green dot (lib/presence.ts, 3 min window) means the
 * app is actually open in front of someone. Mounted once in the platform
 * layout (signed-in branch).
 */
const BEAT_MS = 45_000;

export default function PresenceBeacon() {
  useEffect(() => {
    let last = 0;
    const beat = () => {
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      const now = Date.now();
      if (now - last < 10_000) return;
      last = now;
      fetch("/api/app/presence", { method: "POST", keepalive: true }).catch(() => {});
    };
    beat();
    const timer = setInterval(beat, BEAT_MS);
    document.addEventListener("visibilitychange", beat);
    window.addEventListener("focus", beat);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", beat);
      window.removeEventListener("focus", beat);
    };
  }, []);
  return null;
}
