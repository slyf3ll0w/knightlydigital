"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronUp, Eye, EyeOff, Loader2, Plus, StickyNote } from "lucide-react";
import { QuickMenu, type MenuAnchor, type QuickAction } from "@/components/QuickMenu";
import StickyPaper from "./StickyPaper";
import StickyRow from "./StickyRow";
import StickyEditor, { draftPayload } from "./StickyEditor";
import StickyForm, { emptyDraft, type StickyDraft } from "./StickyForm";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { STICKY_MAX, STICKY_MIN, isInteractiveTarget, normalizePage, type StickyNoteDTO } from "@/lib/sticky-shared";

const DRAG_THRESHOLD = 4;
const HIDDEN_KEY = "wb-notes-hidden";
const NO_NOTES_PAGES = ["/app/login", "/app/register", "/app/get-started", "/app/forgot-password", "/app/reset-password", "/app/verify-email", "/app/suspended", "/app/activate", "/app/open"];

type Drag = { id: string; mode: "move" | "size"; startX: number; startY: number; ox: number; oy: number; ow: number; oh: number; moved: boolean };

/**
 * Sticky notes on ANY page (David 2026-10-06). Mounted once inside the
 * shell's scrolling <main>:
 *  - desktop: right-click on empty space (nothing clickable under the
 *    pointer, no text selected) → "Stick a note here"; notes render in a
 *    layer at the spot they were stuck, draggable, resizable from the
 *    corner; the same menu hides / shows every note.
 *  - phone: a slim "Notes on this page" strip at the top of the content
 *    that expands to the row of notes and an inline composer.
 * Own notes are instant; team notes refresh from the 20-second nav poll
 * (`wb:notes-changed`) and when the app comes back to the foreground.
 */
