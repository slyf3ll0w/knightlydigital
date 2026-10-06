"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ChevronRight, Flag } from "lucide-react";
import { Card } from "@/components/ds";
import TaskCheck from "@/components/tasks/TaskCheck";
import type { TaskDTO } from "@/lib/tasks-shared";

const DONE_LINGER_MS = 650;

/**
 * The tasks due today, on Home. A client island so the circle works from
 * the couch: tick it, the row strikes through, then leaves after a beat
 * (and the server re-renders the counts). Tapping the row opens the task
 * on the Tasks page.
 */
export default function DashboardTasks({ tasks, phone }: { tasks: TaskDTO[]; phone: boolean }) {
  const router = useRouter();
  const [rows, setRows] = useState(tasks);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  useEffect(() => setRows(tasks), [tasks]);

  const onChanged = (next: TaskDTO) => {
    setRows((cur) => cur.map((t) => (t.id === next.id ? next : t)));
    const prior = timers.current.get(next.id);
    if (prior) clearTimeout(prior);
    if (next.doneAt) {
      timers.current.set(
        next.id,
        setTimeout(() => {
          setRows((cur) => cur.filter((t) => t.id !== next.id));
          timers.current.delete(next.id);
          router.refresh();
        }, DONE_LINGER_MS)
      );
    }
  };

  if (rows.length === 0) return null;

  return (
    <Card className="ds-divide overflow-hidden">
      {rows.map((t) => (
        <div key={t.id} className="ds-row items-center">
          <TaskCheck task={t} onChange={onChanged} />
          <Link prefetch={false} href={`/app/tasks?task=${t.id}`} className="flex min-w-0 flex-1 items-center gap-3">
            <span className="min-w-0 flex-1">
              <span className="flex min-w-0 items-center gap-1.5">
                <span className={`truncate text-[14.5px] font-medium text-[color:var(--ds-ink)] ${t.doneAt ? "ds-task-done" : ""}`}>
                  {t.title}
                </span>
                {t.priority === "HIGH" && !t.doneAt && (
                  <Flag size={13} className="shrink-0 text-[color:var(--ds-warn)]" aria-label="High priority" />
                )}
              </span>
              <span className="ds-small mt-0.5 block truncate">
                {[t.allDay ? "Anytime" : t.dueLabel?.replace(/^Today · /, ""), ...t.links.map((l) => l.label)]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
            </span>
            {!phone && <ChevronRight size={16} className="shrink-0 text-[color:var(--ds-faint)]" aria-hidden />}
          </Link>
        </div>
      ))}
    </Card>
  );
}
