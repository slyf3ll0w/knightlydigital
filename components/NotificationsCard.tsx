"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, Smartphone } from "lucide-react";
import SectionHeader from "@/components/SectionHeader";
import { GENERIC_ERROR } from "@/lib/safe-fetch";
import {
  CHANNEL_LABEL,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
  type NotificationChannel,
  type NotificationEvent,
  type PreferenceMap,
} from "@/lib/notification-events";

const ICON = { push: Smartphone, bell: Bell, email: Mail } as const;

/**
 * My Profile → Notifications: one row per kind of alert, a switch per way it
 * reaches you (push, the bell, email to your sign-in address). Saves each
 * switch as it is flipped. Account alerts (Square disconnected, texting
 * approved …) always come through and have no row.
 */
export default function NotificationsCard() {
  const [prefs, setPrefs] = useState<PreferenceMap | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let live = true;
    fetch("/api/app/profile/notifications")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(GENERIC_ERROR))))
      .then((d: { prefs: PreferenceMap }) => live && setPrefs(d.prefs))
      .catch(() => live && setError("Couldn't load your notification settings."));
    return () => {
      live = false;
    };
  }, []);

  async function flip(event: NotificationEvent, channel: NotificationChannel) {
    if (!prefs || busy) return;
    const enabled = !prefs[event][channel];
    const key = `${event}:${channel}`;
    setBusy(key);
    setError("");
    setPrefs({ ...prefs, [event]: { ...prefs[event], [channel]: enabled } });
    try {
      const res = await fetch("/api/app/profile/notifications", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event, channel, enabled }),
      });
      const data = (await res.json().catch(() => ({}))) as { prefs?: PreferenceMap; error?: string };
      if (!res.ok || !data.prefs) throw new Error(data.error || GENERIC_ERROR);
      setPrefs(data.prefs);
    } catch (err) {
      setPrefs((p) => (p ? { ...p, [event]: { ...p[event], [channel]: !enabled } } : p));
      setError(err instanceof Error ? err.message : GENERIC_ERROR);
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="ds-card mt-5 p-5">
      <SectionHeader
        title="Notifications"
        hint="Pick what reaches you, and how. Email goes to the address you sign in with. Account alerts, like Square being disconnected, always come through."
      />
      <div className="mt-3 overflow-hidden rounded-xl border border-[color:var(--ds-line)]">
        <div className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] items-center gap-x-1 bg-[color:var(--ds-surface-2)] px-3.5 py-2 text-[11px] font-medium text-[color:var(--ds-muted)] sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)]">
          <span>Alert</span>
          {NOTIFICATION_CHANNELS.map((c) => {
            const Icon = ICON[c];
            return (
              <span key={c} className="flex items-center justify-center gap-1">
                <Icon size={12} aria-hidden />
                {CHANNEL_LABEL[c]}
              </span>
            );
          })}
        </div>
        <div className="divide-y divide-[color:var(--ds-line)]">
          {NOTIFICATION_EVENTS.map((e) => (
            <div
              key={e.key}
              className="grid grid-cols-[minmax(0,1fr)_repeat(3,3.25rem)] items-center gap-x-1 px-3.5 py-2.5 sm:grid-cols-[minmax(0,1fr)_repeat(3,4.5rem)]"
            >
              <span className="min-w-0">
                <span className="block text-sm font-medium text-[color:var(--ds-ink)]">{e.label}</span>
                {"hint" in e && e.hint && <span className="block text-xs text-[color:var(--ds-muted)]">{e.hint}</span>}
              </span>
              {NOTIFICATION_CHANNELS.map((c) => {
                const on = prefs?.[e.key][c] ?? false;
                return (
                  <span key={c} className="flex justify-center">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={on}
                      aria-label={`${e.label}: ${CHANNEL_LABEL[c]}`}
                      disabled={!prefs || busy !== null}
                      onClick={() => flip(e.key, c)}
                      className={`relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-60 ${
                        on ? "bg-[color:var(--ds-primary)]" : "bg-[color:var(--ds-line-strong)]"
                      } ${!prefs ? "animate-pulse" : ""}`}
                    >
                      <span
                        className={`absolute top-0.5 h-5 w-5 rounded-full bg-[color:var(--ds-surface)] shadow transition-[left] ${on ? "left-[1.125rem]" : "left-0.5"}`}
                      />
                    </button>
                  </span>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      {error && (
        <p className="mt-2 text-xs text-[color:var(--ds-bad)]" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
