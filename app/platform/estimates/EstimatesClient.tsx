"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { BookOpen, Calculator, ChevronRight, Play, Plus, Sparkles, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import KpiStrip from "@/components/KpiStrip";
import FilterBar, { listHref } from "@/components/FilterBar";
import MobileSearch from "@/components/MobileSearch";
import EntityRowActions from "@/components/EntityRowActions";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, wash } from "@/components/EstimatorControls";
import { SECTION_HUES } from "@/lib/section-colors";
import type { EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "./BuildPanel";

/**
 * /app/estimates — the tools ledger, laid out like Jobs and Clients: title
 * + actions, phone search, KPI strip, segmented filter, one ledger with a
 * desktop grid and a two-line phone row, a double-ruled foot. A row opens
 * the tool's page; right-click / press-and-hold gives the quick actions.
 * Building is a sentence to Atlas: the builder is the page when there's
 * nothing yet (or the chat sent a ?prompt=), otherwise one dashed line
 * above the ledger. ?run=1 opens the runner straight away (the + menu's
 * "Estimate").
 */

export type EstimatesFilter = "" | "published" | "off";

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
  /** Copied from a Library listing */
  sourceListingId?: string | null;
  updatedAt: string;
};

export type EstimatesTotals = { all: number; active: number; published: number; off: number; runs: number; leads: number };

const GRID = "lg:grid-cols-[minmax(0,1fr)_100px_120px_90px_110px_40px]";

const statusFilters = [
  { value: "", label: "All", mobile: "All" },
  { value: "published", label: "Published", mobile: "Published" },
  { value: "off", label: "Turned off", mobile: "Off" },
];

export function toolFacts(t: Pick<Tool, "spec">, atlasName: string): string[] {
  const tiers = t.spec.inputs.find((i) => i.type === "select" && i.style === "packages");
  return [
    `${t.spec.inputs.length} question${t.spec.inputs.length === 1 ? "" : "s"}`,
    tiers && tiers.type === "select" ? `${tiers.options.length} packages` : null,
    t.spec.inputs.some((i) => i.type === "map") ? "map measure" : null,
    t.spec.minimumTotal ? `$${Math.round(t.spec.minimumTotal)} minimum` : null,
    t.spec.inputs.some((i) => i.askAtlas) ? `${atlasName} assesses` : null,
  ].filter((x): x is string => Boolean(x));
}

function ToolStamp({ t }: { t: Tool }) {
  if (!t.isActive) return <span className="stamp text-gray-500">Off</span>;
  if (t.isPublic && t.publicSlug) return <span className="stamp text-sky-700">Published</span>;
  return <span className="stamp text-green-700">Live</span>;
}

