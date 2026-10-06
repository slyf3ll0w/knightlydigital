"use client";

import { useEffect, useState } from "react";
import { ListChecks, Loader2, Trash2, Users, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Button, InfoTip } from "@/components/ds";
import { alertSheet, confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { STICKY_BODY_MAX, STICKY_COLORS, type StickyColor, type StickyNoteDTO } from "@/lib/sticky-shared";
import type { TaskDTO } from "@/lib/tasks-shared";

/**
 * The sticky editor: the note itself as the text box (same paper, same
 * hand), five color dots, "Pin to team board", "Make a task", Delete.
 * Bottom sheet on phones, glass card on desktop (Modal does both).
 */
export default function StickyEditor({
  open,
  note,
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
  const [body, setBody] = useState("");
  const [color, setColor] = useState<StickyColor>("YELLOW");
  const [shared, setShared] = useState(false);
  const [busy, setBusy] = useState<"save" | "task" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const readOnly = Boolean(note && !note.canEdit);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(null);
    setBody(note?.body ?? (prefill ? `${prefill.trim()}\n` : ""));
    setColor(note?.color ?? "YELLOW");
    setShared(note?.shared ?? false);
  }, [open, note, prefill]);

  async function save() {
    if (busy || readOnly) return;
    const text = body.trim();
    if (!text) {
      setError("Write something on the note.");
      return;
    }
    setBusy("save");
    setError(null);
    const res = isNew
      ? await postJson<{ note: StickyNoteDTO }>("/api/app/notes", { body: text, color, shared })
      : await postJson<{ note: StickyNoteDTO }>(`/api/app/notes/${note!.id}`, {
          body: text,
          color,
          ...(note!.authorId === meId && shared !== note!.shared ? { shared } : {}),
        }, "PATCH");
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
    // A new note is saved first so the task has something to come from
    let id = note?.id ?? null;
    if (!id) {
      const text = body.trim();
      if (!text) {
        setError("Write something on the note.");
        return;
      }
      setBusy("task");
      const created = await postJson<{ note: StickyNoteDTO }>("/api/app/notes", { body: text, color, shared });
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
    await alertSheet({
      title: "Task added",
      message: `"${res.data.task.title}" is on your list under Tasks. The note stays here.`,
    });
  }

  async function remove() {
    if (!note || busy) return;
    const ok = await confirmSheet({
      title: "Take this note down?",
      message: note.shared ? "It comes off the team board for everyone." : "It's gone for good.",
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

        <div className={`ds-sticky-${color.toLowerCase()}`}>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value.slice(0, STICKY_BODY_MAX))}
            readOnly={readOnly}
            maxLength={STICKY_BODY_MAX}
            placeholder="Call the supplier Monday…"
            aria-label="Note"
            autoFocus={!readOnly}
            className="ds-sticky-input"
          />
        </div>

        {!readOnly && (
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2" role="radiogroup" aria-label="Paper color">
              {STICKY_COLORS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={color === c.key}
                  aria-pressed={color === c.key}
                  aria-label={c.label}
                  title={c.label}
                  onClick={() => setColor(c.key)}
                  className={`ds-sticky-dot ds-sticky-${c.key.toLowerCase()}`}
                />
              ))}
            </div>
            <span className="ds-small">{body.length}/{STICKY_BODY_MAX}</span>
          </div>
        )}

        {!readOnly && canPin && (!note || note.authorId === meId) && (
          <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--ds-ink)]">
            <input
              type="checkbox"
              checked={shared}
              onChange={(e) => setShared(e.target.checked)}
              className="h-4 w-4 rounded accent-[color:var(--ds-primary)]"
            />
            <Users size={14} className="text-[color:var(--ds-muted)]" aria-hidden />
            Pin to the team board
            <InfoTip>Everyone in the company sees it on their Home. Each person can slide it around their own board.</InfoTip>
          </label>
        )}

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
