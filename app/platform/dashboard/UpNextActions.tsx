"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Camera,
  ListChecks,
  Loader2,
  Navigation,
  Phone,
  Play,
  Square,
  MessageSquare,
} from "lucide-react";
import { smsHref, telHref, isApplePlatform, canSendSms, fillEta } from "@/lib/messaging";
import { sendOrQueue } from "@/lib/outbox";
import { hapticImpact } from "@/lib/haptics";
import { formatDuration } from "@/lib/time-entries";

type ClockEntry = { id: string; startedAt: string };

/**
 * The action row inside the phone dashboard's "Up next" hero — the truck-day
 * counterpart of the desktop keyboard shortcuts. The card reads the moment
 * and offers the right one-tap actions:
 *
 * - before a job:  On My Way · Directions · Clock In
 * - on the clock:  Clock Out (live timer) · Photos · Checklist
 * - appointment:   Call · Directions
 *
 * Clock punches reuse the ClockCard machinery (outbox-queued offline, GPS
 * stamp at the tap, idempotent clientKey); On My Way reuses the job page's
 * flow (logs the hand-off, fills {{eta}} from a one-shot fix, opens Messages).
 */
export default function UpNextActions({
  kind,
  id,
  phone,
  address,
  omwMessage,
  omwSentAt,
  clockEntry,
  canClock,
  apptType,
}: {
  kind: "job" | "appointment";
  id: string;
  phone: string | null;
  address: string | null;
  omwMessage: string | null;
  omwSentAt: string | null;
  clockEntry: ClockEntry | null; // my open entry ON THIS job
  canClock: boolean;
  apptType: string | null;
}) {
  const router = useRouter();
  const [entry, setEntry] = useState<ClockEntry | null>(clockEntry);
  const [busy, setBusy] = useState<"omw" | "clock" | null>(null);
  const [omwSent, setOmwSent] = useState(Boolean(omwSentAt));
  const [smsOk, setSmsOk] = useState(false);
  useEffect(() => setSmsOk(canSendSms()), []);

  // Live elapsed label while on the clock
  const [, forceTick] = useState(0);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  useEffect(() => {
    if (!entry) return;
    tickRef.current = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => {
      if (tickRef.current) clearInterval(tickRef.current);
    };
  }, [entry]);

  /** One-shot best-effort GPS fix — shared by the clock punch and the ETA. */
  function getFix(timeoutMs: number): Promise<GeolocationPosition | null> {
    return new Promise((resolve) => {
      if (!("geolocation" in navigator)) return resolve(null);
      const timer = setTimeout(() => resolve(null), timeoutMs);
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          clearTimeout(timer);
          resolve(pos);
        },
        () => {
          clearTimeout(timer);
          resolve(null);
        },
        { enableHighAccuracy: false, timeout: timeoutMs - 500, maximumAge: 60000 }
      );
    });
  }

  async function punch(action: "in" | "out") {
    if (busy) return;
    setBusy("clock");
    hapticImpact("MEDIUM");
    const payload: Record<string, unknown> = {
      action,
      clientKey: crypto.randomUUID(),
      occurredAt: new Date().toISOString(),
    };
    const gps = await getFix(4000);
    if (gps) {
      payload.lat = gps.coords.latitude;
      payload.lng = gps.coords.longitude;
      payload.accuracy = gps.coords.accuracy;
    }
    const res = await sendOrQueue<{ entry?: ClockEntry }>({
      url: `/api/app/jobs/${id}/clock`,
      body: payload,
      label: action === "in" ? "Clock in" : "Clock out",
    });
    if (res.queued) {
      // Trust the tap offline: run the timer from tap-time locally
      setEntry(
        action === "in"
          ? { id: `queued-${payload.clientKey}`, startedAt: payload.occurredAt as string }
          : null
      );
    } else if (res.ok) {
      setEntry(
        action === "in" && res.data?.entry
          ? { id: res.data.entry.id, startedAt: res.data.entry.startedAt }
          : null
      );
      router.refresh();
    }
    setBusy(null);
  }

  async function onMyWay() {
    if (busy || !phone || !omwMessage) return;
    setBusy("omw");
    const wantsEta = /\{\{\s*eta\s*\}\}/.test(omwMessage);
    const pos = wantsEta ? await getFix(4000) : null;
    let etaMinutes: number | null = null;
    try {
      const res = await fetch(`/api/app/jobs/${id}/on-my-way`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && typeof data?.etaMinutes === "number") etaMinutes = data.etaMinutes;
      router.refresh();
    } catch {
      // Logging failed — still hand the text off; the office note is best-effort
    }
    setBusy(null);
    setOmwSent(true);
    window.location.href = smsHref(phone, fillEta(omwMessage, etaMinutes), isApplePlatform());
  }

  const directionsHref = address
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(address)}`
    : null;

  type Action = {
    key: string;
    label: string;
    icon: typeof Play;
    onClick?: () => void;
    href?: string;
    external?: boolean;
    spinning?: boolean;
  };

  let actions: Action[] = [];
  if (kind === "appointment") {
    actions = [
      ...(phone ? [{ key: "call", label: "Call", icon: Phone, href: telHref(phone) }] : []),
      ...(phone && smsOk
        ? [{ key: "text", label: "Text", icon: MessageSquare, href: smsHref(phone) }]
        : []),
      ...(directionsHref && apptType === "IN_PERSON"
        ? [{ key: "nav", label: "Directions", icon: Navigation, href: directionsHref, external: true }]
        : []),
    ];
  } else if (entry) {
    // On the clock here: wrap-up tools + the running timer on Clock Out
    const elapsed = Date.now() - new Date(entry.startedAt).getTime();
    actions = [
      {
        key: "out",
        label: busy === "clock" ? "Clocking…" : `Out · ${formatDuration(elapsed)}`,
        icon: Square,
        onClick: () => punch("out"),
        spinning: busy === "clock",
      },
      { key: "photos", label: "Photos", icon: Camera, href: `/app/jobs/${id}#photos` },
      { key: "list", label: "Checklist", icon: ListChecks, href: `/app/jobs/${id}#checklist` },
    ];
  } else {
    actions = [
      ...(phone && smsOk && omwMessage
        ? [
            {
              key: "omw",
              label: omwSent ? "On My Way ✓" : "On My Way",
              icon: Navigation,
              onClick: onMyWay,
              spinning: busy === "omw",
            },
          ]
        : []),
      ...(directionsHref
        ? [{ key: "nav", label: "Directions", icon: Navigation, href: directionsHref, external: true }]
        : []),
      ...(canClock
        ? [
            {
              key: "in",
              label: busy === "clock" ? "Clocking…" : "Clock In",
              icon: Play,
              onClick: () => punch("in"),
              spinning: busy === "clock",
            },
          ]
        : []),
    ];
  }
  if (actions.length === 0) return null;

  // Translucent chips on the hero gradient — currentColor is --wb-on-accent
  const chip =
    "flex flex-1 items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-[13px] font-semibold transition active:scale-[0.97] disabled:opacity-60";
  const chipStyle = { backgroundColor: "color-mix(in srgb, currentColor 16%, transparent)" };

  return (
    <div className="relative mt-4 flex gap-2">
      {actions.map(({ key, label, icon: Icon, onClick, href, external, spinning }) =>
        href ? (
          <a
            key={key}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            className={chip}
            style={chipStyle}
          >
            <Icon size={15} />
            <span className="truncate">{label}</span>
          </a>
        ) : (
          <button
            key={key}
            type="button"
            onClick={onClick}
            disabled={busy !== null}
            className={chip}
            style={chipStyle}
          >
            {spinning ? <Loader2 size={15} className="animate-spin" /> : <Icon size={15} />}
            <span className="truncate">{label}</span>
          </button>
        )
      )}
    </div>
  );
}
