"use client";

import { useEffect } from "react";

/**
 * Marks an emailed free-tool document (/t/<token>) as viewed. Same shape as
 * components/ViewBeacon.tsx: fires once, and only after the tab has been
 * visible for a moment, so email link-scanner prefetchers (Outlook
 * SafeLinks, Yahoo) don't count as the client opening it. The server also
 * ignores a view from the sender's own browser (their cookie).
 */
export default function SentViewBeacon({ token }: { token: string }) {
  useEffect(() => {
    let fired = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const fire = () => {
      if (fired) return;
      fired = true;
      fetch("/api/public/tools/email/view", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        keepalive: true,
      }).catch(() => {});
    };
    const arm = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(fire, 1500);
    };
    const onVisibility = () => {
      if (document.visibilityState === "visible") arm();
      else if (timer) clearTimeout(timer);
    };
    if (document.visibilityState === "visible") arm();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      if (timer) clearTimeout(timer);
    };
  }, [token]);
  return null;
}
