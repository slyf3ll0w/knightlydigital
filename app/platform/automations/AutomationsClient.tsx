"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, ChevronRight, Pause, Play, Plus, Sparkles, Trash2, X } from "lucide-react";
import TitleSentinel from "@/components/TitleSentinel";
import { Chip, DsPage, PageHeader } from "@/components/ds";
import BottomSheet from "@/components/BottomSheet";
import SwipeRow from "@/components/SwipeRow";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { ENTITY_PATH, describeAutomation } from "@/lib/automations";
import AutomationBuildPanel from "./AutomationBuildPanel";
import Flow, { type FlowNode } from "./Flow";
import { ago, runDot, type Draft, type Row, type Run } from "./types";

/**
 * The Automations list. Every rule is drawn as its own little flow (trigger →
 * wait → action, the same pieces the card builder makes) with a real on/off
 * switch and its last few runs as dots. Desktop links into the card builder;
 * phones get swipe rows, a detail sheet in plain English, and Atlas as the
 * only way to create or change a rule on a phone (the cards are a desktop
 * thing).
 */

/** Starting points for an empty list: drawn as flows, each one hands its sentence to Atlas. */
const EXAMPLES: { ask: string; flow: FlowNode[] }[] = [
  {
    ask: "When a quote has sat unanswered for 5 days, email the client a friendly nudge and notify me.",
    flow: [
      { kind: "trigger", text: "a quote is sent" },
      { kind: "wait", text: "Wait 5 days" },
      { kind: "filter", text: "Only if it's still unanswered" },
      { kind: "action", text: "Email the client a friendly nudge" },
      { kind: "action", text: "Notify me" },
    ],
  },
  {
    ask: "When a job is marked complete, wait a day, then send the client a review request.",
    flow: [
      { kind: "trigger", text: "a job is marked complete" },
      { kind: "wait", text: "Wait 1 day" },
      { kind: "action", text: "Send the client a review request" },
    ],
  },
  {
    ask: "When an invoice is 10 days overdue and over $500, notify the managers.",
    flow: [
      { kind: "trigger", text: "an invoice is 10 days overdue" },
      { kind: "filter", text: "Only if it's over $500" },
      { kind: "action", text: "Notify the managers" },
    ],
  },
  {
    ask: "When a call is missed, text the caller that we'll ring back within the hour.",
    flow: [
      { kind: "trigger", text: "a call is missed" },
      { kind: "action", text: "Text the caller we'll ring back within the hour" },
    ],
  },
];

type Filter = "all" | "live" | "paused";

function flowOf(r: Row): FlowNode[] {
  if (!r.summary) return [];
  return [{ kind: "trigger", text: r.summary.trigger }, ...r.summary.steps];
}

function firedLine(a: Row): string {
  const parts = [a.runs === 0 ? "Hasn't run yet" : `Ran ${a.runs} ${a.runs === 1 ? "time" : "times"}`];
  if (a.lastRunAt) parts.push(`last ${ago(a.lastRunAt)}`);
  if ((a.waiting ?? 0) > 0) parts.push(`${a.waiting} waiting`);
  return parts.join(" · ");
}

/** A real on/off switch (role="switch"); the label says what it is now. */
function OnSwitch({ on, disabled, onChange, name }: { on: boolean; disabled?: boolean; onChange: (v: boolean) => void; name: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={on ? `Pause ${name}` : `Turn on ${name}`}
      title={on ? "On: click to pause" : "Paused: click to turn on"}
      disabled={disabled}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!on);
      }}
      className={`auto-switch ${on ? "is-on" : ""}`}
    >
      <span className="auto-switch-track" aria-hidden>
        <span className="auto-switch-thumb" />
      </span>
      <span className="auto-switch-word">{on ? "On" : "Paused"}</span>
    </button>
  );
}

/** The last few runs, oldest → newest, as dots: green ran, amber waiting, red failed, grey skipped. */
function RunDots({ runs }: { runs: Run[] }) {
  if (runs.length === 0) return null;
  const last = runs.slice(0, 8).reverse();
  return (
    <span className="auto-runs" aria-label={`Last ${last.length} runs`}>
      {last.map((r) => (
        <span key={r.id} className={`auto-run ${runDot(r.status)}`} title={`${r.detail || r.event} · ${ago(r.createdAt)}`} />
      ))}
    </span>
  );
}

