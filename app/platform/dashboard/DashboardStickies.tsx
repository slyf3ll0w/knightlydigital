"use client";

import { useCallback, useEffect, useState } from "react";
import StickyBoard from "@/components/sticky/StickyBoard";
import StickyRow from "@/components/sticky/StickyRow";
import StickyEditor from "@/components/sticky/StickyEditor";
import type { StickyNoteDTO } from "@/lib/sticky-shared";

/**
 * Home's sticky notes: the corkboard band on desktop, the swipe row on
 * phones, one editor. Own notes need no live updates; team notes refresh
 * when the 20-second nav poll sees a newer note (AppShell dispatches
 * `wb:notes-changed`) and when the app comes back to the foreground.
 */
export default function DashboardStickies({
  initial,
  meId,
  canPin,
  phone,
}: {
  initial: StickyNoteDTO[];
  meId: string;
  canPin: boolean;
  phone: boolean;
}) {
  const [notes, setNotes] = useState(initial);
  const [editor, setEditor] = useState<{ open: boolean; note: StickyNoteDTO | null }>({ open: false, note: null });
  useEffect(() => setNotes(initial), [initial]);

  const refetch = useCallback(async () => {
    try {
      const r = await fetch("/api/app/notes");
      if (!r.ok) return;
      const d = (await r.json()) as { notes?: StickyNoteDTO[] };
      if (d.notes) setNotes(d.notes);
    } catch {}
  }, []);
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

  const upsert = (n: StickyNoteDTO) =>
    setNotes((cur) => {
      const rest = cur.filter((x) => x.id !== n.id);
      const prev = cur.find((x) => x.id === n.id);
      // Keep this viewer's placement across an edit
      const merged = prev ? { ...n, x: n.x ?? prev.x, y: n.y ?? prev.y, z: Math.max(n.z, prev.z) } : n;
      return [merged, ...rest];
    });
  const remove = (id: string) => setNotes((cur) => cur.filter((x) => x.id !== id));
  const placed = (id: string, x: number, y: number, z: number) => {
    setNotes((cur) => cur.map((n) => (n.id === id ? { ...n, x, y, z } : n)));
    void fetch(`/api/app/notes/${id}/place`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ x, y, z }),
    }).catch(() => {});
  };

  // Hidden entirely on phones with nothing to show? No: the "+" sticky is
  // the door, and the board on desktop shows a faint "Stick a note".
  return (
    <>
      {/* The one handwriting face, for note bodies only (design-system exception, David 2026-10-03) */}
      <link rel="stylesheet" precedence="default" href="https://fonts.googleapis.com/css2?family=Caveat:wght@500&display=swap" />
      {phone ? (
        <StickyRow notes={notes} onOpen={(n) => setEditor({ open: true, note: n })} onNew={() => setEditor({ open: true, note: null })} />
      ) : (
        <StickyBoard
          notes={notes}
          onOpen={(n) => setEditor({ open: true, note: n })}
          onNew={() => setEditor({ open: true, note: null })}
          onPlaced={placed}
        />
      )}
      <StickyEditor
        open={editor.open}
        note={editor.note}
        meId={meId}
        canPin={canPin}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        onSaved={upsert}
        onDeleted={remove}
      />
    </>
  );
}
