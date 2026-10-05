"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, MonitorSmartphone } from "lucide-react";
import { SIGN_OUT_FAILED, useAppSignOut } from "@/lib/sign-out";

/**
 * Tells the server "someone is looking at the app" (POST /api/app/presence)
 * every 20 s while this page is VISIBLE, right away when it comes back to
 * the front, and on the first touch / key after a few seconds of quiet. A
 * hidden tab or a phone app in the background sends nothing, so the platform
 * console's green dot (lib/presence.ts, 3 min window) means the app is
 * actually open in front of someone. Mounted once in the platform layout
 * (signed-in branch).
 *
 * The same beat enforces one active device per login (lib/active-device.ts).
 * When the server answers `busy`, this covers the app with "in use on …" and
 * a "Use it here" button; while covered it beats every 10 s so the wall lifts
 * soon after the other device goes idle (or the other person is bounced).
 * The touch trigger is what makes a takeover feel immediate on the OTHER
 * device: a phone left face-up on the desk learns on its next tick, but the
 * moment someone picks it up and taps, it asks and is walled.
 *
 * The button arms late on purpose (ARM_MS): David's second test showed the
 * wall rendering under a finger mid-tap and that same tap landing on "Use it
 * here", so the phone took the lock straight back without him meaning to.
 */
const BEAT_MS = 20_000;
const BUSY_BEAT_MS = 10_000;
/** Timer / focus beats never land closer together than this. */
const FLOOR_MS = 10_000;
/** A touch or key re-checks sooner, but not on every tap. */
const TOUCH_FLOOR_MS = 4_000;
/** "Use it here" ignores the tap that was already in flight when the wall appeared. */
const ARM_MS = 900;

type Busy = { device: string };

export default function PresenceBeacon() {
  const [busy, setBusy] = useState<Busy | null>(null);
  const [armed, setArmed] = useState(false);
  const [taking, setTaking] = useState(false);
  const signOut = useAppSignOut();
  const last = useRef(0);
  const inFlight = useRef(false);

  const beat = useCallback(async (takeover = false, floorMs = FLOOR_MS) => {
    if (document.visibilityState !== "visible" || !navigator.onLine) return;
    const now = Date.now();
    if (!takeover && (now - last.current < floorMs || inFlight.current)) return;
    last.current = now;
    inFlight.current = true;
    try {
      const res = await fetch("/api/app/presence", {
        method: "POST",
        keepalive: true,
        headers: { "content-type": "application/json" },
        body: JSON.stringify(takeover ? { takeover: true } : {}),
      });
      if (!res.ok) return;
      const data = (await res.json().catch(() => null)) as { ok?: boolean; busy?: boolean; device?: string } | null;
      if (data?.busy) setBusy((cur) => (cur && cur.device === data.device ? cur : { device: data.device || "another device" }));
      else if (data?.ok) setBusy(null);
    } catch {
      // offline / aborted — the next beat tries again
    } finally {
      inFlight.current = false;
    }
  }, []);

  useEffect(() => {
    void beat();
    const onWake = () => void beat();
    const onTouch = () => void beat(false, TOUCH_FLOOR_MS);
    document.addEventListener("visibilitychange", onWake);
    window.addEventListener("focus", onWake);
    window.addEventListener("pageshow", onWake);
    window.addEventListener("pointerdown", onTouch, { passive: true, capture: true });
    window.addEventListener("keydown", onTouch, { passive: true, capture: true });
    return () => {
      document.removeEventListener("visibilitychange", onWake);
      window.removeEventListener("focus", onWake);
      window.removeEventListener("pageshow", onWake);
      window.removeEventListener("pointerdown", onTouch, { capture: true });
      window.removeEventListener("keydown", onTouch, { capture: true });
    };
  }, [beat]);

  useEffect(() => {
    const timer = setInterval(() => void beat(), busy ? BUSY_BEAT_MS : BEAT_MS);
    return () => clearInterval(timer);
  }, [beat, busy]);

  // Arm the button only once the wall has been on screen for a moment.
  useEffect(() => {
    if (!busy) {
      setArmed(false);
      return;
    }
    const t = setTimeout(() => setArmed(true), ARM_MS);
    return () => clearTimeout(t);
  }, [busy]);

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
      className="fixed inset-0 z-[450] flex items-center justify-center bg-white [[data-mode=dark]_&]:bg-[#0B1120] px-6"
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
        <button
          type="button"
          onClick={() => void takeOver()}
          disabled={!armed || taking}
          className="btn-primary btn-lg mx-auto mt-6 transition-opacity"
          style={{ opacity: armed ? undefined : 0.5 }}
        >
          {taking ? <Loader2 size={14} className="animate-spin" /> : <MonitorSmartphone size={14} />}
          Use it here
        </button>
        <p className="mt-3 text-xs text-gray-500 [[data-mode=dark]_&]:text-gray-400">
          Several devices on one login is included with Pro.
        </p>
        <button
          type="button"
          onClick={() => void signOut.signOut()}
          disabled={signOut.signingOut}
          className="mt-4 text-sm text-gray-500 underline-offset-2 hover:underline disabled:opacity-60 [[data-mode=dark]_&]:text-gray-400"
        >
          {signOut.signingOut ? "Signing out…" : "Sign out"}
        </button>
        {signOut.failed && (
          <p role="alert" className="mt-2 text-xs text-red-600">
            {SIGN_OUT_FAILED}
          </p>
        )}
      </div>
    </div>
  );
}
