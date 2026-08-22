"use client";

import { useRef, useState } from "react";
import type { LucideIcon } from "lucide-react";

export type SwipeRowAction = {
  key: string;
  label: string;
  icon: LucideIcon;
  href: string;
  external?: boolean;
  /** Tray button background (CSS color). */
  bg: string;
};

const BTN_W = 64; // px per revealed action button

/**
 * iOS-style swipe-left row: dragging the row left reveals quick actions
 * (Call / Text / Directions) behind its right edge — one-handed, no precision
 * tapping, made for a phone in a truck cab. Pure touch transforms, no
 * library; mouse/desktop users never see it (touch events only), and rows
 * with no actions render children untouched.
 *
 * The sliding layer paints the page background (--background) so the tray
 * never bleeds through rows that are themselves transparent.
 */
export default function SwipeRow({
  actions,
  children,
}: {
  actions: SwipeRowAction[];
  children: React.ReactNode;
}) {
  const [offset, setOffset] = useState(0);
  const [dragging, setDragging] = useState(false);
  const start = useRef<{ x: number; y: number; base: number } | null>(null);
  const intent = useRef<"h" | "v" | null>(null);

  const trayW = actions.length * BTN_W;
  if (actions.length === 0) return <>{children}</>;

  function onTouchStart(e: React.TouchEvent) {
    const t = e.touches[0];
    start.current = { x: t.clientX, y: t.clientY, base: offset };
    intent.current = null;
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!start.current) return;
    const t = e.touches[0];
    const dx = t.clientX - start.current.x;
    const dy = t.clientY - start.current.y;
    // Decide once per gesture: mostly-horizontal drags move the row, anything
    // else stays a scroll (we never fight the scroller after that call).
    if (intent.current === null) {
      if (Math.abs(dx) < 8 && Math.abs(dy) < 8) return;
      intent.current = Math.abs(dx) > Math.abs(dy) * 1.2 ? "h" : "v";
      if (intent.current === "h") setDragging(true);
    }
    if (intent.current !== "h") return;
    // Only leftward reveal; rubber-band a touch past the tray
    const next = Math.min(0, Math.max(-(trayW + 24), start.current.base + dx));
    setOffset(next);
  }

  function onTouchEnd() {
    if (intent.current === "h") {
      setOffset((o) => (o < -trayW / 2 ? -trayW : 0));
    }
    setDragging(false);
    start.current = null;
    intent.current = null;
  }

  return (
    <div className="relative overflow-hidden">
      {/* Action tray behind the row's right edge */}
      <div
        className="absolute inset-y-0 right-0 flex items-stretch"
        style={{ width: trayW }}
        aria-hidden={offset === 0}
      >
        {actions.map(({ key, label, icon: Icon, href, external, bg }) => (
          <a
            key={key}
            href={href}
            {...(external ? { target: "_blank", rel: "noopener noreferrer" } : {})}
            tabIndex={offset === 0 ? -1 : 0}
            onClick={() => setOffset(0)}
            className="flex flex-col items-center justify-center gap-1 text-[10px] font-semibold text-white active:opacity-80"
            style={{ width: BTN_W, backgroundColor: bg }}
          >
            <Icon size={18} />
            {label}
          </a>
        ))}
      </div>
      {/* The row itself slides over the tray */}
      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchEnd}
        // An open row closes on tap (capture beats the row's own link)
        onClickCapture={
          offset !== 0
            ? (e) => {
                e.preventDefault();
                e.stopPropagation();
                setOffset(0);
              }
            : undefined
        }
        style={{
          transform: `translateX(${offset}px)`,
          transition: dragging ? "none" : "transform 180ms ease",
          // Opaque only while revealed — at rest the row stays transparent so
          // decorations behind it (the timeline rail) show through
          backgroundColor: offset !== 0 || dragging ? "var(--background)" : undefined,
          touchAction: "pan-y",
        }}
      >
        {children}
      </div>
    </div>
  );
}
