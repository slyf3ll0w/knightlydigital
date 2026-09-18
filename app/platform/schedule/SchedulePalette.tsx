"use client";

import { useEffect, useRef, useState } from "react";
import { ChevronRight, GripVertical, Inbox, Loader2, Search, UserPlus, Users, X } from "lucide-react";
import type { PaletteEntity, ScheduleJobDTO } from "./schedule-lib";
import type { useCalendarDrag } from "./useCalendarDrag";

type PaletteResults = {
  contacts: Extract<PaletteEntity, { type: "contact" }>[];
  requests: Extract<PaletteEntity, { type: "request" }>[];
  jobs: Extract<PaletteEntity, { type: "job" }>[];
};

/**
 * The Schedule palette — one search box over clients, leads, open requests,
 * and unscheduled jobs; every row is a card you drag onto the calendar.
 * Where it lands decides what gets asked (see PlaceSheet). Tapping a card
 * "arms" it instead, so the next tap on a day or slot places it — the phone
 * path, and a keyboard-friendly one on desktop.
 */
export default function SchedulePalette({
  open,
  onClose,
  unscheduled,
  drag,
  armed,
  onArm,
  onOpenJob,
  canSell,
}: {
  open: boolean;
  onClose: () => void;
  unscheduled: ScheduleJobDTO[];
  drag: ReturnType<typeof useCalendarDrag>;
  armed: PaletteEntity | null;
  onArm: (entity: PaletteEntity | null) => void;
  onOpenJob: (job: ScheduleJobDTO) => void;
  canSell: boolean;
}) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<PaletteResults | null>(null);
  const [loading, setLoading] = useState(false);
  const seq = useRef(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const my = ++seq.current;
    setLoading(true);
    const t = window.setTimeout(async () => {
      try {
        const res = await fetch(`/api/app/schedule/palette?q=${encodeURIComponent(q.trim())}`);
        const data = (await res.json()) as PaletteResults;
        if (my === seq.current) setResults(res.ok ? data : null);
      } catch {
        if (my === seq.current) setResults(null);
      } finally {
        if (my === seq.current) setLoading(false);
      }
    }, q ? 180 : 0);
    return () => window.clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    if (open && window.matchMedia("(min-width: 1024px)").matches) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const searching = q.trim().length >= 2;
  const lq = q.trim().toLowerCase();
  const localJobs = searching
    ? unscheduled.filter(
        (j) => j.title.toLowerCase().includes(lq) || j.contactName.toLowerCase().includes(lq)
      )
    : unscheduled;
  // Server results include jobs the drawer's 100-row cap may have missed
  const jobRows: ScheduleJobDTO[] = [
    ...localJobs,
    ...(results?.jobs ?? []).map((r) => r.job).filter((j) => !localJobs.some((l) => l.id === j.id)),
  ];
  const contacts = results?.contacts ?? [];
  const requests = results?.requests ?? [];
  const nothing =
    searching && !loading && contacts.length === 0 && requests.length === 0 && jobRows.length === 0;
  const isArmed = (e: PaletteEntity) =>
    armed &&
    armed.type === e.type &&
    (e.type === "job" ? armed.type === "job" && armed.job.id === e.job.id : (armed as { id?: string }).id === (e as { id?: string }).id);

  const card = (
    entity: PaletteEntity,
    key: string,
    title: string,
    sub: string,
    badge?: string,
    onClick?: () => void
  ) => (
    <li
      key={key}
      data-item
      {...drag.handleProps({ type: "palette", entity })}
      onClick={() => (onClick ? onClick() : onArm(isArmed(entity) ? null : entity))}
      className={`flex cursor-grab select-none items-center gap-2.5 rounded-[12px] border bg-white p-3 transition-colors active:cursor-grabbing active:bg-gray-50 lg:p-2.5 ${
        isArmed(entity)
          ? "border-green-500 ring-2 ring-green-200"
          : "border-gray-200 hover:border-green-300 hover:bg-green-50/50"
      } ${drag.state?.source.type === "palette" && isArmed(entity) ? "opacity-50" : ""}`}
    >
      <GripVertical size={14} className="shrink-0 text-gray-300 max-lg:hidden" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15px] font-medium text-gray-900 lg:text-sm">{title}</p>
        <p className="truncate text-xs text-gray-500">{sub}</p>
      </div>
      {badge && (
        <span className="shrink-0 rounded-full bg-blue-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-blue-700">
          {badge}
        </span>
      )}
      <ChevronRight size={16} className="shrink-0 text-gray-300 lg:hidden" />
    </li>
  );

  const section = (label: string, icon: React.ReactNode, count: number) => (
    <div className="flex items-center gap-1.5 px-1 pt-3 text-[11px] font-semibold uppercase tracking-wide text-gray-400">
      {icon}
      {label}
      {count > 0 && <span className="text-gray-300">· {count}</span>}
    </div>
  );

  return (
    <>
      <aside className="phone-sheet sheet-rise sticky top-4 flex w-80 shrink-0 flex-col rounded-lg border border-gray-200 bg-white max-lg:fixed max-lg:inset-x-0 max-lg:bottom-0 max-lg:top-auto max-lg:z-40 max-lg:max-h-[72dvh] max-lg:w-full max-lg:overflow-hidden max-lg:rounded-t-2xl max-lg:rounded-b-none max-lg:border-x-0 max-lg:border-b-0 max-lg:pb-[env(safe-area-inset-bottom)] max-lg:shadow-[0_-8px_30px_rgba(28,25,23,0.18)] lg:max-h-[calc(100vh-6rem)]">
        <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-gray-200 lg:hidden" />
        <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
          <h3 className="text-sm font-semibold text-gray-900">Schedule someone</h3>
          <button onClick={onClose} aria-label="Close" className="p-1 text-gray-400 hover:text-gray-600">
            <X size={15} />
          </button>
        </div>
        <div className="px-3 pt-3">
          <label className="relative block">
            <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              ref={inputRef}
              type="search"
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Client, lead, or request…"
              aria-label="Search clients, leads, and requests"
              className="w-full rounded-[10px] border border-gray-200 bg-gray-50 py-2 pl-9 pr-8 text-sm focus:border-green-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-green-200"
            />
            {loading && (
              <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 animate-spin text-gray-400" />
            )}
          </label>
          <p className="mt-2 px-1 text-xs text-gray-500 max-lg:hidden">
            {armed ? "Now click a day or time to place them." : "Drag onto the calendar, or click a card then pick a spot."}
          </p>
          <p className="mt-2 px-1 text-xs text-gray-500 lg:hidden">
            {armed ? "Now tap a day to place them." : "Tap a card, then tap a day. Or press and hold to drag."}
          </p>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-3 pb-3">
          {nothing && (
            <p className="px-1 py-6 text-center text-sm text-gray-500">No one by that name yet.</p>
          )}

          {searching && canSell && (
            <ul className="mt-3 space-y-2">
              {card(
                { type: "new", name: q.trim() },
                "new",
                `New client “${q.trim()}”`,
                "Create them and schedule in one go",
                undefined
              )}
            </ul>
          )}

          {contacts.length > 0 && (
            <>
              {section(searching ? "Clients & leads" : "Recent clients", <Users size={11} />, contacts.length)}
              <ul className="mt-1.5 space-y-2">
                {contacts.map((c) => card(c, `c-${c.id}`, c.name, c.sub, c.lead ? "Lead" : undefined))}
              </ul>
            </>
          )}

          {requests.length > 0 && (
            <>
              {section(searching ? "Requests" : "Requests waiting", <Inbox size={11} />, requests.length)}
              <ul className="mt-1.5 space-y-2">
                {requests.map((r) =>
                  card(
                    r,
                    `r-${r.id}`,
                    r.title,
                    `${r.name}${r.preferredDate ? ` · wants ${new Date(r.preferredDate + "T12:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}` : ""} · ${r.sub}`
                  )
                )}
              </ul>
            </>
          )}

          {(jobRows.length > 0 || !searching) && (
            <>
              {section("Unscheduled jobs", <UserPlus size={11} />, jobRows.length)}
              {jobRows.length === 0 ? (
                <p className="px-1 pt-2 text-xs text-gray-500">
                  Nothing waiting. New jobs without a date show up here.
                </p>
              ) : (
                <ul className="mt-1.5 space-y-2">
                  {jobRows.map((j) =>
                    card(
                      { type: "job", job: j },
                      `j-${j.id}`,
                      j.title,
                      `${j.contactName}${j.jobNumber ? ` · Job #${j.jobNumber}` : ""}`,
                      undefined,
                      // A tap on an unscheduled job: phones arm it (no drag),
                      // desktop opens the job — the old drawer's behavior
                      () =>
                        window.matchMedia("(max-width: 1023px)").matches
                          ? onArm(isArmed({ type: "job", job: j }) ? null : { type: "job", job: j })
                          : onOpenJob(j)
                    )
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </aside>
      <div className="fixed inset-0 z-30 bg-black/20 lg:hidden" onClick={onClose} />
    </>
  );
}