export default function PageNotes({ mainRef, meId, canPin }: { mainRef: RefObject<HTMLElement | null>; meId: string; canPin: boolean }) {
  const pathname = usePathname() ?? "";
  const page = normalizePage(pathname);
  const active = page.startsWith("/app/") && !NO_NOTES_PAGES.some((p) => page === p || page.startsWith(p + "/"));

  const [notes, setNotes] = useState<StickyNoteDTO[]>([]);
  const [hidden, setHidden] = useState(false);
  const [menu, setMenu] = useState<{ open: boolean; anchor: MenuAnchor | null; at: { x: number; y: number } | null }>({ open: false, anchor: null, at: null });
  const [editor, setEditor] = useState<{ open: boolean; note: StickyNoteDTO | null; at: { x: number; y: number } | null }>({ open: false, note: null, at: null });
  const [stripOpen, setStripOpen] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [draft, setDraft] = useState<StickyDraft>(emptyDraft());
  const [composerBusy, setComposerBusy] = useState(false);
  const [composerError, setComposerError] = useState<string | null>(null);
  // Live px while dragging / resizing
  const [live, setLive] = useState<Record<string, { x: number; y: number; w: number; h: number }>>({});
  const [front, setFront] = useState<string | null>(null);
  const drag = useRef<Drag | null>(null);
  // Phone: with nothing stuck here the strip lives at the bottom of the page
  const [bottomEl, setBottomEl] = useState<HTMLElement | null>(null);
  useEffect(() => {
    setBottomEl((mainRef.current?.querySelector("#wb-page-notes-bottom") as HTMLElement | null) ?? null);
  }, [mainRef, page]);

  useEffect(() => {
    try {
      setHidden(localStorage.getItem(HIDDEN_KEY) === "1");
    } catch {}
  }, []);
  const setHiddenPref = (v: boolean) => {
    setHidden(v);
    try {
      localStorage.setItem(HIDDEN_KEY, v ? "1" : "0");
    } catch {}
  };

  const refetch = useCallback(async () => {
    if (!active) return;
    try {
      const r = await fetch(`/api/app/notes?page=${encodeURIComponent(page)}`);
      if (!r.ok) return;
      const d = (await r.json()) as { notes?: StickyNoteDTO[]; page?: string };
      if (d.notes && d.page === page) setNotes(d.notes);
    } catch {}
  }, [active, page]);

  useEffect(() => {
    setNotes([]);
    setStripOpen(false);
    setComposerOpen(false);
    void refetch();
  }, [refetch]);
  useEffect(() => {
    const onChanged = () => void refetch();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refetch();
    };
    window.addEventListener("wb:notes-changed", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("wb:notes-changed", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refetch]);

  // ── Desktop: right-click on empty space ───────────────────────────────
  useEffect(() => {
    const main = mainRef.current;
    if (!main || !active) return;
    // Listen on the DOCUMENT, not on <main>: React delivers onContextMenu
    // handlers (lead cards, rows, nav items — everything with its own menu)
    // from its root container, which is an ancestor of <main>, so a listener
    // on <main> would run first and see defaultPrevented === false. At the
    // document the native event arrives after React has had its turn.
    const onContext = (e: MouseEvent) => {
      if (window.innerWidth < 1024) return;
      const target = e.target as Element | null;
      if (!target || !main.contains(target)) return;
      if (e.defaultPrevented) return; // something with its own menu took it
      if (isInteractiveTarget(target)) return;
      if (target.closest('[role="menu"], [role="menuitem"], .lead-card, [draggable="true"], [data-row-actions]')) return;
      const sel = window.getSelection();
      if (sel && sel.toString().trim()) return;
      const rect = main.getBoundingClientRect();
      const at = { x: Math.round(e.clientX - rect.left + main.scrollLeft), y: Math.round(e.clientY - rect.top + main.scrollTop) };
      e.preventDefault();
      setMenu({ open: true, anchor: { x: e.clientX, y: e.clientY }, at });
    };
    document.addEventListener("contextmenu", onContext);
    return () => document.removeEventListener("contextmenu", onContext);
  }, [mainRef, active]);

  const upsert = (n: StickyNoteDTO) =>
    setNotes((cur) => {
      const prev = cur.find((x) => x.id === n.id);
      const merged = prev ? { ...n, x: n.x ?? prev.x, y: n.y ?? prev.y } : n;
      return [merged, ...cur.filter((x) => x.id !== n.id)];
    });
  const remove = (id: string) => setNotes((cur) => cur.filter((x) => x.id !== id));

  const menuActions: QuickAction[] = [
    { key: "new", label: "Stick a note here", icon: StickyNote, onSelect: () => setEditor({ open: true, note: null, at: menu.at }) },
    hidden
      ? { key: "show", label: `Show sticky notes${notes.length ? ` (${notes.length} here)` : ""}`, icon: Eye, onSelect: () => setHiddenPref(false) }
      : { key: "hide", label: "Hide sticky notes", icon: EyeOff, onSelect: () => setHiddenPref(true), disabled: notes.length === 0, hint: notes.length === 0 ? "none on this page" : undefined },
  ];

  // ── Desktop: drag + corner resize ─────────────────────────────────────
  const posOf = (n: StickyNoteDTO, i: number) => {
    const l = live[n.id];
    if (l) return { x: l.x, y: l.y, w: l.w, h: l.h };
    // Not placed yet (stuck from a phone): a row along the top
    const x = n.x ?? 24 + i * (n.width + 16);
    const y = n.y ?? 16;
    return { x, y, w: n.width, h: n.height };
  };
  const onPointerDown = (e: React.PointerEvent, n: StickyNoteDTO, i: number, mode: "move" | "size") => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    if (mode === "size") e.stopPropagation();
    const p = posOf(n, i);
    drag.current = { id: n.id, mode, startX: e.clientX, startY: e.clientY, ox: p.x, oy: p.y, ow: p.w, oh: p.h, moved: false };
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    setFront(n.id);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    const dy = e.clientY - d.startY;
    if (!d.moved && Math.hypot(dx, dy) < DRAG_THRESHOLD) return;
    if (!d.moved) {
      d.moved = true;
      hapticImpact("LIGHT");
    }
    setLive((cur) => ({
      ...cur,
      [d.id]:
        d.mode === "move"
          ? { x: Math.max(0, d.ox + dx), y: Math.max(0, d.oy + dy), w: d.ow, h: d.oh }
          : { x: d.ox, y: d.oy, w: Math.min(STICKY_MAX, Math.max(STICKY_MIN, d.ow + dx)), h: Math.min(STICKY_MAX, Math.max(STICKY_MIN, d.oh + dy)) },
    }));
  };
  const onPointerUp = async (e: React.PointerEvent, n: StickyNoteDTO) => {
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture(e.pointerId);
    } catch {}
    if (!d.moved) {
      if (d.mode === "move") setEditor({ open: true, note: n, at: null });
      return;
    }
    const l = live[d.id];
    if (!l) return;
    if (d.mode === "move") {
      setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, x: l.x, y: l.y } : x)));
      if (n.canEdit) void postJson(`/api/app/notes/${n.id}`, { x: Math.round(l.x), y: Math.round(l.y) }, "PATCH");
      else void fetch(`/api/app/notes/${n.id}/place`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ x: Math.round(l.x), y: Math.round(l.y) }) }).catch(() => {});
    } else {
      setNotes((cur) => cur.map((x) => (x.id === n.id ? { ...x, width: Math.round(l.w), height: Math.round(l.h) } : x)));
      void postJson(`/api/app/notes/${n.id}`, { width: Math.round(l.w), height: Math.round(l.h) }, "PATCH");
    }
    setLive((cur) => {
      const next = { ...cur };
      delete next[d.id];
      return next;
    });
  };

  // ── Phone composer ────────────────────────────────────────────────────
  async function stick() {
    if (composerBusy) return;
    if (!draft.body.trim()) {
      setComposerError("Write something on the note.");
      return;
    }
    setComposerBusy(true);
    setComposerError(null);
    const res = await postJson<{ note: StickyNoteDTO }>("/api/app/notes", { ...draftPayload(draft), page });
    setComposerBusy(false);
    if (!res.ok || !res.data?.note) {
      setComposerError(res.data?.error ?? GENERIC_ERROR);
      hapticNotify("ERROR");
      return;
    }
    hapticNotify("SUCCESS");
    const wasAtBottom = notes.length === 0;
    upsert(res.data.note);
    setDraft(emptyDraft());
    setComposerOpen(false);
    // The strip moves from the bottom to the top with its first note — follow it
    if (wasAtBottom) mainRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }

  if (!active) return null;
  const count = notes.length;
  const stripAtBottom = count === 0 && !hidden && bottomEl !== null;

  return (
    <>
      {/* The one handwriting face, for note bodies only (design-system exception, David 2026-10-03) */}
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" />

      {/* ── Desktop layer: notes at their spot on this page ── */}
      {!hidden && count > 0 && (
        <div className="pointer-events-none absolute left-0 top-0 z-[25] hidden h-0 w-full lg:block" aria-label="Sticky notes on this page">
          {notes.map((n, i) => {
            const p = posOf(n, i);
            return (
              <StickyPaper
                key={n.id}
                note={{ ...n, width: p.w, height: p.h }}
                className={`ds-sticky-placed pointer-events-auto ${drag.current?.id === n.id && live[n.id] ? "ds-sticky-dragging" : ""}`}
                style={{ left: p.x, top: p.y, zIndex: front === n.id ? 50 : 10 + (count - i) }}
                onPointerDown={(e) => onPointerDown(e, n, i, "move")}
                onPointerMove={onPointerMove}
                onPointerUp={(e) => void onPointerUp(e, n)}
                onPointerCancel={() => {
                  drag.current = null;
                }}
                handle={
                  n.canEdit ? (
                    <span
                      className="ds-sticky-grip"
                      aria-hidden
                      onPointerDown={(e) => onPointerDown(e, n, i, "size")}
                      onPointerMove={onPointerMove}
                      onPointerUp={(e) => void onPointerUp(e, n)}
                    />
                  ) : null
                }
              />
            );
          })}
        </div>
      )}

      {/* ── Phone: the page strip (at the top with notes, at the bottom without) ── */}
      {(() => {
        const strip = (
      <div className={`${stripAtBottom ? "px-4 pb-3 pt-6" : "px-4 pt-3"} lg:hidden`} data-notes-skip>
        <div className={`ds-notes-strip ${stripOpen ? "ds-notes-strip-open" : ""}`}>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                setStripOpen((v) => !v);
              }}
              aria-expanded={stripOpen}
              className="flex min-w-0 flex-1 items-center gap-2 py-1.5 text-left text-[13px] font-semibold text-[color:var(--ds-ink-2)]"
            >
              <StickyNote size={15} className="shrink-0 text-[color:var(--ds-primary)]" aria-hidden />
              <span className="truncate">
                {hidden ? "Notes hidden" : count === 0 ? "Stick a note on this page" : `${count} ${count === 1 ? "note" : "notes"} on this page`}
              </span>
              {stripOpen ? <ChevronUp size={14} aria-hidden /> : <ChevronDown size={14} aria-hidden />}
            </button>
            {hidden ? (
              <button type="button" onClick={() => setHiddenPref(false)} className="text-[13px] font-semibold text-[color:var(--ds-primary)]">
                Show
              </button>
            ) : (
              <button
                type="button"
                onClick={() => {
                  hapticImpact("LIGHT");
                  setStripOpen(true);
                  setComposerOpen(true);
                }}
                aria-label="Add a note to this page"
                className="ds-disc h-8 w-8"
              >
                <Plus size={16} strokeWidth={2.4} />
              </button>
            )}
          </div>

          {stripOpen && !hidden && (
            <div className="pb-2">
              {composerOpen && (
                <div className="ds-notes-composer">
                  <StickyForm draft={draft} onChange={setDraft} canPin={canPin} compact />
                  {composerError && (
                    <p className="mt-2 text-[13px] text-[color:var(--ds-bad)]" role="alert">
                      {composerError}
                    </p>
                  )}
                  <div className="mt-2.5 flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setComposerOpen(false);
                        setComposerError(null);
                      }}
                      className="rounded-full px-3 py-1.5 text-[13px] font-medium text-[color:var(--ds-ink-2)]"
                    >
                      Cancel
                    </button>
                    <button type="button" onClick={() => void stick()} disabled={composerBusy} className="ds-btn ds-btn-primary ds-btn-sm">
                      {composerBusy ? <Loader2 size={14} className="animate-spin" /> : null}
                      Stick it
                    </button>
                  </div>
                </div>
              )}
              {count > 0 ? (
                <StickyRow notes={notes} onOpen={(n) => setEditor({ open: true, note: n, at: null })} onNew={() => setComposerOpen(true)} />
              ) : (
                !composerOpen && <p className="ds-small px-1 pb-1">Nothing stuck here yet. Press + to add one.</p>
              )}
              {count > 0 && (
                <button type="button" onClick={() => setHiddenPref(true)} className="mt-1 inline-flex items-center gap-1 px-1 text-[12.5px] font-medium text-[color:var(--ds-muted)]">
                  <EyeOff size={12} aria-hidden /> Hide sticky notes everywhere
                </button>
              )}
            </div>
          )}
        </div>
      </div>
        );
        return stripAtBottom && bottomEl ? createPortal(strip, bottomEl) : strip;
      })()}

      <QuickMenu open={menu.open} anchor={menu.anchor} title="Sticky notes" actions={menuActions} onClose={() => setMenu((m) => ({ ...m, open: false }))} />
      <StickyEditor
        open={editor.open}
        note={editor.note}
        page={page}
        at={editor.at}
        portal
        meId={meId}
        canPin={canPin}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        onSaved={upsert}
        onDeleted={remove}
      />
    </>
  );
}
