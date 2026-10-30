"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Eye, EyeOff, Globe, Link2, Loader2, MapPin, Pencil, Tag, Trash2, Unlink, X } from "lucide-react";
import { alertSheet, confirmSheet, promptSheet } from "@/components/ConfirmSheet";
import { postJson } from "@/lib/safe-fetch";
import { JOB_STAGE_OPTIONS, STAGE_LABEL, isBeforeStage, photoMapUrl, photoSrc, unpaired, type PhotoStage, type PhotoView } from "@/lib/photos-shared";

/**
 * Full-screen photo viewer (phone and desktop alike): swipe or arrow between
 * photos, pinch (or scroll-wheel) to zoom, drag to pan while zoomed. The
 * strip at the bottom carries the caption (tap to edit), the stage, who took
 * it, when, "View on map" when the shot was located, and the actions:
 * Stage · Pair (Gallery) · Show to client · Use on website (managers) · Delete.
 * Pair opens a strip of the loose photos of the other kind; tapping one
 * makes the pair (the PATCH answers both rows, `onPatched` gets each).
 */
const ACTIVE_PILL = "bg-white text-black"; // theme-ok: the viewer is black in both themes; the chosen stage is a white pill with black ink

export default function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  onPatched,
  onDeleted,
  canSite,
  canRestage,
  canPair = false,
}: {
  photos: PhotoView[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
  onPatched: (p: PhotoView & { also?: PhotoView[] }) => void;
  onDeleted: (id: string) => void;
  canSite: boolean;
  /** Job photos can move between Before / During / After / Photo; estimate photos stay what they are. */
  canRestage: boolean;
  /** Before/after pairing (Gallery plan) on a job. */
  canPair?: boolean;
}) {
  const photo = photos[index];
  const [busy, setBusy] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const [pairOpen, setPairOpen] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startZoom: number } | null>(null);
  const swipe = useRef<{ x: number; y: number; moved: boolean } | null>(null);

  const go = useCallback(
    (delta: number) => {
      const next = index + delta;
      if (next < 0 || next >= photos.length) return;
      setZoom(1);
      setOffset({ x: 0, y: 0 });
      setStageOpen(false);
      setPairOpen(false);
      onIndex(next);
    },
    [index, photos.length, onIndex]
  );

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight") go(1);
      else if (e.key === "ArrowLeft") go(-1);
    }
    window.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [go, onClose]);

  function onPointerDown(e: React.PointerEvent) {
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: zoom };
      swipe.current = null;
    } else if (pointers.current.size === 1) {
      swipe.current = { x: e.clientX, y: e.clientY, moved: false };
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    const prev = pointers.current.get(e.pointerId);
    if (!prev) return;
    const cur = { x: e.clientX, y: e.clientY };
    pointers.current.set(e.pointerId, cur);
    if (pointers.current.size === 2 && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      const dist = Math.hypot(a.x - b.x, a.y - b.y);
      setZoom(Math.min(5, Math.max(1, gesture.current.startZoom * (dist / gesture.current.startDist))));
    } else if (pointers.current.size === 1) {
      if (zoom > 1) {
        setOffset((o) => ({ x: o.x + cur.x - prev.x, y: o.y + cur.y - prev.y }));
      } else if (swipe.current && Math.hypot(cur.x - swipe.current.x, cur.y - swipe.current.y) > 8) {
        swipe.current.moved = true;
      }
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    const start = swipe.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
    if (pointers.current.size === 0) {
      if (zoom <= 1.02) {
        setZoom(1);
        setOffset({ x: 0, y: 0 });
        if (start) {
          const dx = e.clientX - start.x;
          const dy = e.clientY - start.y;
          if (Math.abs(dx) > 48 && Math.abs(dx) > Math.abs(dy) * 1.3) go(dx < 0 ? 1 : -1);
        }
      }
      swipe.current = null;
    }
  }

  function onWheel(e: React.WheelEvent) {
    if (!e.ctrlKey && Math.abs(e.deltaY) < 1) return;
    setZoom((z) => Math.min(5, Math.max(1, z - e.deltaY * 0.002)));
  }

  async function patch(body: Record<string, unknown>) {
    setBusy(true);
    try {
      const { ok, data } = await postJson<PhotoView & { also?: PhotoView[]; error?: string }>(`/api/app/photos/${photo.id}`, body, "PATCH");
      if (ok && data) onPatched(data);
      else if (data?.error) alertSheet({ message: data.error });
      return ok;
    } finally {
      setBusy(false);
    }
  }

  // Pairing: a Before (or Estimate) pairs with a loose After and vice versa.
  const pairKind: "before" | "after" | null = !canPair || !photo.jobId ? null : isBeforeStage(photo.stage) ? "before" : photo.stage === "AFTER" ? "after" : null;
  const loose = pairKind ? unpaired(photos) : { befores: [], afters: [] };
  const candidates = pairKind === "before" ? loose.afters : pairKind === "after" ? loose.befores : [];
  const partner = photo.pairId ? photos.find((p) => p.pairId === photo.pairId && p.id !== photo.id) ?? null : null;

  async function pairWith(id: string) {
    setPairOpen(false);
    await patch({ pairWith: id });
  }
  async function unpair() {
    if (!(await confirmSheet({ message: "Take this photo out of its before-and-after pair?", confirmLabel: "Unpair" }))) return;
    await patch({ pairWith: null });
  }

  async function editCaption() {
    const text = await promptSheet({
      title: "Caption",
      message: "A few words about this photo. The client sees it when the photo is shown to them.",
      placeholder: "What is this photo of?",
      initial: photo.caption ?? "",
      confirmLabel: "Save",
    });
    if (text === null) return;
    await patch({ caption: text });
  }

  async function toggleClient() {
    await patch({ clientVisible: !photo.clientVisible });
  }

  // "Use on website" (owners/admins): the photo becomes public site data.
  // Turning it on asks once, because it is the client's property on show.
  async function toggleSite() {
    const on = !photo.siteUse;
    if (
      on &&
      !(await confirmSheet({
        title: "Put this photo on your website?",
        message: "It will be public on your site. Only use photos the client is fine with showing.",
        confirmLabel: "Use on website",
      }))
    )
      return;
    await patch({ siteUse: on });
  }

  async function remove() {
    if (!(await confirmSheet({ message: "Remove this photo?", confirmLabel: "Remove photo", destructive: true }))) return;
    setBusy(true);
    try {
      const { ok } = await postJson(`/api/app/photos/${photo.id}`, undefined, "DELETE");
      if (ok) {
        if (photos.length <= 1) onClose();
        onDeleted(photo.id);
      }
    } finally {
      setBusy(false);
    }
  }

  async function restage(stage: PhotoStage) {
    setStageOpen(false);
    if (stage !== photo.stage) await patch({ type: stage });
  }

  const when = photo.takenAt ?? photo.createdAt;
  const whenText = new Date(when).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const stageWord = STAGE_LABEL[photo.stage] || "Photo";

  if (typeof document === "undefined") return null;
  return createPortal(
    <div className="fixed inset-0 z-[90] flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label="Photo" data-photo-viewer>
      <div className="flex items-center justify-between px-3 pt-[max(env(safe-area-inset-top),8px)] pb-2">
        <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close">
          <X size={22} />
        </button>
        <span className="text-sm text-white/80">
          {index + 1} of {photos.length}
        </span>
        <span className="w-10" />
      </div>

      <div
        className="relative flex-1 touch-none select-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onWheel={onWheel}
        onDoubleClick={() => {
          setZoom((z) => (z > 1 ? 1 : 2.5));
          setOffset({ x: 0, y: 0 });
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          key={photo.id}
          src={photoSrc(photo.id)}
          alt={photo.caption ?? stageWord}
          draggable={false}
          className="absolute inset-0 m-auto max-h-full max-w-full object-contain"
          style={{ transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`, transition: pointers.current.size ? "none" : "transform 120ms ease-out" }}
        />
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(-1)}
            className="absolute left-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 lg:block"
            aria-label="Previous photo"
          >
            <ChevronLeft size={22} />
          </button>
        )}
        {index < photos.length - 1 && (
          <button
            type="button"
            onClick={() => go(1)}
            className="absolute right-2 top-1/2 hidden -translate-y-1/2 rounded-full bg-black/40 p-2 hover:bg-black/60 lg:block"
            aria-label="Next photo"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>

      <div className="bg-black/80 px-4 pt-3 pb-[max(env(safe-area-inset-bottom),12px)]">
        <button type="button" onClick={() => void editCaption()} disabled={busy} className="flex w-full items-start gap-2 text-left">
          <span className="mt-0.5 shrink-0 rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide">{stageWord}</span>
          <span className={`min-w-0 flex-1 text-sm ${photo.caption ? "text-white" : "text-white/50"}`}>{photo.caption || "Add a caption"}</span>
          <Pencil size={14} className="mt-1 shrink-0 text-white/60" />
        </button>
        <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-white/60">
          {photo.by && <span>{photo.by}</span>}
          {photo.by && <span aria-hidden>·</span>}
          <span>{whenText}</span>
          {photo.lat !== null && photo.lng !== null && (
            <>
              <span aria-hidden>·</span>
              <a href={photoMapUrl(photo.lat, photo.lng)} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline-offset-2 hover:underline">
                <MapPin size={12} /> View on map
              </a>
            </>
          )}
        </p>

        {pairOpen && pairKind && (
          <div className="mt-3" data-pair-strip>
            <p className="mb-1.5 text-xs text-white/70">
              {candidates.length > 0
                ? `Pair this ${pairKind === "before" ? "Before" : "After"} with…`
                : `No loose ${pairKind === "before" ? "After" : "Before"} photos to pair with yet.`}
            </p>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {candidates.map((c) => (
                <button key={c.id} type="button" onClick={() => void pairWith(c.id)} disabled={busy} className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-white/10" aria-label={c.caption ?? STAGE_LABEL[c.stage]}>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photoSrc(c.id, c.hasThumb ? "thumb" : "full")} alt={c.caption ?? STAGE_LABEL[c.stage]} className="h-full w-full object-cover" />
                  <span className="absolute bottom-0.5 left-0.5 rounded bg-black/60 px-1 text-[9px] font-semibold">{STAGE_LABEL[c.stage]}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {stageOpen && canRestage && (
          <div className="mt-3 flex flex-wrap gap-2">
            {JOB_STAGE_OPTIONS.map((o) => (
              <button
                key={o.value}
                type="button"
                onClick={() => void restage(o.value)}
                className={`rounded-full px-3 py-1 text-xs font-semibold ${o.value === photo.stage ? ACTIVE_PILL : "bg-white/15 text-white hover:bg-white/25"}`}
              >
                {o.label}
              </button>
            ))}
          </div>
        )}

        <div className={`mt-3 grid gap-1 text-[11px] ${pairKind ? "grid-cols-5" : "grid-cols-4"}`}>
          {canRestage ? (
            <Action icon={<Tag size={18} />} label="Stage" onClick={() => { setPairOpen(false); setStageOpen((v) => !v); }} disabled={busy} />
          ) : (
            <span />
          )}
          {pairKind &&
            (partner ? (
              <Action icon={<Unlink size={18} />} label={`Paired · ${STAGE_LABEL[partner.stage] || "Photo"}`} onClick={() => void unpair()} disabled={busy} active />
            ) : (
              <Action icon={<Link2 size={18} />} label="Pair" onClick={() => { setStageOpen(false); setPairOpen((v) => !v); }} disabled={busy} />
            ))}
          <Action
            icon={photo.clientVisible ? <Eye size={18} /> : <EyeOff size={18} />}
            label={photo.clientVisible ? "Client sees it" : "Hidden from client"}
            onClick={() => void toggleClient()}
            disabled={busy}
            active={photo.clientVisible}
          />
          {canSite ? (
            <Action icon={<Globe size={18} />} label={photo.siteUse ? "On website" : "Use on website"} onClick={() => void toggleSite()} disabled={busy} active={photo.siteUse} />
          ) : (
            <span />
          )}
          <Action icon={busy ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />} label="Delete" onClick={() => void remove()} disabled={busy} danger />
        </div>
      </div>
    </div>,
    document.body
  );
}

function Action({
  icon,
  label,
  onClick,
  disabled,
  active,
  danger,
}: {
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  active?: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center leading-tight disabled:opacity-50 ${
        danger ? "text-red-300 hover:bg-red-500/15" : active ? "text-white bg-white/10" : "text-white/80 hover:bg-white/10"
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}
