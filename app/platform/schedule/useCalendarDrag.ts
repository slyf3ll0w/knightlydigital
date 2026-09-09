"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { hapticImpact } from "@/lib/haptics";
import { HOUR_PX, itemDuration, parseParam, snapTo, type PaletteEntity, type ScheduleJobDTO } from "./schedule-lib";

/**
 * Pointer-based drag for the calendar — replaces the browser's HTML5
 * drag-and-drop, which snapped to whole hours, drew no ghost, and did not
 * work on touch at all.
 *
 * How it works:
 *  - Draggables get `handleProps(source)`; a mouse activates after 5px of
 *    movement, a finger after a 280ms hold (so the agenda still scrolls).
 *  - Drop zones are plain DOM elements tagged `data-drop` — "day" (a month
 *    cell or date-strip day: keeps the item's time), "anytime" (the all-day
 *    row), or "column" (a 24h column: the pointer's y becomes the start
 *    minute, snapped). `data-date` = YYYY-MM-DD; `data-user` = whose column
 *    ("" = unassigned, absent = no crew change).
 *  - On every move the hook hit-tests with elementFromPoint (ghosts are
 *    pointer-events:none) and publishes `state.target` so the grid can draw
 *    the landing preview with a live time badge.
 *  - `resizeProps(item)` drags the bottom edge to change the end time.
 *  - `selectProps(date, user)` on empty column space paints a range for
 *    "new thing here" (mouse only).
 */

export type DragSource =
  | {
      type: "item";
      item: ScheduleJobDTO;
      mode: "move" | "resize";
      grabOffsetMin: number;
      /** Dispatch board: which tech's column it was picked up from. */
      fromUserId?: string | null;
    }
  | { type: "palette"; entity: PaletteEntity };

export type DropTarget =
  | { type: "day"; date: Date }
  | { type: "anytime"; date: Date; userId: string | null | undefined }
  | { type: "slot"; date: Date; minute: number; userId: string | null | undefined };

export type DragState = {
  source: DragSource;
  x: number;
  y: number;
  target: DropTarget | null;
  /** Length used to size the landing preview (resize: live end − start). */
  durationMin: number;
  /** Resize mode only: live end minute of the item's own day. */
  endMinute: number | null;
  /** Fingers get a floating card; the mouse keeps the cursor. */
  touch: boolean;
};

export type SelectRange = {
  date: Date;
  userId: string | null | undefined;
  startMin: number;
  endMin: number;
};

type Pending = {
  source: DragSource | null; // null = range selection
  select?: { date: Date; userId: string | null | undefined; column: HTMLElement };
  pointerId: number;
  startX: number;
  startY: number;
  touch: boolean;
  timer: number | null;
};

const MOUSE_THRESHOLD = 5;
const TOUCH_HOLD_MS = 280;
const TOUCH_TOLERANCE = 8;
const EDGE = 44;
const EDGE_SPEED = 14;

function readZone(el: Element | null): { el: HTMLElement; kind: string; date: Date; userId: string | null | undefined } | null {
  const zone = el?.closest<HTMLElement>("[data-drop]");
  if (!zone) return null;
  const kind = zone.dataset.drop ?? "";
  const date = zone.dataset.date ? parseParam(zone.dataset.date) : null;
  if (!date || isNaN(date.getTime())) return null;
  const rawUser = zone.dataset.user;
  const userId = rawUser === undefined ? undefined : rawUser === "" ? null : rawUser;
  return { el: zone, kind, date, userId };
}

