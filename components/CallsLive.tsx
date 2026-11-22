"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useSoftphone } from "@/lib/softphone-client";

/**
 * Keeps a server-rendered calls view current without a reload. Two
 * triggers, both ending in router.refresh():
 *
 *   · the softphone's call changes (placed, answered, ended) — refresh
 *     right away, then again at one, two and a half and five seconds so the
 *     webhook that closes the row (durations, voicemail) is picked up as
 *     soon as it lands;
 *   · GET /api/app/calls/pulse says the company's log changed — polled
 *     every few seconds while the tab is visible, so calls that ring the
 *     cell, missed calls and voicemails appear too.
 *
 * The pulse is a fingerprint, not the data: nothing re-renders while
 * nothing happened. The page hands over the fingerprint it was built with
 * (`builtWith`), so a change that landed between the render and the first
 * poll is caught too: without it a row could sit on "On the line" until
 * the next call (ticket #7iyuu2).
 */
const POLL_MS = 4_000;
const SETTLE_MS = [1_000, 2_500, 5_000];

export default function CallsLive({ builtWith = null }: { builtWith?: string | null }) {
  const router = useRouter();
  const sp = useSoftphone();
  const stamp = useRef<string | null>(builtWith);
  // A fresh render of the page carries a fresh fingerprint
  useEffect(() => {
    if (builtWith !== null) stamp.current = builtWith;
  }, [builtWith]);
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
    const timers = SETTLE_MS.map((ms) => setTimeout(() => router.refresh(), ms));
    return () => timers.forEach(clearTimeout);
  }, [callKey, router]);

  return null;
}
