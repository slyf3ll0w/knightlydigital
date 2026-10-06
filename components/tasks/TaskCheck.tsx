"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { postJson } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import type { TaskDTO } from "@/lib/tasks";

/**
 * The tap-to-complete circle on a task row. Optimistic: it fills at once,
 * posts, and rolls back on failure. The parent hears the server's row via
 * onChange so the list can strike / drop it after a beat.
 */
export default function TaskCheck({
  task,
  onChange,
  className = "",
}: {
  task: Pick<TaskDTO, "id" | "doneAt" | "priority" | "title">;
  onChange?: (task: TaskDTO) => void;
  className?: string;
}) {
  const [done, setDone] = useState(Boolean(task.doneAt));
  const [busy, setBusy] = useState(false);
  const shown = busy ? done : Boolean(task.doneAt);

  async function toggle() {
    if (busy) return;
    const next = !shown;
    setDone(next);
    setBusy(true);
    hapticImpact(next ? "MEDIUM" : "LIGHT");
    const res = await postJson<{ task: TaskDTO }>(`/api/app/tasks/${task.id}/done`, { done: next });
    setBusy(false);
    if (!res.ok || !res.data?.task) {
      setDone(!next);
      hapticNotify("ERROR");
      return;
    }
    onChange?.(res.data.task);
  }

  return (
    <span className={`ds-task-hit ${className}`}>
      <button
        type="button"
        className="ds-task-check"
        data-done={shown ? "true" : "false"}
        data-priority={task.priority}
        aria-pressed={shown}
        aria-label={shown ? `Mark "${task.title}" not done` : `Mark "${task.title}" done`}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void toggle();
        }}
      >
        <Check size={13} strokeWidth={3} aria-hidden />
      </button>
    </span>
  );
}
