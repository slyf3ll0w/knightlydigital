"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calculator, Globe, Play, Power, Sparkles, Trash2, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import PublishEstimatorSheet, { type PublishTool } from "./PublishEstimatorSheet";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";

/**
 * Settings → Estimate tools. Tools are BUILT in conversation with Atlas
 * (manage_estimator) — this page is where you see them, try one, switch it
 * off, or delete it. No form editor on purpose: the spec is Atlas's job, and
 * "ask Atlas to change it" is the edit path.
 */

type Tool = RunnerEstimator & PublishTool & { isActive: boolean; runs: number; assists: number; updatedAt: string };

const EXAMPLES = [
  "Build an estimate tool for driveway pressure washing: $0.25 per sq ft, $150 minimum, sealant optional at $0.45 per sq ft.",
  "Make a quote calculator for interior painting by room: walls $2.50 per sq ft, ceilings $1.75, plus $45 per door and $30 per window.",
  "Create an estimator for lawn mowing: $45 up to a quarter acre, $65 up to a half, $95 up to an acre, weekly or bi-weekly.",
  "Put my driveway tool on my website as an instant-estimate form that shows a price range and emails me the lead.",
];

export default function EstimatorsClient({ tools, brokenCount, companySlug, baseUrl }: { tools: Tool[]; brokenCount: number; companySlug: string; baseUrl: string }) {
  const router = useRouter();
  const atlas = useAssistant();
  const [trying, setTrying] = useState<Tool | null>(null);
  const [publishing, setPublishing] = useState<Tool | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");

  const active = tools.filter((t) => t.isActive);
  const inactive = tools.filter((t) => !t.isActive);

  async function setActive(t: Tool, isActive: boolean) {
    setBusy(t.id);
    setError("");
    const { ok, data } = await postJson(`/api/app/estimators/${t.id}`, { isActive }, "PATCH");
    setBusy(null);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  async function remove(t: Tool) {
    if (
      !(await confirmSheet({
        title: `Delete "${t.name}"?`,
        message: "Quotes already made with it are untouched. The tool itself is gone for good — you'd ask Atlas to build it again.",
        confirmLabel: "Delete Tool",
        destructive: true,
      }))
    )
      return;
    setBusy(t.id);
    setError("");
    const { ok, data } = await postJson(`/api/app/estimators/${t.id}`, undefined, "DELETE");
    setBusy(null);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.refresh();
  }

  function Row({ t }: { t: Tool }) {
    return (
      <div className="flex items-center gap-3 px-4 py-3">
        <span
          className="chip-tool flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]"
          style={{ backgroundColor: SECTION_HUES.quotes, color: hueInk(SECTION_HUES.quotes), opacity: t.isActive ? 1 : 0.5 }}
          aria-hidden
        >
          <Calculator size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="truncate text-sm font-semibold text-gray-900">{t.name}</p>
            <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${t.usesAtlas ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
              {t.usesAtlas ? `${atlas.name} fill-in · tokens per use` : "Free to run"}
            </span>
            {t.isPublic && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">On your website</span>}
          </div>
          <p className="truncate text-xs text-gray-500">
            {t.description || `${t.spec.inputs.length} question${t.spec.inputs.length === 1 ? "" : "s"} · ${t.spec.lines.length} line rule${t.spec.lines.length === 1 ? "" : "s"}`}
            {t.runs > 0 && ` · used ${t.runs}×`}
            {t.submissions > 0 && ` · ${t.submissions} website lead${t.submissions === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {t.isActive && (
            <button type="button" onClick={() => setTrying(t)} aria-label="Try it" title="Try it" className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800">
              <Play size={16} />
            </button>
          )}
          {t.isActive && (
            <button
              type="button"
              onClick={() => setPublishing(t)}
              aria-label="Website form"
              title="Website form"
              className={`rounded-lg p-2 hover:bg-gray-100 hover:text-gray-800 ${t.isPublic ? "text-sky-600" : "text-gray-500"}`}
            >
              <Globe size={16} />
            </button>
          )}
          <button
            type="button"
            disabled={busy === t.id}
            onClick={() => void setActive(t, !t.isActive)}
            aria-label={t.isActive ? "Turn off" : "Turn on"}
            title={t.isActive ? "Turn off" : "Turn on"}
            className="rounded-lg p-2 text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            <Power size={16} />
          </button>
          <button type="button" disabled={busy === t.id} onClick={() => void remove(t)} aria-label="Delete" title="Delete" className="rounded-lg p-2 text-gray-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50">
            <Trash2 size={16} />
          </button>
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
          <PageTitle section="quotes" icon={Calculator}>
            Estimate tools
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
        Quote calculators built around <em>your</em> pricing. Tell {atlas.name} how you price a kind of job and it builds the tool; from then on
        anyone on the team answers a few questions on a new quote and the line items fill themselves in — plain math, no tokens. Any tool can
        also go on your website as an instant-estimate form that captures leads (the globe button). To change a tool, ask {atlas.name}.
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
        {active.length === 0 ? (
          <div className="flex flex-col items-center px-6 py-10 text-center">
            <span
              className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]"
              style={{ backgroundColor: SECTION_HUES.quotes, color: hueInk(SECTION_HUES.quotes) }}
              aria-hidden
            >
              <Calculator size={20} strokeWidth={2.25} />
            </span>
            <p className="mt-3.5 text-sm font-semibold text-gray-900">No estimate tools yet</p>
            <p className="mt-1 max-w-sm text-sm text-gray-500">
              Open {atlas.name} and describe how you price a job. Something like:
            </p>
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
          active.map((t) => <Row key={t.id} t={t} />)
        )}
      </div>

      {inactive.length > 0 && (
        <>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Turned off</p>
          <div className="card-ledger mb-6 divide-y divide-gray-100">{inactive.map((t) => <Row key={t.id} t={t} />)}</div>
        </>
      )}

      {brokenCount > 0 && (
        <p className="text-xs text-amber-700">
          {brokenCount} tool{brokenCount === 1 ? "" : "s"} no longer compile{brokenCount === 1 ? "s" : ""} and {brokenCount === 1 ? "is" : "are"} hidden — ask {atlas.name} to rebuild
          {brokenCount === 1 ? " it" : " them"}.
        </p>
      )}

      <EstimatorRunner estimators={trying ? [trying] : []} open={trying !== null} onClose={() => setTrying(null)} />
      <PublishEstimatorSheet
        tool={publishing}
        companySlug={companySlug}
        baseUrl={baseUrl}
        open={publishing !== null}
        onClose={() => setPublishing(null)}
        onSaved={() => {
          setPublishing(null);
          router.refresh();
        }}
      />
    </div>
  );
}
