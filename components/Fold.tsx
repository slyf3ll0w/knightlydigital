"use client";

import { useState } from "react";
import { ChevronDown } from "lucide-react";

/**
 * Card section that folds shut on phones — tap the header to open. Desktop
 * always shows the content (header not clickable, chevron hidden) so the
 * Console reads exactly as before. Server pages pass their server-rendered
 * section straight through as children.
 *
 * `meta` is a phone-only summary shown while folded (a count, a total) so a
 * closed section still answers the glance question.
 */
export default function Fold({
  title,
  meta,
  defaultOpen = false,
  children,
}: {
  title: string;
  meta?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="card-ledger overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between px-5 py-4 text-left lg:pointer-events-none"
        aria-expanded={open}
      >
        <h2 className="text-[13px] font-semibold text-gray-500">{title}</h2>
        <span className="flex items-center gap-2 lg:hidden">
          {meta && <span className="text-[13px] font-semibold text-gray-700">{meta}</span>}
          <ChevronDown
            size={16}
            className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
          />
        </span>
      </button>
      <div className={`${open ? "block" : "hidden"} border-t border-gray-100 lg:block`}>
        {children}
      </div>
    </div>
  );
}
