"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell, Flag, Link2, Loader2, Trash2, X } from "lucide-react";
import Modal from "@/components/Modal";
import { confirmSheet } from "@/components/ConfirmSheet";
import { inputCls } from "@/components/Input";
import { Button, InfoTip } from "@/components/ds";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { formatSlotLabel, slotTimeOptions } from "@/lib/scheduling";
import { hapticNotify } from "@/lib/haptics";
import {
  REMINDER_CHOICES,
  TASK_NOTES_MAX,
  TASK_TITLE_MAX,
  type ReminderChoice,
  type TaskDTO,
  type TaskLink,
  type TaskPrefill,
} from "@/lib/tasks-shared";

export type TeamMember = { id: string; name: string };

/**
 * The one task editor: a bottom sheet on phones, a glass card on desktop
 * (Modal does both). New or existing. Managers can hand a new task to
 * several people (one task each) and reassign an existing one; everyone
 * else only sees their own name.
 *
 * Dates are wall-clock in the company's timezone — the server parses them
 * with lib/timezone, never the browser's zone.
 */
export default function TaskEditor({
  open,
  onClose,
  task,
  prefill,
  team,
  meId,
  canAssign,
  onSaved,
  onDeleted,
}: {
  open: boolean;
  onClose: () => void;
  /** null = new task */
  task: TaskDTO | null;
  prefill?: TaskPrefill | null;
  team: TeamMember[];
  meId: string;
  canAssign: boolean;
  onSaved: (tasks: TaskDTO[], mode: "created" | "updated") => void;
  onDeleted?: (id: string) => void;
}) {
  const isNew = !task;
  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [dueTime, setDueTime] = useState("");
  const [reminder, setReminder] = useState<ReminderChoice>("none");
  const [remindDate, setRemindDate] = useState("");
  const [remindTime, setRemindTime] = useState("");
  const [high, setHigh] = useState(false);
  const [assignees, setAssignees] = useState<string[]>([meId]);
  const [links, setLinks] = useState<TaskLink[]>([]);
  const [showNotes, setShowNotes] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // (Re)load the form whenever the sheet opens for a different task
  useEffect(() => {
    if (!open) return;
    setError(null);
    setBusy(false);
    if (task) {
      setTitle(task.title);
      setNotes(task.notes ?? "");
      setDueDate(task.dueDate);
      setDueTime(task.dueTime);
      setReminder(task.reminder);
      setRemindDate(task.remindDate);
      setRemindTime(task.remindTime);
      setHigh(task.priority === "HIGH");
      setAssignees([task.assigneeId]);
      setLinks(task.links);
      setShowNotes(Boolean(task.notes));
    } else {
      setTitle(prefill?.title ?? "");
      setNotes("");
      setDueDate("");
      setDueTime("");
      setReminder("none");
      setRemindDate("");
      setRemindTime("");
      setHigh(false);
      setAssignees([meId]);
      setLinks(prefill?.links ?? []);
      setShowNotes(false);
    }
  }, [open, task, prefill, meId]);

  const slots = useMemo(() => slotTimeOptions(15, 7 * 60), []);
  // A stored off-grid time (a reminder set by Atlas, or a legacy row) stays
  // selectable so editing never silently moves it — same rule as SlotTimePicker.
  const withCurrent = (value: string) =>
    value && !slots.some((o) => o.value === value) ? [{ value, label: `${formatSlotLabel(value)} (current)` }, ...slots] : slots;
  const timeOptions = withCurrent(dueTime);
  const remindTimeOptions = withCurrent(remindTime);
  const reminderOptions = useMemo(
    () => (dueDate ? REMINDER_CHOICES : REMINDER_CHOICES.filter((c) => c.key === "none" || c.key === "custom")),
    [dueDate]
  );
  // A reminder relative to a due time makes no sense once the date is cleared
  useEffect(() => {
    if (!dueDate && reminder !== "none" && reminder !== "custom") setReminder("none");
  }, [dueDate, reminder]);

  const linkIds = (list: TaskLink[]) => ({
    contactId: list.find((l) => l.kind === "contact")?.id ?? null,
    jobId: list.find((l) => l.kind === "job")?.id ?? null,
    quoteId: list.find((l) => l.kind === "quote")?.id ?? null,
    invoiceId: list.find((l) => l.kind === "invoice")?.id ?? null,
    callId: list.find((l) => l.kind === "call")?.id ?? null,
  });

  async function save() {
    if (busy) return;
    const t = title.trim();
    if (!t) {
      setError("Give the task a title.");
      return;
    }
    if (reminder === "custom" && (!remindDate || !remindTime)) {
      setError("Pick a date and time for the reminder.");
      return;
    }
    setBusy(true);
    setError(null);
    const body = {
      title: t,
      notes: notes.trim() || null,
      dueDate: dueDate || null,
      dueTime: dueDate ? dueTime || null : null,
      reminder,
      remindDate: reminder === "custom" ? remindDate : undefined,
      remindTime: reminder === "custom" ? remindTime : undefined,
      priority: high ? "HIGH" : "NORMAL",
      ...(isNew ? linkIds(prefill?.links ?? links) : linkIds(links)),
      ...(isNew ? { assigneeIds: assignees } : canAssign ? { assigneeId: assignees[0] } : {}),
    };
    const res = isNew
      ? await postJson<{ tasks: TaskDTO[] }>("/api/app/tasks", body)
      : await postJson<{ task: TaskDTO }>(`/api/app/tasks/${task!.id}`, body, "PATCH");
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.data?.error ?? GENERIC_ERROR);
      hapticNotify("ERROR");
      return;
    }
    hapticNotify("SUCCESS");
    const saved = isNew ? (res.data as { tasks: TaskDTO[] }).tasks : [(res.data as { task: TaskDTO }).task];
    onSaved(saved, isNew ? "created" : "updated");
    onClose();
  }

  async function remove() {
    if (!task || busy) return;
    const ok = await confirmSheet({
      title: "Delete this task?",
      message: `"${task.title}" will be removed for good.`,
      confirmLabel: "Delete task",
      destructive: true,
    });
    if (!ok) return;
    setBusy(true);
    const res = await postJson(`/api/app/tasks/${task.id}`, undefined, "DELETE");
    setBusy(false);
    if (!res.ok) {
      setError(res.data?.error ?? GENERIC_ERROR);
      return;
    }
    onDeleted?.(task.id);
    onClose();
  }

  const toggleAssignee = (id: string) => {
    if (isNew) {
      setAssignees((cur) => (cur.includes(id) ? (cur.length > 1 ? cur.filter((x) => x !== id) : cur) : [...cur, id]));
    } else {
      setAssignees([id]);
    }
  };

  const labelCls = "mb-1 block text-xs font-medium text-[color:var(--ds-ink-2)]";

  return (
    <Modal open={open} onClose={onClose} size="md" dismissible={!busy}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex items-center justify-between">
          <h3 className="ds-h2">{isNew ? "New task" : "Edit task"}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-8 w-8 items-center justify-center rounded-full text-[color:var(--ds-muted)] hover:bg-[color:var(--ds-surface-2)]"
          >
            <X size={16} />
          </button>
        </div>

        <div>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={TASK_TITLE_MAX}
            placeholder="What needs doing?"
            autoFocus
            enterKeyHint="done"
            aria-label="Task"
            className={`${inputCls} text-[15px] font-medium`}
          />
        </div>

        {showNotes ? (
          <div>
            <label className={labelCls} htmlFor="task-notes">
              Notes
            </label>
            <textarea
              id="task-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              maxLength={TASK_NOTES_MAX}
              rows={3}
              className={inputCls}
              placeholder="Anything to remember"
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setShowNotes(true)}
            className="text-[13px] font-medium text-[color:var(--ds-primary)] hover:underline"
          >
            Add notes
          </button>
        )}

        <div className="grid grid-cols-[1fr_auto] gap-2">
          <div>
            <label className={labelCls} htmlFor="task-due-date">
              Due
            </label>
            <input
              id="task-due-date"
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className={inputCls}
            />
          </div>
          <div>
            <label className={labelCls} htmlFor="task-due-time">
              Time
            </label>
            <select
              id="task-due-time"
              value={dueTime}
              onChange={(e) => setDueTime(e.target.value)}
              disabled={!dueDate}
              className={`${inputCls} min-w-[120px]`}
            >
              <option value="">Anytime</option>
              {timeOptions.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className={labelCls} htmlFor="task-reminder">
            <span className="inline-flex items-center gap-1">
              <Bell size={12} aria-hidden /> Reminder
            </span>
          </label>
          <select
            id="task-reminder"
            value={reminder}
            onChange={(e) => setReminder(e.target.value as ReminderChoice)}
            className={inputCls}
          >
            {reminderOptions.map((c) => (
              <option key={c.key} value={c.key}>
                {c.label}
              </option>
            ))}
          </select>
          {reminder === "custom" && (
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <input
                type="date"
                value={remindDate}
                onChange={(e) => setRemindDate(e.target.value)}
                aria-label="Reminder date"
                className={inputCls}
              />
              <select
                value={remindTime}
                onChange={(e) => setRemindTime(e.target.value)}
                aria-label="Reminder time"
                className={`${inputCls} min-w-[120px]`}
              >
                <option value="">Time…</option>
                {remindTimeOptions.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <label className="flex cursor-pointer items-center gap-2.5 text-sm text-[color:var(--ds-ink)]">
          <input
            type="checkbox"
            checked={high}
            onChange={(e) => setHigh(e.target.checked)}
            className="h-4 w-4 rounded accent-[color:var(--ds-primary)]"
          />
          <Flag size={14} className="text-[color:var(--ds-warn)]" aria-hidden />
          High priority
        </label>

        {canAssign && team.length > 1 && (
          <div>
            <p className={`${labelCls} flex items-center gap-1`}>
              <span>{isNew ? "For" : "Assigned to"}</span>
              {isNew && <InfoTip>Pick more than one person and each gets their own copy.</InfoTip>}
            </p>
            <div className="flex flex-wrap gap-1.5">
              {team.map((u) => {
                const on = assignees.includes(u.id);
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => toggleAssignee(u.id)}
                    aria-pressed={on}
                    className={`rounded-full px-3 py-1.5 text-[13px] font-medium transition-colors ${
                      on
                        ? "bg-[color:var(--ds-primary)] text-white"
                        : "bg-[color:var(--ds-surface-2)] text-[color:var(--ds-ink-2)] hover:bg-[color:var(--ds-line)]"
                    }`}
                  >
                    {u.id === meId ? "Me" : u.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {links.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            <Link2 size={13} className="text-[color:var(--ds-muted)]" aria-hidden />
            {links.map((l) => (
              <span
                key={`${l.kind}-${l.id}`}
                className="inline-flex items-center gap-1 rounded-full bg-[color:var(--ds-surface-2)] py-1 pl-2.5 pr-1 text-[12.5px] text-[color:var(--ds-ink-2)]"
              >
                {l.label}
                <button
                  type="button"
                  aria-label={`Remove link to ${l.label}`}
                  onClick={() => setLinks((cur) => cur.filter((x) => x !== l))}
                  className="flex h-5 w-5 items-center justify-center rounded-full hover:bg-[color:var(--ds-line)]"
                >
                  <X size={11} />
                </button>
              </span>
            ))}
          </div>
        )}

        {error && (
          <p className="text-[13px] text-[color:var(--ds-bad)]" role="alert">
            {error}
          </p>
        )}

        <div className="flex items-center justify-between gap-3 pt-1">
          {!isNew ? (
            <button
              type="button"
              onClick={() => void remove()}
              disabled={busy}
              className="inline-flex items-center gap-1 text-[13px] font-medium text-[color:var(--ds-bad)] hover:underline disabled:opacity-50"
            >
              <Trash2 size={13} aria-hidden />
              Delete
            </button>
          ) : (
            <span />
          )}
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy} icon={busy ? Loader2 : undefined}>
              {isNew ? (assignees.length > 1 ? `Add ${assignees.length} tasks` : "Add task") : "Save"}
            </Button>
          </div>
        </div>
      </form>
    </Modal>
  );
}
