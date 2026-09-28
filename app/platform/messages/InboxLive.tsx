"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";

// The inbox is server-rendered. This keeps it current while it is open: a
// small heartbeat every few seconds, and a re-render only when a message
// actually landed (2026-09-28: texting is live and the list sat stale).
const POLL_MS = 4_000;

export default function InboxLive({ stamp }: { stamp: string | null }) {
  const router = useRouter();
  const seen = useRef(stamp);
  seen.current = stamp;

  useEffect(() => {
    let stopped = false;
    let inflight = false;
    const tick = async () => {
      if (stopped || inflight || document.visibilityState !== "visible") return;
      inflight = true;
      try {
        const res = await fetch("/api/app/messages/latest");
        if (!res.ok) return;
        const data = (await res.json()) as { stamp: string | null };
        if (!stopped && data.stamp !== seen.current) router.refresh();
      } catch {
        /* transient — next tick retries */
      } finally {
        inflight = false;
      }
    };
    const interval = setInterval(tick, POLL_MS);
    const onVisible = () => {
      if (document.visibilityState === "visible") void tick();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
