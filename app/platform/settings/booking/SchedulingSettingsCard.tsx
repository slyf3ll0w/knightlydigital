"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, Check, ChevronDown, ChevronUp, Loader2 } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import BusinessHoursEditor from "@/components/BusinessHoursEditor";
import { type BusinessHours } from "@/lib/business-hours";

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
  "px-2 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 bg-white";

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
        className="flex w-full items-center gap-3 px-4 py-3.5 text-left lg:px-5 lg:py-4"
      >
        <CalendarClock size={18} className="shrink-0 text-gray-400" />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-gray-900">Online scheduling settings</p>
          <p className="text-xs text-gray-500">
            Business hours, service area, and arrival windows — shared by every form with
            self-scheduling turned on.
          </p>
        </div>
        {open ? (
          <ChevronUp size={16} className="shrink-0 text-gray-400" />
        ) : (
          <ChevronDown size={16} className="shrink-0 text-gray-400" />
        )}
      </button>

      {open && (
        <div className="space-y-5 border-t border-gray-100 px-4 pb-5 pt-4 lg:px-5">
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          {bookableCount === 0 && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
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
            <p className="text-[13px] font-semibold text-gray-500 mb-2">
              Business hours
              <span className="font-normal normal-case text-gray-400">
                {" "}
                — all times in {timezone.replace(/_/g, " ")} (change in Settings → Business Info)
              </span>
            </p>
            <BusinessHoursEditor
              hours={hours}
              onChange={(next) => {
                setHours(next);
                setSaved(false);
              }}
            />
            <p className="mt-2 text-xs text-gray-400">
              Team members can have their own hours — set them on the{" "}
              <Link href="/app/settings/team" className="underline">
                Team page
              </Link>
              .
            </p>
          </div>

          {/* Arrival window */}
          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-gray-100 pt-4">
            <div className="min-w-0 flex-1">
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
              className={`${inputCls} w-full lg:w-auto`}
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
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-green-500 font-mono"
            />
          </div>

          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50 lg:h-10 lg:w-auto"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : saved ? <Check size={13} /> : null}
            {saved ? "Saved!" : "Save Scheduling Settings"}
          </button>
        </div>
      )}
    </div>
  );
}
