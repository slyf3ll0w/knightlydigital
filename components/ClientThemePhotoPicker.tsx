"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Images, Trash2, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ds";

/**
 * Photo field for the page designer (band photo, login background). Shows
 * the chosen photo, and lets a manager upload one, pick from this company's
 * photos, or clear the choice. Uploads go to POST /api/app/client-theme/assets,
 * which re-encodes them to WebP on the server; `value` is a ThemeAsset id.
 *
 * Remove only clears the choice. Deleting a photo from the library is in the
 * Choose sheet, and the server refuses it while the published look or the
 * draft uses it.
 */

type Asset = { id: string; url: string; width: number; height: number; inUse: "published" | "draft" | null };

const RASTER = /^image\/(jpeg|png|webp|gif|heic|heif|avif)$/i;
const MAX_EDGE = 2400;

/**
 * Shrink a big photo in the browser before it travels (a 12 MP phone photo
 * goes from ~5 MB to well under 1 MB), and turn an iPhone HEIC into JPEG
 * when the browser can read it. Anything that isn't a raster image is sent
 * as is, so the server gives its own answer (SVG / PDF are refused there).
 */
async function prepare(file: File): Promise<Blob> {
  if (!RASTER.test(file.type)) return file;
  const heic = /heic|heif/i.test(file.type);
  if (!heic && file.size < 3 * 1024 * 1024) return file;
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("decode"));
      i.src = url;
    });
    const scale = Math.min(1, MAX_EDGE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/jpeg", 0.9));
    return blob ?? file;
  } catch {
    return file;
  } finally {
    URL.revokeObjectURL(url);
  }
}

async function errorOf(res: Response): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error || "Something went wrong. Try again.";
}

export default function ClientThemePhotoPicker({
  value,
  onChange,
  label,
}: {
  value: string | null;
  onChange: (id: string | null) => void;
  label: string;
}) {
  const [assets, setAssets] = useState<Asset[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/app/client-theme/assets", { cache: "no-store" }).catch(() => null);
    if (!res?.ok) {
      setAssets((a) => a ?? []);
      if (res) setError(await errorOf(res));
      return;
    }
    const body = (await res.json()) as { assets: Asset[] };
    setAssets(body.assets);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const current = value ? assets?.find((a) => a.id === value) ?? null : null;
  // A chosen id we can't find in the list (still loading, or a photo since
  // deleted) still gets a picture: the public URL is predictable.
  const currentUrl = current?.url ?? null;

  async function upload(file: File) {
    setError(null);
    setBusy(true);
    try {
      const blob = await prepare(file);
      const form = new FormData();
      form.append("file", blob, file.name || "photo");
      const res = await fetch("/api/app/client-theme/assets", { method: "POST", body: form });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      const asset = (await res.json()) as Asset;
      setAssets((a) => [{ ...asset, inUse: null }, ...(a ?? []).filter((x) => x.id !== asset.id)]);
      onChange(asset.id);
      setOpen(false);
    } catch {
      setError("The upload didn't go through. Check your connection and try again.");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove(id: string) {
    setError(null);
    setDeleting(id);
    try {
      const res = await fetch(`/api/app/client-theme/assets?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!res.ok) {
        setError(await errorOf(res));
        return;
      }
      setAssets((a) => (a ?? []).filter((x) => x.id !== id));
      if (value === id) onChange(null);
    } finally {
      setDeleting(null);
    }
  }

  const fileInput = (
    <input
      ref={input}
      type="file"
      accept="image/jpeg,image/png,image/webp,image/gif,image/heic,image/heif,image/avif"
      className="hidden"
      data-testid="theme-photo-input"
      onChange={(e) => {
        const f = e.target.files?.[0];
        if (f) void upload(f);
      }}
    />
  );

  return (
    <div className="ds-theme-photo" data-testid="theme-photo-picker">
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label={`${label}: ${value ? "change photo" : "choose a photo"}`}
          className="relative h-16 w-24 shrink-0 overflow-hidden rounded-xl border border-[color:var(--ds-line-strong)] bg-[color:var(--ds-surface-2)]"
        >
          {currentUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={currentUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full w-full items-center justify-center text-[color:var(--ds-muted)]">
              <Images size={20} aria-hidden />
            </span>
          )}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[14.5px] font-medium text-[color:var(--ds-ink)]">{label}</div>
          <div className="mt-1.5 flex flex-wrap gap-2">
            <Button size="sm" variant="soft" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
              Upload
            </Button>
            <Button size="sm" variant="ghost" icon={Images} onClick={() => setOpen(true)}>
              Choose
            </Button>
            {value && (
              <Button size="sm" variant="ghost" icon={X} onClick={() => onChange(null)}>
                Remove
              </Button>
            )}
          </div>
        </div>
      </div>
      {error && !open && (
        <p role="alert" className="mt-2 text-[13px] text-[color:var(--ds-bad)]">
          {error}
        </p>
      )}
      {fileInput}

      <Modal open={open} onClose={() => setOpen(false)} size="lg" portal>
        <div className="ds">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-[17px] font-semibold text-[color:var(--ds-ink)]">{label}</h2>
            <Button size="sm" variant="soft" icon={ImagePlus} loading={busy} onClick={() => input.current?.click()}>
              Upload
            </Button>
          </div>
          {error && (
            <p role="alert" className="mt-2 text-[13px] text-[color:var(--ds-bad)]">
              {error}
            </p>
          )}
          {assets === null ? (
            <p className="ds-small mt-4">Loading photos…</p>
          ) : assets.length === 0 ? (
            <p className="ds-small mt-4">No photos yet. Upload one to use it here.</p>
          ) : (
            <ul className="mt-4 grid max-h-[60vh] grid-cols-2 gap-3 overflow-y-auto sm:grid-cols-3">
              {assets.map((a) => {
                const chosen = a.id === value;
                return (
                  <li key={a.id} className="relative">
                    <button
                      type="button"
                      onClick={() => {
                        onChange(a.id);
                        setOpen(false);
                      }}
                      aria-pressed={chosen}
                      aria-label={chosen ? "Chosen photo" : "Use this photo"}
                      className={`block aspect-[4/3] w-full overflow-hidden rounded-xl border-2 ${chosen ? "border-[color:var(--ds-primary)]" : "border-transparent"}`}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={a.url} alt="" loading="lazy" className="h-full w-full object-cover" />
                    </button>
                    {chosen && (
                      <span className="pointer-events-none absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-[color:var(--ds-primary)] text-[color:var(--ds-on-primary)]">
                        <Check size={14} strokeWidth={3} aria-hidden />
                      </span>
                    )}
                    {a.inUse === null && !chosen && (
                      <button
                        type="button"
                        onClick={() => void remove(a.id)}
                        disabled={deleting === a.id}
                        aria-label="Delete this photo"
                        className="absolute right-2 top-2 flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--ds-surface)] text-[color:var(--ds-ink-2)] shadow"
                      >
                        <Trash2 size={15} aria-hidden />
                      </button>
                    )}
                    {a.inUse && (
                      <span className="ds-small mt-1 block">{a.inUse === "published" ? "On your live pages" : "In your draft"}</span>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
          <div className="mt-4 flex justify-end">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