export default function AutomationsClient({ automations: initial, recentRuns }: { automations: Row[]; recentRuns: Run[] }) {
  const router = useRouter();
  const atlas = useAssistant();
  const [rows, setRows] = useState<Row[]>(initial);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showRuns, setShowRuns] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [detail, setDetail] = useState<Row | null>(null);
  const [creating, setCreating] = useState(false);
  const [creatingAsk, setCreatingAsk] = useState("");
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);
  // An Atlas draft waiting on "Turn it on" / "Save changes" is unsaved work
  useUnsavedWarning(pendingDraft !== null, {
    title: "Leave without saving?",
    message: `The automation ${atlas.name} drafted hasn't been saved yet — it will be lost.`,
  });

  const nameOf = useMemo(() => new Map(rows.map((a) => [a.id, a.name])), [rows]);
  const runsOf = useMemo(() => {
    const m = new Map<string, Run[]>();
    for (const r of recentRuns) m.set(r.automationId, [...(m.get(r.automationId) ?? []), r]);
    return m;
  }, [recentRuns]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "live" ? r.isActive : !r.isActive));
  const liveCount = rows.filter((r) => r.isActive && !r.broken).length;

  async function setActive(a: Row, isActive: boolean) {
    setBusy(a.id);
    setError("");
    hapticImpact("LIGHT");
    const { ok, data } = await postJson(`/api/app/automations/${a.id}`, { isActive }, "PATCH");
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setRows((rs) => rs.map((r) => (r.id === a.id ? { ...r, isActive } : r)));
    setDetail((d) => (d && d.id === a.id ? { ...d, isActive } : d));
    router.refresh();
  }

  async function remove(a: Row) {
    if (
      !(await confirmSheet({
        title: `Delete "${a.name}"?`,
        message: "It stops immediately and its run history goes with it. Anything it already did (emails, notes, moves) stays.",
        confirmLabel: "Delete automation",
        destructive: true,
      }))
    )
      return;
    setBusy(a.id);
    setError("");
    const { ok, data } = await postJson(`/api/app/automations/${a.id}`, undefined, "DELETE");
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticNotify("SUCCESS");
    setRows((rs) => rs.filter((r) => r.id !== a.id));
    setDetail(null);
    router.refresh();
  }

  /** Phone create: Atlas drafted it → show the summary → "Turn it on". */
  async function createFromDraft(d: Draft) {
    setBusy("new");
    setError("");
    const { ok, data } = await postJson<Row>("/api/app/automations", { name: d.name, description: d.description || null, spec: d.spec });
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticNotify("SUCCESS");
    setPendingDraft(null);
    setCreating(false);
    setRows((rs) => [data, ...rs]);
    router.refresh();
  }

  /** Phone change: Atlas drafted a new version of an existing rule. */
  async function saveDraftTo(a: Row, d: Draft) {
    setBusy(a.id);
    setError("");
    const { ok, data } = await postJson<Row>(`/api/app/automations/${a.id}`, { name: d.name, description: d.description || null, spec: d.spec }, "PATCH");
    setBusy(null);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticNotify("SUCCESS");
    setPendingDraft(null);
    setRows((rs) => rs.map((r) => (r.id === a.id ? data : r)));
    setDetail(data);
    router.refresh();
  }

  function openCreate(ask = "") {
    hapticImpact("MEDIUM");
    setCreatingAsk(ask);
    setCreating(true);
  }

  function DesktopCard({ a }: { a: Row }) {
    const nodes = flowOf(a);
    return (
      <article className={`auto-card ${a.isActive ? "" : "is-paused"} ${a.broken ? "is-broken" : ""}`}>
        <div className="auto-card-head">
          <Link href={`/app/automations/${a.id}`} prefetch={false} className="auto-card-name">
            {a.name}
            <ChevronRight size={15} strokeWidth={2.4} aria-hidden />
          </Link>
          {a.broken && <Chip tone="bad">Needs rebuilding</Chip>}
          <span className="ml-auto flex items-center gap-1">
            <button type="button" disabled={busy === a.id} onClick={() => void remove(a)} aria-label="Delete" title="Delete" className="auto-del">
              <Trash2 size={15} />
            </button>
            <OnSwitch on={a.isActive} disabled={busy === a.id || a.broken} onChange={(v) => void setActive(a, v)} name={a.name} />
          </span>
        </div>
        {nodes.length > 0 ? (
          <Link href={`/app/automations/${a.id}`} prefetch={false} className="block" tabIndex={-1} aria-hidden>
            {/* Flush (2026-11-23): steps sit in four fixed columns so every card is the same height and step 1, 2, 3 line up down the page */}
            <Flow nodes={nodes} paused={!a.isActive} className="is-grid" max={nodes.length > 4 ? 3 : undefined} />
          </Link>
        ) : (
          <p className="ds-small mt-2">This rule needs rebuilding in the builder.</p>
        )}
        <div className="auto-card-foot">
          <RunDots runs={runsOf.get(a.id) ?? []} />
          <span>{firedLine(a)}</span>
          {a.description && <span className="auto-card-desc">· {a.description}</span>}
        </div>
      </article>
    );
  }

  function PhoneRow({ a }: { a: Row }) {
    const nodes = flowOf(a);
    return (
      <SwipeRow
        actions={[
          { key: "toggle", label: a.isActive ? "Pause" : "Resume", icon: a.isActive ? Pause : Play, bg: "var(--ds-muted)", onClick: () => void setActive(a, !a.isActive) },
          { key: "delete", label: "Delete", icon: Trash2, bg: "var(--ds-bad)", onClick: () => void remove(a) },
        ]}
      >
        <div
          role="button"
          tabIndex={0}
          onClick={() => { hapticImpact("LIGHT"); setDetail(a); }}
          onKeyDown={(e) => e.key === "Enter" && setDetail(a)}
          className={`auto-card is-phone ${a.isActive ? "" : "is-paused"} ${a.broken ? "is-broken" : ""}`}
        >
          <div className="auto-card-head">
            <span className="auto-card-name">{a.name}</span>
            <span className="ml-auto">
              <OnSwitch on={a.isActive} disabled={busy === a.id || a.broken} onChange={(v) => void setActive(a, v)} name={a.name} />
            </span>
          </div>
          {nodes.length > 0 ? <Flow nodes={nodes} paused={!a.isActive} max={3} /> : <p className="ds-small mt-1 text-[color:var(--ds-bad)]">Needs rebuilding</p>}
          <div className="auto-card-foot">
            <RunDots runs={runsOf.get(a.id) ?? []} />
            <span>{firedLine(a)}</span>
          </div>
        </div>
      </SwipeRow>
    );
  }

  const empty = (
    <div className="auto-empty">
      <div>
        <h2 className="auto-empty-title">No automations yet</h2>
        <p className="ds-small mt-1 max-w-md">
          &ldquo;When this happens, do that&rdquo; rules that run on their own. Start from one of these, or describe your own.
        </p>
      </div>
      <ul className="auto-examples">
        {EXAMPLES.map((e, i) => (
          <li key={e.ask} className="auto-example" style={{ ["--i" as string]: i }}>
            <Flow nodes={e.flow} className="is-grid" max={e.flow.length > 4 ? 3 : undefined} />
            {atlas.available ? (
              <>
                <Link href={`/app/automations/new?atlas=1&ask=${encodeURIComponent(e.ask)}`} prefetch={false} className="auto-example-go hidden lg:inline-flex">
                  Start from this <ArrowRight size={14} strokeWidth={2.4} />
                </Link>
                <button type="button" onClick={() => openCreate(e.ask)} className="auto-example-go inline-flex lg:hidden">
                  Start from this <ArrowRight size={14} strokeWidth={2.4} />
                </button>
              </>
            ) : (
              <p className="ds-small">&ldquo;{e.ask}&rdquo;</p>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Link href="/app/automations/new" prefetch={false} className="btn-primary hidden lg:inline-flex">
          <Plus size={15} /> Build one
        </Link>
        {atlas.available && (
          <>
            <Link href="/app/automations/new?atlas=1" prefetch={false} className="btn-tool-line hidden h-10 items-center gap-1.5 px-4 text-sm font-medium lg:inline-flex">
              <Sparkles size={15} /> Ask {atlas.name}
            </Link>
            <button type="button" onClick={() => openCreate()} className="btn-primary inline-flex lg:hidden">
              <Sparkles size={15} /> Ask {atlas.name}
            </button>
          </>
        )}
      </div>
    </div>
  );

  const pausedCount = rows.filter((r) => !r.isActive).length;
  const liveTab = rows.filter((r) => r.isActive).length;
  const autoInfo = "“When this happens, do that” rules that run on their own. Each fires at most once per record, never moves money, and pauses with one tap.";
  // The builder is a desk tool: at a desk the header opens it; on a phone
  // New automation opens the Atlas sheet (as the phone + always did)
  const deskActions = (
    <>
      <span className="hidden lg:contents">
        {atlas.available && (
          <Link href="/app/automations/new?atlas=1" prefetch={false} className="ds-btn ds-btn-outline">
            <Sparkles size={15} /> Ask {atlas.name}
          </Link>
        )}
        <Link href="/app/automations/new" prefetch={false} className="ds-btn ds-btn-primary">
          <Plus size={15} /> New automation
        </Link>
      </span>
      {atlas.available && (
        <button type="button" onClick={() => openCreate()} className="ds-btn ds-btn-primary lg:hidden">
          <Plus size={15} /> New automation
        </button>
      )}
    </>
  );
  return (
    <DsPage
      open
      className="rx-phone lg:max-w-5xl"
      header={
        <div>
          <PageHeader
            eyebrow={
              rows.length > 0
                ? `${liveCount} ${liveCount === 1 ? "rule" : "rules"} on${pausedCount ? ` · ${pausedCount} paused` : ""} · each runs once per record`
                : "When this happens, do that"
            }
            title="Automations"
            info={autoInfo}
            actions={deskActions}
          />
        </div>
      }
    >
      <span className="hidden"><TitleSentinel title="Automations" /></span>

      {error && (
        <div role="alert" className="form-error mb-4 mt-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-[color:var(--ds-bad)] opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {rows.length > 0 && (
        <nav className="tl-tabs flex" aria-label="Show">
          {([
            ["all", "All", rows.length],
            ["live", "On", liveTab],
            ["paused", "Paused", pausedCount],
          ] as [Filter, string, number][]).map(([k, label, n]) => (
            <button key={k} type="button" onClick={() => { hapticImpact("LIGHT"); setFilter(k); }} className={`tl-tab ${filter === k ? "is-on" : ""}`} aria-pressed={filter === k}>
              {label}
              <span className="tl-tab-n">{n}</span>
            </button>
          ))}
        </nav>
      )}

      <div className="mb-6 mt-3 lg:mt-6">
        {rows.length === 0 ? (
          empty
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-[color:var(--ds-muted)]">Nothing {filter}.</p>
        ) : (
          <>
            {/* phone list first: specs take the first visible match */}
            <div className="auto-list auto-list-phone flex flex-col lg:hidden">{shown.map((a) => <PhoneRow key={a.id} a={a} />)}</div>
            <div className="auto-list hidden lg:flex lg:flex-col">{shown.map((a) => <DesktopCard key={a.id} a={a} />)}</div>
          </>
        )}
      </div>

      {recentRuns.length > 0 && (
        <section className="auto-activity">
          <button type="button" onClick={() => setShowRuns((v) => !v)} className="auto-activity-toggle" aria-expanded={showRuns}>
            <ChevronRight size={15} strokeWidth={2.4} className={`transition-transform ${showRuns ? "rotate-90" : ""}`} aria-hidden />
            Recent activity <span className="ds-small font-normal">· {recentRuns.length}</span>
          </button>
          {showRuns && (
            <ol className="auto-timeline">
              {recentRuns.map((r) => (
                <li key={r.id} className="auto-timeline-row">
                  <span className={`auto-timeline-dot ${runDot(r.status)}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-[color:var(--ds-ink)]">
                      <span className="font-semibold">{nameOf.get(r.automationId) ?? "Deleted rule"}</span> · {r.event} ·{" "}
                      {ENTITY_PATH[r.entityType as keyof typeof ENTITY_PATH] ? (
                        <Link href={`${ENTITY_PATH[r.entityType as keyof typeof ENTITY_PATH]}/${r.entityId.split(":")[0]}`} className="underline decoration-[color:var(--ds-line-strong)] underline-offset-2 hover:decoration-current">{r.entityType}</Link>
                      ) : (
                        r.entityType
                      )}
                    </p>
                    {r.detail && <p className="ds-small">{r.detail}</p>}
                  </div>
                  <span className="ds-small shrink-0 tabular-nums">{ago(r.createdAt)}</span>
                </li>
              ))}
            </ol>
          )}
        </section>
      )}

      {/* ── phone: detail sheet ─────────────────────────────────────────── */}
      <BottomSheet open={detail !== null} onClose={() => { setDetail(null); setPendingDraft(null); }} title={detail?.name} closeButton>
        {detail && (
          <div className="max-h-[78dvh] overflow-y-auto px-5 pb-2">
            <div className="mb-4 flex items-center gap-3">
              <OnSwitch on={detail.isActive} disabled={busy === detail.id || detail.broken} onChange={(v) => void setActive(detail, v)} name={detail.name} />
              <span className="ds-small">{firedLine(detail)}</span>
              <button type="button" disabled={busy === detail.id} onClick={() => void remove(detail)} aria-label="Delete" className="ml-auto rounded-full p-2 text-[color:var(--ds-bad)] active:bg-[color:var(--ds-bad-soft)]"><Trash2 size={16} /></button>
            </div>

            {pendingDraft ? (
              <div className="ds-card p-3">
                <p className="auto-sheet-label">New version</p>
                <PlainSteps spec={pendingDraft} />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy === detail.id} onClick={() => void saveDraftTo(detail, pendingDraft)} className="btn-primary flex-1 justify-center">Save changes</button>
                  <button type="button" onClick={() => setPendingDraft(null)} className="btn-tool-line h-10 px-4 text-sm">Discard</button>
                </div>
              </div>
            ) : (detail.summary?.steps ?? []).length === 0 ? (
              <p className="text-sm text-[color:var(--ds-bad)]">This rule needs rebuilding.</p>
            ) : (
              <Flow nodes={flowOf(detail)} layout="column" paused={!detail.isActive} />
            )}

            {atlas.available && !pendingDraft && (
              <div className="mt-5">
                <p className="auto-sheet-label">Change with {atlas.name}</p>
                <AutomationBuildPanel
                  compact
                  current={{ name: detail.name, description: detail.description ?? "", spec: detail.spec }}
                  onDraft={(d) => setPendingDraft(d)}
                  placeholder="e.g. also text them two days later if they still haven't answered"
                />
              </div>
            )}

            {(runsOf.get(detail.id) ?? []).length > 0 && (
              <div className="mt-5">
                <p className="auto-sheet-label">Run history</p>
                <ol className="auto-timeline">
                  {(runsOf.get(detail.id) ?? []).slice(0, 10).map((r) => (
                    <li key={r.id} className="auto-timeline-row">
                      <span className={`auto-timeline-dot ${runDot(r.status)}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[color:var(--ds-ink)]">{r.detail || r.event}</span>
                      <span className="ds-small shrink-0">{ago(r.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              </div>
            )}
            <p className="ds-small mt-4 text-center">Edit the cards on a desktop.</p>
          </div>
        )}
      </BottomSheet>

      {/* ── phone: create with Atlas ─────────────────────────────────────── */}
      <BottomSheet open={creating} onClose={() => { setCreating(false); setPendingDraft(null); }} title="New automation" closeButton>
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-2">
          {pendingDraft && !detail ? (
            <div>
              <p className="text-[15px] font-semibold text-[color:var(--ds-ink)]">{pendingDraft.name}</p>
              {pendingDraft.description && <p className="ds-small mb-2">{pendingDraft.description}</p>}
              <PlainSteps spec={pendingDraft} />
              {pendingDraft.notes.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-[color:var(--ds-warn)]">{pendingDraft.notes.map((n, i) => <li key={i}>{n}</li>)}</ul>
              )}
              <div className="mt-3 flex gap-2">
                <button type="button" disabled={busy === "new"} onClick={() => void createFromDraft(pendingDraft)} className="btn-primary flex-1 justify-center">Turn it on</button>
                <button type="button" onClick={() => setPendingDraft(null)} className="btn-tool-line h-10 px-4 text-sm">Change</button>
              </div>
            </div>
          ) : (
            <>
              <AutomationBuildPanel key={creatingAsk} current={null} initialPrompt={creatingAsk} onDraft={(d) => setPendingDraft(d)} />
              <ul className="mt-3 space-y-1.5">
                {EXAMPLES.slice(0, 3).map((e) => (
                  <li key={e.ask}>
                    <button type="button" onClick={() => setCreatingAsk(e.ask)} className="auto-ask-chip">
                      &ldquo;{e.ask}&rdquo;
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </BottomSheet>
    </DsPage>
  );
}

/** A drafted rule as a vertical flow (phone sheets). */
function PlainSteps({ spec }: { spec: Draft }) {
  const d = describeAutomation(spec.spec);
  return <Flow nodes={[{ kind: "trigger", text: d.trigger }, ...d.steps]} layout="column" />;
}
