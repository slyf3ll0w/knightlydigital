"use client";

import { AlertTriangle as AlertTriangleIcon, Car } from "lucide-react";
import {
  HOUR_PX,
  durationLabel,
  fmtMinute,
  fmtTime,
  hourLabel,
  itemTone,
  layoutTimed,
  sameDay,
  sortItems,
  toParam,
  type ScheduleJobDTO,
  type WeekHours,
} from "./schedule-lib";
import { TypeGlyph } from "./TypeGlyph";
import type { useCalendarDrag } from "./useCalendarDrag";

export type GridColumn = {
  key: string;
  date: Date;
  /** undefined = no crew meaning (week/day); null = the Unassigned column. */
  userId?: string | null;
  label: string;
  sub?: string;
  onHeaderClick?: () => void;
  isToday?: boolean;
};

/** Drive minutes INTO a stop, keyed by column then item id. */
export type DriveLegs = Record<string, Record<string, { minutes: number; from: string; measured: boolean }>>;

function userKey(u: string | null | undefined): string {
  return u === undefined ? "*" : u ?? "";
}

/**
 * The hour grid behind week, day, and the dispatch board. Columns are
 * whatever the caller says they are — seven days, one day, or one tech
 * each — and every column is a `data-drop="column"` zone the drag engine
 * reads the landing minute from. Draws off-hours shading, the landing
 * preview with its time badge, live resize, drag-to-select, and the drive
 * time between consecutive stops when the caller has legs to show.
 */
