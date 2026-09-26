"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronRight, Pause, Play, Plus, Sparkles, Trash2, X, Zap } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import { Chip } from "@/components/ds";
import BottomSheet from "@/components/BottomSheet";
import SwipeRow from "@/components/SwipeRow";
import { SegmentedRow, Segment } from "@/components/FilterChips";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { ENTITY_PATH, describeAutomation } from "@/lib/automations";
import AutomationBuildPanel from "./AutomationBuildPanel";
import { ago, runDot, type Draft, type Row, type Run } from "./types";

/**
 * The Automations list. Desktop: a ledger of rules with pause / delete and
 * links into the card builder. Phones: iOS list rows (swipe for pause /
 * delete), a detail sheet in plain English, and Atlas as the only way to
 * create or change a rule on a phone (the cards are a desktop thing).
 */

const EXAMPLES = [
  "When a quote has sat unanswered for 5 days, email the client a friendly nudge and notify me.",
  "When a job is marked complete, wait a day, then send the client a review request.",
  "When an invoice is 10 days overdue and over $500, notify the managers.",
  "When a lead sits in the same stage for two weeks, move it to Follow-up and add a note.",
  "When a call is missed, text the caller that we'll ring back within the hour.",
  "Every Monday at 8am, email the office how many quotes are still waiting.",
];

type Filter = "all" | "live" | "paused";

