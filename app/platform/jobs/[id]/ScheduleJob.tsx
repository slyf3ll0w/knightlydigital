"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays, Loader2, X } from "lucide-react";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { localInputToISO } from "@/lib/statuses";
import SlotTimePicker, { SlotTimeSelect } from "@/components/SlotTimePicker";
import SuggestedTimes from "@/components/SuggestedTimes";
import DayChips from "@/components/DayChips";
import DurationChips, { durationChoiceFor } from "@/components/DurationChips";
import { TimeField } from "@/components/DateField";
import {
  DEFAULT_JOB_DURATION_MINUTES,
  addMinutesToLocalDateTime,
  endFollowingStart,
  joinLocalDateTime,
  splitLocalDateTime,
} from "@/lib/scheduling";
import ScheduleHeadsUp, { useScheduleCheck } from "@/components/ScheduleHeadsUp";
import { ARRIVAL_WINDOW_CHOICES, arrivalWindowChoiceLabel } from "@/lib/arrival-window";
import { minuteToTime, timeToMinute } from "@/lib/client-window";
import { InfoTip } from "@/components/ds";

const SLOT_INPUT_CLS =
  "min-w-0 flex-[1.15] px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
const SLOT_TIME_CLS =
  "min-w-0 flex-1 px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";
const FIELD_CLS =
  "w-full px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]";

