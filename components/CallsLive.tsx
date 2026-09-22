"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSoftphone } from "@/lib/softphone-client";

/**
 * Keeps a server-rendered calls view current without a reload. Two
 * triggers, both ending in router.refresh():
 *
 *   · the softphone's call changes (placed, answered, ended) — refresh
 *     right away, and once more a couple of seconds later so the webhook
 *     that closes the row (durations, voicemail) has landed;
 *   · GET /api/app/calls/pulse says the company's log changed — polled
 *     every few seconds while the tab is visible, so calls that ring the
 *     cell, missed calls and voicemails appear too.
 *
 * The pulse is a fingerprint, not the data: nothing re-renders while
 * nothing happened.
 */
const POLL_MS = 4_000;
const SETTLE_MS = 2_500;

export default function CallsLive() {
  const router = useRouter();
  const sp = useSoftphone();
  const stamp = useRef<string | null>(null);
  const callKey = sp.call ? `${sp.call.callId ?? "?"}:${sp.call.state}` : "none";

  useEffect(() => {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      if (document.visibilityState === "visible") {
        try {
          const res = await fetch("/api/app/calls/pulse", { cache: "no-store" });
          if (res.ok) {
            const j = (await res.json()) as { stamp?: string };
            if (typeof j.stamp === "string") {
              if (stamp.current !== null && stamp.current !== j.stamp) router.refresh();
              stamp.current = j.stamp;
            }
          }
        } catch {
          /* next tick */
        }
      }
      if (!stopped) timer = setTimeout(tick, POLL_MS);
    };
    void tick();
    const onVisible = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    router.refresh();
    const t = setTimeout(() => router.refresh(), SETTLE_MS);
    return () => clearTimeout(t);
  }, [callKey, router]);

  return null;
}
