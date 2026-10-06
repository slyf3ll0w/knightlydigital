"use client";

import { useEffect, useState } from "react";
import { ListChecks, Loader2, Trash2, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ds";
import { alertSheet, confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { STICKY_SIZES, type StickyNoteDTO } from "@/lib/sticky-shared";
import type { TaskDTO } from "@/lib/tasks-shared";
import StickyForm, { emptyDraft, sizeKeyFor, type StickyDraft } from "./StickyForm";

/** What a create / edit sends (shared with the phone composer). */
export function draftPayload(d: StickyDraft) {
  const px = STICKY_SIZES.find((s) => s.key === d.size)?.px ?? 168;
  return {
    body: d.body.trim(),
    color: d.color,
    shared: d.shared,
    width: px,
    height: px,
    expiry: d.expiry,
    expiryDate: d.expiry === "custom" ? d.expiryDate : undefined,
  };
}

/**
 * The sticky editor: a bottom sheet on phones, a glass card on desktop
 * (Modal does both). New notes land on `page` at `at` (the right-click
 * spot; null = the page strip picks a slot). "Make a task" copies the
 * first line into a Task and keeps the note.
 */
export default function StickyEditor({
  open,
  note,
  page,
  at,
  prefill,
  portal = false,
  meId,
  canPin,
  onClose,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  /** null = a new note */
  note: StickyNoteDTO | null;
  /** The page a NEW note sticks to */
  page: string;
  at?: { x: number; y: number } | null;
  /** Starting text for a new note (a call: "Maria Rivera · (469) 555-0100") */
  prefill?: string;
  /** Render into document.body — for hosts outside the page tree (the softphone card) */
  portal?: boolean;
  meId: string;
  /** The team board is available to this viewer (plan gate is dark until PLAN_GATING=1). */
  canPin: boolean;
  onClose: () => void;
  onSaved: (note: StickyNoteDTO) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !note;
  const [draft, setDraft] = useState<StickyDraft>(emptyDraft());
  const [busy, setBusy] = useState<"save" | "task" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = Boolean(note && !note.canEdit);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(null);
    setDraft(
      note
        ? {
            body: note.body,
            color: note.color,
            size: sizeKeyFor(Math.max(note.width, note.height)),
            shared: note.shared,
            expiry: note.expiresAt ? "custom" : "none",
            expiryDate: note.expiryDate,
          }
        : emptyDraft(prefill)
    );
  }, [open, note, prefill]);

  async function save() {
    if (busy || readOnly) return;
    if (!draft.body.trim()) {
      setError("Write something on the note.");
      return;
    }
    setBusy("save");
    setError(null);
    const payload = draftPayload(draft);
    const res = isNew
      ? await postJson<{ note: StickyNoteDTO }>("/api/app/notes", { ...payload, page, x: at?.x, y: at?.y })
      : await postJson<{ note: StickyNoteDTO }>(
          `/api/app/notes/${note!.id}`,
          {
            ...payload,
            // Size chips only change the note when the user picked a different one;
            // a corner-dragged custom size is kept otherwise
            ...(sizeKeyFor(Math.max(note!.width, note!.height)) === draft.size ? { width: undefined, height: undefined } : {}),
            ...(note!.authorId === meId ? {} : { shared: undefined }),
          },
          "PATCH"
        );
    setBusy(null);
    if (!res.ok || !res.data?.note) {
      setError(res.data?.error ?? GENERIC_ERROR);
      hapticNotify("ERROR");
      return;
    }
    hapticImpact("LIGHT");
    onSaved(res.data.note);
    onClose();
  }

  async function makeTask() {
    if (busy) return;
    let id = note?.id ?? null;
    if (!id) {
      if (!draft.body.trim()) {
        setError("Write something on the note.");
        return;
      }
      setBusy("task");
      const created = await postJson<{ note: StickyNoteDTO }>("/api/app/notes", { ...draftPayload(draft), page, x: at?.x, y: at?.y });
      if (!created.ok || !created.data?.note) {
        setBusy(null);
        setError(created.data?.error ?? GENERIC_ERROR);
        return;
      }
      onSaved(created.data.note);
      id = created.data.note.id;
    } else {
      setBusy("task");
    }
    const res = await postJson<{ task: TaskDTO }>(`/api/app/notes/${id}/task`);
    setBusy(null);
    if (!res.ok || !res.data?.task) {
      setError(res.data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticNotify("SUCCESS");
    onClose();
    await alertSheet({ title: "Task added", message: `"${res.data.task.title}" is on your list under Tasks. The note stays here.` });
  }

  async function remove() {
    if (!note || busy) return;
    const ok = await confirmSheet({
      title: "Take this note down?",
      message: note.shared ? "It comes off this page for everyone." : "It's gone for good.",
      confirmLabel: "Take it down",
      destructive: true,
    });
    if (!ok) return;
    setBusy("delete");
    const res = await postJson(`/api/app/notes/${note.id}`, undefined, "DELETE");
    setBusy(null);
    if (!res.ok) {
      setError(res.data?.error ?? GENERIC_ERROR);
      return;
    }
    onDeleted(note.id);
    onClose();
  }

  return (
    <Modal open={open} onClose={onClose} size="sm" dismissible={busy === null} portal={portal}>
      {/* `ds` here so the paper tokens exist even when the host sits outside the page tree */}
      <div className="ds space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="ds-h2">{isNew ? "New note" : readOnly ? `${note?.authorName}'s note` : "Note"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
          >
            <X size={16} />
          </button>
        </div>

        <StickyForm
          draft={draft}
          onChange={setDraft}
          canPin={canPin && (!note || note.authorId === meId)}
          readOnly={readOnly}
        />

        {error && (
          <p className="text-[13px] text-[color:var(--ds-bad)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
          <div className="flex items-center gap-1">
            {note?.canEdit && (
              <button
                type="button"
                onClick={() => void remove()}
                disabled={busy !== null}
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[color:var(--ds-bad)] hover:bg-[color:var(--ds-bad-soft)] disabled:opacity-50"
              >
                {busy === "delete" ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} aria-hidden />}
                Take down
              </button>
            )}
            <button
              type="button"
              onClick={() => void makeTask()}
              disabled={busy !== null}
              className="inline-flex items-center gap-1 rounded-full px-2.5 py-1.5 text-[13px] font-medium text-[color:var(--ds-primary)] hover:bg-[color:var(--ds-primary-soft)] disabled:opacity-50"
            >
              {busy === "task" ? <Loader2 size={13} className="animate-spin" /> : <ListChecks size={13} aria-hidden />}
              Make a task
            </button>
          </div>
          {!readOnly && (
            <Button onClick={() => void save()} disabled={busy !== null} icon={busy === "save" ? Loader2 : undefined}>
              {isNew ? "Stick it" : "Save"}
            </Button>
          )}
        </div>
      </div>
    </Modal>
  );
}
