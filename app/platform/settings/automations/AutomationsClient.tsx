"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Pause, Play, Sparkles, Trash2, X, Zap } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import type { AutomationSpec } from "@/lib/automations";

/**
 * Settings → Automations. Rules are BUILT with Atlas (manage_automation);
 * this page shows each rule in plain English, lets you pause / resume /
 * delete, and shows the run log — the kill switch and the audit trail.
 */

type Row = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  runs: number;
  lastRunAt: string | null;
  updatedAt: string;
  spec: AutomationSpec | null;
  summary: { trigger: string; when: string | null; actions: string[] } | null;
  broken: boolean;
};

type Run = { id: string; automationId: string; event: string; entityType: string; entityId: string; status: string; detail: string | null; createdAt: string };

const EXAMPLES = [
  "When a quote has sat unanswered for 5 days, email the client a friendly nudge and notify me.",
  "When a job is marked complete, send the client a review request.",
  "When an invoice is 10 days overdue and over $500, notify the managers.",
  "When a lead sits in the same stage for two weeks, move it to Follow-up and add a note.",
];

const ENTITY_PATH: Record<string, string> = { request: "/app/requests", appointment: "/app/appointments", quote: "/app/quotes", job: "/app/jobs", invoice: "/app/invoices", contact: "/app/contacts" };

function ago(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const m = Math.round(ms / 60000);
  if (m < 60) return `${Math.max(1, m)}m ago`;
  const h = Math.round(m / 60);
  if (h < 48) return `${h}h ago`;
  return `${Math.round(h / 24)}d ago`;
}

export default function AutomationsClient({ automations, recentRuns }: { automations: Row[]; recentRuns: Run[] }) {
  const router = useRouter();
  const atlas = useAssistant();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [showRuns, setShowRuns] = useState(false);

  const nameOf = new Map(automations.map((a) => [a.id, a.name]));

  async function setActive(a: Row, isActive: boolean) {
    setBusy(a.id);
    setError("");
    const { ok, data } = await postJson(`/api/app/automations/${a.id}`, { isActive }, "PATCH");
    setBusy(null);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
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
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  function Card({ a }: { a: Row }) {
    return (
      <div className={`px-4 py-3 ${a.isActive ? "" : "opacity-70"}`}>
        <div className="flex items-start gap-3">
          <span
            className="chip-tool mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
            style={{ backgroundColor: SECTION_HUES.business, color: hueInk(SECTION_HUES.business) }}
            aria-hidden
          >
            <Zap size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="text-sm font-semibold text-gray-900">{a.name}</p>
              {!a.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Paused</span>}
              {a.broken && <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">Needs rebuilding</span>}
            </div>
            {a.summary && (
              <div className="mt-1 space-y-0.5 text-sm text-gray-700">
                <p>{a.summary.trigger}</p>
                {a.summary.when && <p className="text-gray-500">{a.summary.when}</p>}
                {a.summary.actions.map((x, i) => (
                  <p key={i} className="pl-3 text-gray-700">
                    → {x}
                  </p>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-gray-500">
              {a.runs === 0 ? "Hasn't fired yet" : `Fired ${a.runs}×`}
              {a.lastRunAt && ` · last ${ago(a.lastRunAt)}`}
              {a.description && ` · ${a.description}`}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            <button
              type="button"
              disabled={busy === a.id || a.broken}
              onClick={() => void setActive(a, !a.isActive)}
              aria-label={a.isActive ? "Pause" : "Resume"}
              title={a.isActive ? "Pause" : "Resume"}
              className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
            >
              {a.isActive ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <button type="button" disabled={busy === a.id} onClick={() => void remove(a)} aria-label="Delete" title="Delete" className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
              <Trash2 size={16} />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Link href="/app/settings" className="hidden shrink-0 text-gray-400 hover:text-gray-600 lg:block">
            <ArrowLeft size={18} />
          </Link>
          <PageTitle section="business" icon={Zap}>
            Automations
          </PageTitle>
        </div>
        {atlas.available && (
          <button type="button" onClick={atlas.open} className="btn-primary h-10 shrink-0 justify-center sm:px-4">
            <Sparkles size={16} />
            <span className="hidden sm:inline">Build with {atlas.name}</span>
          </button>
        )}
      </div>
      <p className="mb-5 mt-2 text-sm text-gray-500 lg:ml-8 lg:mb-6">
        “When this happens, do that” rules that run on their own. Describe one to {atlas.name}, confirm the plain-English card, and it&apos;s live — no
        tokens per run. Each rule fires at most once per record, never moves money, and you can pause it here any time.
      </p>

      {error && (
        <div role="alert" className="form-error mb-4 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600">
            <X size={14} />
          </button>
        </div>
      )}

      <div className="card-ledger mb-6 divide-y divide-gray-100">
        {automations.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: SECTION_HUES.business, color: hueInk(SECTION_HUES.business) }} aria-hidden>
              <Zap size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3.5 text-sm font-semibold text-gray-900">No automations yet</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">Tell {atlas.name} what should happen automatically. For example:</p>
            <ul className="mt-3 w-full max-w-md space-y-2 text-left">
              {EXAMPLES.map((e) => (
                <li key={e} className="rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-600">
                  “{e}”
                </li>
              ))}
            </ul>
            {atlas.available && (
              <button type="button" onClick={atlas.open} className="btn-primary mt-5 inline-flex">
                <Sparkles size={15} />
                Build one with {atlas.name}
              </button>
            )}
          </div>
        ) : (
          automations.map((a) => <Card key={a.id} a={a} />)
        )}
      </div>

      {recentRuns.length > 0 && (
        <>
          <button type="button" onClick={() => setShowRuns((v) => !v)} className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500 hover:text-gray-800">
            Recent activity ({recentRuns.length}) {showRuns ? "▾" : "▸"}
          </button>
          {showRuns && (
            <div className="card-ledger divide-y divide-gray-100">
              {recentRuns.map((r) => (
                <div key={r.id} className="flex items-start gap-3 px-4 py-2.5 text-xs">
                  <span className={`mt-0.5 h-2 w-2 shrink-0 rounded-full ${r.status === "ok" ? "bg-emerald-500" : r.status === "failed" ? "bg-red-500" : "bg-gray-300"}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="text-gray-800">
                      <span className="font-medium">{nameOf.get(r.automationId) ?? "Deleted rule"}</span> · {r.event} ·{" "}
                      <Link href={`${ENTITY_PATH[r.entityType] ?? "/app"}/${r.entityId}`} className="underline decoration-gray-300 hover:text-gray-900">
                        {r.entityType}
                      </Link>
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
    </div>
  );
}
