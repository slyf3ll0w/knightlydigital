"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2 } from "lucide-react";

const OUT_SIZE = 256; // exported square, matches the old center-crop pipeline
const MAX_ZOOM = 3;

/**
 * Crop/reposition dialog for profile photos: drag to pan, pinch or slider to
 * zoom, circular guide shows exactly what the round Avatar will display.
 * Exports a 256px JPEG blob. Desktop = centered card, mobile = bottom sheet
 * (modal-pop/modal-card).
 */
export default function AvatarCropModal({
  file,
  onCancel,
  onSave,
  busy = false,
}: {
  file: File;
  onCancel: () => void;
  onSave: (blob: Blob) => void;
  busy?: boolean;
}) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);

  const imgRef = useRef<HTMLImageElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null);
  const [zoom, setZoom] = useState(1); // 1 = the image exactly covers the box
  const [offset, setOffset] = useState({ x: 0, y: 0 }); // px, from centered
  const [exporting, setExporting] = useState(false);

  // Pointer state: one finger pans, two pinch-zoom
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ startDist: number; startZoom: number } | null>(null);

  const boxSize = () => boxRef.current?.clientWidth ?? 280;

  const coverScale = dims ? boxSize() / Math.min(dims.w, dims.h) : 1;
  const scale = coverScale * zoom;

  function clampOffset(o: { x: number; y: number }, z = zoom) {
    if (!dims) return o;
    const s = coverScale * z;
    const maxX = Math.max(0, (dims.w * s - boxSize()) / 2);
    const maxY = Math.max(0, (dims.h * s - boxSize()) / 2);
    return {
      x: Math.min(maxX, Math.max(-maxX, o.x)),
      y: Math.min(maxY, Math.max(-maxY, o.y)),
    };
  }

  function setZoomClamped(z: number) {
    const next = Math.min(MAX_ZOOM, Math.max(1, z));
    setZoom(next);
    setOffset((o) => clampOffset(o, next));
  }

  function onPointerDown(e: React.PointerEvent) {
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()];
      gesture.current = { startDist: Math.hypot(a.x - b.x, a.y - b.y), startZoom: zoom };
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
      setZoomClamped(gesture.current.startZoom * (dist / gesture.current.startDist));
    } else if (pointers.current.size === 1) {
      setOffset((o) => clampOffset({ x: o.x + cur.x - prev.x, y: o.y + cur.y - prev.y }));
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) gesture.current = null;
  }

  async function exportCrop() {
    const img = imgRef.current;
    if (!img || !dims || exporting) return;
    setExporting(true);
    try {
      const V = boxSize();
      const srcSide = V / scale;
      const cx = dims.w / 2 - offset.x / scale;
      const cy = dims.h / 2 - offset.y / scale;
      const sx = Math.min(Math.max(0, cx - srcSide / 2), dims.w - srcSide);
      const sy = Math.min(Math.max(0, cy - srcSide / 2), dims.h - srcSide);
      const canvas = document.createElement("canvas");
      canvas.width = OUT_SIZE;
      canvas.height = OUT_SIZE;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Canvas not supported");
      ctx.drawImage(img, sx, sy, srcSide, srcSide, 0, 0, OUT_SIZE, OUT_SIZE);
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("export failed"))), "image/jpeg", 0.85);
      });
      onSave(blob);
    } catch {
      onCancel();
    } finally {
      setExporting(false);
    }
  }

  const working = busy || exporting;

  return (
    <div className="modal-pop fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
      <div className="modal-card w-full max-w-sm rounded-lg bg-white p-5 shadow-xl">
        <h2 className="mb-1 text-base font-semibold text-gray-900">Position your photo</h2>
        <p className="mb-3 text-xs text-gray-500">Drag to move · pinch or slide to zoom</p>

        <div
          ref={boxRef}
          className="relative mx-auto aspect-square w-full max-w-[280px] touch-none select-none overflow-hidden rounded-xl bg-gray-100"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={onPointerUp}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            ref={imgRef}
            src={url}
            alt=""
            draggable={false}
            onLoad={(e) => {
              const el = e.currentTarget;
              setDims({ w: el.naturalWidth, h: el.naturalHeight });
              setZoom(1);
              setOffset({ x: 0, y: 0 });
            }}
            className="pointer-events-none absolute left-1/2 top-1/2 max-w-none"
            style={
              dims
                ? {
                    width: dims.w * scale,
                    height: dims.h * scale,
                    transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                  }
                : { visibility: "hidden" }
            }
          />
          {!dims && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-400">
              <Loader2 size={20} className="animate-spin" />
            </div>
          )}
          {/* Circular guide — everything outside the circle is what gets cut */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-1 ring-inset ring-white/70"
            style={{ boxShadow: "0 0 0 9999px rgba(255,255,255,0.55)" }}
          />
        </div>

        <input
          type="range"
          min={100}
          max={MAX_ZOOM * 100}
          value={zoom * 100}
          onChange={(e) => setZoomClamped(Number(e.target.value) / 100)}
          disabled={!dims}
          aria-label="Zoom"
          className="mt-4 w-full accent-green-600"
        />

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={working}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={exportCrop}
            disabled={!dims || working}
            className="flex items-center gap-1.5 rounded-lg bg-green-500 px-4 py-2 text-sm font-semibold text-white hover:bg-green-600 disabled:opacity-50"
          >
            {working && <Loader2 size={14} className="animate-spin" />}
            Save Photo
          </button>
        </div>
      </div>
    </div>
  );
}
