"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * The fold at the foot of a create form (streamline batch 1, 2026-10-16):
 * the three or four fields someone off pen and paper actually needs stay on
 * top, everything else waits behind "+ More details" with a one-line hint
 * of what's in there. Opens in place and stays open (the Leads board
 * quick-add set the pattern). Controlled when `open`/`onOpenChange` are
 * given, so a "change" link elsewhere on the form can open it.
 */
export default function MoreDetails({
  hint,
  children,
  open: openProp,
  onOpenChange,
  label = "More details",
}: {
  /** What's inside, in plain words: "title, notes, lead source, crew". */
  hint?: string;
  children: React.ReactNode;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  label?: string;
}) {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (v: boolean) => {
    setOpenState(v);
    onOpenChange?.(v);
  };

  if (open) return <>{children}</>;

  return (
    <button
      type="button"
      onClick={() => setOpen(true)}
      className="flex w-full items-center gap-2 rounded-[12px] border border-dashed border-gray-300 px-4 py-3 text-left text-sm hover:bg-gray-50 active:bg-gray-100"
    >
      <ChevronDown size={16} className="shrink-0 text-[color:var(--ds-primary)]" aria-hidden />
      <span className="font-semibold text-[color:var(--ds-primary)]">+ {label}</span>
      {hint && <span className="min-w-0 truncate text-xs text-gray-500">{hint}</span>}
    </button>
  );
}
