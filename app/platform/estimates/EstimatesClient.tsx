"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, ChevronRight, Play, Plus, Sparkles, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, wash } from "@/components/EstimatorControls";
import { SECTION_HUES } from "@/lib/section-colors";
import type { EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "./BuildPanel";

/**
 * /app/estimates — your tools, one row each; a row opens the tool's page.
 * Building is a sentence to Atlas: the builder is the page when there's
 * nothing yet (or the chat sent a ?prompt=), otherwise one line at the top.
 * A finished build goes straight to the new tool's page. ?run=1 opens the
 * runner straight away (the + menu's "Estimate").
 */

export type Tool = RunnerEstimator & {
  isActive: boolean;
  runs: number;
  assists: number;
  isPublic: boolean;
  publicSlug: string | null;
  publicConfig: EstimatorPublicConfig;
  publicViews: number;
  publicCalcs: number;
  submissions: number;
  updatedAt: string;
};

function factsOf(t: Tool, atlasName: string): string {
  const tiers = t.spec.inputs.find((i) => i.type === "select" && i.style === "packages");
  return [
    `${t.spec.inputs.length} question${t.spec.inputs.length === 1 ? "" : "s"}`,
    tiers && tiers.type === "select" ? `${tiers.options.length} packages` : null,
    t.spec.inputs.some((i) => i.type === "map") ? "map measure" : null,
    t.spec.minimumTotal ? `$${Math.round(t.spec.minimumTotal)} minimum` : null,
    t.spec.inputs.some((i) => i.askAtlas) ? `${atlasName} assesses` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export default function EstimatesClient({
  tools: initialTools,
  brokenCount,
  manager,
  initialPrompt = "",
  autoRun = false,
}: {
  tools: Tool[];
  brokenCount: number;
  companySlug: string;
  baseUrl: string;
  manager: boolean;
  initialPrompt?: string;
  autoRun?: boolean;
}) {
  const router = useRouter();
  const atlas = useAssistant();
  const theme = APP_THEME;
  const [tools, setTools] = useState<Tool[]>(initialTools);
  useEffect(() => setTools(initialTools), [initialTools]);
  const [running, setRunning] = useState<Tool[] | null>(autoRun ? initialTools.filter((t) => t.isActive) : null);
  const [building, setBuilding] = useState<boolean>(Boolean(initialPrompt) || initialTools.length === 0);

  const active = useMemo(() => tools.filter((t) => t.isActive), [tools]);
  const inactive = useMemo(() => tools.filter((t) => !t.isActive), [tools]);

  function Row({ t }: { t: Tool }) {
    const placeholders = t.spec.placeholders?.length ?? 0;
    return (
      <Link href={`/app/estimates/${t.id}`} prefetch={false} className={`group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 ${t.isActive ? "" : "opacity-60"}`}>
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
          <Calculator size={18} strokeWidth={2.25} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span className="truncate text-[15px] font-semibold text-gray-900">{t.name}</span>
            {!t.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Off</span>}
            {t.isPublic && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">On your website</span>}
            {placeholders > 0 && manager && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{placeholders} rate{placeholders === 1 ? "" : "s"} to confirm</span>}
          </span>
          <span className="mt-0.5 block truncate text-xs text-gray-500">{t.description || factsOf(t, atlas.name)}</span>
        </span>
        <ChevronRight size={16} className="shrink-0 text-gray-300 group-hover:text-gray-500" />
      </Link>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageTitle section="quotes" icon={Calculator} sub={manager ? "Tell Atlas how you price a job. It builds a tool your team runs onsite and your website runs for you." : "Answer a tool's questions, show the number, turn it into a quote."}>
          Estimates
        </PageTitle>
        {manager && tools.length > 0 ? (
          <button type="button" onClick={() => setBuilding((b) => !b)} className={building ? "inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50" : "btn-primary h-10 justify-center"}>
            {building ? <X size={15} /> : <Plus size={15} />} {building ? "Close" : "Build a tool"}
          </button>
        ) : active.length > 0 ? (
          <button type="button" onClick={() => setRunning(active)} className="btn-primary h-10 justify-center">
            <Play size={15} /> Run a tool
          </button>
        ) : null}
      </div>

      {manager && building && (
        <div className="mb-6">
          <BuildPanel
            initialPrompt={initialPrompt}
            autoFocus={Boolean(initialPrompt) || tools.length > 0}
            onBuilt={(t: BuiltTool) => {
              // straight into the new tool: the form, the sample chips, Ask Atlas one tap away
              router.push(`/app/estimates/${t.id}?s=try`);
            }}
          />
        </div>
      )}

      {manager && !building && tools.length > 0 && (
        <button type="button" onClick={() => setBuilding(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-left hover:border-gray-400 hover:bg-gray-50">
          <Sparkles size={16} style={{ color: theme.accent }} />
          <span className="min-w-0 flex-1 text-sm text-gray-500">Describe how you price a job — {atlas.name} builds the tool…</span>
        </button>
      )}

      <div className="card-ledger overflow-hidden">
        {tools.length === 0 ? (
          <EmptyState art="quotes" hue={SECTION_HUES.quotes} title="No tools yet" body={manager ? "Describe how you price a job above and press Build it." : "Ask a manager to build one — then this page prices jobs in a few taps."} showPlusIcon={false} />
        ) : (
          <>
            <div className="divide-y divide-gray-100">
              {active.map((t) => (
                <Row key={t.id} t={t} />
              ))}
            </div>
            {inactive.length > 0 && (
              <>
                <p className="border-t border-gray-100 bg-gray-50 px-4 py-1.5 text-[11px] font-semibold text-gray-500">Turned off</p>
                <div className="divide-y divide-gray-100 border-t border-gray-100">
                  {inactive.map((t) => (
                    <Row key={t.id} t={t} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
      </div>
      {brokenCount > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          {brokenCount} tool{brokenCount === 1 ? "" : "s"} no longer compile{brokenCount === 1 ? "s" : ""} and {brokenCount === 1 ? "is" : "are"} hidden.
        </p>
      )}

      <EstimatorRunner estimators={running ?? []} open={running !== null} onClose={() => setRunning(null)} showSamples={manager} />
    </div>
  );
}
