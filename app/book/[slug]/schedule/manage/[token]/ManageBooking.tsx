"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarClock, CheckCircle, Loader2, Video, XCircle } from "lucide-react";
import { textOn } from "@/lib/branding";
import type { ScheduleAppearance } from "../../shell";

type Info = {
  status: "SCHEDULED" | "COMPLETED" | "CANCELLED" | "NO_SHOW";
  typeName: string;
  exactTime: boolean;
  timezone: string;
  companyName: string;
  companySlug: string;
  typeSlug: string;
  start: string;
  windowEnd: string;
  label: string;
  address: string | null;
  meetingLink: string | null;
  withName: string | null;
  tentative: boolean;
  canReschedule: boolean;
  canCancel: boolean;
  cutoffHours: number;
  pastCutoff: boolean;
  days: { date: string; label: string; slots: { start: string; label: string; windowEnd: string }[] }[];
};

/** Self-serve reschedule / cancel, keyed by the email link's token. */
export default function ManageBooking({ token, appearance }: { token: string; appearance: ScheduleAppearance }) {
  const { dark, accent, transparent } = appearance;
  const [info, setInfo] = useState<Info | null>(null);
  const [loading, setLoading] = useState(true);
  const [mode, setMode] = useState<"view" | "reschedule">("view");
  const [activeDay, setActiveDay] = useState("");
  const [slot, setSlot] = useState<Info["days"][number]["slots"][number] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/public/schedule/manage/${token}?slots=1`);
      const data = await res.json().catch(() => null);
      if (!res.ok || !data) {
        setError(data?.error ?? "This link isn't valid any more.");
        return;
      }
      setInfo(data);
      setActiveDay((prev) => (data.days.some((d: { date: string }) => d.date === prev) ? prev : (data.days[0]?.date ?? "")));
    } finally {
      setLoading(false);
    }
  }, [token]);
  useEffect(() => {
    void load();
  }, [load]);

  async function act(body: Record<string, unknown>) {
    setBusy(true);
    setError("");
    try {
      const res = await fetch(`/api/public/schedule/manage/${token}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "Something went wrong. Please try again.");
        if (res.status === 409) await load();
        return;
      }
      if (body.action === "cancel") setNotice("Your booking is cancelled. We've sent a confirmation to your email.");
      else setNotice(`Moved to ${data.label}. A new confirmation is on its way.`);
      setMode("view");
      setSlot(null);
      await load();
    } finally {
      setBusy(false);
    }
  }

  const ink = dark ? "text-white" : "text-gray-900";
  const muted = dark ? "text-gray-400" : "text-gray-500";
  const card = transparent ? "bg-transparent" : dark ? "bg-[#101410] border border-white/10 rounded-lg shadow-sm" : "card-ledger shadow-sm";
  const chip = (selected: boolean) =>
    `px-2 py-2 rounded border text-xs font-medium transition-colors ${selected ? "text-white" : dark ? "border-white/15 text-gray-200 hover:border-white/30" : "border-gray-300 text-gray-700 hover:border-gray-400"}`;

  if (loading && !info) {
    return (
      <p className={`flex items-center justify-center gap-2 text-sm ${muted}`}>
        <Loader2 size={14} className="animate-spin" /> Loading your booking…
      </p>
    );
  }
  if (!info) return <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error || "This link isn't valid any more."}</div>;

  const active = info.status === "SCHEDULED";
  const rebook = `/book/${info.companySlug}/${info.typeSlug}`;

  return (
    <div className={`${card} space-y-4 p-6`}>
      {notice && <div className="rounded border border-green-200 bg-green-50 px-4 py-3 text-sm text-green-800">{notice}</div>}
      {error && <div className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}

      <div className="flex items-start gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22`, color: accent }}>
          {active ? <CalendarClock size={18} /> : info.status === "CANCELLED" ? <XCircle size={18} /> : <CheckCircle size={18} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-semibold ${ink}`}>{info.typeName}</p>
          <p className={`text-lg font-bold ${ink}`}>{info.label}</p>
          {info.withName && <p className={`text-sm ${muted}`}>with {info.withName}</p>}
          {info.address && <p className={`text-sm ${muted}`}>{info.address}</p>}
          {info.meetingLink && (
            <a href={info.meetingLink} target="_blank" rel="noopener noreferrer" className="mt-1 inline-flex items-center gap-1 text-sm font-medium hover:underline" style={{ color: accent }}>
              <Video size={14} /> Join link
            </a>
          )}
          <p className={`mt-1 text-xs ${muted}`}>
            {info.status === "CANCELLED" ? "Cancelled" : info.status === "COMPLETED" ? "Completed" : info.tentative ? "Awaiting confirmation" : "Confirmed"} · {info.companyName}
          </p>
        </div>
      </div>

      {active && mode === "view" && (
        <div className="flex flex-wrap gap-2 border-t pt-4" style={{ borderColor: dark ? "#ffffff1a" : "#f3f4f6" }}>
          {info.canReschedule && (
            <button type="button" onClick={() => setMode("reschedule")} className="rounded px-4 py-2 text-sm font-semibold" style={{ backgroundColor: accent, color: textOn(accent) }}>
              Reschedule
            </button>
          )}
          {info.canCancel && (
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm("Cancel this booking?")) void act({ action: "cancel" });
              }}
              className={`rounded border px-4 py-2 text-sm font-semibold ${dark ? "border-white/20 text-gray-200" : "border-gray-300 text-gray-700"} disabled:opacity-50`}
            >
              Cancel booking
            </button>
          )}
          {info.pastCutoff && (
            <p className={`w-full text-xs ${muted}`}>Changes need at least {info.cutoffHours} hours&apos; notice — please contact {info.companyName} directly.</p>
          )}
          {!info.canReschedule && !info.canCancel && !info.pastCutoff && (
            <p className={`text-xs ${muted}`}>To change this booking, reply to your confirmation email or contact {info.companyName}.</p>
          )}
        </div>
      )}

      {active && mode === "reschedule" && (
        <div className="space-y-3 border-t pt-4" style={{ borderColor: dark ? "#ffffff1a" : "#f3f4f6" }}>
          <p className={`text-sm font-medium ${ink}`}>Pick a new time</p>
          {info.days.length === 0 ? (
            <p className={`text-sm ${muted}`}>No other open times right now — please contact {info.companyName}.</p>
          ) : (
            <>
              <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-2">
                {info.days.map((d) => {
                  const on = d.date === activeDay;
                  return (
                    <button key={d.date} type="button" onClick={() => setActiveDay(d.date)} className={`shrink-0 rounded border px-3 py-1.5 text-xs font-semibold ${on ? "text-white" : dark ? "border-white/15 text-gray-300" : "border-gray-300 text-gray-600"}`} style={on ? { backgroundColor: accent, borderColor: accent } : undefined}>
                      {d.label}
                    </button>
                  );
                })}
              </div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {(info.days.find((d) => d.date === activeDay)?.slots ?? []).map((s) => {
                  const on = slot?.start === s.start;
                  return (
                    <button key={s.start} type="button" onClick={() => setSlot(s)} className={chip(on)} style={on ? { backgroundColor: accent, borderColor: accent } : undefined}>
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={!slot || busy} onClick={() => slot && act({ action: "reschedule", slotStart: slot.start })} className="rounded px-4 py-2 text-sm font-semibold disabled:opacity-50" style={{ backgroundColor: accent, color: textOn(accent) }}>
              {busy ? <Loader2 size={14} className="animate-spin" /> : "Move booking"}
            </button>
            <button type="button" onClick={() => setMode("view")} className={`rounded px-4 py-2 text-sm font-medium ${muted}`}>
              Keep it
            </button>
          </div>
        </div>
      )}

      {info.status === "CANCELLED" && (
        <a href={rebook} className="inline-block rounded px-4 py-2 text-sm font-semibold" style={{ backgroundColor: accent, color: textOn(accent) }}>
          Book another time
        </a>
      )}
    </div>
  );
}
