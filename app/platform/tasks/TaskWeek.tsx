"use client";

import Monogram from "@/components/Monogram";
import type { TaskDTO } from "@/lib/tasks-shared";

/**
 * Tasks page picture (2026-11-23): the week ahead. A pile for what's
 * overdue, then today and the next six days; each task due that day stands
 * in its column as the monogram of whoever it's for (a high-priority one
 * gets a warn ring). Tap one to open it. Later and undated tasks are named
 * in the title line. Shaped by the list itself, like the Jobs week.
 * Styles: app/ds-clients.css (.ds-tweek*).
 */

const SHOW = 4;

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return t.toISOString().slice(0, 10);
}

function dayParts(ymd: string) {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  return {
    dow: t.toLocaleDateString("en-US", { weekday: "short", timeZone: "UTC" }),
    long: t.toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric", timeZone: "UTC" }),
    date: d,
  };
}

export default function TaskWeek({
  tasks,
  today,
  onOpen,
  showWho,
}: {
  tasks: TaskDTO[];
  today: string;
  onOpen: (t: TaskDTO) => void;
  /** Team view: the circle is whoever the task is for; on My tasks (always
   *  you) it's the client the task is about, or a plain dot. */
  showWho: boolean;
}) {
  const open = tasks.filter((t) => !t.doneAt);
  const overdue = open.filter((t) => t.bucket === "overdue");
  const days = Array.from({ length: 7 }, (_, k) => addDays(today, k));
  const lastDay = days[6];
  const later = open.filter((t) => t.bucket !== "overdue" && t.dueDate && t.dueDate > lastDay).length;
  const undated = open.filter((t) => !t.dueDate).length;
  const dueToday = open.filter((t) => t.bucket !== "overdue" && t.dueDate === today).length;

  const columns: { key: string; dow: string; date: string; long: string; rows: TaskDTO[]; cls: string }[] = [
    { key: "overdue", dow: "Overdue", date: "", long: "Overdue", rows: overdue, cls: "is-overdue" },
    ...days.map((ymd, k) => {
      const p = dayParts(ymd);
      return {
        key: ymd,
        dow: k === 0 ? "Today" : p.dow,
        date: String(p.date),
        long: k === 0 ? `Today, ${p.long}` : p.long,
        rows: open.filter((t) => t.bucket !== "overdue" && t.dueDate === ymd),
        cls: k === 0 ? "is-today" : "",
      };
    }),
  ];

  const extra = [later ? `${later} later` : null, undated ? `${undated} with no date` : null].filter(Boolean).join(" · ");

  return (
    <section className="ds-pic ds-rise mb-5 lg:mb-6" style={{ "--ds-i": 1 } as React.CSSProperties}>
      <div className="ds-pic-head">
        <h2 className="ds-pic-title">
          {open.length === 0 ? (
            "Nothing left on the list"
          ) : (
            <>
              <b>{dueToday}</b> due today
              {overdue.length > 0 && (
                <>
                  {" "}
                  · <span className="ds-pic-bad">{overdue.length} overdue</span>
                </>
              )}
              {extra && <span className="ds-pic-quiet"> · {extra}</span>}
            </>
          )}
        </h2>
      </div>
      <ol className="ds-tweek" aria-label="Open tasks by due day">
        {columns.map((c, k) => {
          const more = c.rows.length - Math.min(SHOW, c.rows.length);
          return (
            <li
              key={c.key}
              className={`ds-tweek-day ${c.cls} ${c.rows.length ? "has-tasks" : ""}`}
              title={`${c.long}: ${c.rows.length} ${c.rows.length === 1 ? "task" : "tasks"}`}
              style={{ "--k": k } as React.CSSProperties}
            >
              <span className="ds-tweek-stack">
                {more > 0 && <span className="ds-tweek-more">+{more}</span>}
                {c.rows.slice(0, SHOW).map((t, j) => {
                  const who = showWho ? t.assigneeName : t.links.find((l) => l.kind === "contact")?.label;
                  return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => onOpen(t)}
                    className={`ds-tweek-task ${t.priority === "HIGH" ? "is-high" : ""}`}
                    title={who ? `${t.title} · ${who}` : t.title}
                    aria-label={`Open task: ${t.title}`}
                    style={{ "--j": j } as React.CSSProperties}
                  >
                    {who ? <Monogram name={who} size={28} /> : <span className="ds-tweek-dot" />}
                  </button>
                  );
                })}
              </span>
              <span className="ds-tweek-track" aria-hidden />
              <span className="ds-tweek-dow">{c.dow}</span>
              <span className="ds-tweek-date">{c.date || " "}</span>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
