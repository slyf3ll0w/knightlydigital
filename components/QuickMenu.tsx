"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import { hapticImpact } from "@/lib/haptics";

/**
 * Quick actions for a list row: right-click (desktop) or press-and-hold
 * (phone) on a row opens the same short menu the row's page has under "…".
 * Desktop gets a `sheet-material` popover at the pointer; phones get the
 * iOS-style bottom sheet. Both are the one component — CSS decides which
 * shows, so callers never branch on the device.
 *
 * `QuickMenu` is the presentation (controlled). `RowActions` wraps a row —
 * a server-rendered <Link> is fine — and wires the gestures. The row's own
 * click keeps working: a press-and-hold that opened the sheet swallows the
 * click that follows it. (No hover handle — David wants the rows clean.)
 */

export type QuickAction = {
  key: string;
  label: string;
  icon?: LucideIcon;
  /** Navigate instead of running a handler (tel: links work too). */
  href?: string;
  onSelect?: () => void | Promise<void>;
  destructive?: boolean;
  disabled?: boolean;
  /** Small grey text under the label (phone) / after it (desktop). */
  hint?: string;
  /** Renders as a section label, not a button. */
  heading?: boolean;
};

export type MenuAnchor = { x: number; y: number; alignRight?: boolean };

const LONG_PRESS_MS = 380;
const MOVE_CANCEL_PX = 10;

