"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { signOut } from "next-auth/react";

/**
 * Tells the server "someone is looking at the app" (POST /api/app/presence)
 * every 45 s while this page is VISIBLE, and right away when it comes back to
 * the front. A hidden tab or a phone app in the background sends nothing, so
 * the platform console's green dot (lib/presence.ts, 3 min window) means the
 * app is actually open in front of someone. Mounted once in the platform
 * layout (signed-in branch).
 *
 * The same beat enforces one active device per login (lib/active-device.ts).
 * When the server answers `busy`, this covers the app with "in use on …" and
 * a "Use it here" button; while covered it beats every 15 s so the wall lifts
 * soon after the other device goes idle (or the other person is bounced).
 */
const BEAT_MS = 45_000;
const BUSY_BEAT_MS = 15_000;

type Busy = { device: string };

export default function PresenceBeacon() {
  const [busy, setBusy] = useState<Busy | null>(null);
  const [taking, setTaking] = useState(false);
  const last = useRef(0);

  const beat = useCallback(async (takeover = false) => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    const now = Date.now();
    if (!takeover && now - last.current < 10_000) return;
    last.current = now;
    try {
      const res = await fetch("/api/app/presence", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(takeover ? { takeover: true } : {}),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { ok?: boolean; busy?: boolean; device?: string } | null;
      if (data?.busy) setBusy({ device: data.device || "another device" });
      else if (data?.ok) setBusy(null);
    } catch {
      // offline / aborted — the next beat tries again
    }
  }, []);

  useEffect(() => {
    void beat();
    const onWake = () => void beat();
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
    };
  }, [beat]);

  useEffect(() => {
    const timer = setInterval(() => void beat(), busy ? BUSY_BEAT_MS : BEAT_MS);
    return () => clearInterval(timer);
  }, [beat, busy]);

  const takeOver = useCallback(async () => {
    setTaking(true);
    await beat(true);
    setTaking(false);
  }, [beat]);

  if (!busy) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="one-device-title"
      data-testid="one-device-wall"
      className="fixed inset-0 z-[600] flex items-center justify-center bg-white [[data-mode=dark]_&]:bg-[#0B1120] px-6"
      style={{ paddingTop: "env(safe-area-inset-top)", paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <div className="w-full max-w-sm text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-gray-100 [[data-mode=dark]_&]:bg-white/10">
          <MonitorSmartphone size={26} className="text-gray-500 [[data-mode=dark]_&]:text-gray-300" />
        </div>
        <h2 id="one-device-title" className="mt-4 text-lg font-semibold text-gray-900 [[data-mode=dark]_&]:text-white">
          This login is in use on {busy.device}
        </h2>
        <p className="mt-2 text-sm text-gray-600 [[data-mode=dark]_&]:text-gray-300">
          WorkBench works on one device at a time per login. If that&apos;s you, take it back here. If it&apos;s someone
          else, they need their own login from the Team page.
        </p>
        <button type="button" onClick={() => void takeOver()} disabled={taking} className="btn-primary btn-lg mx-auto mt-6">
          {taking ? <Loader2 size={14} className="animate-spin" /> : <MonitorSmartphone size={14} />}
          Use it here
        </button>
        <button
          type="button"
          onClick={() => void signOut({ callbackUrl: "/app/login" })}
          className="mt-4 text-sm text-gray-500 underline-offset-2 hover:underline [[data-mode=dark]_&]:text-gray-400"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
