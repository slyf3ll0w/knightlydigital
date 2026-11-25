"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Bell, Check, ChevronRight, Flag, Pencil, Plus, RotateCcw, Trash2, Users } from "lucide-react";
import { Button, Card, DsPage, Hint, PageHeader } from "@/components/ds";
import TitleSentinel from "@/components/TitleSentinel";
import SwipeRow from "@/components/SwipeRow";
import RowActions from "@/components/QuickMenu";
import TaskCheck from "@/components/tasks/TaskCheck";
import TaskEditor, { type TeamMember } from "@/components/tasks/TaskEditor";
import TaskDetail from "@/components/tasks/TaskDetail";
import { alertSheet, confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact } from "@/lib/haptics";
import Monogram from "@/components/Monogram";
import TaskWeek from "./TaskWeek";
import {
  TASK_BUCKET_LABELS,
  TASK_BUCKET_ORDER,
  type TaskBucket,
  type TaskDTO,
  type TaskPrefill,
  type TaskView,
} from "@/lib/tasks-shared";

const DONE_LINGER_MS = 650;

/**
 * /app/tasks — My tasks / Team / Done. Desktop: a grouped list (Overdue ·
 * Today · Tomorrow · Later · No date) with the check circle on every row.
 * Phone: the same groups as an iOS-Reminders-style list; tap the circle to
 * finish, swipe left for Done / Delete, tap the row to edit. Tabs are links
 * (the server renders each view) so the back button and deep links work.
 */
