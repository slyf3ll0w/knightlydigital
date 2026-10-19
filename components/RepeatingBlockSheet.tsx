"use client";

import AddressAutocomplete from "@/components/AddressAutocomplete";
import { useEffect, useState } from "react";
import { Loader2, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import RepeatPicker from "@/components/RepeatPicker";
import { confirmSheet } from "@/components/ConfirmSheet";
import { inputCls } from "@/components/Input";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { SeriesDTO } from "@/lib/time-block-series";
import { DateField, TimeField } from "@/components/DateField";

/**
 * The editor for one repeating block — "Lunch, every weekday, 12–1" — used
 * from Settings → Booking (the repeating-blocks list) and from the Schedule
 * when someone opens an occurrence and picks "Edit every time". Saving
 * writes the series; the server rebuilds the occurrences still ahead.
 */

export type SeriesDefaults = {
  title?: string;
  who?: string; // user id | "everyone"
  allDay?: boolean;
  startsOn?: string;
  startTime?: string;
  endTime?: string;
  weekdays?: number[];
  address?: string;
};

type Form = {
  title: string;
  who: string;
  address: string;
  allDay: boolean;
  startTime: string;
  endTime: string;
  weekdays: number[];
  startsOn: string;
  endsOn: string;
};

const pad = (n: number) => String(n).padStart(2, "0");
const hhmm = (min: number) => `${pad(Math.floor(min / 60))}:${pad(min % 60)}`;
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

function formFrom(initial: SeriesDTO | null, defaults: SeriesDefaults, meId: string): Form {
  if (initial) {
    return {
      title: initial.title === "Blocked off" ? "" : initial.title,
      who: initial.userId ?? "everyone",
      address: initial.address ?? "",
      allDay: initial.allDay,
      startTime: hhmm(initial.startMinute),
      endTime: hhmm(initial.endMinute),
      weekdays: initial.weekdays,
      startsOn: initial.startsOn,
      endsOn: initial.endsOn ?? "",
    };
  }
  const startsOn = defaults.startsOn ?? todayKey();
  return {
    title: defaults.title ?? "",
    who: defaults.who ?? meId,
    address: defaults.address ?? "",
    allDay: defaults.allDay ?? false,
    startTime: defaults.startTime ?? "12:00",
    endTime: defaults.endTime ?? "13:00",
    weekdays: defaults.weekdays ?? [new Date(`${startsOn}T12:00:00`).getDay()],
    startsOn,
    endsOn: "",
  };
}

export default function RepeatingBlockSheet({
  open,
  initial,
  defaults = {},
  users,
  meId,
  canBlockForOthers,
  onClose,
  onSaved,
  onRemoved,
}: {
  open: boolean;
  /** null = new series */
  initial: SeriesDTO | null;
  defaults?: SeriesDefaults;
  users: { id: string; name: string }[];
  meId: string;
  canBlockForOthers: boolean;
  onClose: () => void;
  onSaved: (series: SeriesDTO) => void;
  onRemoved?: (id: string) => void;
}) {
  const [form, setForm] = useState<Form>(() => formFrom(initial, defaults, meId));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const canEdit = initial ? initial.canEdit : true;

  // Fresh form each time the sheet opens on something else
  useEffect(() => {
    if (open) {
      setForm(formFrom(initial, defaults, meId));
      setErr("");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initial?.id]);

  const set = (patch: Partial<Form>) => setForm((f) => ({ ...f, ...patch }));
  const field = `${inputCls} disabled:bg-gray-50 disabled:text-gray-500`;
  const label = "mb-0.5 block text-xs font-medium text-gray-500";

  async function save() {
    if (form.weekdays.length === 0) return setErr("Pick at least one day of the week.");
    if (!form.startsOn) return setErr("Pick a start date.");
    const body: Record<string, unknown> = {
      title: form.title,
      address: form.address.trim() || null,
      allDay: form.allDay,
      startTime: form.startTime,
      endTime: form.endTime,
      weekdays: form.weekdays,
      startsOn: form.startsOn,
      endsOn: form.endsOn || null,
    };
    if (canBlockForOthers) body.forUserId = form.who === "everyone" ? null : form.who;
    setBusy(true);
    setErr("");
    const { ok, data } = initial
      ? await postJson(`/api/app/time-block-series/${initial.id}`, body, "PATCH")
      : await postJson("/api/app/time-block-series", body);
    setBusy(false);
    if (!ok) return setErr(data?.error ?? GENERIC_ERROR);
    onSaved(data as SeriesDTO);
  }

  async function remove() {
    if (!initial) return;
    const sure = await confirmSheet({
      title: "Remove this repeating block?",
      message: "Every time it was on the schedule goes with it, including days already past.",
      confirmLabel: "Remove",
      destructive: true,
    });
    if (!sure) return;
    setBusy(true);
    setErr("");
    const { ok, data } = await postJson(`/api/app/time-block-series/${initial.id}`, undefined, "DELETE");
    setBusy(false);
    if (!ok) return setErr(data?.error ?? GENERIC_ERROR);
    onRemoved?.(initial.id);
  }

  return (
    <Modal open={open} onClose={() => !busy && onClose()}>
      <div className="space-y-3 text-left">
        <h2 className="text-base font-semibold text-gray-900">{initial ? "Edit Repeating Block" : "Repeating Block"}</h2>
        {!canEdit && <p className="text-sm text-gray-500">Only owners and admins can change someone else&apos;s blocked time.</p>}
        {err && (
          <div role="alert" className="form-error">
            {err}
          </div>
        )}
        <div>
          <label className={label}>Reason</label>
          <input type="text" value={form.title} disabled={!canEdit} placeholder="Blocked off" onChange={(e) => set({ title: e.target.value })} className={field} />
        </div>
        {canBlockForOthers && (
          <div>
            <label className={label}>Who</label>
            <select value={form.who} disabled={!canEdit} onChange={(e) => set({ who: e.target.value })} className={field}>
              <option value="everyone">Everyone (whole team)</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.id === meId ? `${u.name} (me)` : u.name}
                </option>
              ))}
            </select>
          </div>
        )}
        <div>
          <label className={label}>Repeats every</label>
          <RepeatPicker weekdays={form.weekdays} onWeekdays={(weekdays) => set({ weekdays })} endsOn={form.endsOn} onEndsOn={(endsOn) => set({ endsOn })} startsOn={form.startsOn} disabled={!canEdit} />
        </div>
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="checkbox" checked={form.allDay} disabled={!canEdit} onChange={(e) => set({ allDay: e.target.checked })} className="rounded text-[color:var(--ds-primary)] focus:ring-[color:var(--ds-primary)]" />
          All day
        </label>
        {!form.allDay && (
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label}>From</label>
              <TimeField value={form.startTime} disabled={!canEdit} onChange={(e) => set({ startTime: e.target.value })} className={field} />
            </div>
            <div>
              <label className={label}>To</label>
              <TimeField value={form.endTime} disabled={!canEdit} onChange={(e) => set({ endTime: e.target.value })} className={field} />
            </div>
          </div>
        )}
        <div>
          <label className={label}>Starting</label>
          <DateField value={form.startsOn} disabled={!canEdit} onChange={(e) => set({ startsOn: e.target.value })} className={field} />
        </div>
        <div>
          <label className={label}>Where (optional)</label>
          <AddressAutocomplete endpoint="/api/app/geocode/suggest" value={form.address} disabled={!canEdit} placeholder="Address — so jobs get scheduled around the drive" onChange={(v) => set({ address: v })} onPick={(a) => set({ address: a.label })} className={field} />
        </div>
        <div className="flex items-center gap-2 pt-1">
          {canEdit && (
            <button type="button" onClick={save} disabled={busy} className="btn-primary">
              {busy && <Loader2 size={14} className="animate-spin" />}
              {initial ? "Save" : "Add"}
            </button>
          )}
          <button type="button" onClick={onClose} disabled={busy} className="rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit && initial && (
            <button type="button" onClick={remove} disabled={busy} aria-label="Remove repeating block" className="ml-auto flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
              <Trash2 size={14} />
              Remove
            </button>
          )}
        </div>
      </div>
    </Modal>
  );
}