/** One ledger row — hoisted so a parent re-render (opening the runner, the builder) never remounts it and drops an open menu. */
function ToolRow({ t, manager, atlasName, onRun }: { t: Tool; manager: boolean; atlasName: string; onRun: (t: Tool) => void }) {
  const theme = APP_THEME;
  const placeholders = t.spec.placeholders?.length ?? 0;
  const facts = toolFacts(t, atlasName);
  const pills = (
    <>
      {placeholders > 0 && manager && <span className="stamp text-amber-700">{placeholders} rate{placeholders === 1 ? "" : "s"} to confirm</span>}
      {t.sourceListingId && <span className="stamp text-gray-500">Library</span>}
    </>
  );
  return (
    <EntityRowActions meta={{ kind: "tool", id: t.id, name: t.name, isActive: t.isActive, isPublic: Boolean(t.isPublic && t.publicSlug), manager }} onRun={t.isActive ? () => onRun(t) : undefined}>
      <Link href={`/app/estimates/${t.id}`} prefetch={false} className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 lg:grid lg:gap-4 lg:py-2.5 ${GRID} ${t.isActive ? "" : "opacity-70"}`}>
        {/* Phone row: icon tile anchors it (a tool has no face), name + status, then the facts */}
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[12px] lg:hidden" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
          <Calculator size={18} strokeWidth={2.25} />
        </span>
        <div className="min-w-0 flex-1 lg:flex-none">
          <div className="flex items-center justify-between gap-3 lg:block">
            <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900 lg:text-sm lg:font-medium">
              {t.name}
              <span className="ml-2 hidden lg:inline-flex lg:gap-1 lg:align-middle">{pills}</span>
            </p>
            <span className="shrink-0 lg:hidden">
              <ToolStamp t={t} />
            </span>
          </div>
          <p className="mt-0.5 truncate text-[13px] text-gray-500 lg:text-xs">{t.description || facts.join(" · ")}</p>
          {(placeholders > 0 && manager) || t.sourceListingId ? <span className="mt-1 flex gap-1 lg:hidden">{pills}</span> : null}
        </div>
        <span className="hidden text-sm text-gray-500 lg:block">{t.spec.inputs.length}</span>
        <span className="hidden lg:block">
          <ToolStamp t={t} />
        </span>
        <span className="numeral-ledger hidden text-sm text-gray-600 lg:block">{t.runs > 0 ? t.runs.toLocaleString() : "—"}</span>
        <span className="numeral-ledger hidden text-sm text-gray-600 lg:block">{t.isPublic && t.publicSlug ? (t.submissions > 0 ? `${t.submissions.toLocaleString()} of ${t.publicViews.toLocaleString()}` : `${t.publicViews.toLocaleString()} views`) : "—"}</span>
        <ChevronRight size={14} className="hidden shrink-0 text-gray-400 lg:block" />
      </Link>
    </EntityRowActions>
  );
}

export default function EstimatesClient({
  tools,
  totals,
  filter,
  query,
  brokenCount,
  manager,
  initialPrompt = "",
  autoRun = false,
  resumeBuildId = null,
}: {
  tools: Tool[];
  totals: EstimatesTotals;
  filter: EstimatesFilter;
  query: string;
  brokenCount: number;
  companySlug: string;
  baseUrl: string;
  manager: boolean;
  initialPrompt?: string;
  autoRun?: boolean;
  /** A build still running on the server (the owner navigated away mid-build) — the builder picks it up. */
  resumeBuildId?: string | null;
}) {
  const router = useRouter();
  const atlas = useAssistant();
  const theme = APP_THEME;
  const active = useMemo(() => tools.filter((t) => t.isActive), [tools]);
  const [running, setRunning] = useState<Tool[] | null>(autoRun ? active : null);
  const [building, setBuilding] = useState<boolean>(Boolean(initialPrompt) || Boolean(resumeBuildId) || totals.all === 0);
  useEffect(() => {
    if (totals.all === 0 && manager) setBuilding(true);
  }, [totals.all, manager]);

  const filtered = Boolean(filter) || Boolean(query);
  const kpis = [
    { label: "Live tools", mobileLabel: "Live", value: totals.active, href: "/app/estimates", zero: totals.active === 0 },
    { label: "Estimates run", mobileLabel: "Runs", value: totals.runs, zero: totals.runs === 0 },
    { label: "Website leads", mobileLabel: "Web leads", value: totals.leads, href: "/app/estimates?status=published", zero: totals.leads === 0 },
  ];

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="mb-6 flex items-center justify-between gap-2">
        <PageTitle>Estimates</PageTitle>
        <div className="flex items-center gap-2">
          <Link href="/app/estimates/library" prefetch={false} title="Estimate tools other businesses have shared" className="btn-tool-line flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] bg-white text-sm font-semibold text-gray-700 transition-colors hover:bg-gray-50 sm:w-auto sm:px-4">
            <BookOpen size={15} />
            <span className="hidden sm:inline">Library</span>
          </Link>
          {manager ? (
            <button type="button" onClick={() => setBuilding((b) => !b)} className={building ? "btn-tool-line flex h-10 w-10 items-center justify-center gap-1.5 rounded-[10px] bg-white text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:w-auto sm:px-4" : "btn-primary h-10 w-10 justify-center !px-0 sm:w-auto sm:!px-4"}>
              {building ? <X size={15} /> : <Plus size={15} />}
              <span className="hidden sm:inline">{building ? "Close" : "Build a tool"}</span>
            </button>
          ) : active.length > 0 ? (
            <button type="button" onClick={() => setRunning(active)} className="btn-primary h-10 justify-center">
              <Play size={15} /> Run a tool
            </button>
          ) : null}
        </div>
      </div>

      {manager && building && (
        <div className="mb-6">
          <BuildPanel
            resumeBuildId={resumeBuildId}
            initialPrompt={initialPrompt}
            autoFocus={Boolean(initialPrompt) || totals.all > 0}
            onBuilt={(t: BuiltTool) => {
              // straight into the new tool: the form, the sample chips, Ask Atlas one tap away
              router.push(`/app/estimates/${t.id}?s=try`);
            }}
          />
        </div>
      )}

      {totals.all > 0 && (
        <>
          <MobileSearch action="/app/estimates" placeholder="Search tools…" defaultValue={query} params={{ status: filter || undefined }} />
          <KpiStrip kpis={kpis} desktopCols={3} hue={SECTION_HUES.quotes} />
          {manager && <FilterBar hue={SECTION_HUES.quotes} options={statusFilters} value={filter} href={(v) => listHref("/app/estimates", { q: query || undefined }, { status: v })} />}
        </>
      )}

      {manager && !building && totals.all > 0 && (
        <button type="button" onClick={() => setBuilding(true)} className="mb-4 flex w-full items-center gap-3 rounded-xl border border-dashed border-gray-300 bg-white px-4 py-3 text-left hover:border-gray-400 hover:bg-gray-50">
          <Sparkles size={16} style={{ color: theme.accent }} />
          <span className="min-w-0 flex-1 text-sm text-gray-500">Describe how you price a job — {atlas.name} builds the tool…</span>
        </button>
      )}

      <div className="card-ledger overflow-hidden">
        {tools.length === 0 ? (
          <EmptyState
            art="quotes"
            hue={SECTION_HUES.quotes}
            title={filtered ? "No tools match" : "No tools yet"}
            body={filtered ? "Try a different search or filter." : manager ? "Describe how you price a job above and press Build it." : "Ask a manager to build one — then this page prices jobs in a few taps."}
            actionHref={filtered ? "/app/estimates" : undefined}
            actionLabel={filtered ? "Show all tools" : undefined}
            showPlusIcon={false}
          />
        ) : (
          <>
            <div className="list-settle divide-y divide-gray-100">
              <div className={`hidden bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 lg:grid lg:gap-4 ${GRID}`}>
                <span>Tool</span>
                <span>Questions</span>
                <span>Status</span>
                <span>Runs</span>
                <span>Web leads</span>
                <span></span>
              </div>
              {tools.map((t) => (
                <ToolRow key={t.id} t={t} manager={manager} atlasName={atlas.name} onRun={(x) => setRunning([x])} />
              ))}
            </div>
            {/* Ledger foot */}
            <div className={`flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5 lg:grid lg:gap-4 ${GRID}`}>
              <span className="text-xs font-medium text-gray-500">
                {tools.length} {tools.length === 1 ? "tool" : "tools"}
                {filtered && totals.all !== tools.length ? ` of ${totals.all}` : ""}
              </span>
              <span className="hidden lg:block" />
              <span className="hidden lg:block" />
              <span className="numeral-ledger hidden text-xs font-semibold text-gray-700 lg:block">{tools.reduce((s, t) => s + t.runs, 0).toLocaleString()}</span>
              <span className="numeral-ledger hidden text-xs font-semibold text-gray-700 lg:block">{tools.reduce((s, t) => s + t.submissions, 0).toLocaleString()}</span>
              <span className="hidden lg:block" />
            </div>
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
