"use client";

import { useEffect } from "react";

/**
 * Service-worker registration for the client hub (the operator app registers
 * via OfflineSupport). The hub shares /sw.js — root scope, so one worker
 * serves both surfaces: web push for message replies, plus the static-asset
 * caches. Hub pages themselves aren't snapshotted (the SW's offline logic is
 * /app-only); this exists so the hub can be installed as a PWA and receive
 * notifications. Production only — dev servers fight with SW caching.
 */
export default function HubPwa() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  }, []);
  return null;
}
