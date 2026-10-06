"use client";

import { ImagePlus } from "lucide-react";

/** The "drop to send" sheet over a conversation while files are dragged onto it (lib/use-file-drop.ts). */
export default function FileDropOverlay({ show, hint }: { show: boolean; hint: string }) {
  if (!show) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-[inherit] bg-[color-mix(in_srgb,var(--ds-surface)_88%,transparent)] p-6 backdrop-blur-sm">
      <div className="flex h-full w-full flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[color:var(--ds-primary)] text-center">
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
          <ImagePlus size={22} />
        </span>
        <p className="text-[15px] font-semibold text-gray-900">Drop to send</p>
        <p className="max-w-xs text-xs text-gray-500">{hint}</p>
      </div>
    </div>
  );
}
