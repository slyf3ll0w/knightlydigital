"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Calculator, ChevronRight, Play, Plus, Sparkles, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, wash } from "@/components/EstimatorControls";
import { SECTION_HUES } from "@/lib/section-colors";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "@/lib/estimator-public";
import type { EstimatorSpec } from "@/lib/estimator";
import BuildPanel, { type BuiltTool } from "./BuildPanel";

/**
 * /app/estimates — the tools as a list (the app's ledger-row idiom), each
 * row its own page. The builder is the marquee at the top when there's
 * nothing yet or the owner asks for it; otherwise it folds to one line so
 * the list stays the page. ?run=1 opens the runner straight away (the +
 * menu's "Estimate"); ?prompt=… arrives from the Atlas chat.
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

function toTool(t: BuiltTool): Tool {
  const r = t as Record<string, unknown>;
  return {
    id: t.id,
    name: t.name,
    description: typeof r.description === "string" ? r.description : null,
    usesAtlas: r.usesAtlas === true,
    spec: r.spec as EstimatorSpec,
    isActive: r.isActive !== false,
    runs: Number(r.runs ?? 0),
    assists: Number(r.assists ?? 0),
    isPublic: r.isPublic === true,
    publicSlug: typeof r.publicSlug === "string" ? r.publicSlug : null,
    publicConfig: sanitizePublicConfig(r.publicConfig),
    publicViews: Number(r.publicViews ?? 0),
    publicCalcs: Number(r.publicCalcs ?? 0),
    submissions: Number(r.submissions ?? 0),
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

function factsOf(t: Tool, atlasName: string): string {
  const tiers = t.spec.inputs.find((i) => i.type === "select" && i.style === "packages");
  const sections = new Set(t.spec.inputs.map((i) => i.section).filter(Boolean)).size;
  return [
    `${t.spec.inputs.length} question${t.spec.inputs.length === 1 ? "" : "s"}${sections > 1 ? ` in ${sections} steps` : ""}`,
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
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);

  const active = useMemo(() => tools.filter((t) => t.isActive), [tools]);
  const inactive = useMemo(() => tools.filter((t) => !t.isActive), [tools]);

  function upsert(t: BuiltTool) {
    const tool = toTool(t);
    setTools((prev) => (prev.some((x) => x.id === tool.id) ? prev.map((x) => (x.id === tool.id ? { ...x, ...tool } : x)) : [tool, ...prev]));
    setFresh(tool.id);
    setTimeout(() => setFresh((f) => (f === tool.id ? null : f)), 6000);
    router.refresh();
  }

  const rowCls = "group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100";

  function Row({ t }: { t: Tool }) {
    const placeholders = t.spec.placeholders?.length ?? 0;
    const isFresh = fresh === t.id;
    return (
      <div className={`relative ${t.isActive ? "" : "opacity-70"} ${isFresh ? "bg-green-50/60" : ""}`}>
        <Link href={`/app/estimates/${t.id}`} prefetch={false} className={rowCls}>
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
            <Calculator size={18} strokeWidth={2.25} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="truncate text-[15px] font-semibold text-gray-900">{t.name}</span>
              {isFresh && (
                <span className="rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider" style={{ backgroundColor: theme.accent, color: theme.onAccent }}>
                  New
                </span>
              )}
              {!t.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Off</span>}
              {t.isPublic && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">On your website</span>}
              {placeholders > 0 && manager && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                  <AlertTriangle size={11} /> {placeholders} rate{placeholders === 1 ? "" : "s"} to set
                </span>
              )}
            </span>
            <span className="mt-0.5 block truncate text-xs text-gray-500">{t.description || factsOf(t, atlas.name)}</span>
            <span className="mt-0.5 block truncate text-[11px] text-gray-400 lg:hidden">
              {factsOf(t, atlas.name)}
              {t.runs > 0 ? ` · used ${t.runs}×` : ""}
              {t.submissions > 0 ? ` · ${t.submissions} lead${t.submissions === 1 ? "" : "s"}` : ""}
            </span>
          </span>
          <span className="hidden w-40 shrink-0 text-xs text-gray-500 lg:block">{factsOf(t, atlas.name)}</span>
          <span className="hidden w-28 shrink-0 text-right text-xs tabular-nums text-gray-500 lg:block">
            {t.runs > 0 ? `${t.runs} run${t.runs === 1 ? "" : "s"}` : "—"}
            {t.submissions > 0 ? ` · ${t.submissions} lead${t.submissions === 1 ? "" : "s"}` : ""}
          </span>
          <ChevronRight size={16} className="shrink-0 text-gray-300 group-hover:text-gray-500" />
        </Link>
        {t.isActive && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              setRunning([t]);
            }}
            className="absolute right-11 top-1/2 hidden -translate-y-1/2 items-center gap-1 rounded-lg border border-gray-200 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 lg:inline-flex"
          >
            <Play size={12} /> Run
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <PageTitle section="quotes" icon={Calculator} sub={manager ? "Pricing tools your team runs onsite and your website runs for you." : "Answer a tool's questions, show the number, turn it into a quote."}>
          Estimates
        </PageTitle>
        <div className="flex items-center gap-2">
          {active.length > 0 && (
            <button type="button" onClick={() => setRunning(active)} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
              <Play size={15} /> Run a tool
            </button>
          )}
          {manager && tools.length > 0 && (
            <button type="button" onClick={() => setBuilding((b) => !b)} className={building ? "inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-200 bg-white px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50" : "btn-primary h-10 justify-center"}>
              {building ? (
                <>
                  <X size={15} /> Close builder
                </>
              ) : (
                <>
                  <Plus size={15} /> Build a tool
                </>
              )}
            </button>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {manager && building && (
        <div className="mb-6">
          <BuildPanel
            initialPrompt={initialPrompt}
            autoFocus={Boolean(initialPrompt) || tools.length > 0}
            onBuilt={(t) => upsert(t)}
            onTry={(t) => setRunning([toTool(t)])}
            onPublish={(t) => router.push(`/app/estimates/${t.id}?s=website`)}
            onEdit={(t) => router.push(`/app/estimates/${t.id}?s=questions`)}
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
          <EmptyState art="quotes" hue={SECTION_HUES.quotes} title="No tools yet" body={manager ? "Describe how you price a job above and press Build it — the tool prices jobs in a few taps, onsite and on your website." : "Ask a manager to build one — then this page prices jobs in a few taps."} showPlusIcon={false} />
        ) : (
          <>
            <div className="hidden items-center gap-3 bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 lg:flex">
              <span className="w-10 shrink-0" />
              <span className="min-w-0 flex-1">Tool</span>
              <span className="w-40 shrink-0">Shape</span>
              <span className="w-28 shrink-0 text-right">Used</span>
              <span className="w-[6.5rem] shrink-0" />
            </div>
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