export function useCalendarDrag({
  snapMinutes,
  onDrop,
  onSelect,
  scrollRef,
}: {
  snapMinutes: number;
  /** `endMinute` is set only for a resize (the target is the item's own start). */
  onDrop: (source: DragSource, target: DropTarget, endMinute: number | null) => void;
  onSelect?: (range: SelectRange) => void;
  /** The hour grid's scroll box — auto-scrolls when dragging near its edges. */
  scrollRef?: React.RefObject<HTMLElement | null>;
}) {
  const [state, setState] = useState<DragState | null>(null);
  const [selection, setSelection] = useState<SelectRange | null>(null);
  const stateRef = useRef<DragState | null>(null);
  const selectionRef = useRef<SelectRange | null>(null);
  const pendingRef = useRef<Pending | null>(null);
  const lastPoint = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const raf = useRef<number | null>(null);
  const onDropRef = useRef(onDrop);
  const onSelectRef = useRef(onSelect);
  onDropRef.current = onDrop;
  onSelectRef.current = onSelect;

  const publish = (next: DragState | null) => {
    stateRef.current = next;
    setState(next);
  };
  const publishSelection = (next: SelectRange | null) => {
    selectionRef.current = next;
    setSelection(next);
  };

  /** Resolve where the pointer is over the calendar into a landing spot. */
  const resolveTarget = useCallback(
    (x: number, y: number, src: DragSource): DropTarget | null => {
      const zone = readZone(document.elementFromPoint(x, y));
      if (!zone) return null;
      if (zone.kind === "day") return { type: "day", date: zone.date };
      if (zone.kind === "anytime") return { type: "anytime", date: zone.date, userId: zone.userId };
      if (zone.kind === "column") {
        const rect = zone.el.getBoundingClientRect();
        const grab = src.type === "item" ? src.grabOffsetMin : 0;
        const raw = ((y - rect.top) / HOUR_PX) * 60 - grab;
        const dur =
          src.type === "item" ? (src.item.scheduledAnytime ? 60 : itemDuration(src.item)) : 60;
        const minute = Math.max(0, Math.min(24 * 60 - Math.min(dur, 24 * 60), snapTo(raw, snapMinutes)));
        return { type: "slot", date: zone.date, minute, userId: zone.userId };
      }
      return null;
    },
    [snapMinutes]
  );

  const stopAutoScroll = () => {
    if (raf.current !== null) cancelAnimationFrame(raf.current);
    raf.current = null;
  };

  const autoScrollTick = useCallback(() => {
    const box = scrollRef?.current;
    const { x, y } = lastPoint.current;
    if (box && (stateRef.current || selectionRef.current)) {
      const r = box.getBoundingClientRect();
      if (x >= r.left && x <= r.right) {
        if (y < r.top + EDGE && y > r.top - EDGE) box.scrollTop -= EDGE_SPEED;
        else if (y > r.bottom - EDGE && y < r.bottom + EDGE) box.scrollTop += EDGE_SPEED;
      }
    }
    // The page itself, for month drags near the viewport edge
    if (stateRef.current) {
      if (y < EDGE) window.scrollBy(0, -EDGE_SPEED);
      else if (y > window.innerHeight - EDGE) window.scrollBy(0, EDGE_SPEED);
    }
    raf.current = requestAnimationFrame(autoScrollTick);
  }, [scrollRef]);

  const preventTouch = (e: TouchEvent) => {
    if (stateRef.current || selectionRef.current) e.preventDefault();
  };

  const teardown = useCallback(() => {
    const p = pendingRef.current;
    if (p?.timer) window.clearTimeout(p.timer);
    pendingRef.current = null;
    stopAutoScroll();
    document.removeEventListener("touchmove", preventTouch);
    document.body.classList.remove("cal-dragging");
    // The browser still fires a click on whatever the pointer went down on
    // once it comes up — after a real drag that click must not open the
    // item, arm a card, or place an armed one. Swallow exactly one.
    if (stateRef.current || selectionRef.current) {
      const swallow = (e: Event) => {
        e.stopPropagation();
        e.preventDefault();
        document.removeEventListener("click", swallow, true);
      };
      document.addEventListener("click", swallow, true);
      window.setTimeout(() => document.removeEventListener("click", swallow, true), 400);
    }
    publish(null);
    publishSelection(null);
  }, []);

  const activate = useCallback(
    (p: Pending, x: number, y: number) => {
      if (p.timer) window.clearTimeout(p.timer);
      p.timer = null;
      document.addEventListener("touchmove", preventTouch, { passive: false });
      document.body.classList.add("cal-dragging");
      if (p.touch) hapticImpact("MEDIUM");
      if (p.source) {
        const src = p.source;
        const dur =
          src.type === "item" ? (src.item.scheduledAnytime ? 60 : itemDuration(src.item)) : 60;
        publish({
          source: src,
          x,
          y,
          target: resolveTarget(x, y, src),
          durationMin: dur,
          endMinute: null,
          touch: p.touch,
        });
      } else if (p.select) {
        const rect = p.select.column.getBoundingClientRect();
        const startMin = snapTo(((p.startY - rect.top) / HOUR_PX) * 60, snapMinutes);
        publishSelection({
          date: p.select.date,
          userId: p.select.userId,
          startMin: Math.max(0, startMin),
          endMin: Math.max(0, startMin) + snapMinutes,
        });
      }
      stopAutoScroll();
      raf.current = requestAnimationFrame(autoScrollTick);
    },
    [autoScrollTick, resolveTarget, snapMinutes]
  );

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      lastPoint.current = { x: e.clientX, y: e.clientY };
      const dx = e.clientX - p.startX;
      const dy = e.clientY - p.startY;
      const dist = Math.hypot(dx, dy);

      const st = stateRef.current;
      const sel = selectionRef.current;
      if (!st && !sel) {
        // Not yet dragging: a finger that travels is a scroll, not a hold
        if (p.touch) {
          if (dist > TOUCH_TOLERANCE) teardown();
          return;
        }
        if (dist > MOUSE_THRESHOLD) activate(p, e.clientX, e.clientY);
        return;
      }
      if (st) {
        if (st.source.type === "item" && st.source.mode === "resize") {
          const item = st.source.item;
          const start = new Date(item.scheduledAt!);
          const startMin = start.getHours() * 60 + start.getMinutes();
          const zone = readZone(document.elementFromPoint(e.clientX, e.clientY));
          // Resize reads the y within the item's own column even if the
          // pointer wanders sideways — find any column to measure against
          const col =
            zone?.kind === "column"
              ? zone.el
              : (document.querySelector<HTMLElement>(`[data-drop="column"]`) ?? null);
          if (col) {
            const rect = col.getBoundingClientRect();
            const raw = ((e.clientY - rect.top) / HOUR_PX) * 60;
            const endMin = Math.min(24 * 60, Math.max(startMin + snapMinutes, snapTo(raw, snapMinutes)));
            publish({ ...st, x: e.clientX, y: e.clientY, endMinute: endMin, durationMin: endMin - startMin });
          }
          return;
        }
        publish({ ...st, x: e.clientX, y: e.clientY, target: resolveTarget(e.clientX, e.clientY, st.source) });
      } else if (sel && p.select) {
        const rect = p.select.column.getBoundingClientRect();
        const cur = snapTo(((e.clientY - rect.top) / HOUR_PX) * 60, snapMinutes);
        const a = Math.max(0, Math.min(sel.startMin, cur));
        const b = Math.min(24 * 60, Math.max(sel.startMin + snapMinutes, cur));
        // Anchor stays where the press began; the other edge follows
        const anchored = snapTo(((p.startY - rect.top) / HOUR_PX) * 60, snapMinutes);
        publishSelection({
          ...sel,
          startMin: cur < anchored ? a : anchored,
          endMin: cur < anchored ? anchored : b,
        });
      }
    };

    const onUp = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      const st = stateRef.current;
      const sel = selectionRef.current;
      if (st) {
        if (st.source.type === "item" && st.source.mode === "resize") {
          if (st.endMinute !== null) {
            const day = new Date(st.source.item.scheduledAt!);
            const startMin = day.getHours() * 60 + day.getMinutes();
            onDropRef.current(
              st.source,
              { type: "slot", date: day, minute: startMin, userId: undefined },
              st.endMinute
            );
          }
        } else if (st.target) {
          onDropRef.current(st.source, st.target, null);
        }
      } else if (sel && sel.endMin > sel.startMin) {
        onSelectRef.current?.(sel);
      }
      teardown();
    };

    const onCancel = (e: PointerEvent) => {
      const p = pendingRef.current;
      if (!p || e.pointerId !== p.pointerId) return;
      teardown();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (stateRef.current || selectionRef.current)) teardown();
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("pointercancel", onCancel);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointermove", onMove);
      document.removeEventListener("pointerup", onUp);
      document.removeEventListener("pointercancel", onCancel);
      document.removeEventListener("keydown", onKey);
      teardown();
    };
  }, [activate, resolveTarget, snapMinutes, teardown]);

  const begin = (e: React.PointerEvent, pending: Omit<Pending, "pointerId" | "startX" | "startY" | "touch" | "timer">) => {
    if (e.button !== 0 && e.pointerType === "mouse") return;
    if (pendingRef.current) return;
    const touch = e.pointerType !== "mouse";
    const p: Pending = {
      ...pending,
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      touch,
      timer: null,
    };
    lastPoint.current = { x: e.clientX, y: e.clientY };
    pendingRef.current = p;
    if (touch && p.source) {
      p.timer = window.setTimeout(() => {
        if (pendingRef.current === p) activate(p, lastPoint.current.x, lastPoint.current.y);
      }, TOUCH_HOLD_MS);
    }
  };

  /** Props for a draggable calendar item or palette card. */
  const handleProps = (source: DragSource | (() => DragSource)) => ({
    onPointerDown: (e: React.PointerEvent) => {
      const src = typeof source === "function" ? source() : source;
      // Measure where inside the item the grab happened so the block doesn't
      // jump to put its top under the cursor
      let grab = 0;
      if (src.type === "item" && src.mode === "move" && src.item.scheduledAt && !src.item.scheduledAnytime) {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const frac = rect.height > 0 ? (e.clientY - rect.top) / rect.height : 0;
        grab = Math.max(0, frac * itemDuration(src.item));
      }
      begin(e, { source: src.type === "item" ? { ...src, grabOffsetMin: grab } : src });
    },
    style: { touchAction: "manipulation" as const },
  });

  /** Props for the bottom-edge resize handle of a timed item. */
  const resizeProps = (item: ScheduleJobDTO) => ({
    onPointerDown: (e: React.PointerEvent) => {
      e.stopPropagation();
      begin(e, { source: { type: "item", item, mode: "resize", grabOffsetMin: 0 } });
      // Resizing has nothing to wait for — a mouse starts immediately
      if (e.pointerType === "mouse" && pendingRef.current) activate(pendingRef.current, e.clientX, e.clientY);
    },
    style: { touchAction: "none" as const },
  });

  /** Props for empty column space: press-and-drag paints a new range. */
  const selectProps = (date: Date, userId: string | null | undefined) => ({
    onPointerDown: (e: React.PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if ((e.target as HTMLElement).closest("[data-item]")) return;
      begin(e, { source: null, select: { date, userId, column: e.currentTarget as HTMLElement } });
    },
  });

  const cancel = teardown;

  return { state, selection, handleProps, resizeProps, selectProps, cancel };
}