export default function TimeGrid({
  columns,
  itemsFor,
  hours,
  today,
  mounted,
  scrollRef,
  drag,
  onOpen,
  legs,
  wide,
  emptyHint,
  onEmptyClick,
  onAccept,
}: {
  columns: GridColumn[];
  itemsFor: (col: GridColumn) => ScheduleJobDTO[];
  hours: WeekHours;
  today: Date;
  mounted: boolean;
  scrollRef: React.RefObject<HTMLDivElement | null>;
  drag: ReturnType<typeof useCalendarDrag>;
  onOpen: (item: ScheduleJobDTO) => void;
  legs?: DriveLegs;
  wide: boolean;
  emptyHint?: string;
  /** A click on empty column space (armed palette card → place it here). */
  onEmptyClick?: (date: Date, minute: number, userId: string | null | undefined) => void;
  /** Inline Accept on a self-booked appointment awaiting approval. */
  onAccept?: (item: ScheduleJobDTO) => void;
}) {
  const nowMin = today.getHours() * 60 + today.getMinutes();
  // Column count is dynamic (dispatch = one per tech), so the template is an
  // inline style — Tailwind can't generate a class from a runtime number
  const gridStyle = {
    gridTemplateColumns: wide
      ? `56px repeat(${columns.length}, minmax(${columns.length > 7 ? 150 : 110}px, 1fr))`
      : "56px minmax(0, 1fr)",
  };
  const st = drag.state;
  const movingId = st?.source.type === "item" ? st.source.item.id : null;
  const resizing = st?.source.type === "item" && st.source.mode === "resize" ? st : null;

  const previewLabel = (() => {
    if (!st) return "";
    if (st.source.type === "item") return st.source.item.kind === "block" ? st.source.item.title || "Blocked off" : st.source.item.contactName;
    const e = st.source.entity;
    if (e.type === "job") return e.job.contactName;
    if (e.type === "pick") return e.kind === "job" ? "New job" : "New appointment";
    return e.name;
  })();

  return (
    <div className="overflow-hidden rounded-lg border border-gray-200 bg-white">
      <div className={wide ? "overflow-x-auto" : ""}>
        <div style={wide ? { minWidth: 56 + columns.length * (columns.length > 7 ? 150 : 110) } : undefined}>
          {/* Column headers */}
          <div className="grid border-b border-gray-200" style={gridStyle}>
            <div />
            {columns.map((col) => (
              <button
                key={col.key}
                type="button"
                onClick={col.onHeaderClick}
                className={`border-l border-gray-100 px-1 py-2 text-center ${
                  col.onHeaderClick ? "hover:bg-gray-50" : "cursor-default"
                }`}
              >
                <div className={`truncate text-sm font-semibold ${col.isToday ? "text-green-600" : "text-gray-900"}`}>
                  {col.label}
                </div>
                {col.sub && <div className="truncate text-[11px] text-gray-400">{col.sub}</div>}
              </button>
            ))}
          </div>

          {/* Anytime row */}
          <div className="grid border-b border-gray-200" style={gridStyle}>
            <div className="flex items-start justify-end px-2 py-1.5">
              <span className="text-[11px] font-medium text-gray-400">Anytime</span>
            </div>
            {columns.map((col) => {
              const anytime = sortItems(itemsFor(col).filter((it) => it.scheduledAnytime));
              const hot =
                st?.target?.type === "anytime" &&
                sameDay(st.target.date, col.date) &&
                userKey(st.target.userId) === userKey(col.userId);
              return (
                <div
                  key={col.key}
                  data-drop="anytime"
                  data-date={toParam(col.date)}
                  {...(col.userId !== undefined ? { "data-user": col.userId ?? "" } : {})}
                  className={`min-h-[34px] space-y-0.5 border-l border-gray-100 p-1 transition-colors ${
                    hot ? "bg-green-100/70 ring-2 ring-inset ring-green-400" : ""
                  }`}
                >
                  {anytime.map((it) => (
                    <div
                      key={it.id}
                      data-item
                      {...(it.kind === "block" && !it.block?.canEdit
                        ? {}
                        : drag.handleProps({ type: "item", item: it, mode: "move", grabOffsetMin: 0, fromUserId: col.userId }))}
                      onClick={() => onOpen(it)}
                      className={`cursor-grab select-none truncate rounded-lg border-l-2 px-1.5 py-0.5 text-xs font-medium active:cursor-grabbing ${itemTone(it)} ${
                        movingId === it.id ? "opacity-40" : ""
                      }`}
                      title={`${it.contactName} — ${it.title}`}
                    >
                      <TypeGlyph apptType={it.apptType} recurring={it.recurring} />{" "}
                      {it.kind === "block" ? it.title || "Blocked off" : `${it.contactName} — ${it.title}`}
                    </div>
                  ))}
                  {hot && anytime.length === 0 && (
                    <div className="truncate rounded-lg border-l-2 border-green-500 bg-green-200/60 px-1.5 py-0.5 text-xs font-medium text-green-900">
                      {previewLabel} · Anytime
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Hour grid */}
          <div ref={scrollRef} className="relative max-h-[60vh] overflow-y-auto lg:max-h-[calc(100vh-21rem)]">
            <div className="grid" style={gridStyle}>
              {/* Time gutter */}
              <div>
                {Array.from({ length: 24 }, (_, h) => (
                  <div key={h} className="relative border-b border-gray-50" style={{ height: HOUR_PX }}>
                    <span className="absolute -top-2 right-2 bg-white px-0.5 text-[10px] text-gray-400">
                      {h === 0 ? "" : hourLabel(h)}
                    </span>
                  </div>
                ))}
              </div>

              {columns.map((col) => {
                const all = itemsFor(col);
                const timed = all.filter((it) => !it.scheduledAnytime && it.scheduledAt);
                const blocks = layoutTimed(timed, col.date);
                const open = hours[col.date.getDay()] ?? [];
                // Closed stretches = the complement of the open ranges
                const closed: { start: number; end: number }[] = [];
                let cursor = 0;
                for (const r of [...open].sort((a, b) => a.start - b.start)) {
                  if (r.start > cursor) closed.push({ start: cursor, end: r.start });
                  cursor = Math.max(cursor, r.end);
                }
                if (cursor < 24 * 60) closed.push({ start: cursor, end: 24 * 60 });

                const hotSlot =
                  st?.target?.type === "slot" &&
                  sameDay(st.target.date, col.date) &&
                  userKey(st.target.userId) === userKey(col.userId)
                    ? st.target
                    : null;
                const sel =
                  drag.selection &&
                  sameDay(drag.selection.date, col.date) &&
                  userKey(drag.selection.userId) === userKey(col.userId)
                    ? drag.selection
                    : null;
                const colLegs = legs?.[col.key];
                // Stops in clock order for the gap labels — work, plus any
                // blocked time the route engine gave a drive leg (it has an
                // address, so the tech really goes there)
                const stops = blocks
                  .filter((b) => b.j.kind !== "block" || Boolean(colLegs?.[b.j.id]))
                  .sort((a, b) => a.startMin - b.startMin);

                return (
                  <div
                    key={col.key}
                    data-drop="column"
                    data-date={toParam(col.date)}
                    {...(col.userId !== undefined ? { "data-user": col.userId ?? "" } : {})}
                    {...drag.selectProps(col.date, col.userId)}
                    onClick={(e) => {
                      if (!onEmptyClick) return;
                      if ((e.target as HTMLElement).closest("[data-item]")) return;
                      const rect = e.currentTarget.getBoundingClientRect();
                      const minute = Math.max(0, Math.round((((e.clientY - rect.top) / HOUR_PX) * 60) / 15) * 15);
                      onEmptyClick(col.date, minute, col.userId);
                    }}
                    className={`relative border-l border-gray-100 ${col.isToday ? "cal-today" : ""}`}
                    style={{ height: 24 * HOUR_PX }}
                  >
                    {/* Off-hours shading */}
                    {closed.map((c, i) => (
                      <div
                        key={`c-${i}`}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 cal-offhours"
                        style={{ top: (c.start / 60) * HOUR_PX, height: ((c.end - c.start) / 60) * HOUR_PX }}
                      />
                    ))}
                    {/* Hour lines */}
                    {Array.from({ length: 24 }, (_, h) => (
                      <div
                        key={h}
                        aria-hidden
                        className="pointer-events-none absolute inset-x-0 border-b cal-hourline"
                        style={{ top: h * HOUR_PX, height: HOUR_PX }}
                      >
                        <div className="absolute inset-x-0 top-1/2 border-b border-dashed cal-halfline" />
                      </div>
                    ))}

                    {/* Empty-day hint (dispatch columns with nothing on them) */}
                    {emptyHint && all.length === 0 && (
                      <div className="pointer-events-none absolute inset-x-2 top-[calc(8*48px+6px)] text-center text-[11px] text-gray-400">
                        {emptyHint}
                      </div>
                    )}

                    {/* Current-time line (client-only to avoid hydration drift) */}
                    {mounted && col.isToday && (
                      <div
                        className="pointer-events-none absolute left-0 right-0 z-10 border-t-2 border-red-400"
                        style={{ top: (nowMin / 60) * HOUR_PX }}
                      >
                        <span className="absolute -left-1 -top-[5px] h-2 w-2 rounded-full bg-red-400" />
                      </div>
                    )}

                    {/* Drive-time gaps between consecutive stops */}
                    {colLegs &&
                      stops.map((s, i) => {
                        const leg = colLegs[s.j.id];
                        if (!leg) return null;
                        const prevEnd = i === 0 ? null : stops[i - 1].endMin;
                        const gapMin = prevEnd === null ? null : s.startMin - prevEnd;
                        const tight = gapMin !== null && leg.minutes > gapMin;
                        const top = prevEnd === null ? Math.max(0, s.startMin - 14) : prevEnd;
                        const height = prevEnd === null ? 14 : Math.max(0, s.startMin - prevEnd);
                        const px = (height / 60) * HOUR_PX;
                        const label = `${leg.measured ? "" : "~"}${leg.minutes} min drive from ${leg.from}${
                          tight ? ` · only ${Math.max(0, gapMin!)} min between` : ""
                        }`;
                        return (
                          <div
                            key={`leg-${s.j.id}`}
                            aria-hidden
                            title={label}
                            className={`pointer-events-none absolute left-1 right-1 z-[5] flex items-center justify-center overflow-hidden ${
                              tight ? "text-red-600" : "text-gray-400"
                            }`}
                            style={{ top: (top / 60) * HOUR_PX, height: Math.max(px, 12) }}
                          >
                            {px >= 12 && (
                              <span
                                className={`flex items-center gap-1 rounded-full px-1.5 text-[10px] font-medium leading-4 ${
                                  tight ? "bg-red-50" : "bg-white/90"
                                }`}
                              >
                                <Car size={10} />
                                {leg.measured ? "" : "~"}
                                {leg.minutes}m{tight ? " · tight" : ""}
                              </span>
                            )}
                          </div>
                        );
                      })}

                    {/* Items */}
                    {blocks.map(({ j, startMin, endMin, col: c, cols }) => {
                      const liveEnd = resizing && resizing.source.type === "item" && resizing.source.item.id === j.id && resizing.endMinute !== null
                        ? resizing.endMinute
                        : endMin;
                      const canDrag = j.kind !== "block" || Boolean(j.block?.canEdit);
                      return (
                        <div
                          key={j.id}
                          data-item
                          {...(canDrag
                            ? drag.handleProps({ type: "item", item: j, mode: "move", grabOffsetMin: 0, fromUserId: col.userId })
                            : {})}
                          onClick={() => onOpen(j)}
                          className={`absolute cursor-grab select-none overflow-hidden rounded-lg border-l-2 px-1.5 py-0.5 text-xs font-medium shadow-sm active:cursor-grabbing ${itemTone(j)} ${
                            movingId === j.id && !resizing ? "opacity-40" : ""
                          } ${resizing?.source.type === "item" && resizing.source.item.id === j.id ? "ring-2 ring-green-400" : ""}`}
                          style={{
                            top: (startMin / 60) * HOUR_PX + 1,
                            height: Math.max(22, ((liveEnd - startMin) / 60) * HOUR_PX - 2),
                            left: `calc(${(c / cols) * 100}% + 2px)`,
                            width: `calc(${(1 / cols) * 100}% - 4px)`,
                          }}
                          title={`${j.contactName} — ${j.title}${j.conflictNote ? `\n⚠ Overlaps: ${j.conflictNote}` : ""}`}
                        >
                          <span className="block truncate font-semibold">
                            <TypeGlyph apptType={j.apptType} recurring={j.recurring} />{" "}
                            {j.conflictNote && <AlertTriangleIcon size={11} className="inline shrink-0 text-amber-600" />}{" "}
                            {j.kind === "block" ? j.title || "Blocked off" : j.contactName}
                          </span>
                          <span className="block truncate">
                            {fmtTime(new Date(j.scheduledAt!))}
                            {resizing?.source.type === "item" && resizing.source.item.id === j.id
                              ? ` – ${fmtMinute(liveEnd)} · ${durationLabel(liveEnd - startMin)}`
                              : ` · ${j.kind === "block" ? (j.contactName === "Everyone" ? "Whole team" : j.contactName) : j.title}`}
                          </span>
                          {j.tentative && (
                            <span className="mt-0.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide opacity-90">
                              Awaiting approval
                              {onAccept && j.requestId && liveEnd - startMin >= 45 && (
                                <button
                                  type="button"
                                  onPointerDown={(e) => e.stopPropagation()}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    onAccept(j);
                                  }}
                                  className="rounded-full bg-blue-600 px-1.5 py-px text-[10px] font-bold normal-case tracking-normal text-white hover:bg-blue-700"
                                >
                                  Accept
                                </button>
                              )}
                            </span>
                          )}
                          {canDrag && (
                            <span
                              {...drag.resizeProps(j)}
                              aria-label="Change end time"
                              className="absolute inset-x-0 bottom-0 h-2.5 cursor-ns-resize"
                            >
                              <span className="mx-auto mt-1 block h-0.5 w-6 rounded-full bg-current opacity-30" />
                            </span>
                          )}
                        </div>
                      );
                    })}

                    {/* Landing preview */}
                    {hotSlot && st && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-[2px] right-[2px] z-20 overflow-visible rounded-lg border-2 border-green-500 bg-green-200/60 px-1.5 py-0.5 text-xs font-medium text-green-900 shadow-lg"
                        style={{
                          top: (hotSlot.minute / 60) * HOUR_PX + 1,
                          height: Math.max(22, (st.durationMin / 60) * HOUR_PX - 2),
                        }}
                      >
                        <span className="block truncate font-semibold">{previewLabel}</span>
                        <span className="absolute -top-6 left-0 whitespace-nowrap rounded-md bg-gray-900 px-1.5 py-0.5 text-[11px] font-semibold text-white shadow">
                          {fmtMinute(hotSlot.minute)} – {fmtMinute(hotSlot.minute + st.durationMin)}
                          {" · "}
                          {durationLabel(st.durationMin)}
                        </span>
                      </div>
                    )}

                    {/* Drag-to-create range */}
                    {sel && (
                      <div
                        aria-hidden
                        className="pointer-events-none absolute left-[2px] right-[2px] z-20 rounded-lg border-2 border-dashed border-green-500 bg-green-100/70 px-1.5 py-0.5 text-xs font-semibold text-green-900"
                        style={{
                          top: (sel.startMin / 60) * HOUR_PX + 1,
                          height: Math.max(22, ((sel.endMin - sel.startMin) / 60) * HOUR_PX - 2),
                        }}
                      >
                        {fmtMinute(sel.startMin)} – {fmtMinute(sel.endMin)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
