"use client";

import { useEffect } from "react";

/**
 * Team-map position reporting. Every few minutes WHILE the app is in the
 * foreground: ask the server "am I clocked in?" and only then read the
 * device's position and post one ping. The order matters — geolocation is
 * never touched off the clock, which is both the privacy promise to techs
 * and the reason the permission prompt only ever appears around clocking.
 *
 * Foreground-only by design (tier 2, no background tracking): when the phone
 * locks or the app is backgrounded, pings stop and the team map shows the
 * last known position with its age.
 */
const INTERVAL_MS = 3 * 60_000;

export default function TeamLocationReporter() {
  useEffect(() => {
    let cancelled = false;
    let inFlight = false;

    async function tick() {
      if (cancelled || inFlight) return;
      if (document.visibilityState !== "visible" || !navigator.onLine) return;
      if (!("geolocation" in navigator)) return;
      inFlight = true;
      try {
        // 1. On the clock? (server-checked; no location read otherwise)
        const res = await fetch("/api/app/location");
        if (!res.ok) return;
        const { onClock } = await res.json();
        if (!onClock || cancelled) return;

        // 2. One position read, then one ping
        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 10000);
          navigator.geolocation.getCurrentPosition(
            (p) => {
              clearTimeout(timer);
              resolve(p);
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 9000, maximumAge: 120000 }
          );
        });
        if (!pos || cancelled) return;
        await fetch("/api/app/location", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
          }),
        });
      } catch {
        // best-effort — never surface errors for a background nicety
      } finally {
        inFlight = false;
      }
    }

    tick();
    const id = setInterval(tick, INTERVAL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      cancelled = true;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, []);

  return null;
}