function stepsWord(r: Row): string {
  const n = r.summary?.steps.filter((s) => s.kind === "action").length ?? 0;
  return `${n} step${n === 1 ? "" : "s"}`;
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
  const [pendingDraft, setPendingDraft] = useState<Draft | null>(null);

  const nameOf = useMemo(() => new Map(rows.map((a) => [a.id, a.name])), [rows]);
  const shown = rows.filter((r) => (filter === "all" ? true : filter === "live" ? r.isActive : !r.isActive));

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
        confirmLabel: "Delete Automation",
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

  const tile = (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]" aria-hidden>
      <Zap size={18} strokeWidth={2.25} />
    </span>
  );

  function DesktopRow({ a }: { a: Row }) {
    return (
      <div className={`flex items-start gap-3 px-4 py-3 ${a.isActive ? "" : "opacity-70"}`}>
        {tile}
        <Link href={`/app/automations/${a.id}`} prefetch={false} className="group min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-sm font-semibold text-[color:var(--ds-ink)] group-hover:underline">{a.name}</p>
            {!a.isActive && <Chip>Paused</Chip>}
            {a.broken && <Chip tone="bad">Needs rebuilding</Chip>}
          </div>
          {a.summary && (
            <p className="mt-0.5 truncate text-sm text-gray-700">
              {a.summary.trigger} <span className="text-gray-400">→</span> {stepsWord(a)}
            </p>
          )}
          <p className="mt-1 text-xs text-gray-500">
            {a.runs === 0 ? "Hasn't fired yet" : `Fired ${a.runs}×`}
            {a.lastRunAt && ` · last ${ago(a.lastRunAt)}`}
            {a.description && ` · ${a.description}`}
          </p>
        </Link>
        <div className="flex shrink-0 items-center gap-1">
          <button type="button" disabled={busy === a.id || a.broken} onClick={() => void setActive(a, !a.isActive)} aria-label={a.isActive ? "Pause" : "Resume"} title={a.isActive ? "Pause" : "Resume"} className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50">
            {a.isActive ? <Pause size={16} /> : <Play size={16} />}
          </button>
          <button type="button" disabled={busy === a.id} onClick={() => void remove(a)} aria-label="Delete" title="Delete" className="rounded-lg p-2 text-gray-400 hover:bg-[color:var(--ds-bad-soft)] hover:text-[color:var(--ds-bad)] disabled:opacity-50">
            <Trash2 size={16} />
          </button>
        </div>
      </div>
    );
  }

  function PhoneRow({ a }: { a: Row }) {
    return (
      <SwipeRow
        actions={[
          { key: "toggle", label: a.isActive ? "Pause" : "Resume", icon: a.isActive ? Pause : Play, bg: "var(--ds-muted)", onClick: () => void setActive(a, !a.isActive) },
          { key: "delete", label: "Delete", icon: Trash2, bg: "var(--ds-bad)", onClick: () => void remove(a) },
        ]}
      >
        <button type="button" onClick={() => { hapticImpact("LIGHT"); setDetail(a); }} className={`flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-100 ${a.isActive ? "" : "opacity-60"}`}>
          {tile}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-2">
              <span className={`h-2 w-2 shrink-0 rounded-full ${a.broken ? "bg-[color:var(--ds-bad)]" : a.isActive ? "bg-[color:var(--ds-good)]" : "bg-[color:var(--ds-faint)]"}`} aria-hidden />
              <span className="truncate text-[15px] font-semibold text-[color:var(--ds-ink)]">{a.name}</span>
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">
              {a.summary ? `${a.summary.trigger} → ${stepsWord(a)}` : "Needs rebuilding"}
            </span>
          </span>
          <span className="shrink-0 text-right text-[11px] tabular-nums text-gray-400">
            {a.runs > 0 ? `${a.runs}×` : "—"}
            {a.lastRunAt && <span className="block">{ago(a.lastRunAt)}</span>}
          </span>
          <ChevronRight size={16} className="shrink-0 text-gray-300" />
        </button>
      </SwipeRow>
    );
  }

  const empty = (
    <EmptyState icon={Zap} title="No automations yet" body="“When this happens, do that” rules that run on their own. For example:">
      <ul className="mt-3 w-full max-w-md space-y-2 text-left">
        {EXAMPLES.map((e) => (
          <li key={e} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">“{e}”</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <Link href="/app/automations/new" prefetch={false} className="btn-primary hidden lg:inline-flex">
          <Plus size={15} /> Build one
        </Link>
        {atlas.available && (
          <>
            <Link href="/app/automations/new?atlas=1" prefetch={false} className="btn-tool-line hidden h-10 items-center gap-1.5 px-4 text-sm font-medium lg:inline-flex">
              <Sparkles size={15} /> Ask {atlas.name}
            </Link>
            <button type="button" onClick={() => setCreating(true)} className="btn-primary inline-flex lg:hidden">
              <Sparkles size={15} /> Ask {atlas.name}
            </button>
          </>
        )}
      </div>
    </EmptyState>
  );

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="flex items-start justify-between gap-3">
        <PageTitle section="business" icon={Zap} info="“When this happens, do that” rules that run on their own. Each fires at most once per record, never moves money, and pauses with one tap.">
          Automations
        </PageTitle>
        <div className="flex shrink-0 items-center gap-2">
          {atlas.available && (
            <Link href="/app/automations/new?atlas=1" prefetch={false} className="btn-tool-line hidden h-10 items-center gap-1.5 px-3.5 text-sm font-medium lg:inline-flex">
              <Sparkles size={15} /> Ask {atlas.name}
            </Link>
          )}
          <Link href="/app/automations/new" prefetch={false} className="btn-primary hidden h-10 lg:inline-flex">
            <Plus size={15} /> New automation
          </Link>
          {atlas.available && (
            <button type="button" onClick={() => { hapticImpact("MEDIUM"); setCreating(true); }} aria-label="New automation" className="glass-control flex h-10 w-10 items-center justify-center rounded-full text-gray-800 lg:hidden">
              <Plus size={20} />
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4 mt-3 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-[color:var(--ds-bad)] opacity-70 hover:opacity-100"><X size={14} /></button>
        </div>
      )}

      {rows.length > 0 && (
        <div className="sticky top-0 z-10 -mx-4 mb-3 mt-4 bg-[color:var(--ds-canvas)]/90 px-4 py-2 backdrop-blur lg:hidden">
          <SegmentedRow>
            {(["all", "live", "paused"] as Filter[]).map((k) => (
              <Segment key={k} active={filter === k} onClick={() => { hapticImpact("LIGHT"); setFilter(k); }}>
                {k === "all" ? "All" : k === "live" ? "Live" : "Paused"}
              </Segment>
            ))}
          </SegmentedRow>
        </div>
      )}

      <div className="ds-card mb-6 mt-3 divide-y divide-[color:var(--ds-line)] lg:mt-6">
        {rows.length === 0 ? (
          empty
        ) : shown.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-gray-500">Nothing {filter}.</p>
        ) : (
          <>
            <div className="hidden lg:block lg:divide-y lg:divide-[color:var(--ds-line)]">{shown.map((a) => <DesktopRow key={a.id} a={a} />)}</div>
            <div className="divide-y divide-[color:var(--ds-line)] lg:hidden">{shown.map((a) => <PhoneRow key={a.id} a={a} />)}</div>
          </>
        )}
      </div>

      {recentRuns.length > 0 && (
        <>
          <button type="button" onClick={() => setShowRuns((v) => !v)} className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800">
            Recent activity ({recentRuns.length}) {showRuns ? "▾" : "▸"}
          </button>
          {showRuns && (
            <div className="ds-card divide-y divide-[color:var(--ds-line)]">
              {recentRuns.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${runDot(r.status)}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-800">
                      <span className="font-medium">{nameOf.get(r.automationId) ?? "Deleted rule"}</span> · {r.event} ·{" "}
                      {ENTITY_PATH[r.entityType as keyof typeof ENTITY_PATH] ? (
                        <Link href={`${ENTITY_PATH[r.entityType as keyof typeof ENTITY_PATH]}/${r.entityId.split(":")[0]}`} className="underline decoration-gray-300 hover:text-gray-900">{r.entityType}</Link>
                      ) : (
                        r.entityType
                      )}
                    </p>
                    {r.detail && <p className="text-gray-500">{r.detail}</p>}
                  </div>
                  <span className="shrink-0 text-gray-400">{ago(r.createdAt)}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── phone: detail sheet ─────────────────────────────────────────── */}
      <BottomSheet open={detail !== null} onClose={() => { setDetail(null); setPendingDraft(null); }} title={detail?.name} closeButton>
        {detail && (
          <div className="max-h-[78dvh] overflow-y-auto px-5 pb-2">
            <div className="mb-3 flex items-center gap-2">
              <button type="button" disabled={busy === detail.id || detail.broken} onClick={() => void setActive(detail, !detail.isActive)} className={`inline-flex h-9 items-center gap-1.5 rounded-full px-3.5 text-sm font-semibold ${detail.isActive ? "bg-gray-100 text-gray-800" : "btn-primary"}`}>
                {detail.isActive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
              </button>
              <span className="text-xs text-gray-500">{detail.runs === 0 ? "Hasn't fired yet" : `Fired ${detail.runs}×${detail.lastRunAt ? ` · ${ago(detail.lastRunAt)}` : ""}`}</span>
              <button type="button" disabled={busy === detail.id} onClick={() => void remove(detail)} aria-label="Delete" className="ml-auto rounded-full p-2 text-[color:var(--ds-bad)] active:bg-[color:var(--ds-bad-soft)]"><Trash2 size={16} /></button>
            </div>

            {pendingDraft ? (
              <div className="ds-card p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">New version</p>
                <PlainSteps spec={pendingDraft} />
                <div className="mt-3 flex gap-2">
                  <button type="button" disabled={busy === detail.id} onClick={() => void saveDraftTo(detail, pendingDraft)} className="btn-primary flex-1 justify-center">Save changes</button>
                  <button type="button" onClick={() => setPendingDraft(null)} className="btn-tool-line h-10 px-4 text-sm">Discard</button>
                </div>
              </div>
            ) : (
              <ol className="space-y-1.5">
                {(detail.summary?.steps ?? []).length === 0 ? (
                  <li className="text-sm text-[color:var(--ds-bad)]">This rule needs rebuilding.</li>
                ) : (
                  [{ kind: "trigger", text: detail.summary!.trigger }, ...detail.summary!.steps].map((s, i) => (
                    <li key={i} className="flex gap-2.5 text-sm text-gray-800">
                      <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{i + 1}</span>
                      <span className={s.kind === "filter" || s.kind === "wait" ? "text-gray-500" : ""}>{s.text}</span>
                    </li>
                  ))
                )}
              </ol>
            )}

            {atlas.available && !pendingDraft && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Change with {atlas.name}</p>
                <AutomationBuildPanel
                  compact
                  current={{ name: detail.name, description: detail.description ?? "", spec: detail.spec }}
                  onDraft={(d) => setPendingDraft(d)}
                  placeholder="e.g. also text them two days later if they still haven't answered"
                />
              </div>
            )}

            {recentRuns.some((r) => r.automationId === detail.id) && (
              <div className="mt-4">
                <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-gray-500">Run history</p>
                <div className="ds-card divide-y divide-[color:var(--ds-line)]">
                  {recentRuns.filter((r) => r.automationId === detail.id).slice(0, 10).map((r) => (
                    <div key={r.id} className="flex items-center gap-2.5 px-3 py-2 text-xs">
                      <span className={`h-2 w-2 shrink-0 rounded-full ${runDot(r.status)}`} aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-gray-700">{r.detail || r.event}</span>
                      <span className="shrink-0 text-gray-400">{ago(r.createdAt)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="mt-4 text-center text-[11px] text-gray-400">Edit the cards on a desktop.</p>
          </div>
        )}
      </BottomSheet>

      {/* ── phone: create with Atlas ─────────────────────────────────────── */}
      <BottomSheet open={creating} onClose={() => { setCreating(false); setPendingDraft(null); }} title="New automation" closeButton>
        <div className="max-h-[78dvh] overflow-y-auto px-5 pb-2">
          {pendingDraft && !detail ? (
            <div>
              <p className="text-[15px] font-semibold text-gray-900">{pendingDraft.name}</p>
              {pendingDraft.description && <p className="mb-2 text-xs text-gray-500">{pendingDraft.description}</p>}
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
              <AutomationBuildPanel current={null} onDraft={(d) => setPendingDraft(d)} />
              <ul className="mt-3 space-y-1.5">
                {EXAMPLES.slice(0, 3).map((e) => (
                  <li key={e} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">“{e}”</li>
                ))}
              </ul>
            </>
          )}
        </div>
      </BottomSheet>
    </div>
  );
}

/** A drafted rule in plain English (phone sheets). */
function PlainSteps({ spec }: { spec: Draft }) {
  const d = describeAutomation(spec.spec);
  return (
    <ol className="space-y-1.5">
      {[{ kind: "trigger", text: d.trigger }, ...d.steps].map((s, i) => (
        <li key={i} className="flex gap-2.5 text-sm text-gray-800">
          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{i + 1}</span>
          <span className={s.kind === "filter" || s.kind === "wait" ? "text-gray-500" : ""}>{s.text}</span>
        </li>
      ))}
    </ol>
  );
}
