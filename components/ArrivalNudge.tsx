"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, MapPin, Play } from "lucide-react";
import BottomSheet from "./BottomSheet";
import { sendOrQueue } from "@/lib/outbox";
import { hapticImpact } from "@/lib/haptics";

/**
 * Arrival awareness: when the phone comes to the foreground near the day's
 * next job site, offer a one-tap "Clock in?" sheet. Prompt, never automatic —
 * techs hate software punching their clock for them.
 *
 * Deliberately conservative about both battery and privacy:
 * - One-shot position reads only, and only at app-open/foreground moments
 *   (never continuous tracking), throttled to one check per few minutes.
 * - Only runs when geolocation permission is ALREADY granted — it never
 *   raises the browser permission prompt itself (techs who clock in with GPS
 *   have granted it; everyone else never hears from this).
 * - Phones only, and "Not now" mutes that job for good (a job is visited
 *   once — no re-prompting every time the app foregrounds on site).
 */

const CHECK_MIN_MS = 4 * 60_000; // at most one check per 4 minutes
const NEAR_METERS = 150;
const MAX_FIX_ACCURACY = 250; // a fix vaguer than this can't say "you're here"

function metersBetween(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const R = 6371000;
  const dLat = ((bLat - aLat) * Math.PI) / 180;
  const dLng = ((bLng - aLng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((aLat * Math.PI) / 180) * Math.cos((bLat * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

type NearbyJob = { id: string; title: string };

export default function ArrivalNudge() {
  const router = useRouter();
  const [nearby, setNearby] = useState<NearbyJob | null>(null);
  const [busy, setBusy] = useState(false);
  const lastFix = useRef<GeolocationPosition | null>(null);
  const lastCheck = useRef(0);
  const checking = useRef(false);

  useEffect(() => {
    // Phones only — a desk browser's IP-based "location" is noise
    if (!window.matchMedia("(max-width: 1023px)").matches) return;

    async function check() {
      if (checking.current || Date.now() - lastCheck.current < CHECK_MIN_MS) return;
      checking.current = true;
      lastCheck.current = Date.now();
      try {
        // Never be the reason the permission prompt appears
        const perm = await navigator.permissions
          .query({ name: "geolocation" as PermissionName })
          .catch(() => null);
        if (perm?.state !== "granted") return;

        const res = await fetch("/api/app/arrival");
        if (!res.ok) return;
        const data = (await res.json()) as {
          job: { id: string; title: string; lat: number | null; lng: number | null } | null;
          clockedInJobId: string | null;
        };
        const job = data.job;
        if (!job || job.lat == null || job.lng == null) return;
        if (data.clockedInJobId === job.id) return; // already on this clock
        if (localStorage.getItem(`wb-arrival-muted:${job.id}`)) return;

        const pos = await new Promise<GeolocationPosition | null>((resolve) => {
          const timer = setTimeout(() => resolve(null), 8000);
          navigator.geolocation.getCurrentPosition(
            (p) => {
              clearTimeout(timer);
              resolve(p);
            },
            () => {
              clearTimeout(timer);
              resolve(null);
            },
            { enableHighAccuracy: false, timeout: 7500, maximumAge: 120000 }
          );
        });
        if (!pos || pos.coords.accuracy > MAX_FIX_ACCURACY) return;
        lastFix.current = pos;

        const dist = metersBetween(pos.coords.latitude, pos.coords.longitude, job.lat, job.lng);
        if (dist <= NEAR_METERS) {
          hapticImpact("LIGHT");
          setNearby({ id: job.id, title: job.title });
        }
      } catch {
        /* arrival is a convenience — never surface its failures */
      } finally {
        checking.current = false;
      }
    }

    void check();
    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  function dismiss() {
    if (nearby) {
      try {
        localStorage.setItem(`wb-arrival-muted:${nearby.id}`, "1");
      } catch {
        /* private mode — the throttle still keeps it quiet */
      }
    }
    setNearby(null);
  }

  async function clockIn() {
    if (!nearby || busy) return;
    setBusy(true);
    hapticImpact("MEDIUM");
    const payload: Record<string, unknown> = {
      action: "in",
      clientKey: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    // Reuse the fix that triggered the prompt — it IS the arrival stamp
    const fix = lastFix.current;
    if (fix) {
      payload.lat = fix.coords.latitude;
      payload.lng = fix.coords.longitude;
      payload.accuracy = fix.coords.accuracy;
    }
    await sendOrQueue({
      url: `/api/app/jobs/${nearby.id}/clock`,
      body: payload,
      label: "Clock in",
    });
    setBusy(false);
    setNearby(null);
    router.refresh();
  }

  return (
    <BottomSheet open={nearby !== null} onClose={dismiss} title="Looks like you've arrived">
      {nearby && (
        <div className="px-4 pb-4">
          <p className="flex items-start gap-2 text-sm text-gray-700">
            <MapPin size={16} className="mt-0.5 shrink-0 text-green-600" />
            <span>
              You&apos;re at the site of <span className="font-semibold">{nearby.title}</span>.
              Want to clock in?
            </span>
          </p>
          <div className="mt-4 flex gap-2">
            <button
              type="button"
              onClick={dismiss}
              className="flex-1 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-semibold text-gray-700 active:bg-gray-50"
            >
              Not now
            </button>
            <button
              type="button"
              onClick={clockIn}
              disabled={busy}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-green-600 px-4 py-3 text-sm font-semibold text-white active:bg-green-700 disabled:opacity-60"
            >
              {busy ? <Loader2 size={14} className="animate-spin" /> : <Play size={14} fill="currentColor" />}
              Clock In
            </button>
          </div>
        </div>
      )}
    </BottomSheet>
  );
}
