"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { CalendarClock, CalendarOff, ChevronDown, ChevronLeft, ChevronRight, CloudRain, Columns3, Loader2, Plus, Route as RouteIcon, UserPlus } from "lucide-react";
import { QuickMenu, type QuickAction, type MenuAnchor } from "@/components/QuickMenu";
import Monogram from "@/components/Monogram";
import { addDays, sameDay, startOfWeek, type View } from "./schedule-lib";

/**
 * The bar above the calendar (heavy pilot round 6). One calm strip instead of
 * a row of loose buttons:
 *   left  — ‹ › Today, then the range as the big title (year muted) with a
 *           plain-English "this week / tomorrow" under it, and a small
 *           seven-day load line that shows how full each day is;
 *   right — Day · Week · Month with a sliding thumb, By tech (day view),
 *           Map, and who's on it.
 * The page actions sit with the title: Schedule someone (the palette) and a
 * split New button — New job is the main move, the caret holds New
 * appointment, Block off time and Move the day.
 */

export type DayLoad = { date: Date; count: number };

const VIEWS: View[] = ["day", "week", "month"];

function relative(view: View, anchor: Date, today: Date): string {
  if (view === "day") {
    if (sameDay(anchor, today)) return "Today";
    if (sameDay(anchor, addDays(today, 1))) return "Tomorrow";
    if (sameDay(anchor, addDays(today, -1))) return "Yesterday";
    return "";
  }
  if (view === "week") {
    const w = Math.round((startOfWeek(anchor).getTime() - startOfWeek(today).getTime()) / (7 * 86400000));
    return w === 0 ? "This week" : w === 1 ? "Next week" : w === -1 ? "Last week" : "";
  }
  const m = (anchor.getFullYear() - today.getFullYear()) * 12 + anchor.getMonth() - today.getMonth();
  return m === 0 ? "This month" : m === 1 ? "Next month" : m === -1 ? "Last month" : "";
}

export function ScheduleActions({
  paletteOpen,
  onPalette,
  unscheduledCount,
  newJobHref,
  canNewAppointment,
  onBlock,
  onMoveDay,
}: {
  paletteOpen: boolean;
  onPalette: () => void;
  unscheduledCount: number;
  newJobHref: string | null;
  canNewAppointment: boolean;
  onBlock: () => void;
  onMoveDay: (() => void) | null;
}) {
  const caretRef = useRef<HTMLButtonElement>(null);
  const [menu, setMenu] = useState<MenuAnchor | null>(null);

  const actions: QuickAction[] = [];
  if (newJobHref) actions.push({ key: "job", label: "New job", icon: Plus, href: newJobHref });
  if (canNewAppointment) actions.push({ key: "appt", label: "New appointment", icon: CalendarClock, href: "/app/appointments/new" });
  actions.push({ key: "block", label: "Block off time", icon: CalendarOff, onSelect: onBlock });
  if (onMoveDay) actions.push({ key: "move", label: "Move the day", icon: CloudRain, hint: "Rained out, sick day", onSelect: onMoveDay });

  const openMenu = () => {
    const r = caretRef.current?.getBoundingClientRect();
    if (!r) return;
    setMenu({ x: r.right, y: r.bottom + 6, alignRight: true, target: caretRef.current });
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={onPalette}
        aria-label="Schedule someone"
        aria-pressed={paletteOpen}
        title="Schedule someone (P)"
        className="sch-act"
        data-on={paletteOpen || undefined}
      >
        <UserPlus size={16} strokeWidth={2.3} />
        <span className="hidden md:inline">Schedule someone</span>
        {unscheduledCount > 0 && <span className="sch-act-count">{unscheduledCount}</span>}
      </button>

      <div className="sch-new">
        {newJobHref ? (
          <Link href={newJobHref} className="sch-new-main">
            <Plus size={16} strokeWidth={2.6} />
            <span className="hidden sm:inline">New job</span>
          </Link>
        ) : (
          <button type="button" onClick={onBlock} className="sch-new-main">
            <CalendarOff size={16} strokeWidth={2.4} />
            <span className="hidden sm:inline">Block time</span>
          </button>
        )}
        <button ref={caretRef} type="button" className="sch-new-caret" aria-label="More ways to add" aria-haspopup="menu" onClick={openMenu}>
          <ChevronDown size={16} strokeWidth={2.6} />
        </button>
      </div>
      <QuickMenu open={Boolean(menu)} anchor={menu} title="Add to the schedule" actions={actions} onClose={() => setMenu(null)} />
    </div>
  );
}

