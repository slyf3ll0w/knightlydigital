"use client";

import { useRef, useState } from "react";
import { ImagePlus, Loader2, Trash2 } from "lucide-react";
import { toast } from "@/lib/toast";

/**
 * The product's picture for the shop page: one photo, replaced by the next
 * upload, removed with the trash button. Talks to
 * /api/app/work-items/[id]/photo; the parent keeps the list in step.
 */
export default function ProductPhoto({ itemId, photoKey, onChange }: { itemId: string; photoKey: string | null; onChange: (photoKey: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [bust, setBust] = useState(0);
  const [error, setError] = useState("");

  async function upload(file: File) {
    setBusy(true);
    setError("");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch(`/api/app/work-items/${itemId}/photo`, { method: "POST", body: fd });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setError(data?.error ?? "The photo didn't upload.");
        return;
      }
      onChange(`uploaded:${Date.now()}`);
      setBust(Date.now());
      toast("Photo added");
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const res = await fetch(`/api/app/work-items/${itemId}/photo`, { method: "DELETE" });
      if (res.ok) {
        onChange(null);
        toast("Photo removed");
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      {photoKey ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={`/api/public/store-photos/${itemId}?v=${bust}`} alt="" className="h-16 w-16 rounded-md object-cover bg-gray-100" />
      ) : (
        <div className="flex h-16 w-16 items-center justify-center rounded-md border border-dashed border-gray-300 text-gray-400">
          <ImagePlus size={18} />
        </div>
      )}
      <div className="text-sm">
        <p className="text-gray-700">Photo for the shop page</p>
        <div className="mt-1 flex items-center gap-3">
          <button type="button" className="ds-link text-xs" disabled={busy} onClick={() => input.current?.click()}>
            {busy ? <Loader2 size={12} className="inline animate-spin" /> : photoKey ? "Replace" : "Add a photo"}
          </button>
          {photoKey && (
            <button type="button" className="inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[color:var(--ds-bad)]" disabled={busy} onClick={remove}>
              <Trash2 size={12} /> Remove
            </button>
          )}
        </div>
        {error && <p className="mt-1 text-xs text-[color:var(--ds-bad)]">{error}</p>}
        <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
      </div>
    </div>
  );
}
