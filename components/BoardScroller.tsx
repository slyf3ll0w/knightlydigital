"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A sideways scroller for wide boards (Leads). Ticket #msloxvj: with a lot
 * of cards the board grows taller than the window, and its own scrollbar sat
 * at the very bottom, so moving between columns meant scrolling all the way
 * down first. Two ways across from anywhere, on a desk (mouse/trackpad):
 *
 *  - a slim scrollbar pinned to the bottom of the window while the board's
 *    real bar is off-screen, kept in step with the board;
 *  - grab blank board space (not a card or a control) and drag sideways.
 *
 * Touch screens already swipe in both directions, so they get neither.
 */
export default function BoardScroller({ className, children }: { className?: string; children: ReactNode }) {
  const boardRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const syncing = useRef(false);
  const [bar, setBar] = useState<{ left: number; width: number; inner: number } | null>(null);

  // Show the pinned bar only when the board overflows sideways AND its own
  // bar is below the window while the board itself is on screen.
  useEffect(() => {
    const board = boardRef.current;
    if (!board || !window.matchMedia("(pointer: fine)").matches) return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const r = board.getBoundingClientRect();
      const overflows = board.scrollWidth > board.clientWidth + 1;
      const vh = window.innerHeight;
      const show = overflows && r.bottom > vh && r.top < vh - 80;
      setBar((prev) => {
        if (!show) return null;
        const next = { left: r.left, width: r.width, inner: board.scrollWidth };
        return prev && prev.left === next.left && prev.width === next.width && prev.inner === next.inner ? prev : next;
      });
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(measure);
    };
    measure();
    const ro = new ResizeObserver(schedule);
    ro.observe(board);
    for (const child of Array.from(board.children)) ro.observe(child);
    window.addEventListener("scroll", schedule, true);
    window.addEventListener("resize", schedule);
    return () => {
      if (frame) cancelAnimationFrame(frame);
      ro.disconnect();
      window.removeEventListener("scroll", schedule, true);
      window.removeEventListener("resize", schedule);
    };
  }, []);

  // Keep the pinned bar and the board in step (either one can be moved).
  useEffect(() => {
    const board = boardRef.current;
    const pinned = barRef.current;
    if (!board || !pinned) return;
    pinned.scrollLeft = board.scrollLeft;
    const follow = (from: HTMLElement, to: HTMLElement) => () => {
      if (syncing.current) {
        syncing.current = false;
        return;
      }
      if (Math.abs(to.scrollLeft - from.scrollLeft) < 1) return;
      syncing.current = true;
      to.scrollLeft = from.scrollLeft;
    };
    const fromBoard = follow(board, pinned);
    const fromBar = follow(pinned, board);
    board.addEventListener("scroll", fromBoard, { passive: true });
    pinned.addEventListener("scroll", fromBar, { passive: true });
    return () => {
      board.removeEventListener("scroll", fromBoard);
      pinned.removeEventListener("scroll", fromBar);
    };
  }, [bar]);

  // Grab-and-drag on blank board space (mouse only; cards keep their own drag).
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    let start: { x: number; left: number; id: number } | null = null;
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" || e.button !== 0) return;
      const t = e.target as HTMLElement | null;
      if (t?.closest('[draggable="true"], button, a, input, textarea, select, label, [role="button"], [contenteditable="true"]')) return;
      if (board.scrollWidth <= board.clientWidth + 1) return;
      start = { x: e.clientX, left: board.scrollLeft, id: e.pointerId };
    };
    const move = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      const dx = e.clientX - start.x;
      if (Math.abs(dx) < 4 && !board.hasPointerCapture(start.id)) return;
      if (!board.hasPointerCapture(start.id)) {
        board.setPointerCapture(start.id);
        board.style.cursor = "grabbing";
        board.style.userSelect = "none";
      }
      board.scrollLeft = start.left - dx;
    };
    const up = (e: PointerEvent) => {
      if (!start || e.pointerId !== start.id) return;
      if (board.hasPointerCapture(start.id)) board.releasePointerCapture(start.id);
      board.style.cursor = "";
      board.style.userSelect = "";
      start = null;
    };
    board.addEventListener("pointerdown", down);
    board.addEventListener("pointermove", move);
    board.addEventListener("pointerup", up);
    board.addEventListener("pointercancel", up);
    return () => {
      board.removeEventListener("pointerdown", down);
      board.removeEventListener("pointermove", move);
      board.removeEventListener("pointerup", up);
      board.removeEventListener("pointercancel", up);
    };
  }, []);

  return (
    <>
      <div ref={boardRef} className={className} data-board-scroller>
        {children}
      </div>
      {bar && (
        <div
          ref={barRef}
          aria-hidden
          data-testid="board-pinned-scrollbar"
          className="fixed bottom-0 z-30 overflow-x-auto overflow-y-hidden"
          style={{ left: bar.left, width: bar.width, height: 14 }}
        >
          <div style={{ width: bar.inner, height: 1 }} />
        </div>
      )}
    </>
  );
}
