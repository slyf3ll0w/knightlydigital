"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  CalendarClock,
  CalendarDays,
  CalendarOff,
  ChevronLeft,
  ChevronRight,
  CloudRain,
  Columns3,
  Loader2,
  Navigation as NavigationIcon,
  Phone as PhoneIcon,
  Plus,
  Route as RouteIcon,
  Trash2,
  UserPlus,
  X,
} from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { SECTION_HUES } from "@/lib/section-colors";
import { FilterChip, SegmentedRow, Segment } from "@/components/FilterChips";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { telHref } from "@/lib/messaging";
import Modal from "@/components/Modal";
import SwipeRow, { type SwipeRowAction } from "@/components/SwipeRow";
import MonthGrid from "./MonthGrid";
import TimeGrid, { type DriveLegs, type GridColumn } from "./TimeGrid";
import SchedulePalette from "./SchedulePalette";
import PlaceSheet, { type PlaceIntent, type PlaceResult } from "./PlaceSheet";
import UndoToast, { type ToastState } from "./UndoToast";
import { TypeGlyph } from "./TypeGlyph";
import { useCalendarDrag, type DragSource, type DropTarget, type SelectRange } from "./useCalendarDrag";
import {
  DAY_NAMES,
  HOUR_PX,
  MONTHS,
  addDays,
  atMinute,
  durationLabel,
  fmtMinute,
  fmtTime,
  initialsOf,
  itemDuration,
  itemTone,
  minutesOf,
  pad,
  parseParam,
  placeLabel,
  sameDay,
  sortItems,
  startOfWeek,
  toParam,
  type PaletteEntity,
  type ScheduleJobDTO,
  type View,
  type WeekHours,
} from "./schedule-lib";

export type { ScheduleJobDTO, BlockInfo } from "./schedule-lib";

/**
 * Month / Week / Day calendar, the dispatch board, and everything that
 * moves work around on it.
 *
 *  - Drag (mouse, or press-and-hold on a phone) moves jobs, appointments,
 *    and blocked time; the bottom edge resizes; empty grid space paints a
 *    new range. Every move is optimistic with an Undo toast and, when a
 *    client is attached, a one-tap "Text client" with the new time.
 *  - The Schedule palette drags clients, leads, requests, and unscheduled
 *    jobs in; where they land fills the PlaceSheet.
 *  - Day view can split into one column per tech (the dispatch board);
 *    dragging between columns reassigns. Drive time between stops shows in
 *    the gaps, and a gap too short for the drive turns red.
 *  - "Move the day" shifts everything on a day to another date at once.
 *
 * Drag rules:
 *  - drop on a time slot  → starts there (15-min snap), keeps the length
 *  - drop on the Anytime row → date-only ("anytime", anchored at noon)
 *  - drop on a month cell / date-strip day → moves the date, keeps the time
 */

type BlockForm = {
  title: string;
  who: string; // user id | "everyone" (managers only)
  allDay: boolean;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  address: string; // optional "where I'll be" — routing drives around it
};

type Snapshot = {
  scheduledAt: string | null;
  scheduledEnd: string | null;
  scheduledAnytime: boolean;
  assigneeIds: string[];
};