export default function TasksClient({
  view,
  initial,
  counts,
  team,
  meId,
  canAssign,
  openTaskId,
  prefill,
  today,
}: {
  view: TaskView;
  initial: TaskDTO[];
  counts: { mine: number; team: number };
  team: TeamMember[];
  meId: string;
  canAssign: boolean;
  openTaskId: string | null;
  prefill: TaskPrefill | null;
  /** YYYY-MM-DD in the company's zone (the week picture starts here). */
  today: string;
}) {
  const router = useRouter();
  // Done tab: my finished tasks, or (managers) the whole team's
  const doneView = view === "done" || view === "team_done";
  const [tasks, setTasks] = useState<TaskDTO[]>(initial);
  const [editor, setEditor] = useState<{ open: boolean; task: TaskDTO | null }>({ open: false, task: null });
  // A row tap or a notification lands on the details (tick it off, read the
  // notes); Edit is one step further. The editor opens straight away only
  // for a new task.
  const [detail, setDetail] = useState<{ open: boolean; task: TaskDTO | null }>({ open: false, task: null });
  // The prefill from ?new=1 is held here: the URL is cleaned right after, and
  // the editor must not reset mid-typing when the prop goes null.
  const [editorPrefill, setEditorPrefill] = useState(prefill);
  const lingering = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  // A server refresh (after a save) re-sends the list — take it.
  useEffect(() => setTasks(initial), [initial]);

  const cleanUrl = useCallback(() => {
    const url = view === "mine" ? "/app/tasks" : `/app/tasks?view=${view}`;
    try {
      window.history.replaceState(null, "", url);
    } catch {}
  }, [view]);

  // Door: ?new=1 (Create tile, quick menu, "Add task" from a record, the
  // empty list's "Add a task"). Watched, not mount-only: a door used while
  // already on this page is a soft navigation that re-renders the server page
  // with a fresh prefill but keeps this component mounted.
  useEffect(() => {
    if (!prefill) return;
    setEditorPrefill(prefill);
    setEditor({ open: true, task: null });
    cleanUrl();
  }, [prefill, cleanUrl]);

  // Door: ?task=<id> (a reminder push / bell card).
  useEffect(() => {
    if (prefill || !openTaskId) return;
    const hit = initial.find((t) => t.id === openTaskId);
    if (hit) {
      setDetail({ open: true, task: hit });
      cleanUrl();
      return;
    }
    let cancelled = false;
    fetch(`/api/app/tasks/${openTaskId}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { task?: TaskDTO } | null) => {
        if (cancelled) return;
        if (d?.task) setDetail({ open: true, task: d.task });
        cleanUrl();
      })
      .catch(() => cleanUrl());
    return () => {
      cancelled = true;
    };
    // run once per mount
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const openNew = () => {
    hapticImpact("LIGHT");
    // A plain new task: drop links left over from an earlier ?new=1 door
    setEditorPrefill(null);
    setEditor({ open: true, task: null });
  };
  const openTask = (t: TaskDTO) => {
    hapticImpact("LIGHT");
    setDetail({ open: true, task: t });
  };
  const editTask = (t: TaskDTO) => {
    setDetail((d) => ({ ...d, open: false }));
    setEditor({ open: true, task: t });
  };

  // A finished task lingers struck-through for a beat, then leaves the open
  // views; the Done view keeps it (and lets you untick it).
  const onChanged = (next: TaskDTO) => {
    setTasks((cur) => cur.map((t) => (t.id === next.id ? next : t)));
    setDetail((d) => (d.task?.id === next.id ? { ...d, task: next } : d));
    const leaving = view === "done" ? !next.doneAt : Boolean(next.doneAt);
    const prior = lingering.current.get(next.id);
    if (prior) clearTimeout(prior);
    if (leaving) {
      lingering.current.set(
        next.id,
        setTimeout(() => {
          setTasks((cur) => cur.filter((t) => t.id !== next.id));
          lingering.current.delete(next.id);
          router.refresh();
        }, DONE_LINGER_MS)
      );
    } else {
      router.refresh();
    }
  };

  const onSaved = (saved: TaskDTO[]) => {
    setDetail((d) => (d.task ? { ...d, task: saved.find((t) => t.id === d.task!.id) ?? d.task } : d));
    setTasks((cur) => {
      const byId = new Map(cur.map((t) => [t.id, t]));
      for (const t of saved) {
        const belongs =
          doneView ? Boolean(t.doneAt) : view === "team" ? !t.doneAt : !t.doneAt && t.assigneeId === meId;
        if (belongs) byId.set(t.id, t);
        else byId.delete(t.id);
      }
      return [...byId.values()];
    });
    router.refresh();
  };

  const onDeleted = (id: string) => {
    setDetail((d) => (d.task?.id === id ? { open: false, task: null } : d));
    setTasks((cur) => cur.filter((t) => t.id !== id));
    router.refresh();
  };

  // One row action at a time: a double swipe (or a right-click on top of a
  // swipe) must not post twice. A refusal is said out loud, never swallowed.
  const acting = useRef(false);
  const fail = (data: { error?: string } | null | undefined) =>
    alertSheet({ title: "That didn't go through", message: data?.error ?? GENERIC_ERROR });

  const remove = async (t: TaskDTO) => {
    if (acting.current) return;
    const ok = await confirmSheet({
      title: "Delete this task?",
      message: `"${t.title}" will be removed for good.`,
      confirmLabel: "Delete task",
      destructive: true,
    });
    if (!ok || acting.current) return;
    acting.current = true;
    const res = await postJson(`/api/app/tasks/${t.id}`, undefined, "DELETE");
    acting.current = false;
    if (!res.ok) {
      await fail(res.data);
      return;
    }
    onDeleted(t.id);
  };

  const quickDone = async (t: TaskDTO) => {
    if (acting.current) return;
    acting.current = true;
    hapticImpact("MEDIUM");
    const res = await postJson<{ task: TaskDTO }>(`/api/app/tasks/${t.id}/done`, { done: !t.doneAt });
    acting.current = false;
    if (!res.ok || !res.data?.task) {
      await fail(res.data);
      return;
    }
    onChanged(res.data.task);
  };

  // ── Grouping ──────────────────────────────────────────────────────────
  const groups = useMemo(() => {
    if (doneView) return tasks.length ? [{ key: "done" as const, label: "Done", rows: tasks }] : [];
    const by = new Map<TaskBucket, TaskDTO[]>();
    for (const t of tasks) {
      const list = by.get(t.bucket) ?? [];
      list.push(t);
      by.set(t.bucket, list);
    }
    return TASK_BUCKET_ORDER.filter((k) => by.has(k)).map((k) => ({ key: k, label: TASK_BUCKET_LABELS[k], rows: by.get(k)! }));
  }, [tasks, view, doneView]);

  const tabs: { key: TaskView; label: string; count?: number }[] = [
    { key: "mine", label: "My tasks", count: counts.mine },
    ...(canAssign ? [{ key: "team" as const, label: "Team", count: counts.team }] : []),
    { key: "done", label: "Done" },
  ];
  const hrefFor = (k: TaskView) => (k === "mine" ? "/app/tasks" : `/app/tasks?view=${k}`);
  const tabActive = (k: TaskView) => (k === "done" ? doneView : view === k);
  // Under Done, managers pick whose finished tasks: their own or the team's
  // (same flag as the Team tab, so it hides when that does)
  const doneScopes: { key: TaskView; label: string }[] = [
    { key: "done", label: "Mine" },
    { key: "team_done", label: "Team" },
  ];

  const pageInfo =
    "Your own tasks, with a due time and a reminder if you want one. " +
    (canAssign
      ? "Owners and admins can hand a task to anyone on the team and see everyone's open tasks under Team (and their finished ones under Done → Team). "
      : "") +
    "Reminders arrive as a push and in the bell — or by email when none of your devices has notifications on; due-today and overdue tasks also show on Home.";

  const empty = (
    <Card>
      {view === "team_done" ? (
        <Hint title="Nobody has finished a task yet." />
      ) : view === "done" ? (
        <Hint title="Nothing finished yet." />
      ) : view === "team" ? (
        <Hint title="Nobody has an open task." action={{ href: "/app/tasks?new=1", label: "Give someone a task", icon: Plus }} />
      ) : (
        <Hint title="Nothing on your list." action={{ href: "/app/tasks?new=1", label: "Add a task", icon: Plus }} />
      )}
    </Card>
  );

  const subFor = (t: TaskDTO) =>
    [
      t.dueLabel,
      view === "done" && t.doneLabel ? `Done ${t.doneLabel}` : null,
      ...t.links.map((l) => l.label),
      view === "team" || (doneView && t.assigneeId !== meId) ? t.assigneeName : null,
    ]
      .filter(Boolean)
      .join(" · ");

  const titleEl = (t: TaskDTO) => (
    <span className="flex min-w-0 items-center gap-1.5">
      <span className={`truncate text-[14.5px] font-medium text-[color:var(--ds-ink)] ${t.doneAt ? "ds-task-done" : ""}`}>{t.title}</span>
      {t.priority === "HIGH" && !t.doneAt && (
        <Flag size={13} className="shrink-0 text-[color:var(--ds-warn)]" aria-label="High priority" />
      )}
      {t.remindAt && !t.doneAt && (
        <Bell size={12} className="shrink-0 text-[color:var(--ds-faint)]" aria-hidden />
      )}
    </span>
  );

  // Right-click (desktop) opens the same short menu the sibling lists have
  const desktopRow = (t: TaskDTO) => (
    <RowActions
      key={t.id}
      title={t.title}
      actions={[
        {
          key: "done",
          label: t.doneAt ? "Mark not done" : "Mark done",
          icon: t.doneAt ? RotateCcw : Check,
          onSelect: () => quickDone(t),
        },
        { key: "edit", label: "Edit", icon: Pencil, onSelect: () => editTask(t) },
        { key: "delete", label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(t) },
      ]}
    >
      <div className={`ds-row ds-trow-task items-center ${leavingNow(t) ? "is-leaving" : ""}`}>
        <TaskCheck task={t} onChange={onChanged} />
        <button type="button" onClick={() => openTask(t)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <span className="min-w-0 flex-1">
            {titleEl(t)}
            {subFor(t) && <span className="ds-small mt-0.5 block truncate">{subFor(t)}</span>}
          </span>
          <ChevronRight size={16} className="shrink-0 text-[color:var(--ds-faint)]" aria-hidden />
        </button>
      </div>
    </RowActions>
  );

  const phoneRow = (t: TaskDTO) => (
    <SwipeRow
      key={t.id}
      actions={[
        {
          key: "done",
          label: t.doneAt ? "Undo" : "Done",
          icon: Check,
          bg: "var(--ds-good)",
          onClick: () => void quickDone(t),
        },
        { key: "delete", label: "Delete", icon: Trash2, bg: "var(--ds-bad)", onClick: () => void remove(t) },
      ]}
    >
      <div className={`ds-row ds-trow-task items-center ${leavingNow(t) ? "is-leaving" : ""}`}>
        <TaskCheck task={t} onChange={onChanged} />
        <button type="button" onClick={() => openTask(t)} className="min-w-0 flex-1 py-0.5 text-left active:opacity-70">
          {titleEl(t)}
          {subFor(t) && <span className="ds-small mt-0.5 block truncate">{subFor(t)}</span>}
        </button>
        {(view === "team" || view === "team_done") && <Monogram name={t.assigneeName || "?"} size={26} />}
      </div>
    </SwipeRow>
  );

  // A finished (or, on Done, un-finished) task plays its exit before it leaves
  const leavingNow = (t: TaskDTO) => (doneView ? !t.doneAt : Boolean(t.doneAt));

  // Desktop board card: the check, the task, and whose it is
  const boardCard = (t: TaskDTO) => (
    <RowActions
      key={t.id}
      title={t.title}
      actions={[
        {
          key: "done",
          label: t.doneAt ? "Mark not done" : "Mark done",
          icon: t.doneAt ? RotateCcw : Check,
          onSelect: () => quickDone(t),
        },
        { key: "edit", label: "Edit", icon: Pencil, onSelect: () => editTask(t) },
        { key: "delete", label: "Delete", icon: Trash2, destructive: true, onSelect: () => remove(t) },
      ]}
    >
      <div
        className={`ds-tcard ${leavingNow(t) ? "is-leaving" : ""} ${t.priority === "HIGH" && !t.doneAt ? "is-high" : ""}`}
        data-bucket={t.bucket}
      >
        <TaskCheck task={t} onChange={onChanged} />
        <button type="button" onClick={() => openTask(t)} className="ds-tcard-body">
          <span className="ds-tcard-title">
            <span className="ds-tcard-strike">{t.title}</span>
            {t.priority === "HIGH" && !t.doneAt && (
              <Flag size={13} className="ml-1 inline shrink-0 align-[-1px] text-[color:var(--ds-warn)]" aria-label="High priority" />
            )}
            {t.remindAt && !t.doneAt && <Bell size={12} className="ml-1 inline align-[-1px] text-[color:var(--ds-faint)]" aria-hidden />}
          </span>
          {(t.dueLabel || (view === "done" && t.doneLabel)) && (
            <span className={`ds-tcard-due ${t.bucket === "overdue" && !t.doneAt ? "is-late" : ""}`}>
              {view === "done" && t.doneLabel ? `Done ${t.doneLabel}` : t.dueLabel}
            </span>
          )}
          {t.links.length > 0 && <span className="ds-tcard-links">{t.links.map((l) => l.label).join(" · ")}</span>}
        </button>
        <span className="ds-tcard-who" title={`For ${t.assigneeName}`}>
          <Monogram name={t.assigneeName || "?"} size={24} />
        </span>
      </div>
    </RowActions>
  );

  // Desktop context line (the open page): what's open and what's late
  const lateCount = tasks.filter((t) => t.bucket === "overdue" && !t.doneAt).length;
  const openNow = view === "team" ? counts.team : counts.mine;
  const contextLine = [
    `${openNow} open`,
    lateCount > 0 ? `${lateCount} overdue` : null,
    view === "team" ? "everyone" : null,
  ]
    .filter(Boolean)
    .join(" · ");
  return (
    <DsPage open className="rx-tasks rx-phone">
      <PageHeader
        eyebrow={contextLine}
        title="Tasks"
        info={pageInfo}
        actions={
          <Button icon={Plus} onClick={openNew}>
            New task
          </Button>
        }
      />
      <span className="hidden"><TitleSentinel title="Tasks" /></span>

      {/* The open page's underline tabs with counts (phones: they scroll) */}
      <div className="rx-tabsrow">
        <div className="clx-filters">
          <nav className="clx-tabs" aria-label="Show">
            {tabs.map((t) => (
              <Link
                key={t.key}
                prefetch={false}
                href={hrefFor(t.key)}
                aria-current={tabActive(t.key) ? "page" : undefined}
                className={`clx-tab ${tabActive(t.key) ? "is-on" : ""}`}
              >
                {t.key === "team" && <Users size={14} aria-hidden />}
                {t.label}
                {t.count ? <span className="clx-tab-n">{t.count.toLocaleString("en-US")}</span> : null}
              </Link>
            ))}
          </nav>
          {doneView && canAssign && (
            <span className="clx-filters-end">
              <nav className="rx-scope" aria-label="Whose">
                {doneScopes.map((sc) => (
                  <Link
                    key={sc.key}
                    prefetch={false}
                    href={hrefFor(sc.key)}
                    aria-current={view === sc.key ? "page" : undefined}
                    className={`rx-scope-btn ${view === sc.key ? "is-on" : ""}`}
                  >
                    {sc.label}
                  </Link>
                ))}
              </nav>
            </span>
          )}
        </div>
      </div>

      {!doneView && tasks.length > 0 && (
        <div className="mt-4 lg:mt-0">
          <TaskWeek tasks={tasks} today={today} onOpen={openTask} showWho={view === "team"} />
        </div>
      )}

      {groups.length === 0 ? (
        <div className="mt-4 lg:mt-0">{empty}</div>
      ) : !doneView ? (
        <>
          {/* Desktop: a board, one column per due group */}
          <div
            className="ds-tboard hidden lg:grid"
            style={{ "--cols": Math.min(groups.length, 5) } as React.CSSProperties}
          >
            {groups.map((g, gi) => (
              <section key={g.key} className="ds-tcol ds-rise" data-bucket={g.key} style={{ "--ds-i": gi + 2 } as React.CSSProperties}>
                <h2 className="ds-tcol-head">
                  <span>{g.label}</span>
                  <span className="ds-tcol-count">{g.rows.length}</span>
                </h2>
                <div className="ds-tcol-cards">{g.rows.map(boardCard)}</div>
              </section>
            ))}
          </div>
          {/* Phones: the grouped list, open sections (swipe a row for Done / Delete) */}
          <div className="rx-tgroups mt-6 space-y-7 lg:hidden">
            {groups.map((g, gi) => (
              <section key={g.key} className="ds-rise" style={{ "--ds-i": gi } as React.CSSProperties}>
                <h2 className="bb-h2 rx-h2">
                  <span className={`bb-h2-text ${g.key === "overdue" ? "rx-bad" : ""}`}>{g.label}</span>
                  <span className="bb-h2-n">{g.rows.length}</span>
                </h2>
                <Card className="ds-divide rx-open-card overflow-hidden">
                  <div className="divide-y divide-[color:var(--ds-line)]">{g.rows.map(phoneRow)}</div>
                </Card>
              </section>
            ))}
          </div>
        </>
      ) : (
        <div className="mt-4 space-y-6 lg:mt-0">
          {groups.map((g, gi) => (
            <section key={g.key} className="ds-rise" style={{ "--ds-i": gi } as React.CSSProperties}>
              <h2 className="mb-1.5 flex items-center gap-3 px-1 text-[13px] font-semibold text-[color:var(--ds-ink-2)] lg:mb-2 lg:px-0 lg:text-xs">
                <span className={g.key === "overdue" ? "text-[color:var(--ds-bad)]" : ""}>{g.label}</span>
                <span className="hidden h-px flex-1 bg-[color:var(--ds-line)] lg:block" aria-hidden />
                <span className="numeral-ledger ml-auto font-normal text-[color:var(--ds-faint)] lg:ml-0">{g.rows.length}</span>
              </h2>
              <Card className="ds-divide rx-open-card overflow-hidden">
                <div className="hidden lg:block lg:divide-y lg:divide-[color:var(--ds-line)]">{g.rows.map(desktopRow)}</div>
                <div className="divide-y divide-[color:var(--ds-line)] lg:hidden">{g.rows.map(phoneRow)}</div>
              </Card>
            </section>
          ))}
        </div>
      )}

      <TaskDetail
        open={detail.open}
        task={detail.task}
        meId={meId}
        onClose={() => setDetail((d) => ({ ...d, open: false }))}
        onEdit={editTask}
        onChanged={onChanged}
      />
      <TaskEditor
        open={editor.open}
        onClose={() => setEditor((e) => ({ ...e, open: false }))}
        task={editor.task}
        prefill={editor.task ? null : editorPrefill}
        team={team}
        meId={meId}
        canAssign={canAssign}
        onSaved={onSaved}
        onDeleted={onDeleted}
      />
    </DsPage>
  );
}
