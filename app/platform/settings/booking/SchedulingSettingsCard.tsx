"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, ChevronDown, ChevronUp, Loader2, Plus, Trash2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import {
  DAY_KEYS,
  DAY_LABELS,
  type BusinessHours,
  type DayKey,
  type TimeRange,
} from "@/lib/business-hours";

/**
 * Company-wide scheduling settings for online booking: business hours,
 * service-area ZIPs, and the arrival-window width. Lives above the forms
 * list — every self-scheduling form shares these. Collapsed by default so
 * companies that don't use online booking never see the machinery.
 */

const WINDOW_OPTIONS = [
  { value: 60, label: "1 hour" },
  { value: 120, label: "2 hours" },
  { value: 180, label: "3 hours" },
  { value: 240, label: "4 hours" },
];

const inputCls =
  "px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

export default function SchedulingSettingsCard({
  hours: initialHours,
  serviceZips: initialZips,
  arrivalWindowMinutes: initialWindow,
  timezone,
  bookableCount,
}: {
  hours: BusinessHours;
  serviceZips: string[];
  arrivalWindowMinutes: number;
  timezone: string;
  bookableCount: number;
}) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState<BusinessHours>(initialHours);
  const [zipsText, setZipsText] = useState(initialZips.join(", "));
  const [window_, setWindow] = useState(initialWindow);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  function setDay(day: DayKey, ranges: TimeRange[]) {
    setHours((h) => ({ ...h, [day]: ranges }));
    setSaved(false);
  }

  async function save() {
    setSaving(true);
    setError("");
    const serviceZips = zipsText
      .split(/[\s,;]+/)
      .map((z) => z.trim())
      .filter(Boolean);
    const { ok, data } = await postJson(
      "/api/app/settings",
      { businessHours: hours, serviceZips, arrivalWindowMinutes: window_ },
      "PATCH"
    );
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="card-ledger mb-6">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <CalendarClock size={18} className="text-gray-400 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-semibold text-gray-900">Online scheduling settings</p>
          <p className="text-xs text-gray-500">
            Business hours, service area, and arrival windows — shared by every form with
            self-scheduling turned on.
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="text-gray-400" />
        ) : (
          <ChevronDown size={16} className="text-gray-400" />
        )}
      </button>

      {open && (
        <div className="px-5 pb-5 space-y-5 border-t border-gray-100 pt-4">
          {error && (
            <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {bookableCount === 0 && (
            <div className="rounded border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
              No one on your team accepts online bookings yet — clients won&apos;t see any
              times until someone is marked bookable on the{" "}
              <Link href="/app/settings/team" className="font-semibold underline">
                Team page
              </Link>
              .
            </div>
          )}

          {/* Business hours */}
          <div>
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
              Business hours
              <span className="font-normal normal-case text-gray-400">
                {" "}
                — all times in {timezone.replace(/_/g, " ")} (change in Settings → Business Info)
              </span>
            </p>
            <div className="space-y-1.5">
              {DAY_KEYS.map((day) => {
                const ranges = hours[day];
                const isOpen = ranges.length > 0;
                return (
                  <div key={day} className="flex flex-wrap items-center gap-2">
                    <label className="flex items-center gap-2 w-28 text-sm text-gray-700 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={isOpen}
                        onChange={(e) =>
                          setDay(day, e.target.checked ? [{ start: "08:00", end: "17:00" }] : [])
                        }
                        className="accent-green-600"
                      />
                      {DAY_LABELS[day]}
                    </label>
                    {isOpen ? (
                      <div className="flex flex-wrap items-center gap-2">
                        {ranges.map((r, i) => (
                          <span key={i} className="flex items-center gap-1.5">
                            <input
                              type="time"
                              value={r.start}
                              onChange={(e) =>
                                setDay(
                                  day,
                                  ranges.map((x, j) => (j === i ? { ...x, start: e.target.value } : x))
                                )
                              }
                              className={inputCls}
                            />
                            <span className="text-xs text-gray-400">to</span>
                            <input
                              type="time"
                              value={r.end}
                              onChange={(e) =>
                                setDay(
                                  day,
                                  ranges.map((x, j) => (j === i ? { ...x, end: e.target.value } : x))
                                )
                              }
                              className={inputCls}
                            />
                            {ranges.length > 1 && (
                              <button
                                type="button"
                                onClick={() => setDay(day, ranges.filter((_, j) => j !== i))}
                                className="text-gray-300 hover:text-red-500"
                                aria-label="Remove hours"
                              >
                                <Trash2 size={13} />
                              </button>
                            )}
                          </span>
                        ))}
                        {ranges.length < 2 && (
                          <button
                            type="button"
                            onClick={() => setDay(day, [...ranges, { start: "13:00", end: "17:00" }])}
                            className="flex items-center gap-0.5 text-xs text-gray-400 hover:text-green-600"
                            title="Split the day, e.g. around lunch"
                          >
                            <Plus size={11} />
                            Split
                          </button>
                        )}
                      </div>
                    ) : (
                      <span className="text-xs text-gray-400">Closed</span>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Arrival window */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-gray-100 pt-4">
            <div>
              <p className="text-sm font-medium text-gray-900">Arrival window</p>
              <p className="text-xs text-gray-500">
                What clients are promised — &quot;we&apos;ll arrive between 8:00 and 10:00&quot;.
              </p>
            </div>
            <select
              value={window_}
              onChange={(e) => {
                setWindow(Number(e.target.value));
                setSaved(false);
              }}
              className={inputCls}
            >
              {WINDOW_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>

          {/* Service area */}
          <div className="border-t border-gray-100 pt-4">
            <p className="text-sm font-medium text-gray-900">Service area ZIP codes</p>
            <p className="text-xs text-gray-500 mb-2">
              Bookings outside these ZIPs are politely turned away before they pick a time.
              Leave empty to accept any address.
            </p>
            <textarea
              value={zipsText}
              onChange={(e) => {
                setZipsText(e.target.value);
                setSaved(false);
              }}
              rows={2}
              placeholder="75002, 75013, 75025..."
              className="w-full px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-green-500 hover:bg-green-600 active:bg-green-700 text-white text-sm font-semibold rounded transition-colors disabled:opacity-50"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? "Saved!" : "Save Scheduling Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
