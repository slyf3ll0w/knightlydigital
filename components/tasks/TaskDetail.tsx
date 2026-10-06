"use client";

import { useState } from "react";
import Link from "next/link";
import { Bell, Check, Flag, Link2, Loader2, Pencil, RotateCcw, User, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Button } from "@/components/ds";
import { postJson } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import type { TaskDTO } from "@/lib/tasks-shared";

/**
 * What a task looks like when you open it (a reminder tap, a bell card, a
 * row): the details, and one big button to tick it off. Editing is a step
 * away behind Edit — a notification about "call Mrs. Patel back" should not
 * land you in a form (David 2026-10-06).
 */
export default function TaskDetail({
  open,
  task,
  meId,
  onClose,
  onEdit,
  onChanged,
}: {
  open: boolean;
  task: TaskDTO | null;
  meId: string;
  onClose: () => void;
  onEdit: (task: TaskDTO) => void;
  onChanged: (task: TaskDTO) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function toggleDone() {
    if (!task || busy) return;
    const next = !task.doneAt;
    setBusy(true);
    hapticImpact(next ? "MEDIUM" : "LIGHT");
    const res = await postJson<{ task: TaskDTO }>(`/api/app/tasks/${task.id}/done`, { done: next });
    setBusy(false);
    if (!res.ok || !res.data?.task) {
      hapticNotify("ERROR");
      return;
    }
    if (next) hapticNotify("SUCCESS");
    onChanged(res.data.task);
    if (next) onClose();
  }

  const done = Boolean(task?.doneAt);
  const who =
    task &&
    (task.assigneeId === meId
      ? task.createdById !== meId
        ? `From ${task.createdByName}`
        : null
      : `For ${task.assigneeName}${task.createdById !== meId ? ` · from ${task.createdByName}` : ""}`);

  return (
    <Modal open={open} onClose={onClose} size="md" dismissible={!busy}>
      {task && (
        <div className="space-y-4">
          <div className="flex items-start justify-between gap-3">
            <h3 className={`ds-h2 min-w-0 flex-1 ${done ? "ds-task-done" : ""}`}>{task.title}</h3>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
            >
              <X size={16} />
            </button>
          </div>

          <div className="space-y-1.5 text-[14px] text-[color:var(--ds-ink-2)]">
            {task.priority === "HIGH" && !done && (
              <p className="flex items-center gap-2">
                <Flag size={14} className="text-[color:var(--ds-warn)]" aria-hidden />
                High priority
              </p>
            )}
            {task.dueLabel && (
              <p className={task.bucket === "overdue" && !done ? "font-semibold text-[color:var(--ds-bad)]" : ""}>
                {done ? `Was due ${task.dueLabel.replace(/^Overdue · /, "")}` : `Due ${task.dueLabel.replace(/^Overdue · /, "")}`}
                {task.bucket === "overdue" && !done ? " · overdue" : ""}
              </p>
            )}
            {!task.dueLabel && !done && <p className="ds-small">No date</p>}
            {task.remindLabel && !done && (
              <p className="flex items-center gap-2">
                <Bell size={14} className="text-[color:var(--ds-faint)]" aria-hidden />
                {task.remindLabel}
              </p>
            )}
            {who && (
              <p className="flex items-center gap-2">
                <User size={14} className="text-[color:var(--ds-faint)]" aria-hidden />
                {who}
              </p>
            )}
          </div>

          {task.notes && <p className="ds-body whitespace-pre-wrap">{task.notes}</p>}

          {task.links.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <Link2 size={13} className="text-[color:var(--ds-muted)]" aria-hidden />
              {task.links.map((l) => (
                <Link
                  key={`${l.kind}-${l.id}`}
                  prefetch={false}
                  href={l.href}
                  className="rounded-full bg-[color:var(--ds-primary-soft)] px-2.5 py-1 text-[12.5px] font-medium text-[color:var(--ds-primary)] hover:underline"
                >
                  {l.label}
                </Link>
              ))}
            </div>
          )}

          <div className="flex items-center justify-between gap-3 pt-1">
            <Button variant="ghost" icon={Pencil} onClick={() => onEdit(task)} disabled={busy}>
              Edit
            </Button>
            <Button onClick={() => void toggleDone()} disabled={busy} icon={busy ? Loader2 : done ? RotateCcw : Check} size="lg">
              {done ? "Mark not done" : "Mark done"}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