export function QuickMenu({ open, anchor, title, actions, onClose }: { open: boolean; anchor: MenuAnchor | null; title?: string; actions: QuickAction[]; onClose: () => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);

  // desktop popover: place at the pointer, then nudge inside the viewport
  useLayoutEffect(() => {
    if (!open || !anchor) {
      setPos(null);
      return;
    }
    const el = popRef.current;
    const w = el?.offsetWidth ?? 220;
    const h = el?.offsetHeight ?? 200;
    const pad = 8;
    let left = anchor.alignRight ? anchor.x - w : anchor.x;
    let top = anchor.y;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - pad - w;
    if (left < pad) left = pad;
    if (top + h > window.innerHeight - pad) top = Math.max(pad, anchor.y - h);
    setPos({ left, top });
  }, [open, anchor, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    // the popover only shows at lg; the phone sheet has its own backdrop and must survive a scroll
    const desktop = () => window.innerWidth >= 1024;
    const onDown = (e: MouseEvent) => {
      if (desktop() && popRef.current && !popRef.current.contains(e.target as Node)) onClose();
    };
    const onScroll = () => {
      if (desktop()) onClose();
    };
    window.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("resize", onScroll);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("resize", onScroll);
    };
  }, [open, onClose]);

  const run = useCallback(
    async (a: QuickAction) => {
      if (a.disabled || busy) return;
      if (!a.onSelect) {
        onClose();
        return;
      }
      // Close FIRST: an action that asks a question (Delete → confirm sheet)
      // must not draw underneath this menu, which sits above the sheet layer.
      onClose();
      setBusy(a.key);
      try {
        await a.onSelect();
      } finally {
        setBusy(null);
      }
    },
    [busy, onClose]
  );

  const items = actions.filter((a) => a.heading || !a.disabled || a.hint);

  const desktopItem = (a: QuickAction) => {
    if (a.heading) return <p key={a.key} className="px-3.5 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{a.label}</p>;
    const cls = `flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-sm ${a.destructive ? "text-red-600 hover:bg-red-50" : "text-gray-700 hover:bg-gray-50"} disabled:opacity-50`;
    const inner = (
      <>
        {a.icon && <a.icon size={14} className={a.destructive ? "text-red-400" : "text-gray-400"} />}
        <span className="min-w-0 flex-1 truncate">{a.label}</span>
        {a.hint && <span className="ml-3 shrink-0 text-[11px] text-gray-400">{a.hint}</span>}
      </>
    );
    if (a.href && !a.disabled) {
      const external = /^(tel:|mailto:|https?:)/.test(a.href);
      return external ? (
        <a key={a.key} href={a.href} role="menuitem" className={cls} onClick={onClose}>
          {inner}
        </a>
      ) : (
        <Link key={a.key} href={a.href} prefetch={false} role="menuitem" className={cls} onClick={onClose}>
          {inner}
        </Link>
      );
    }
    return (
      <button key={a.key} type="button" role="menuitem" disabled={a.disabled || busy !== null} onClick={() => void run(a)} className={cls}>
        {inner}
      </button>
    );
  };

  const phoneItem = (a: QuickAction) => {
    if (a.heading) return <p key={a.key} className="px-5 pb-1 pt-3 text-[12px] font-semibold text-gray-500">{a.label}</p>;
    const cls = `flex w-full items-center gap-3 px-5 py-3 text-left text-[15px] ${a.destructive ? "text-red-600 active:bg-red-50" : "text-gray-900 active:bg-gray-100"} disabled:opacity-50`;
    const inner = (
      <>
        {a.icon && (
          <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] ${a.destructive ? "bg-red-50 text-red-600" : "bg-gray-100 text-gray-700"}`}>
            <a.icon size={16} strokeWidth={2.25} />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{a.label}</span>
          {a.hint && <span className="block truncate text-xs font-normal text-gray-500">{a.hint}</span>}
        </span>
      </>
    );
    if (a.href && !a.disabled) {
      const external = /^(tel:|mailto:|https?:)/.test(a.href);
      return external ? (
        <a key={a.key} href={a.href} className={cls} onClick={onClose}>
          {inner}
        </a>
      ) : (
        <Link key={a.key} href={a.href} prefetch={false} className={cls} onClick={onClose}>
          {inner}
        </Link>
      );
    }
    return (
      <button key={a.key} type="button" disabled={a.disabled || busy !== null} onClick={() => void run(a)} className={cls}>
        {inner}
      </button>
    );
  };

  const popover =
    open && anchor && typeof document !== "undefined"
      ? createPortal(
          <div
            ref={popRef}
            role="menu"
            aria-label={title}
            className="ds-glass fixed z-[80] hidden w-max min-w-[13rem] max-w-[18rem] whitespace-nowrap rounded-xl py-1.5 lg:block"
            style={{ left: pos?.left ?? anchor.x, top: pos?.top ?? anchor.y, visibility: pos ? "visible" : "hidden", animation: "tile-in 160ms cubic-bezier(0.22,1,0.36,1) both" }}
            onContextMenu={(e) => e.preventDefault()}
          >
            {title && <p className="truncate border-b border-gray-100 px-3.5 pb-1.5 pt-1 text-[11px] font-semibold text-gray-500">{title}</p>}
            {items.map(desktopItem)}
          </div>,
          // inside the app wrapper: every material class is scoped to .app-ui, so a body portal gets no background at all
          document.querySelector(".app-ui") ?? document.body
        )
      : null;

  // The phone sheet is portaled out too (2026-09-26): a `fixed` sheet left
  // inline under a glass surface (the tab bar, the More sheet) is contained by
  // that surface's backdrop-filter and opens inside a 56px strip.
  const sheet = (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="divide-y divide-gray-100/80">{items.map(phoneItem)}</div>
    </BottomSheet>
  );

  return (
    <>
      {popover}
      {typeof document !== "undefined" ? createPortal(sheet, document.querySelector(".app-ui") ?? document.body) : sheet}
    </>
  );
}

/**
 * Wrap a list row. Right-click / press-and-hold / the hover "⋯" handle open
 * `actions`; the row inside stays a normal link.
 */
export default function RowActions({ actions, title, children, className = "" }: { actions: QuickAction[]; title?: string; children: ReactNode; className?: string }) {
  const [anchor, setAnchor] = useState<MenuAnchor | null>(null);
  const [open, setOpen] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef<{ x: number; y: number } | null>(null);
  const swallow = useRef(false);
  const enabled = actions.some((a) => !a.heading);

  const openAt = useCallback((a: MenuAnchor) => {
    setAnchor(a);
    setOpen(true);
  }, []);
  const close = useCallback(() => setOpen(false), []);

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };
  useEffect(() => clearTimer, []);

  if (!enabled) return <div className={className}>{children}</div>;

  return (
    <div
      className={`group relative ${className}`}
      style={{ WebkitTouchCallout: "none" }}
      onContextMenu={(e) => {
        e.preventDefault();
        // a press-and-hold already opened the sheet on this browser
        if (timer.current || open) return;
        openAt({ x: e.clientX, y: e.clientY });
      }}
      onTouchStart={(e) => {
        const t = e.touches[0];
        if (!t) return;
        start.current = { x: t.clientX, y: t.clientY };
        clearTimer();
        timer.current = setTimeout(() => {
          timer.current = null;
          swallow.current = true;
          hapticImpact("MEDIUM");
          openAt({ x: t.clientX, y: t.clientY });
        }, LONG_PRESS_MS);
      }}
      onTouchMove={(e) => {
        const t = e.touches[0];
        if (!start.current || !timer.current || !t) return;
        if (Math.hypot(t.clientX - start.current.x, t.clientY - start.current.y) > MOVE_CANCEL_PX) clearTimer();
      }}
      onTouchEnd={clearTimer}
      onTouchCancel={clearTimer}
      onClickCapture={(e) => {
        if (!swallow.current) return;
        swallow.current = false;
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      {children}
      <QuickMenu open={open} anchor={anchor} title={title} actions={actions} onClose={close} />
    </div>
  );
}
