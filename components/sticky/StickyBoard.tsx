"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronUp, Plus } from "lucide-react";
import StickyPaper from "./StickyPaper";
import { hapticImpact } from "@/lib/haptics";
import type { StickyNoteDTO } from "@/lib/sticky-shared";

const BOARD_H = 240;
const NOTE = 168;
const DRAG_THRESHOLD = 4;
const COLLAPSE_KEY = "wb-sticky-collapsed";

/**
 * The desktop corkboard: a band across the top of Home where notes sit
 * where you put them (pointer-event drag, same pattern as the route list:
 * 4 px threshold + setPointerCapture). Positions are 0–1 of the board and
 * saved per viewer. Unplaced notes take a free slot left to right. Last
 * touched floats on top. Collapses to a "Notes (3)" strip, remembered on
 * this device.
 */
export default function StickyBoard({
  notes,
  onOpen,
  onNew,
  onPlaced,
}: {
  notes: StickyNoteDTO[];
  onOpen: (note: StickyNoteDTO) => void;
  onNew: () => void;
  onPlaced: (id: string, x: number, y: number, z: number) => void;
}) {
  const boardRef = useRef<HTMLDivElement>(null);
  const [collapsed, setCollapsed] = useState(false);
  // An empty board stays folded to its strip (David 2026-10-06) until the
  // first note or an explicit New note
  const [openEmpty, setOpenEmpty] = useState(false);
  const [width, setWidth] = useState(0);
  const [dragging, setDragging] = useState<string | null>(null);
  // Live positions while dragging (px), keyed by note id
  const [live, setLive] = useState<Record<string, { x: number; y: number }>>({});
  const drag = useRef<{ id: string; startX: number; startY: number; originX: number; originY: number; moved: boolean } | null>(null);

  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch {}
  }, []);
  useEffect(() => {
    const el = boardRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, [collapsed]);

  const showBoard = !collapsed && (notes.length > 0 || openEmpty);
  const toggle = () => {
    if (notes.length === 0) {
      setOpenEmpty((v) => !v);
      return;
    }
    setCollapsed((c) => {
      try {
        localStorage.setItem(COLLAPSE_KEY, c ? "0" : "1");
      } catch {}
      return !c;
    });
  };

  // Pixel position for a note: saved fraction, or a free slot for new ones
  const maxX = Math.max(0, width - NOTE - 8);
  const maxY = BOARD_H - NOTE - 8;
  const positions = new Map<string, { x: number; y: number }>();
  let slot = 0;
  for (const n of notes) {
    if (live[n.id]) positions.set(n.id, live[n.id]);
    else if (n.x !== null && n.y !== null) positions.set(n.id, { x: n.x * maxX, y: n.y * maxY });
    else {
      positions.set(n.id, { x: Math.min(maxX, 12 + slot * (NOTE + 14)), y: 10 + (slot % 2) * 18 });
      slot++;
    }
  }
  const topZ = notes.reduce((m, n) => Math.max(m, n.z), 0);

  const onPointerDown = useCallback(
    (e: React.PointerEvent, n: StickyNoteDTO) => {
      if (e.button !== 0 && e.pointerType === "mouse") return;
      const p = positions.get(n.id) ?? { x: 0, y: 0 };
      drag.current = { id: n.id, startX: e.clientX, startY: e.clientY, originX: p.x, originY: p.y, moved: false };
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    },
    // positions is derived each render; capturing the current one is intended
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [notes, live, width]
  );
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      setDragging(d.id);
      hapticImpact("LIGHT");
    }
    setLive((cur) => ({
      ...cur,
      [d.id]: { x: Math.min(maxX, Math.max(0, d.originX + dx)), y: Math.min(maxY, Math.max(0, d.originY + dy)) },
    }));
  };
  const onPointerUp = (e: React.PointerEvent, n: StickyNoteDTO) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (!d.moved) {
      // a tap: open
      onOpen(n);
      return;
    }
    setDragging(null);
    const p = live[d.id] ?? positions.get(d.id);
    if (!p) return;
    onPlaced(n.id, maxX > 0 ? p.x / maxX : 0, maxY > 0 ? p.y / maxY : 0, topZ + 1);
    // The saved fraction is the truth from here (it survives a resize); drop the px copy
    setLive((cur) => {
      const next = { ...cur };
      delete next[d.id];
      return next;
    });
  };

  return (
    <section className="ds-rise" aria-label="Sticky notes">
      <div className="mb-2 flex items-center justify-between">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={showBoard}
          className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-[color:var(--ds-ink-2)] hover:text-[color:var(--ds-ink)]"
        >
          {showBoard ? <ChevronUp size={15} aria-hidden /> : <ChevronDown size={15} aria-hidden />}
          Notes{notes.length > 0 ? ` (${notes.length})` : ""}
        </button>
        {(showBoard || notes.length === 0) && (
          <button
            type="button"
            onClick={onNew}
            className="inline-flex items-center gap-1 text-[13px] font-semibold text-[color:var(--ds-primary)] hover:underline"
          >
            <Plus size={14} aria-hidden /> New note
          </button>
        )}
      </div>
      {showBoard && (
        <div className="ds-corkframe">
        <div ref={boardRef} className="ds-corkboard w-full" style={{ height: BOARD_H }}>
          {notes.length === 0 && (
            <button type="button" onClick={onNew} className="ds-sticky ds-sticky-ghost ds-sticky-pinned ds-sticky-placed" style={{ left: 16, top: 36 }}>
              <Plus size={22} aria-hidden />
              <span className="mt-1">Stick a note</span>
            </button>
          )}
          {notes.map((n) => {
            const p = positions.get(n.id)!;
            return (
              <StickyPaper
                key={n.id}
                note={n}
                pinned
                className={`ds-sticky-placed ${dragging === n.id ? "ds-sticky-dragging" : ""}`}
                style={{ left: p.x, top: p.y, zIndex: dragging === n.id ? 1000 : n.z }}
                onPointerDown={(e) => onPointerDown(e, n)}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => onPointerUp(e, n)}
                onPointerCancel={() => {
                  drag.current = null;
                  setDragging(null);
                }}
              />
            );
          })}
        </div>
        </div>
      )}
    </section>
  );
}