function toLocalInput(d: string | null): string {
  if (!d) return "";
  const date = new Date(d);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toLocalDate(d: string | null): string {
  return toLocalInput(d).slice(0, 10);
}

/** Whole minutes from one local `YYYY-MM-DDTHH:mm` to another (null when either is incomplete). */
function minutesBetween(start: string, end: string): number | null {
  const a = splitLocalDateTime(start);
  const b = splitLocalDateTime(end);
  if (!a.time || !b.time) return null;
  const toMs = (p: { date: string; time: string }) => {
    const [y, mo, d] = p.date.split("-").map(Number);
    const [h, mi] = p.time.split(":").map(Number);
    return new Date(y, mo - 1, d, h, mi).getTime();
  };
  return Math.round((toMs(b) - toMs(a)) / 60_000);
}

/**
 * The job page's schedule panel. Same shape as New Job since 2026-10-16: a
 * day chip, a start time and a length (Custom shows an End picker). An
 * existing schedule opens with its own length selected.
 */
export default function ScheduleJob({
  jobId,
  scheduledAt,
  scheduledEnd,
  scheduledAnytime,
  arrivalWindowMinutes,
  companyWindowMinutes,
  arriveAfterMin = null,
  arriveBeforeMin = null,
  address,
  assigneeId,
  crewIds,
  intervalMinutes = 30,
  defaultDurationMinutes,
  dayStartMinutes,
  headsUp = true,
}: {
  jobId: string;
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  /** Per-job client arrival-window override; null = company default. */
  arrivalWindowMinutes?: number | null;
  /** Company default window width, for the "Company default (…)" label. */
  companyWindowMinutes?: number;
  /** The client's window — minutes from midnight, company-local (lib/client-window.ts). */
  arriveAfterMin?: number | null;
  arriveBeforeMin?: number | null;
  /** Job-site address + a tech — enables the "Find a Time" suggestion chips. */
  address?: string | null;
  assigneeId?: string;
  /** Everyone on the job — the live overlap / drive-time heads-up checks each. */
  crewIds?: string[];
  intervalMinutes?: number;
  /** Expected on-site time from the price book (sum of the job's line items'
      service durations). Falls back to one hour when absent. */
  defaultDurationMinutes?: number;
  /** Business-day anchor for the time dropdowns (minutes since midnight). */
  dayStartMinutes?: number;
  /** Ask /api/app/schedule/check while picking — false for techs, who it 403s (they'd see other people's bookings). */
  headsUp?: boolean;
}) {
  const router = useRouter();
  const jobLength = defaultDurationMinutes || DEFAULT_JOB_DURATION_MINUTES;
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [anytime, setAnytime] = useState(scheduledAnytime);
  const [start, setStart] = useState(toLocalInput(scheduledAt));
  const [end, setEnd] = useState(toLocalInput(scheduledEnd));
  // How long: a chip (minutes) or Custom (null → an End picker shows)
  const [duration, setDuration] = useState<number | null>(jobLength);
  // "" = inherit the company default; a number = this job's own window
  const [window_, setWindow] = useState(
    arrivalWindowMinutes == null ? "" : String(arrivalWindowMinutes)
  );
  // "HH:mm" or "" — when the client can take the visit
  const [after, setAfter] = useState(minuteToTime(arriveAfterMin));
  const [before, setBefore] = useState(minuteToTime(arriveBeforeMin));

  const { date: pickedDate, time: pickedTime } = splitLocalDateTime(start);

  // Live heads-up while picking: anyone on the job already booked then, or
  // unable to drive there / on to their next stop in time (David 2026-10-06)
  const check = useScheduleCheck(
    open && !anytime && headsUp
      ? {
          start,
          end,
          userIds: crewIds?.length ? crewIds : assigneeId ? [assigneeId] : [],
          onSite: true,
          address: address ?? null,
          excludeJobId: jobId,
        }
      : null
  );

  // A fresh draft every time the panel opens: Cancel used to leave abandoned
  // edits behind for the next open, and after a save + router.refresh() the
  // props moved on while these stayed at their first-render values.
  function openPanel() {
    const s = toLocalInput(scheduledAt);
    const e = toLocalInput(scheduledEnd);
    setAnytime(scheduledAnytime);
    setStart(s);
    setEnd(e);
    // An existing schedule opens on its own length (a chip when one matches)
    const mins = s && e ? minutesBetween(s, e) : null;
    setDuration(mins != null && mins > 0 ? durationChoiceFor(mins) : jobLength);
    setWindow(arrivalWindowMinutes == null ? "" : String(arrivalWindowMinutes));
    setAfter(minuteToTime(arriveAfterMin));
    setBefore(minuteToTime(arriveBeforeMin));
    setError("");
    setOpen(true);
  }

  /** A new start: the end follows it by the chosen length (Custom keeps its old length). */
  function applyStart(nextStart: string) {
    setEnd(
      duration != null && nextStart.length >= 16
        ? addMinutesToLocalDateTime(nextStart, duration)
        : endFollowingStart(start, end, nextStart, jobLength)
    );
    setStart(nextStart);
  }

  function applyDuration(minutes: number | null) {
    setDuration(minutes);
    if (minutes != null && start.length >= 16) setEnd(addMinutesToLocalDateTime(start, minutes));
  }

  function pickDay(d: string) {
    if (anytime) {
      setStart(d ? `${d}T12:00` : "");
      return;
    }
    applyStart(joinLocalDateTime(d, pickedTime));
  }

  async function save() {
    setError("");
    // The picker holds a bare "YYYY-MM-DD" until a time is chosen — that's
    // not a schedule yet, and it used to save as UTC midnight (the evening
    // before, in the Americas)
    if (!anytime && [start, end].some((v) => v && v.length < 16)) {
      setError("Pick a time, or choose Anytime");
      return;
    }
    const afterMin = after ? timeToMinute(after) : null;
    const beforeMin = before ? timeToMinute(before) : null;
    if (typeof afterMin === "number" && typeof beforeMin === "number" && beforeMin <= afterMin) {
      setError("The client's window must end after it starts");
      return;
    }
    setLoading(true);
    const body = {
      arrivalWindowMinutes: window_ === "" ? null : Number(window_),
      arriveAfterMin: afterMin,
      arriveBeforeMin: beforeMin,
      ...(anytime
        ? {
            // date-only: anchor at noon so the date survives timezone shifts
            scheduledAt: pickedDate ? localInputToISO(`${pickedDate}T12:00`) : null,
            scheduledEnd: null,
            scheduledAnytime: Boolean(pickedDate),
          }
        : {
            scheduledAt: localInputToISO(start),
            scheduledEnd: localInputToISO(end),
            scheduledAnytime: false,
          }),
    };
    const { ok, data } = await postJson<{ conflicts?: string[] }>(
      `/api/app/jobs/${jobId}`,
      body,
      "PATCH"
    );
    setLoading(false);
    if (!ok) {
      setError((data as { error?: string } | null)?.error ?? GENERIC_ERROR);
      return;
    }
    setOpen(false);
    // Overlaps and drive time were shown live under the fields (ScheduleHeadsUp)
    router.refresh();
  }

  if (!open) {
    return (
      <button
        onClick={openPanel}
        className={`flex items-center gap-1.5 text-sm font-medium hover:underline ${
          scheduledAt ? "text-[color:var(--ds-primary)]" : "text-[color:var(--ds-warn)]"
        }`}
      >
        <CalendarDays size={13} />
        {scheduledAt
          ? scheduledAnytime
            ? `${new Date(scheduledAt).toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })} — Anytime`
            : new Date(scheduledAt).toLocaleString("en-US", {
                month: "short",
                day: "numeric",
                hour: "numeric",
                minute: "2-digit",
              })
          : "Unscheduled — set a date"}
      </button>
    );
  }

  const timed = !anytime && Boolean(pickedDate);

  // A small stacked panel: fields get the full width on phones (the parent
  // fact cell goes basis-full below sm) instead of squeezing into a wrap row.
  return (
    <div className="mt-1.5 w-full max-w-lg space-y-2.5 rounded-[10px] border border-gray-200 bg-gray-50/70 p-3">
      <div>
        <label className="block text-xs text-gray-500 mb-1">Day</label>
        <DayChips value={pickedDate} onChange={pickDay} />
      </div>
      {timed && (
        <div className="grid gap-2.5 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-0.5">Start</label>
            <SlotTimeSelect
              time={pickedTime}
              onChange={(t) => applyStart(joinLocalDateTime(pickedDate, t))}
              intervalMinutes={intervalMinutes}
              dayStartMinutes={dayStartMinutes}
              className={FIELD_CLS}
              ariaLabel="Start time"
            />
          </div>
          <div className="min-w-0">
            <label className="block text-xs text-gray-500 mb-0.5">How long</label>
            <DurationChips value={duration} onChange={applyDuration} />
          </div>
        </div>
      )}
      {timed && duration === null && (
        <div className="min-w-0">
          <label className="block text-xs text-gray-500 mb-0.5">End</label>
          <SlotTimePicker
            value={end}
            intervalMinutes={intervalMinutes}
            dayStartMinutes={dayStartMinutes}
            inputCls={SLOT_INPUT_CLS}
            timeCls={SLOT_TIME_CLS}
            ariaLabel="End"
            onChange={setEnd}
          />
        </div>
      )}
      {!anytime && <ScheduleHeadsUp result={check} />}
      {timed && assigneeId && (
        <SuggestedTimes
          date={pickedDate}
          userId={assigneeId}
          address={address}
          durationMinutes={duration ?? jobLength}
          excludeId={jobId}
          onPick={(s, e) => {
            setStart(s);
            setEnd(e);
            const mins = minutesBetween(s, e);
            if (mins != null) setDuration(durationChoiceFor(mins));
          }}
        />
      )}
      {!anytime && (
        <div>
          <label className="block text-xs text-gray-500 mb-0.5">
            Arrival window <span className="text-gray-400">(what the client is promised)</span>
          </label>
          <select
            value={window_}
            onChange={(e) => setWindow(e.target.value)}
            className="w-full sm:w-64 px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
          >
            <option value="">
              Company default{companyWindowMinutes != null ? ` (${arrivalWindowChoiceLabel(companyWindowMinutes)})` : ""}
            </option>
            {ARRIVAL_WINDOW_CHOICES.map((m) => (
              <option key={m} value={m}>
                {arrivalWindowChoiceLabel(m)}
              </option>
            ))}
          </select>
        </div>
      )}
      <div>
        <label className="mb-0.5 flex items-center gap-1 text-xs text-gray-500">
          Client can take it
          <InfoTip>
            When the client is available — &quot;not before 1 PM&quot;, &quot;before noon&quot;. Optimize waits for the window to open and warns if an order would arrive after it closes. Leave both blank for any time.
          </InfoTip>
        </label>
        <div className="flex flex-wrap items-center gap-2 text-sm text-gray-600">
          <span className="text-xs">from</span>
          <TimeField
            value={after}
            step={900}
            onChange={(e) => setAfter(e.target.value)}
            aria-label="Client available from"
            placeholder="Any"
            className="w-32 px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
          />
          <span className="text-xs">until</span>
          <TimeField
            value={before}
            step={900}
            onChange={(e) => setBefore(e.target.value)}
            aria-label="Client available until"
            placeholder="Any"
            className="w-32 px-2 py-1.5 border border-gray-300 rounded-lg bg-white text-sm focus:outline-none focus:ring-2 focus:ring-[color:var(--ds-primary)]"
          />
          {(after || before) && (
            <button
              type="button"
              onClick={() => {
                setAfter("");
                setBefore("");
              }}
              className="text-xs text-gray-500 hover:underline"
            >
              Any time
            </button>
          )}
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 pt-0.5">
        <label className="flex items-center gap-1.5 text-xs text-gray-600 select-none">
          <input
            type="checkbox"
            checked={anytime}
            onChange={(e) => {
              const on = e.target.checked;
              setAnytime(on);
              // Anytime anchors at noon; a timed job starts from the bare day
              if (on) setStart(pickedDate ? `${pickedDate}T12:00` : "");
              else setStart(pickedDate);
              setEnd("");
            }}
            className="h-3.5 w-3.5 rounded border-gray-300 accent-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]"
          />
          Anytime (no set time)
        </label>
        <div className="flex items-center gap-1.5">
          <button
            onClick={save}
            disabled={loading}
            className="btn-primary btn-sm"
          >
            {loading && <Loader2 size={12} className="animate-spin" />}
            Save
          </button>
          <button
            onClick={() => setOpen(false)}
            className="p-1.5 text-gray-400 hover:text-gray-600"
            aria-label="Cancel"
          >
            <X size={15} />
          </button>
        </div>
      </div>
      {error && <p className="text-xs text-[color:var(--ds-bad)]">{error}</p>}
    </div>
  );
}