export default function ScheduleBar({
  view,
  anchor,
  today,
  rangeLabel,
  shortLabel,
  busy,
  onStep,
  onToday,
  onView,
  onDay,
  load,
  mapHref,
  byTech,
  users,
  team,
  onTeam,
}: {
  view: View;
  anchor: Date;
  today: Date;
  rangeLabel: string;
  shortLabel: string;
  busy: boolean;
  onStep: (dir: -1 | 1) => void;
  onToday: () => void;
  onView: (v: View) => void;
  onDay: (d: Date) => void;
  /** Seven days around the anchor and how much is booked on each. */
  load: DayLoad[];
  mapHref: string;
  /** Shown in day view for dispatchers with a team. */
  byTech: { on: boolean; toggle: () => void } | null;
  users: { id: string; name: string }[];
  team: string;
  onTeam: (id: string) => void;
}) {
  const yr = rangeLabel.match(/,?\s(\d{4})$/);
  const main = yr ? rangeLabel.slice(0, yr.index) : rangeLabel;
  const year = yr && Number(yr[1]) !== today.getFullYear() ? yr[1] : "";
  const rel = relative(view, anchor, today);
  const onToday_ = view === "month" ? anchor.getMonth() === today.getMonth() && anchor.getFullYear() === today.getFullYear() : view === "week" ? sameDay(startOfWeek(anchor), startOfWeek(today)) : sameDay(anchor, today);
  const max = Math.max(1, ...load.map((d) => d.count));
  const vi = VIEWS.indexOf(view);
  const who = users.find((u) => u.id === team);

  return (
    <div className="sch-bar">
      <div className="sch-when">
        <div className="sch-nav">
          <button onClick={() => onStep(-1)} aria-label="Previous" className="sch-nav-btn">
            <ChevronLeft size={18} strokeWidth={2.4} />
          </button>
          <button onClick={() => onStep(1)} aria-label="Next" className="sch-nav-btn">
            <ChevronRight size={18} strokeWidth={2.4} />
          </button>
        </div>
        <div className="min-w-0">
          <h2 className="sch-title">
            <span className="hidden lg:inline">{main}</span>
            <span className="lg:hidden">{shortLabel}</span>
            {year && <span className="sch-title-year hidden lg:inline"> {year}</span>}
            {busy && <Loader2 size={15} className="ml-2 inline animate-spin text-[color:var(--ds-faint)]" />}
          </h2>
          <p className="sch-rel">
            {rel && !(view === "day" && rel === "Today" && shortLabel === "Today") ? <span>{rel}</span> : null}
            {!onToday_ && (
              <button type="button" onClick={onToday} className="sch-today">
                Back to today
              </button>
            )}
          </p>
        </div>
        {view !== "month" && load.length > 0 && (
          <div className="sch-load" role="group" aria-label="How full each day is">
            {load.map((d) => {
              const isAnchor = view === "day" ? sameDay(d.date, anchor) : false;
              const isToday = sameDay(d.date, today);
              const label = `${d.date.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}: ${d.count === 0 ? "nothing booked" : `${d.count} booked`}`;
              return (
                <button
                  key={d.date.toDateString()}
                  type="button"
                  className="sch-load-day"
                  data-anchor={isAnchor || undefined}
                  data-today={isToday || undefined}
                  title={label}
                  aria-label={label}
                  onClick={() => onDay(d.date)}
                >
                  <span className="sch-load-bar" style={{ ["--h" as string]: d.count === 0 ? "3px" : `${Math.max(6, Math.round((d.count / max) * 26))}px` }} />
                  <span className="sch-load-dow">{d.date.toLocaleDateString("en-US", { weekday: "narrow" })}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="sch-tools">
        <div className="sch-seg" role="tablist" aria-label="Calendar view" style={{ ["--i" as string]: vi }}>
          <span className="sch-seg-thumb" aria-hidden />
          {VIEWS.map((v) => (
            <button key={v} role="tab" aria-selected={view === v} className="sch-seg-btn" onClick={() => onView(v)}>
              {v[0].toUpperCase() + v.slice(1)}
            </button>
          ))}
        </div>
        {byTech && (
          <button type="button" className="sch-tool" data-on={byTech.on || undefined} aria-pressed={byTech.on} onClick={byTech.toggle}>
            <Columns3 size={15} strokeWidth={2.3} />
            By tech
          </button>
        )}
        <Link href={mapHref} className="sch-tool">
          <RouteIcon size={15} strokeWidth={2.3} />
          Map
        </Link>
        {users.length > 1 && (
          <label className="sch-who">
            {who ? <Monogram name={who.name} size={22} /> : <span className="sch-who-all" aria-hidden>All</span>}
            <select value={team} onChange={(e) => onTeam(e.target.value)} aria-label="Team member">
              <option value="">Everyone</option>
              {users.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name}
                </option>
              ))}
            </select>
            <ChevronDown size={14} strokeWidth={2.4} className="sch-who-caret" />
          </label>
        )}
      </div>
    </div>
  );
}
