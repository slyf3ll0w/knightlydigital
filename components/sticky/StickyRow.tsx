"use client";

import { Plus } from "lucide-react";
import StickyPaper from "./StickyPaper";
import { hapticImpact } from "@/lib/haptics";
import type { StickyNoteDTO } from "@/lib/sticky-shared";

/**
 * Phone: a sideways-swiping row of stickies under the hero (no free
 * placement; order = last edited). Tap opens the editor; "+" at the end.
 */
export default function StickyRow({
  notes,
  onOpen,
  onNew,
}: {
  notes: StickyNoteDTO[];
  onOpen: (note: StickyNoteDTO) => void;
  onNew: () => void;
}) {
  return (
    <section aria-label="Sticky notes" className="-mx-4">
      <div className="no-scrollbar flex items-start gap-3 overflow-x-auto px-4 py-3">
        {notes.map((n) => (
          <StickyPaper
            key={n.id}
            note={n}
            small
            className="shrink-0"
            onOpen={() => {
              hapticImpact("LIGHT");
              onOpen(n);
            }}
          />
        ))}
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            onNew();
          }}
          className="ds-sticky ds-sticky-ghost ds-sticky-sm shrink-0"
          aria-label="New note"
        >
          <Plus size={22} aria-hidden />
          <span className="mt-1">{notes.length === 0 ? "Stick a note" : "New"}</span>
        </button>
      </div>
    </section>
  );
}