export default function ScheduleClient({
  view,
  explicitView = true,
  date,
  team,
  board = false,
  jobs,
  unscheduled,
  users,
  hours,
  intervalMinutes = 30,
  dayStartMinutes = 8 * 60,
  capacityByDow,
  canCreateJob = true,
  canCreateAppointment = true,
  canBlockForOthers = false,
  canDispatch = false,
  meId = "",
}: {
  view: View;
  explicitView?: boolean;
  date: string;
  team: string;
  board?: boolean;
  jobs: ScheduleJobDTO[];
  unscheduled: ScheduleJobDTO[];
  users: { id: string; name: string }[];
  hours: WeekHours;
  intervalMinutes?: number;
  dayStartMinutes?: number;
  capacityByDow: number[];
  canCreateJob?: boolean;
  canCreateAppointment?: boolean;
  canBlockForOthers?: boolean;
  canDispatch?: boolean;
  meId?: string;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [items, setItems] = useState<ScheduleJobDTO[]>(jobs);
  useEffect(() => setItems(jobs), [jobs]);

  const [paletteOpen, setPaletteOpen] = useState(false);
  const [armed, setArmed] = useState<PaletteEntity | null>(null);
  const [placeIntent, setPlaceIntent] = useState<PlaceIntent | null>(null);
  const [chooser, setChooser] = useState<SelectRange | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  // Overlap warnings from the last schedule save (non-blocking, dismissible)
  const [conflicts, setConflicts] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const [legs, setLegs] = useState<DriveLegs | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const shiftHeld = useRef(false);
  const toastSeq = useRef(0);

  // Block-off-time sheet: null = closed; id null = creating a new block
  const [blockSheet, setBlockSheet] = useState<null | {
    id: string | null;
    canEdit: boolean;
    userName: string | null;
    /** Mirrored from the person's Google Calendar — read-only, edit it there */
    mirrored?: boolean;
    form: BlockForm;
  }>(null);
  const [blockBusy, setBlockBusy] = useState(false);
  const [blockErr, setBlockErr] = useState("");

  // "Move the day" sheet
  const [shiftSheet, setShiftSheet] = useState<null | { toDate: string; includeAppointments: boolean; notify: boolean }>(null);
  const [shiftBusy, setShiftBusy] = useState(false);
  const [shiftErr, setShiftErr] = useState("");

  const anchor = useMemo(() => parseParam(date), [date]);
  const today = useMemo(() => new Date(), []);
  const hue = SECTION_HUES.schedule;

  useEffect(() => setMounted(true), []);

  // Shift-drag duplicates a job instead of moving it
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeld.current = true;
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === "Shift") shiftHeld.current = false;
    };
    const blur = () => {
      shiftHeld.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Open week/day scrolled to the current time when "now" is on screen (an
  // hour of context above it), otherwise to the start of the business day.
  useEffect(() => {
    if (!scrollRef.current) return;
    const now = new Date();
    const nowVisible =
      view === "day"
        ? sameDay(anchor, now)
        : (() => {
            const ws = startOfWeek(anchor);
            return now >= ws && now < addDays(ws, 7);
          })();
    const open = hours[anchor.getDay()]?.[0]?.start ?? dayStartMinutes;
    scrollRef.current.scrollTop = nowVisible
      ? Math.max(0, ((now.getHours() * 60 + now.getMinutes()) / 60 - 1) * HOUR_PX)
      : Math.max(0, (open / 60 - 0.5) * HOUR_PX);
  }, [view, date, anchor, hours, dayStartMinutes, board]);

  function go(next: { view?: View; date?: Date; team?: string; board?: boolean }, replace = false) {
    const v = next.view ?? view;
    const params = new URLSearchParams();
    params.set("view", v);
    params.set("date", toParam(next.date ?? anchor));
    const t = next.team !== undefined ? next.team : team;
    if (t) params.set("team", t);
    const b = next.board !== undefined ? next.board : board;
    if (b && v === "day" && !t) params.set("board", "team");
    const url = `/app/schedule?${params.toString()}`;
    startTransition(() => (replace ? router.replace(url) : router.push(url)));
  }

  // Phones open on today's Day agenda — the month grid is a desktop tool and
  // its truncated chips are unreadable at phone widths. Only when the URL
  // didn't ask for a view explicitly, so shared links still win.
  useEffect(() => {
    if (!explicitView && view !== "day" && window.matchMedia("(max-width: 1023px)").matches) {
      go({ view: "day", date: new Date() }, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function step(dir: 1 | -1) {
    if (view === "month") {
      go({ date: new Date(anchor.getFullYear(), anchor.getMonth() + dir, 1) });
    } else {
      go({ date: addDays(anchor, dir * (view === "week" ? 7 : 1)) });
    }
  }

  // Keyboard: T today · ← → step · N new job · P palette (not while typing)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      if (el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (blockSheet || placeIntent || shiftSheet || chooser) return;
      if (e.key === "t" || e.key === "T") go({ date: new Date() });
      else if (e.key === "ArrowLeft") step(-1);
      else if (e.key === "ArrowRight") step(1);
      else if ((e.key === "p" || e.key === "P") && window.matchMedia("(min-width: 1024px)").matches) setPaletteOpen((o) => !o);
      else if ((e.key === "n" || e.key === "N") && canCreateJob) router.push(`/app/jobs/new?date=${toParam(view === "month" ? new Date() : anchor)}`);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, team, board, blockSheet, placeIntent, shiftSheet, chooser, canCreateJob]);

  const allItems = useMemo(() => {
    const map = new Map<string, ScheduleJobDTO>();
    for (const j of [...items, ...unscheduled]) map.set(j.id, j);
    return map;
  }, [items, unscheduled]);

  const showToast = (t: Omit<ToastState, "id">) => setToast({ ...t, id: ++toastSeq.current });

  // ── Optimistic moves ──────────────────────────────────────────────────────

  const patchLocal = useCallback((id: string, patch: Partial<ScheduleJobDTO>) => {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  function snapshotOf(it: ScheduleJobDTO): Snapshot {
    return {
      scheduledAt: it.scheduledAt,
      scheduledEnd: it.scheduledEnd,
      scheduledAnytime: it.scheduledAnytime,
      assigneeIds: it.assigneeIds ?? [],
    };
  }

  /** Save a job/appointment's new place; on failure put it back. */
  async function commitMove(
    item: ScheduleJobDTO,
    next: Snapshot,
    opts: { undoable?: boolean; label?: string } = {}
  ): Promise<boolean> {
    const prev = snapshotOf(item);
    const crewChanged = JSON.stringify([...prev.assigneeIds].sort()) !== JSON.stringify([...next.assigneeIds].sort());
    const timeChanged =
      prev.scheduledAt !== next.scheduledAt || prev.scheduledEnd !== next.scheduledEnd || prev.scheduledAnytime !== next.scheduledAnytime;
    if (!crewChanged && !timeChanged) return true;

    // Optimistic: the calendar moves now
    patchLocal(item.id, {
      scheduledAt: next.scheduledAt,
      scheduledEnd: next.scheduledEnd,
      scheduledAnytime: next.scheduledAnytime,
      assigneeIds: next.assigneeIds,
      assignees: next.assigneeIds.map((id) => users.find((u) => u.id === id)?.name ?? "").filter(Boolean),
      conflictNote: null,
    });

    const body: Record<string, unknown> = {};
    if (timeChanged) {
      body.scheduledAt = next.scheduledAt;
      body.scheduledEnd = next.scheduledEnd;
      body.scheduledAnytime = next.scheduledAnytime;
    }
    if (crewChanged) {
      if (item.kind === "job") body.assigneeIds = next.assigneeIds;
      else body.assignedToId = next.assigneeIds[0] ?? null;
    }
    const endpoint = item.kind === "appointment" ? `/api/app/appointments/${item.id}` : `/api/app/jobs/${item.id}`;

    setSaving(true);
    setError("");
    const { ok, data } = await postJson<{ conflicts?: string[] }>(endpoint, body, "PATCH");
    setSaving(false);
    if (!ok) {
      patchLocal(item.id, { ...prev, assignees: item.assignees });
      setError(data?.error ?? GENERIC_ERROR);
      return false;
    }
    const warned = data?.conflicts;
    setConflicts(Array.isArray(warned) ? warned : []);

    if (opts.undoable !== false) {
      const when = next.scheduledAt
        ? placeLabel(
            new Date(next.scheduledAt),
            next.scheduledAnytime ? null : minutesOf(new Date(next.scheduledAt)),
            next.scheduledEnd && next.scheduledAt
              ? Math.round((new Date(next.scheduledEnd).getTime() - new Date(next.scheduledAt).getTime()) / 60000)
              : 60
          )
        : "unscheduled";
      const crewNote =
        crewChanged && next.assigneeIds.length
          ? ` · ${next.assigneeIds.map((id) => users.find((u) => u.id === id)?.name ?? "").filter(Boolean).join(", ")}`
          : crewChanged
            ? " · unassigned"
            : "";
      const canNotify = timeChanged && item.kind !== "block" && Boolean(item.phone || item.contactId);
      showToast({
        text: opts.label ?? `Moved ${item.contactName || item.title}`,
        sub: `${when}${crewNote}`,
        onUndo: async () => {
          const fresh = allItems.get(item.id) ?? item;
          await commitMove({ ...fresh, ...next, assigneeIds: next.assigneeIds }, prev, { undoable: false });
          startTransition(() => router.refresh());
        },
        onNotify: canNotify
          ? async () => {
              setToast((t) => (t ? { ...t, notifyBusy: true } : t));
              const r = await postJson<{ via?: string[] }>("/api/app/schedule/notify-move", {
                kind: item.kind,
                id: item.id,
                previousStart: prev.scheduledAt,
                previousAnytime: prev.scheduledAnytime,
              });
              if (r.ok) {
                setToast((t) =>
                  t ? { ...t, notifyBusy: false, notified: true, sub: `Sent by ${(r.data?.via ?? []).join(" + ") || "message"}` } : t
                );
              } else {
                setToast((t) => (t ? { ...t, notifyBusy: false } : t));
                setError(r.data?.error ?? GENERIC_ERROR);
              }
            }
          : undefined,
        notifyLabel: item.phone ? "Text client" : "Email client",
      });
    }
    startTransition(() => router.refresh());
    return true;
  }

  /** Shift a time block by whole days, or set it onto a slot. */
  async function moveBlock(item: ScheduleJobDTO, target: DropTarget) {
    const b = item.block;
    if (!b || !b.canEdit) return;
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    let startAt: Date;
    let endAt: Date;
    let allDay = b.allDay;
    if (target.type === "slot") {
      startAt = atMinute(target.date, target.minute);
      const len = b.allDay ? 60 * 60000 : Math.max(15 * 60000, e.getTime() - s.getTime());
      endAt = new Date(startAt.getTime() + len);
      allDay = false;
    } else if (target.type === "anytime") {
      startAt = new Date(target.date);
      startAt.setHours(0, 0, 0, 0);
      endAt = new Date(target.date);
      endAt.setHours(23, 59, 59, 999);
      allDay = true;
    } else {
      // Day drop: keep the block's shape, shift every day by the delta of
      // the segment that was grabbed
      const seg = new Date(item.scheduledAt!);
      seg.setHours(0, 0, 0, 0);
      const tgt = new Date(target.date);
      tgt.setHours(0, 0, 0, 0);
      const deltaDays = Math.round((tgt.getTime() - seg.getTime()) / 86400000);
      if (deltaDays === 0) return;
      startAt = addDays(s, deltaDays);
      endAt = addDays(e, deltaDays);
    }
    setSaving(true);
    setError("");
    const { ok, data } = await postJson(
      `/api/app/time-blocks/${b.id}`,
      { title: b.title, allDay, startAt: startAt.toISOString(), endAt: endAt.toISOString(), ...(canBlockForOthers ? { forUserId: b.userId } : {}) },
      "PATCH"
    );
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    showToast({
      text: `Moved ${b.title || "blocked time"}`,
      sub: placeLabel(startAt, allDay ? null : minutesOf(startAt), Math.round((endAt.getTime() - startAt.getTime()) / 60000)),
      onUndo: async () => {
        await postJson(
          `/api/app/time-blocks/${b.id}`,
          { title: b.title, allDay: b.allDay, startAt: b.startAt, endAt: b.endAt, ...(canBlockForOthers ? { forUserId: b.userId } : {}) },
          "PATCH"
        );
        startTransition(() => router.refresh());
      },
    });
    startTransition(() => router.refresh());
  }

  /** Where a dragged thing landed → what to do about it. */
  async function handleDrop(source: DragSource, target: DropTarget, endMinute: number | null) {
    setArmed(null);
    if (source.type === "palette") {
      const ent = source.entity;
      setPlaceIntent({
        entity: ent,
        date: toParam(target.date),
        minute: target.type === "slot" ? target.minute : target.type === "anytime" ? null : ent.type === "job" ? null : 9 * 60,
        userId: target.type === "day" ? (team || undefined) : target.userId ?? (team || undefined),
      });
      return;
    }

    const item = allItems.get(source.item.id) ?? source.item;
    if (item.kind === "block") {
      if (source.mode === "move") await moveBlock(item, target);
      return;
    }

    // Resize: only the end moves
    if (source.mode === "resize") {
      if (endMinute === null || !item.scheduledAt) return;
      const start = new Date(item.scheduledAt);
      const end = atMinute(start, endMinute);
      await commitMove(item, { ...snapshotOf(item), scheduledEnd: end.toISOString() }, { label: `${item.contactName} now ends ${fmtMinute(endMinute)}` });
      return;
    }

    // First-time scheduling of an unscheduled job goes through the sheet
    if (!item.scheduledAt) {
      setPlaceIntent({
        entity: { type: "job", job: item },
        date: toParam(target.date),
        minute: target.type === "slot" ? target.minute : null,
        userId: target.type === "day" ? undefined : target.userId,
      });
      return;
    }

    let start: Date;
    let end: Date | null = null;
    let anytime: boolean;
    if (target.type === "anytime") {
      start = atMinute(target.date, 12 * 60); // date-only convention: anchor at noon
      anytime = true;
    } else if (target.type === "day") {
      if (!item.scheduledAnytime) {
        start = atMinute(target.date, minutesOf(new Date(item.scheduledAt)));
        anytime = false;
      } else {
        start = atMinute(target.date, 12 * 60);
        anytime = true;
      }
    } else {
      start = atMinute(target.date, target.minute);
      anytime = false;
    }
    if (!anytime) end = new Date(start.getTime() + itemDuration(item) * 60000);

    // Crew: a drop into a tech's column swaps that tech in for the one it
    // came from (undefined = the column has no crew meaning)
    let assigneeIds = item.assigneeIds ?? [];
    if (target.type !== "day" && target.userId !== undefined) {
      const from = source.fromUserId;
      const rest = assigneeIds.filter((id) => id !== from);
      if (item.kind === "appointment") {
        if (target.userId) assigneeIds = [target.userId];
      } else {
        assigneeIds = target.userId === null ? rest : [...rest.filter((id) => id !== target.userId), target.userId];
      }
    }

    // Shift-drag copies a job instead of moving it
    if (shiftHeld.current && item.kind === "job" && canCreateJob) {
      setSaving(true);
      const dup = await postJson<{ id?: string }>(`/api/app/jobs/${item.id}/duplicate`);
      if (!dup.ok || !dup.data?.id) {
        setSaving(false);
        setError(dup.data?.error ?? GENERIC_ERROR);
        return;
      }
      const body: Record<string, unknown> = {
        scheduledAt: start.toISOString(),
        scheduledEnd: end ? end.toISOString() : null,
        scheduledAnytime: anytime,
      };
      if (users.length > 0) body.assigneeIds = assigneeIds;
      const r = await postJson<{ conflicts?: string[] }>(`/api/app/jobs/${dup.data.id}`, body, "PATCH");
      setSaving(false);
      if (!r.ok) {
        setError(r.data?.error ?? GENERIC_ERROR);
        return;
      }
      setConflicts(r.data?.conflicts ?? []);
      showToast({ text: `Copied ${item.contactName} — ${item.title}`, sub: placeLabel(start, anytime ? null : minutesOf(start), itemDuration(item)) });
      startTransition(() => router.refresh());
      return;
    }

    await commitMove(item, {
      scheduledAt: start.toISOString(),
      scheduledEnd: end ? end.toISOString() : null,
      scheduledAnytime: anytime,
      assigneeIds,
    });
  }

  const drag = useCalendarDrag({
    snapMinutes: 15,
    onDrop: handleDrop,
    onSelect: (range) => setChooser(range),
    scrollRef,
  });

  /** An armed palette card meets a click on the calendar. */
  function placeArmed(day: Date, minute: number | null, userId?: string | null) {
    if (!armed) return;
    const ent = armed;
    setArmed(null);
    setPlaceIntent({
      entity: ent,
      date: toParam(day),
      minute: minute ?? (ent.type === "job" || ent.type === "request" ? null : 9 * 60),
      userId: userId ?? (team || undefined),
    });
  }

  function onPlaced(r: PlaceResult) {
    setPlaceIntent(null);
    setConflicts(r.conflicts);
    showToast({
      text: `${r.kind === "job" ? "Scheduled" : "Booked"} ${r.contactName || r.label}`,
      sub: r.label,
    });
    startTransition(() => router.refresh());
  }

  const openItem = (it: ScheduleJobDTO) => {
    if (drag.state) return; // a drag just ended on this element
    if (it.kind === "block") {
      if (it.block) openBlockEdit(it.block);
      return;
    }
    router.push(it.kind === "appointment" ? `/app/appointments/${it.id}` : `/app/jobs/${it.id}`);
  };

  async function acceptTentative(it: ScheduleJobDTO) {
    if (!it.requestId) return;
    setSaving(true);
    const { ok, data } = await postJson(`/api/app/requests/${it.requestId}/booking`, { action: "accept" });
    setSaving(false);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    patchLocal(it.id, { tentative: false });
    showToast({ text: `Accepted ${it.contactName}'s booking`, sub: it.title });
    startTransition(() => router.refresh());
  }

  // ── Blocked-off time ──────────────────────────────────────────────────────

  function openBlockCreate(prefill?: { date: Date; startMin: number; endMin: number; who?: string | null }) {
    const d = toParam(prefill?.date ?? (view === "month" ? new Date() : anchor));
    setBlockErr("");
    setBlockSheet({
      id: null,
      canEdit: true,
      userName: null,
      form: {
        title: "",
        who: prefill?.who === null ? "everyone" : prefill?.who ?? meId,
        allDay: false,
        startDate: d,
        endDate: d,
        startTime: prefill ? `${pad(Math.floor(prefill.startMin / 60))}:${pad(prefill.startMin % 60)}` : "09:00",
        endTime: prefill ? `${pad(Math.floor(prefill.endMin / 60))}:${pad(prefill.endMin % 60)}` : "17:00",
        address: "",
      },
    });
  }

  function openBlockEdit(b: NonNullable<ScheduleJobDTO["block"]>) {
    const s = new Date(b.startAt);
    const e = new Date(b.endAt);
    setBlockErr("");
    setBlockSheet({
      id: b.id,
      canEdit: b.canEdit,
      userName: b.userName,
      mirrored: b.source === "GOOGLE",
      form: {
        title: b.title === "Blocked off" ? "" : b.title,
        who: b.userId ?? "everyone",
        allDay: b.allDay,
        startDate: toParam(s),
        endDate: toParam(e),
        startTime: `${pad(s.getHours())}:${pad(s.getMinutes())}`,
        endTime: `${pad(e.getHours())}:${pad(e.getMinutes())}`,
        address: b.address ?? "",
      },
    });
  }

  async function saveBlock() {
    if (!blockSheet) return;
    const f = blockSheet.form;
    if (!f.startDate) {
      setBlockErr("Pick a date.");
      return;
    }
    let startAt: Date;
    let endAt: Date;
    if (f.allDay) {
      startAt = parseParam(f.startDate);
      endAt = parseParam(f.endDate || f.startDate);
      endAt.setHours(23, 59, 59, 999);
    } else {
      const [sh, sm] = f.startTime.split(":").map(Number);
      const [eh, em] = f.endTime.split(":").map(Number);
      startAt = parseParam(f.startDate);
      startAt.setHours(sh || 0, sm || 0, 0, 0);
      endAt = parseParam(f.startDate);
      endAt.setHours(eh || 0, em || 0, 0, 0);
    }
    if (endAt <= startAt) {
      setBlockErr(f.allDay ? "The end date can't be before the start date." : "The end time must be after the start time.");
      return;
    }
    const body: Record<string, unknown> = {
      title: f.title,
      allDay: f.allDay,
      startAt: startAt.toISOString(),
      endAt: endAt.toISOString(),
      address: f.address.trim() || null,
    };
    if (canBlockForOthers) body.forUserId = f.who === "everyone" ? null : f.who;

    setBlockBusy(true);
    setBlockErr("");
    const { ok, data } = blockSheet.id
      ? await postJson(`/api/app/time-blocks/${blockSheet.id}`, body, "PATCH")
      : await postJson("/api/app/time-blocks", body);
    setBlockBusy(false);
    if (!ok) {
      setBlockErr(data?.error ?? GENERIC_ERROR);
      return;
    }
    setBlockSheet(null);
    startTransition(() => router.refresh());
  }

  async function deleteBlock() {
    if (!blockSheet?.id) return;
    setBlockBusy(true);
    setBlockErr("");
    const { ok, data } = await postJson(`/api/app/time-blocks/${blockSheet.id}`, undefined, "DELETE");
    setBlockBusy(false);
    if (!ok) {
      setBlockErr(data?.error ?? GENERIC_ERROR);
      return;
    }
    setBlockSheet(null);
    startTransition(() => router.refresh());
  }

  // ── Move the day ──────────────────────────────────────────────────────────

  function nextBusinessDay(from: Date): Date {
    for (let i = 1; i <= 7; i++) {
      const d = addDays(from, i);
      if ((hours[d.getDay()] ?? []).length > 0) return d;
    }
    return addDays(from, 1);
  }

  async function submitShift() {
    if (!shiftSheet) return;
    setShiftBusy(true);
    setShiftErr("");
    const { ok, data } = await postJson<{
      moved: number;
      notified: number;
      conflicts: string[];
      undo: { kind: string; id: string }[];
    }>("/api/app/schedule/shift-day", {
      date,
      toDate: shiftSheet.toDate,
      userId: team || undefined,
      includeAppointments: shiftSheet.includeAppointments,
      notify: shiftSheet.notify,
    });
    setShiftBusy(false);
    if (!ok || !data) {
      setShiftErr(data?.error ?? GENERIC_ERROR);
      return;
    }
    const toDate = shiftSheet.toDate;
    const ids = data.undo.map((u) => u.id);
    setShiftSheet(null);
    setConflicts(data.conflicts ?? []);
    showToast({
      text: `Moved ${data.moved} to ${parseParam(toDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}`,
      sub: shiftSheet.notify ? `${data.notified} client${data.notified === 1 ? "" : "s"} told` : undefined,
      onUndo: async () => {
        await postJson("/api/app/schedule/shift-day", { date: toDate, toDate: date, ids, includeAppointments: true });
        startTransition(() => router.refresh());
      },
    });
    go({ date: parseParam(toDate) });
  }

  // ── Drive time between stops (day view, per tech) ─────────────────────────

  const wantLegs = view === "day" && (board || Boolean(team));
  useEffect(() => {
    if (!wantLegs) {
      setLegs(null);
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/app/route-plan?date=${date}`);
        if (!res.ok) return;
        const data = (await res.json()) as {
          enabled: boolean;
          start: { label: string } | null;
          memberStarts: Record<string, { label: string }>;
          stops: { id: string; title: string; contactName: string; scheduledAt: string; scheduledAnytime: boolean; assigneeIds: string[] }[];
          drive: { legs: Record<string, Record<string, number>> };
        };
        if (cancelled) return;
        const out: DriveLegs = {};
        for (const [userId, legMap] of Object.entries(data.drive?.legs ?? {})) {
          const mine = data.stops
            .filter((s) => s.assigneeIds.includes(userId) && !s.scheduledAnytime)
            .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime());
          const col: DriveLegs[string] = {};
          // Blocked time shows on the calendar as per-day segments
          // (`blockId#n`), while the route engine keys the stop by the
          // block's own id — map it onto whichever segment sits on this day
          const calendarId = (stopId: string) =>
            items.find((it) => it.kind === "block" && it.block?.id === stopId && it.scheduledAt && sameDay(new Date(it.scheduledAt), anchor))?.id ?? stopId;
          mine.forEach((s, i) => {
            const minutes = legMap[s.id];
            if (minutes === undefined || minutes === null) return;
            const from =
              i === 0
                ? data.memberStarts?.[userId] ? "home" : data.start ? "the shop" : "start"
                : mine[i - 1].contactName || mine[i - 1].title;
            col[calendarId(s.id)] = { minutes, from, measured: Boolean(data.enabled) };
          });
          out[`u-${userId}`] = col;
        }
        setLegs(out);
      } catch {
        /* drive time is decoration */
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantLegs, date, jobs]);

  // ── Derived ───────────────────────────────────────────────────────────────

  let rangeLabel: string;
  let shortLabel: string;
  if (view === "month") {
    rangeLabel = `${MONTHS[anchor.getMonth()]} ${anchor.getFullYear()}`;
    shortLabel =
      anchor.getFullYear() === today.getFullYear()
        ? MONTHS[anchor.getMonth()]
        : `${MONTHS[anchor.getMonth()].slice(0, 3)} ${anchor.getFullYear()}`;
  } else if (view === "week") {
    const ws = startOfWeek(anchor);
    const we = addDays(ws, 6);
    const fmt = (d: Date) => d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
    rangeLabel = `${fmt(ws)} – ${fmt(we)}, ${we.getFullYear()}`;
    shortLabel = `${fmt(ws)} – ${fmt(we)}`;
  } else {
    rangeLabel = anchor.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
    shortLabel = sameDay(anchor, today)
      ? "Today"
      : anchor.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });
  }

  const weekDays = view === "week" ? Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i)) : [anchor];

  /** Items on a given day, Anytime first, then in clock order. */
  const itemsOn = useCallback(
    (day: Date): ScheduleJobDTO[] => sortItems(items.filter((j) => j.scheduledAt && sameDay(new Date(j.scheduledAt), day))),
    [items]
  );

  const showBoard = view === "day" && board && !team && users.length > 1 && canDispatch;

  const columns: GridColumn[] = useMemo(() => {
    if (view === "week") {
      return weekDays.map((d) => ({
        key: `d-${toParam(d)}`,
        date: d,
        label: `${DAY_NAMES[d.getDay()]} ${d.getDate()}`,
        isToday: sameDay(d, today),
        onHeaderClick: () => go({ view: "day", date: d }),
      }));
    }
    const dayItems = itemsOn(anchor);
    const booked = (list: ScheduleJobDTO[]) =>
      list.filter((it) => it.kind !== "block" && !it.scheduledAnytime).reduce((s, it) => s + itemDuration(it), 0);
    if (showBoard) {
      const cols: GridColumn[] = users.map((u) => {
        const mine = dayItems.filter((it) => (it.assigneeIds ?? []).includes(u.id));
        const drive = Object.values(legs?.[`u-${u.id}`] ?? {}).reduce((s, l) => s + l.minutes, 0);
        return {
          key: `u-${u.id}`,
          date: anchor,
          userId: u.id,
          label: u.name,
          sub: `${durationLabel(booked(mine))} booked${drive ? ` · ~${drive}m drive` : ""}`,
          isToday: sameDay(anchor, today),
        };
      });
      const loose = dayItems.filter((it) => it.kind !== "block" && (it.assigneeIds ?? []).length === 0);
      if (loose.length > 0) {
        cols.push({ key: "u-none", date: anchor, userId: null, label: "Unassigned", sub: `${loose.length} to hand out`, isToday: sameDay(anchor, today) });
      }
      return cols;
    }
    const drive = team ? Object.values(legs?.[`u-${team}`] ?? {}).reduce((s, l) => s + l.minutes, 0) : 0;
    return [
      {
        key: team ? `u-${team}` : "day",
        date: anchor,
        userId: team || undefined,
        label: anchor.toLocaleDateString("en-US", { weekday: "long" }),
        sub: `${durationLabel(booked(dayItems))} booked${drive ? ` · ~${drive}m drive` : ""}`,
        isToday: sameDay(anchor, today),
      },
    ];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, date, showBoard, users, legs, items, team]);

  const itemsFor = useCallback(
    (col: GridColumn): ScheduleJobDTO[] => {
      const day = itemsOn(col.date);
      const uid = col.userId;
      if (uid === undefined) return day;
      return day.filter((it) => {
        if (it.kind === "block") return it.block?.userId === null || it.block?.userId === uid;
        const ids = it.assigneeIds ?? [];
        return uid === null ? ids.length === 0 : ids.includes(uid);
      });
    },
    [itemsOn]
  );

  const capacityForMonth = useMemo(
    () => (team ? capacityByDow.map((m) => (users.length ? m / users.length : m)) : capacityByDow),
    [capacityByDow, team, users.length]
  );

  // ── Mobile renderers ──────────────────────────────────────────────────────
  // Phones get a different calendar entirely. A 24-hour time grid asks you to
  // scroll a mostly-empty column to find two jobs, and month cells at 375px
  // truncate every chip to a few letters — so under lg the day/week views are
  // agendas and the month view is a dot grid, both tap-through to a day.
  // Press-and-hold a row to drag it onto another day in the strip or grid.

  function renderDateStrip() {
    const days = Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(anchor), i));
    const target = drag.state?.target?.type === "day" ? drag.state.target.date : null;
    return (
      <div className="card-tool mb-3 flex overflow-hidden lg:hidden">
        {days.map((d, i) => {
          const selected = sameDay(d, anchor);
          const isToday = sameDay(d, today);
          const count = itemsOn(d).length;
          const hot = target ? sameDay(target, d) : false;
          return (
            <button
              key={i}
              data-drop="day"
              data-date={toParam(d)}
              onClick={() => (armed ? placeArmed(d, null) : go({ view: "day", date: d }))}
              aria-current={selected ? "date" : undefined}
              className={`flex min-w-0 flex-1 flex-col items-center gap-1 py-2 transition-colors active:bg-gray-50 ${
                hot ? "bg-green-100" : ""
              }`}
            >
              <span className="text-[10px] font-semibold uppercase tracking-wide text-gray-400">{DAY_NAMES[d.getDay()][0]}</span>
              <span
                className="flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-semibold"
                style={
                  selected
                    ? { backgroundColor: "var(--mobile-accent)", color: "var(--mobile-on-accent)" }
                    : isToday
                      ? { backgroundColor: "color-mix(in srgb, var(--mobile-accent) 14%, transparent)", color: "var(--wb-ink)" }
                      : undefined
                }
              >
                {d.getDate()}
              </span>
              <span className="flex h-1.5 items-center gap-[3px]">
                {Array.from({ length: Math.min(count, 3) }, (_, k) => (
                  <span
                    key={k}
                    className="h-1.5 w-1.5 rounded-full"
                    style={{
                      backgroundColor: selected ? "var(--mobile-accent)" : "color-mix(in srgb, var(--mobile-accent) 55%, transparent)",
                    }}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  function agendaRow(it: ScheduleJobDTO) {
    const start = new Date(it.scheduledAt!);
    const end = it.scheduledEnd ? new Date(it.scheduledEnd) : null;
    const isBlock = it.kind === "block";
    const crew = !isBlock ? (it.assignees ?? []) : [];
    const swipeActions: SwipeRowAction[] = isBlock
      ? []
      : [
          ...(it.phone ? [{ key: "call", label: "Call", icon: PhoneIcon, href: telHref(it.phone), bg: "#16A34A" }] : []),
          ...(it.address
            ? [
                {
                  key: "nav",
                  label: "Directions",
                  icon: NavigationIcon,
                  href: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(it.address)}`,
                  external: true,
                  bg: "#2563EB",
                },
              ]
            : []),
        ];
    const canDrag = !isBlock || Boolean(it.block?.canEdit);
    const moving = drag.state?.source.type === "item" && drag.state.source.item.id === it.id;
    return (
      <li key={it.id}>
        <SwipeRow actions={swipeActions}>
          <button
            type="button"
            data-item
            {...(canDrag ? drag.handleProps({ type: "item", item: it, mode: "move", grabOffsetMin: 0 }) : {})}
            onClick={() => openItem(it)}
            className={`flex w-full items-stretch gap-2.5 text-left transition-transform active:scale-[0.99] ${moving ? "opacity-40" : ""}`}
          >
            <span className="w-[56px] shrink-0 pt-2 text-right">
              {it.scheduledAnytime ? (
                <span className="text-[11px] font-semibold text-gray-400">Anytime</span>
              ) : (
                <>
                  <span className="numeral-ledger block text-[13px] font-semibold text-gray-900">{fmtTime(start)}</span>
                  {end && <span className="numeral-ledger block text-[11px] text-gray-400">{fmtTime(end)}</span>}
                </>
              )}
            </span>
            <span className={`flex min-w-0 flex-1 items-center gap-2 rounded-[16px] border-l-[3px] px-3 py-2.5 shadow-[0_1px_2px_rgba(9,13,19,0.08)] ${itemTone(it)}`}>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5 text-[15px] font-semibold">
                  <TypeGlyph apptType={it.apptType} recurring={it.recurring} size={13} />
                  <span className="truncate">{isBlock ? it.title || "Blocked off" : it.contactName}</span>
                </span>
                <span className="mt-0.5 block truncate text-[13px] opacity-80">
                  {isBlock ? (it.contactName === "Everyone" ? "Whole team" : it.contactName) : it.title}
                  {!isBlock && it.jobNumber ? ` · #${it.jobNumber}` : ""}
                </span>
                {it.tentative && <span className="stamp mt-1.5 text-blue-800">Awaiting approval</span>}
                {it.conflictNote && (
                  <span className="stamp mt-1.5 text-amber-700" title={it.conflictNote}>
                    Double-booked
                  </span>
                )}
              </span>
              {crew.length > 0 && (
                <span className="flex shrink-0 items-center gap-1 self-center">
                  {crew.slice(0, 2).map((n, k) => (
                    <span
                      key={k}
                      className="flex h-6 w-6 items-center justify-center rounded-full text-[9.5px] font-bold"
                      style={{ background: "color-mix(in srgb, currentColor 14%, transparent)" }}
                      title={n}
                    >
                      {initialsOf(n)}
                    </span>
                  ))}
                  {crew.length > 2 && <span className="text-[10px] font-semibold opacity-70">+{crew.length - 2}</span>}
                </span>
              )}
            </span>
          </button>
        </SwipeRow>
      </li>
    );
  }

  function renderAgenda(days: Date[]) {
    const nowMs = today.getTime();
    const target = drag.state?.target?.type === "day" ? drag.state.target.date : null;
    return (
      <div className="lg:hidden">
        {days.map((day, di) => {
          const list = itemsOn(day);
          const isToday = sameDay(day, today);
          const nowIdx =
            isToday && mounted ? list.findIndex((it) => !it.scheduledAnytime && new Date(it.scheduledAt!).getTime() > nowMs) : -1;
          const firstTimed = list.find((it) => !it.scheduledAnytime);
          const summary =
            days.length === 1 && list.length > 0
              ? `${list.length} on the schedule${firstTimed ? ` · first at ${fmtTime(new Date(firstTimed.scheduledAt!))}` : ""}`
              : null;
          const hot = target ? sameDay(target, day) : false;
          return (
            <section
              key={di}
              className={`${di > 0 ? "mt-5" : ""} rounded-xl transition-colors ${hot ? "bg-green-50 ring-2 ring-green-300" : ""}`}
              {...(days.length > 1 ? { "data-drop": "day", "data-date": toParam(day) } : {})}
            >
              {summary && <p className="mb-2.5 px-0.5 text-[13px] font-medium text-gray-500">{summary}</p>}
              {days.length > 1 && (
                <div className="mb-2 flex items-center gap-2 px-0.5">
                  <h3 className={`text-[13px] font-semibold ${isToday ? "text-gray-900" : "text-gray-500"}`}>
                    {day.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  </h3>
                  {isToday && (
                    <span className="stamp" style={{ color: "var(--wb-ink)" }}>
                      Today
                    </span>
                  )}
                  <span className="h-px flex-1 bg-gray-200" aria-hidden />
                  {armed && (
                    <button onClick={() => placeArmed(day, null)} className="text-[12px] font-semibold text-green-700">
                      Place here
                    </button>
                  )}
                </div>
              )}
              {list.length === 0 ? (
                days.length > 1 ? (
                  <p className="px-0.5 pb-1 text-[13px] text-gray-400">Nothing scheduled</p>
                ) : (
                  <button
                    type="button"
                    onClick={() => armed && placeArmed(day, null)}
                    className="card-tool w-full px-4 py-7 text-center"
                  >
                    <p className="text-sm font-medium text-gray-500">{armed ? "Tap to place here" : "Nothing scheduled"}</p>
                    <p className="mt-0.5 text-xs text-gray-400">
                      {unscheduled.length > 0 ? `${unscheduled.length} job${unscheduled.length === 1 ? "" : "s"} waiting to be scheduled` : "Free day."}
                    </p>
                  </button>
                )
              ) : (
                <ul className="space-y-2">
                  {list.flatMap((it, i) =>
                    i === nowIdx
                      ? [
                          <li key={`now-${di}`} aria-hidden className="flex items-center gap-2 py-1">
                            <span className="numeral-ledger w-[56px] shrink-0 text-right text-[11px] font-bold" style={{ color: "#F86A0A" }}>
                              {fmtTime(new Date())}
                            </span>
                            <span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: "#F86A0A" }} />
                            <span className="h-[2px] flex-1 rounded-full" style={{ backgroundColor: "#F86A0A" }} />
                          </li>,
                          agendaRow(it),
                        ]
                      : [agendaRow(it)]
                  )}
                </ul>
              )}
            </section>
          );
        })}
      </div>
    );
  }

  function renderMonthCompact() {
    const y = anchor.getFullYear();
    const m = anchor.getMonth();
    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const byDay: Record<number, ScheduleJobDTO[]> = {};
    for (const it of items) {
      if (!it.scheduledAt) continue;
      const d = new Date(it.scheduledAt);
      if (d.getMonth() !== m || d.getFullYear() !== y) continue;
      (byDay[d.getDate()] ??= []).push(it);
    }
    const target = drag.state?.target?.type === "day" ? drag.state.target.date : null;
    return (
      <div className="lg:hidden">
        <div className="card-tool overflow-hidden">
          <div className="grid grid-cols-7 border-b border-gray-100 py-1.5">
            {DAY_NAMES.map((d) => (
              <div key={d} className="text-center text-[10px] font-semibold uppercase text-gray-400">
                {d[0]}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-y-0.5 px-1 py-2">
            {Array.from({ length: firstDow }, (_, i) => (
              <div key={`e-${i}`} />
            ))}
            {Array.from({ length: daysInMonth }, (_, i) => {
              const d = i + 1;
              const cellDate = new Date(y, m, d);
              const isToday = sameDay(cellDate, today);
              const selected = sameDay(cellDate, anchor);
              const dayItems = byDay[d] ?? [];
              const hot = target ? sameDay(target, cellDate) : false;
              return (
                <button
                  key={d}
                  data-drop="day"
                  data-date={toParam(cellDate)}
                  onClick={() => (armed ? placeArmed(cellDate, null) : go({ date: cellDate }))}
                  aria-current={selected ? "date" : undefined}
                  className={`flex flex-col items-center gap-1 rounded-xl py-1.5 transition-colors active:bg-gray-50 ${hot ? "bg-green-100" : ""}`}
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full text-[15px] font-medium ${selected || isToday ? "" : "text-gray-900"}`}
                    style={
                      selected
                        ? { backgroundColor: "var(--mobile-accent)", color: "var(--mobile-on-accent)" }
                        : isToday
                          ? { backgroundColor: "color-mix(in srgb, var(--mobile-accent) 14%, transparent)", color: "var(--wb-ink)" }
                          : undefined
                    }
                  >
                    {d}
                  </span>
                  <span className="flex h-1.5 items-center gap-[3px]">
                    {dayItems.slice(0, 3).map((it) => (
                      <span
                        key={it.id}
                        className="h-1.5 w-1.5 rounded-full"
                        style={{
                          backgroundColor: selected ? "var(--mobile-accent)" : "color-mix(in srgb, var(--mobile-accent) 55%, transparent)",
                        }}
                      />
                    ))}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mb-2 mt-4 flex items-center gap-2 px-0.5">
          <h3 className="text-[13px] font-semibold text-gray-900">
            {anchor.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
          </h3>
          {sameDay(anchor, today) && (
            <span className="stamp" style={{ color: "var(--wb-ink)" }}>
              Today
            </span>
          )}
          <span className="h-px flex-1 bg-gray-200" aria-hidden />
          <button onClick={() => go({ view: "day" })} className="text-[13px] font-semibold text-green-700">
            Day view
          </button>
        </div>
        {renderAgenda([anchor])}
      </div>
    );
  }

  // ── Floating card while dragging (fingers, palette cards, off-grid) ───────
  const ghost = (() => {
    const st = drag.state;
    if (!st) return null;
    const onGrid = st.target?.type === "slot";
    if (!st.touch && st.source.type === "item" && onGrid) return null;
    let label = "";
    let sub = "";
    if (st.source.type === "item") {
      const it = st.source.item;
      label = it.kind === "block" ? it.title || "Blocked off" : it.contactName;
      sub = it.kind === "block" ? "" : it.title;
    } else {
      const e = st.source.entity;
      label = e.type === "job" ? e.job.contactName : e.type === "pick" ? "" : e.name;
      sub = e.type === "job" ? e.job.title : e.type === "request" ? e.title : e.type === "contact" ? e.sub : "New client";
    }
    const where = st.target
      ? st.target.type === "day"
        ? st.target.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })
        : st.target.type === "anytime"
          ? `${st.target.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })} · Anytime`
          : `${st.target.date.toLocaleDateString("en-US", { weekday: "short", day: "numeric" })} · ${fmtMinute(st.target.minute)}`
      : "Drop on a day or time";
    return (
      <div
        aria-hidden
        className="pointer-events-none fixed z-[70] w-[220px] max-w-[70vw] rounded-[12px] border border-green-300 bg-white px-3 py-2 text-sm shadow-[0_12px_30px_rgba(9,13,19,0.25)]"
        style={{
          // Keep the card on screen: a finger near the right edge used to
          // push it past the viewport and the page shifted sideways
          left: Math.max(8, Math.min(st.x + 14, (typeof window !== "undefined" ? window.innerWidth : 400) - 228)),
          top: Math.max(8, st.y - (st.touch ? 72 : -14)),
        }}
      >
        <p className="truncate font-semibold text-gray-900">{label}</p>
        {sub && <p className="truncate text-xs text-gray-500">{sub}</p>}
        <p className={`mt-1 text-[11px] font-semibold ${st.target ? "text-green-700" : "text-gray-400"}`}>{where}</p>
      </div>
    );
  })();

  const dayLabelFor = (d: Date) => d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" });

  // ── Page ──────────────────────────────────────────────────────────────────
  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="mb-5 flex items-center justify-between gap-2">
        <PageTitle section="schedule" icon={CalendarDays}>
          Schedule
        </PageTitle>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              setPaletteOpen((o) => !o);
              setArmed(null);
            }}
            aria-label="Schedule someone"
            title="Schedule someone (P)"
            className={`relative flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] text-sm font-semibold transition-colors md:w-auto md:px-4 ${
              paletteOpen ? "chip-pressed bg-green-50 text-green-700" : "btn-tool-line bg-white text-gray-700 hover:bg-gray-50"
            }`}
          >
            <UserPlus size={16} />
            <span className="hidden md:inline">Schedule someone</span>
            {unscheduled.length > 0 && (
              <span className="absolute -right-1 -top-1 min-w-[18px] rounded-full bg-amber-400 px-1 py-px text-center text-[11px] font-bold text-amber-950 md:static md:bg-amber-100 md:text-amber-700">
                {unscheduled.length}
              </span>
            )}
          </button>
          <button
            onClick={() => openBlockCreate()}
            aria-label="Block off time"
            title="Block Time"
            className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 md:w-auto md:px-4"
          >
            <CalendarOff size={16} />
            <span className="hidden md:inline">Block Time</span>
          </button>
          {view === "day" && canDispatch && (
            <button
              onClick={() => {
                setShiftErr("");
                setShiftSheet({ toDate: toParam(nextBusinessDay(anchor)), includeAppointments: true, notify: true });
              }}
              aria-label="Move the day"
              title="Move everything on this day"
              className="flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 md:w-auto md:px-4"
            >
              <CloudRain size={16} />
              <span className="hidden md:inline">Move the day</span>
            </button>
          )}
          {canCreateAppointment && (
            <Link
              href="/app/appointments/new"
              aria-label="New appointment"
              title="New Appointment"
              className="hidden h-10 items-center justify-center gap-1.5 rounded-[10px] btn-tool-line bg-blue-50 px-4 text-sm font-semibold text-blue-700 transition-colors hover:bg-blue-100 md:flex"
            >
              <CalendarClock size={16} />
              New Appointment
            </Link>
          )}
          {canCreateJob && (
            <Link
              href={`/app/jobs/new?date=${toParam(view === "month" ? new Date() : anchor)}`}
              className="hidden lg:flex h-10 items-center gap-1.5 rounded-[10px] btn-tool bg-green-500 px-4 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700"
            >
              <Plus size={15} />
              New Job
            </Link>
          )}
        </div>
      </div>

      {/* ── Mobile controls ── */}
      <div className="mb-2.5 flex items-center gap-1 lg:hidden">
        <button onClick={() => step(-1)} className="-ml-1.5 shrink-0 rounded-full p-2 transition-colors active:bg-gray-100" aria-label="Previous">
          <ChevronLeft size={20} className="text-gray-500" />
        </button>
        <h2 className="min-w-0 flex-1 truncate text-center text-[17px] font-bold text-gray-900">{shortLabel}</h2>
        <button onClick={() => step(1)} className="shrink-0 rounded-full p-2 transition-colors active:bg-gray-100" aria-label="Next">
          <ChevronRight size={20} className="text-gray-500" />
        </button>
        {!sameDay(anchor, today) && (
          <button onClick={() => go({ date: new Date() })} className="shrink-0 rounded-[10px] btn-tool-line bg-white px-2.5 py-1.5 text-[13px] font-semibold text-gray-700">
            Today
          </button>
        )}
      </div>
      <div className="mb-4 flex items-center gap-2 lg:hidden">
        <SegmentedRow className="min-w-0 flex-1">
          {(["day", "week", "month"] as View[]).map((v) => (
            <Segment key={v} active={view === v} onClick={() => go({ view: v })}>
              <span className="capitalize">{v}</span>
            </Segment>
          ))}
          <Segment active={false} href={`/app/schedule/map?date=${toParam(anchor)}${team ? `&team=${team}` : ""}`}>
            <RouteIcon size={13} />
            Map
          </Segment>
        </SegmentedRow>
        {users.length > 1 && (
          <select
            value={team}
            onChange={(e) => go({ team: e.target.value })}
            aria-label="Team member"
            className="max-w-[128px] shrink-0 rounded-[10px] border border-gray-200 bg-white py-2 pl-3 pr-2 text-[13px] font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            <option value="">Everyone</option>
            {users.map((u) => (
              <option key={u.id} value={u.id}>
                {u.name}
              </option>
            ))}
          </select>
        )}
        {(saving || isPending) && <Loader2 size={15} className="shrink-0 animate-spin text-gray-400" />}
      </div>

      {/* ── Desktop controls ── */}
      <div className="mb-4 hidden flex-wrap items-center gap-x-2 gap-y-2 lg:flex">
        <div className="flex items-center gap-1">
          <button onClick={() => step(-1)} className="rounded-full p-2 transition-colors hover:bg-gray-100" aria-label="Previous">
            <ChevronLeft size={18} className="text-gray-600" />
          </button>
          <button onClick={() => step(1)} className="rounded-full p-2 transition-colors hover:bg-gray-100" aria-label="Next">
            <ChevronRight size={18} className="text-gray-600" />
          </button>
          <button onClick={() => go({ date: new Date() })} className="rounded-[10px] btn-tool-line bg-white px-3 py-1.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50">
            Today
          </button>
        </div>
        <h2 className="text-base font-bold text-gray-900 lg:text-lg">{rangeLabel}</h2>
        {(saving || isPending) && <Loader2 size={15} className="animate-spin text-gray-400" />}

        <div className="ml-auto flex items-center gap-2">
          <div className="flex shrink-0 items-center gap-1.5">
            {(["month", "week", "day"] as View[]).map((v) => (
              <FilterChip key={v} hue={hue} active={view === v} onClick={() => go({ view: v })}>
                <span className="capitalize">{v}</span>
              </FilterChip>
            ))}
            {view === "day" && users.length > 1 && canDispatch && !team && (
              <FilterChip hue={hue} active={board} onClick={() => go({ board: !board })}>
                <Columns3 size={14} />
                By tech
              </FilterChip>
            )}
            <FilterChip hue={hue} active={false} href={`/app/schedule/map?date=${toParam(anchor)}${team ? `&team=${team}` : ""}`}>
              <RouteIcon size={14} />
              Map
            </FilterChip>
          </div>
          {users.length > 1 && (
            <select
              value={team}
              onChange={(e) => go({ team: e.target.value, board: false })}
              className="min-w-0 rounded-[10px] border border-gray-300 bg-white px-3 py-1.5 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-green-500"
            >
              <option value="">All team members</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
          )}
        </div>
      </div>

      {armed && (
        <div className="mb-3 flex items-center justify-between gap-3 rounded-lg border border-green-200 bg-green-50 px-3 py-2 text-sm text-green-800">
          <span>
            Placing <strong>{armed.type === "job" ? armed.job.contactName : armed.type === "pick" ? "someone" : armed.name}</strong> — tap a day
            {view !== "month" ? " or time" : ""} on the calendar.
          </span>
          <button onClick={() => setArmed(null)} className="p-0.5 text-green-500 hover:text-green-700" aria-label="Cancel">
            <X size={14} />
          </button>
        </div>
      )}

      {error && (
        <div className="mb-3 flex items-center justify-between rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      {conflicts.length > 0 && (
        <div className="mb-3 flex items-start justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
          <div>
            <p className="font-semibold">Heads up — this overlaps:</p>
            {conflicts.map((c) => (
              <p key={c} className="mt-0.5 text-xs">
                {c}
              </p>
            ))}
          </div>
          <button onClick={() => setConflicts([])} className="p-0.5 text-amber-400 hover:text-amber-600">
            <X size={14} />
          </button>
        </div>
      )}

      {/* Calendar + palette */}
      <div className="flex items-start gap-4">
        <div className={`min-w-0 flex-1 ${isPending ? "opacity-60" : ""}`}>
          {view === "month" ? (
            renderMonthCompact()
          ) : (
            <>
              {view === "day" && renderDateStrip()}
              {renderAgenda(weekDays)}
            </>
          )}

          <div className="hidden lg:block">
            {view === "month" ? (
              <MonthGrid
                anchor={anchor}
                today={today}
                items={items}
                drag={drag}
                onOpen={openItem}
                onGoDay={(d) => go({ view: "day", date: d })}
                capacityByDow={capacityForMonth}
                onCellClick={armed ? (d) => placeArmed(d, null) : undefined}
              />
            ) : (
              <TimeGrid
                columns={columns}
                itemsFor={itemsFor}
                hours={hours}
                today={today}
                mounted={mounted}
                scrollRef={scrollRef}
                drag={drag}
                onOpen={openItem}
                legs={legs ?? undefined}
                wide={view === "week" || showBoard}
                emptyHint={showBoard ? "Nothing yet — drop work here" : undefined}
                onEmptyClick={armed ? (d, minute, userId) => placeArmed(d, minute, userId) : undefined}
                onAccept={canCreateAppointment ? acceptTentative : undefined}
              />
            )}
          </div>

          <div className="mt-4 hidden flex-wrap items-center gap-3 lg:flex">
            {[
              ["bg-green-500", "Active job"],
              ["bg-amber-500", "Requires invoicing"],
              ["bg-blue-500", "Appointment"],
              ["bg-gray-400", "Closed"],
              ["bg-blocked border border-gray-400", "Blocked off"],
            ].map(([c, label]) => (
              <div key={label} className="flex items-center gap-1.5 text-xs text-gray-500">
                <div className={`h-2.5 w-2.5 rounded-lg ${c}`} />
                {label}
              </div>
            ))}
            {view !== "month" && (
              <span className="ml-auto text-[11px] text-gray-400">
                Drag to move · drag the bottom edge to change length · drag empty space for new · Shift-drag copies
              </span>
            )}
          </div>
        </div>

        <SchedulePalette
          open={paletteOpen}
          onClose={() => {
            setPaletteOpen(false);
            setArmed(null);
          }}
          unscheduled={unscheduled}
          drag={drag}
          armed={armed}
          onArm={(e) => {
            setArmed(e);
            // Phones: the sheet covers the calendar — close it so the day is tappable
            if (e && window.matchMedia("(max-width: 1023px)").matches) setPaletteOpen(false);
          }}
          onOpenJob={(j) => router.push(`/app/jobs/${j.id}`)}
          canSell={canCreateAppointment || canCreateJob}
        />
      </div>

      {ghost}

      {/* New-thing chooser after painting a range */}
      <Modal open={Boolean(chooser)} onClose={() => setChooser(null)} cardClassName="w-full max-w-sm space-y-3 rounded-lg bg-white p-5 text-left shadow-xl">
        {chooser && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">
                {dayLabelFor(chooser.date)} · {fmtMinute(chooser.startMin)} – {fmtMinute(chooser.endMin)}
              </h2>
              <p className="mt-0.5 text-sm text-gray-500">
                {durationLabel(chooser.endMin - chooser.startMin)}
                {chooser.userId ? ` · ${users.find((u) => u.id === chooser.userId)?.name ?? ""}` : ""}
              </p>
            </div>
            <div className="grid gap-2">
              {canCreateJob && (
                <button
                  onClick={() => {
                    const c = chooser;
                    setChooser(null);
                    setPlaceIntent({ entity: { type: "pick", kind: "job" }, date: toParam(c.date), minute: c.startMin, userId: c.userId ?? (team || undefined), durationMin: c.endMin - c.startMin });
                  }}
                  className="flex items-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-green-600"
                >
                  <Plus size={15} /> New job
                </button>
              )}
              {canCreateAppointment && (
                <button
                  onClick={() => {
                    const c = chooser;
                    setChooser(null);
                    setPlaceIntent({ entity: { type: "pick", kind: "appointment" }, date: toParam(c.date), minute: c.startMin, userId: c.userId ?? (team || undefined), durationMin: c.endMin - c.startMin });
                  }}
                  className="flex items-center gap-2 rounded-[10px] btn-tool-line bg-blue-50 px-4 py-2.5 text-sm font-semibold text-blue-700 hover:bg-blue-100"
                >
                  <CalendarClock size={15} /> New appointment
                </button>
              )}
              <button
                onClick={() => {
                  const c = chooser;
                  setChooser(null);
                  openBlockCreate({ date: c.date, startMin: c.startMin, endMin: c.endMin, who: c.userId === undefined ? team || meId : c.userId });
                }}
                className="flex items-center gap-2 rounded-[10px] btn-tool-line bg-white px-4 py-2.5 text-sm font-semibold text-gray-700 hover:bg-gray-50"
              >
                <CalendarOff size={15} /> Block off this time
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Move the day */}
      <Modal open={Boolean(shiftSheet)} onClose={() => !shiftBusy && setShiftSheet(null)} cardClassName="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-left shadow-xl">
        {shiftSheet && (
          <>
            <div>
              <h2 className="text-base font-semibold text-gray-900">Move the day</h2>
              <p className="mt-0.5 text-sm text-gray-500">
                Everything on {dayLabelFor(anchor)}
                {team ? ` for ${users.find((u) => u.id === team)?.name ?? "this tech"}` : ""} keeps its time and length, just on a different date. Rained out, sick day, truck in the shop.
              </p>
            </div>
            {shiftErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{shiftErr}</div>}
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Move to</label>
              <input
                type="date"
                value={shiftSheet.toDate}
                onChange={(e) => setShiftSheet((s) => s && { ...s, toDate: e.target.value })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
              />
              <div className="mt-1.5 flex flex-wrap gap-1.5">
                {(
                  [
                    ["Tomorrow", addDays(anchor, 1)],
                    ["Next business day", nextBusinessDay(anchor)],
                    ["Next week", addDays(anchor, 7)],
                  ] as [string, Date][]
                ).map(([label, d]) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => setShiftSheet((s) => s && { ...s, toDate: toParam(d) })}
                    className={`rounded-full border px-2.5 py-1 text-xs font-medium ${
                      shiftSheet.toDate === toParam(d) ? "border-green-500 bg-green-50 text-green-700" : "border-gray-200 text-gray-600 hover:bg-gray-50"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shiftSheet.includeAppointments} onChange={(e) => setShiftSheet((s) => s && { ...s, includeAppointments: e.target.checked })} className="rounded text-green-600 focus:ring-green-500" />
              Move appointments too (calls, estimates)
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input type="checkbox" checked={shiftSheet.notify} onChange={(e) => setShiftSheet((s) => s && { ...s, notify: e.target.checked })} className="rounded text-green-600 focus:ring-green-500" />
              Text or email each client their new time
            </label>
            <div className="flex items-center gap-2 pt-1">
              <button onClick={submitShift} disabled={shiftBusy} className="flex items-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50">
                {shiftBusy && <Loader2 size={14} className="animate-spin" />}
                Move everything
              </button>
              <button onClick={() => setShiftSheet(null)} disabled={shiftBusy} className="rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50">
                Cancel
              </button>
            </div>
          </>
        )}
      </Modal>

      {/* Block-off-time sheet (create + edit; read-only when not yours) */}
      <Modal open={Boolean(blockSheet)} onClose={() => !blockBusy && setBlockSheet(null)} cardClassName="w-full max-w-md space-y-3 rounded-lg bg-white p-5 text-left shadow-xl">
        {blockSheet && (
          <>
            <h2 className="text-base font-semibold text-gray-900">
              {blockSheet.id === null ? "Block Off Time" : blockSheet.canEdit ? "Edit Blocked Time" : blockSheet.mirrored ? "Busy in Google Calendar" : "Blocked Time"}
            </h2>
            {!blockSheet.canEdit && (
              <p className="text-sm text-gray-500">
                {blockSheet.mirrored
                  ? `From ${blockSheet.userName ? `${blockSheet.userName}'s` : "their"} Google Calendar. Change it in Google and it updates here within a few minutes.`
                  : blockSheet.form.who === "everyone"
                    ? "Blocked off for the whole team by an owner or admin."
                    : "Only owners and admins can change someone else's blocked time."}
              </p>
            )}
            {blockErr && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{blockErr}</div>}
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Reason</label>
              <input
                type="text"
                value={blockSheet.form.title}
                disabled={!blockSheet.canEdit}
                placeholder="Blocked off"
                onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, title: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
            </div>
            {canBlockForOthers ? (
              <div>
                <label className="mb-0.5 block text-xs font-medium text-gray-500">Who</label>
                <select
                  value={blockSheet.form.who}
                  onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, who: e.target.value } })}
                  className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                >
                  <option value="everyone">Everyone (whole team)</option>
                  {users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.id === meId ? `${u.name} (me)` : u.name}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              blockSheet.id !== null &&
              !blockSheet.canEdit && (
                <p className="text-xs text-gray-500">
                  Applies to: {blockSheet.form.who === "everyone" ? "everyone" : blockSheet.userName ?? "a teammate"}
                </p>
              )
            )}
            <div>
              <label className="mb-0.5 block text-xs font-medium text-gray-500">Where (optional)</label>
              <input
                type="text"
                value={blockSheet.form.address}
                disabled={!blockSheet.canEdit}
                placeholder="Address — so jobs get scheduled around the drive"
                onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, address: e.target.value } })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
              />
              {blockSheet.form.who !== "everyone" && blockSheet.form.address.trim() && (
                <p className="mt-1 text-xs text-gray-500">Find a Time and the route map will count the drive to and from here.</p>
              )}
            </div>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={blockSheet.form.allDay}
                disabled={!blockSheet.canEdit}
                onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, allDay: e.target.checked } })}
                className="rounded text-green-600 focus:ring-green-500"
              />
              All day
            </label>
            {blockSheet.form.allDay ? (
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-500">From</label>
                  <input
                    type="date"
                    value={blockSheet.form.startDate}
                    disabled={!blockSheet.canEdit}
                    onChange={(e) =>
                      setBlockSheet((s) => {
                        if (!s) return s;
                        const startDate = e.target.value;
                        const endDate = s.form.endDate < startDate ? startDate : s.form.endDate;
                        return { ...s, form: { ...s.form, startDate, endDate } };
                      })
                    }
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-500">Through</label>
                  <input
                    type="date"
                    value={blockSheet.form.endDate}
                    disabled={!blockSheet.canEdit}
                    onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, endDate: e.target.value } })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
              </div>
            ) : (
              <>
                <div>
                  <label className="mb-0.5 block text-xs font-medium text-gray-500">Date</label>
                  <input
                    type="date"
                    value={blockSheet.form.startDate}
                    disabled={!blockSheet.canEdit}
                    onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, startDate: e.target.value } })}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">From</label>
                    <input
                      type="time"
                      value={blockSheet.form.startTime}
                      disabled={!blockSheet.canEdit}
                      onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, startTime: e.target.value } })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                  <div>
                    <label className="mb-0.5 block text-xs font-medium text-gray-500">To</label>
                    <input
                      type="time"
                      value={blockSheet.form.endTime}
                      disabled={!blockSheet.canEdit}
                      onChange={(e) => setBlockSheet((s) => s && { ...s, form: { ...s.form, endTime: e.target.value } })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-50 disabled:text-gray-500"
                    />
                  </div>
                </div>
              </>
            )}
            <div className="flex items-center gap-2 pt-1">
              {blockSheet.canEdit && (
                <button onClick={saveBlock} disabled={blockBusy} className="flex items-center gap-2 rounded-[10px] btn-tool bg-green-500 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-green-600 active:bg-green-700 disabled:opacity-50">
                  {blockBusy && <Loader2 size={14} className="animate-spin" />}
                  {blockSheet.id === null ? "Block Time" : "Save"}
                </button>
              )}
              <button onClick={() => setBlockSheet(null)} disabled={blockBusy} className="rounded-[10px] btn-tool-line bg-white px-4 py-2 text-sm font-medium text-gray-600 transition-colors hover:bg-gray-50">
                {blockSheet.canEdit ? "Cancel" : "Close"}
              </button>
              {blockSheet.canEdit && blockSheet.id !== null && (
                <button onClick={deleteBlock} disabled={blockBusy} aria-label="Remove blocked time" className="ml-auto flex items-center gap-1.5 rounded-[10px] px-3 py-2 text-sm font-medium text-red-600 transition-colors hover:bg-red-50">
                  <Trash2 size={14} />
                  Remove
                </button>
              )}
            </div>
          </>
        )}
      </Modal>

      <PlaceSheet
        intent={placeIntent}
        users={users}
        meId={meId}
        canCreateJob={canCreateJob}
        canCreateAppointment={canCreateAppointment}
        intervalMinutes={intervalMinutes}
        dayStartMinutes={dayStartMinutes}
        onClose={() => setPlaceIntent(null)}
        onDone={onPlaced}
      />

      <UndoToast toast={toast} onClose={() => setToast(null)} />
    </div>
  );
}
