"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Calculator, ChevronRight, Play, Plus, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import Monogram from "@/components/Monogram";
import FilterBar, { listHref } from "@/components/FilterBar";
import { SegmentedRow, Segment } from "@/components/FilterChips";
import MobileSearch from "@/components/MobileSearch";
import EntityRowActions from "@/components/EntityRowActions";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { SECTION_HUES } from "@/lib/section-colors";
import { shortDate } from "@/lib/statuses";
import { ESTIMATE_SORTS } from "@/lib/list-sort";
import type { EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "./BuildPanel";
import LibraryClient from "./library/LibraryClient";

/**
 * /app/estimates — laid out like Agreements: title + one primary button, a
 * Tools | Library view switch, the phone search bar, the status filter with
 * a sort, and one ledger (desktop grid, two-line phone rows with a
 * monogram, a double-ruled foot). A row opens the tool's page; right-click
 * / press-and-hold gives the quick actions. Building is a sentence to
 * Atlas: the builder is the page when there's nothing yet (or the chat
 * sent a ?prompt=), otherwise "Build a tool" folds it open above the
 * ledger. ?run=1 opens the runner straight away (the + menu's "Estimate").
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

const GRID = "lg:grid-cols-[minmax(0,1fr)_90px_140px_150px_40px]";

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
function ToolRow({ t, manager, atlasName, tz, onRun }: { t: Tool; manager: boolean; atlasName: string; tz: string; onRun: (t: Tool) => void }) {
  const placeholders = t.spec.placeholders?.length ?? 0;
  const facts = toolFacts(t, atlasName);
  const sub = [t.description || facts.join(" · "), placeholders > 0 && manager ? `${placeholders} rate${placeholders === 1 ? "" : "s"} to confirm` : null].filter(Boolean).join(" · ");
  return (
    <EntityRowActions meta={{ kind: "tool", id: t.id, name: t.name, isActive: t.isActive, isPublic: Boolean(t.isPublic && t.publicSlug), manager }} onRun={t.isActive ? () => onRun(t) : undefined}>
      <Link href={`/app/estimates/${t.id}`} prefetch={false} className={`block px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 lg:grid lg:items-center lg:gap-4 lg:py-2.5 ${GRID} ${t.isActive ? "" : "opacity-70"}`}>
        {/* Phone row: monogram anchor, name + status, then what it does */}
        <div className="flex min-w-0 items-center gap-3 lg:hidden">
          <Monogram name={t.name} size={40} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-3">
              <p className="min-w-0 flex-1 truncate text-[15.5px] font-semibold text-gray-900">{t.name}</p>
              <ToolStamp t={t} />
            </div>
            <p className="mt-0.5 truncate text-[13px] text-gray-500">{sub}</p>
          </div>
        </div>
        <div className="hidden min-w-0 lg:block">
          <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
          <p className="truncate text-xs text-gray-500">{sub}</p>
        </div>
        <span className="hidden text-sm text-gray-500 lg:block">{t.spec.inputs.length}</span>
        <span className="hidden text-sm text-gray-500 lg:block">{shortDate(t.updatedAt, tz)}</span>
        <span className="hidden lg:block">
          <ToolStamp t={t} />
        </span>
        <ChevronRight size={14} className="hidden shrink-0 text-gray-400 lg:block" />
      </Link>
    </EntityRowActions>
  );
}

export default function EstimatesClient({
  tools,
  totalCount,
  filter,
  sort,
  query,
  view,
  libraryIndustry,
  tz,
  brokenCount,
  manager,
  initialPrompt = "",
  autoRun = false,
  resumeBuildId = null,
}: {
  tools: Tool[];
  totalCount: number;
  filter: EstimatesFilter;
  sort: string;
  query: string;
  view: "tools" | "library";
  libraryIndustry: string;
  tz: string;
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
  const active = useMemo(() => tools.filter((t) => t.isActive), [tools]);
  const [running, setRunning] = useState<Tool[] | null>(autoRun ? active : null);
  const [building, setBuilding] = useState<boolean>(Boolean(initialPrompt) || Boolean(resumeBuildId) || totalCount === 0);
  useEffect(() => {
    if (totalCount === 0 && manager) setBuilding(true);
  }, [totalCount, manager]);

  const filtered = Boolean(filter) || Boolean(query);
  const current = { q: query || undefined, status: filter || undefined, sort: sort !== ESTIMATE_SORTS[0].value ? sort : undefined };

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-y-3 lg:mb-6">
        <PageTitle section="quotes" icon={Calculator} sub={manager ? "Tell Atlas how you price a job. It builds a tool your team runs onsite and your website runs for you." : "Answer a tool's questions, show the number, turn it into a quote."}>
          Estimates
        </PageTitle>
        {view === "tools" && manager ? (
          <button type="button" onClick={() => setBuilding((b) => !b)} aria-label={building ? "Close the builder" : "Build a tool"} className={building ? "btn-tool-line flex h-10 shrink-0 items-center justify-center gap-1.5 rounded-[10px] bg-white px-3 text-sm font-semibold text-gray-700 hover:bg-gray-50 sm:px-4" : "btn-primary h-10 shrink-0 justify-center sm:px-4"}>
            {building ? <X size={15} /> : <Plus size={15} />}
            <span className="hidden sm:inline">{building ? "Close" : "Build a tool"}</span>
          </button>
        ) : view === "tools" && active.length > 0 ? (
          <button type="button" onClick={() => setRunning(active)} className="btn-primary h-10 shrink-0 justify-center">
            <Play size={15} /> Run a tool
          </button>
        ) : null}
      </div>

      <SegmentedRow className="mb-4 max-w-xs">
        <Segment active={view === "tools"} href="/app/estimates">
          Tools
        </Segment>
        <Segment active={view === "library"} href="/app/estimates?view=library">
          Library
        </Segment>
      </SegmentedRow>

      {view === "library" ? (
        <LibraryClient embedded manager={manager} defaultIndustry={libraryIndustry} />
      ) : (
        <>
          {manager && building && (
            <div className="mb-6">
              <BuildPanel
                resumeBuildId={resumeBuildId}
                initialPrompt={initialPrompt}
                autoStart={Boolean(initialPrompt)}
                autoFocus={Boolean(initialPrompt) || totalCount > 0}
                onBuilt={(t: BuiltTool) => {
                  // straight into the new tool: the form, the sample chips, Ask Atlas one tap away
                  router.push(`/app/estimates/${t.id}?s=try`);
                }}
              />
            </div>
          )}

          {totalCount > 0 && (
            <>
              <MobileSearch action="/app/estimates" placeholder="Search tools…" defaultValue={query} params={{ status: filter || undefined, sort: current.sort }} />
              {manager ? (
                <FilterBar
                  hue={SECTION_HUES.quotes}
                  options={statusFilters}
                  value={filter}
                  href={(v) => listHref("/app/estimates", current, { status: v })}
                  sort={{ options: ESTIMATE_SORTS, value: sort, href: (v) => listHref("/app/estimates", current, { sort: v }) }}
                />
              ) : (
                <FilterBar hue={SECTION_HUES.quotes} options={statusFilters.slice(0, 2)} value={filter === "published" ? filter : ""} href={(v) => listHref("/app/estimates", current, { status: v })} sort={{ options: ESTIMATE_SORTS, value: sort, href: (v) => listHref("/app/estimates", current, { sort: v }) }} />
              )}
            </>
          )}

          <div className="card-ledger overflow-hidden">
            {tools.length === 0 ? (
              <EmptyState
                art="quotes"
                hue={SECTION_HUES.quotes}
                title={filtered ? "No tools match this filter" : "No tools yet"}
                body={filtered ? "Try a different search or status." : manager ? "Describe how you price a job above and press Build it." : "Ask a manager to build one — then this page prices jobs in a few taps."}
                actionHref={filtered ? "/app/estimates" : undefined}
                actionLabel={filtered ? "Show all tools" : undefined}
                showPlusIcon={false}
              />
            ) : (
              <>
                <div className="divide-y divide-gray-100">
                  <div className={`hidden bg-gray-50 px-4 py-2 text-xs font-medium text-gray-500 lg:grid lg:gap-4 ${GRID}`}>
                    <span>Tool</span>
                    <span>Questions</span>
                    <span>Updated</span>
                    <span>Status</span>
                    <span></span>
                  </div>
                  {tools.map((t) => (
                    <ToolRow key={t.id} t={t} manager={manager} atlasName={atlas.name} tz={tz} onRun={(x) => setRunning([x])} />
                  ))}
                </div>
                {/* Ledger foot */}
                <div className="flex items-center justify-between gap-4 border-t-2 border-double border-gray-300 bg-gray-50/60 px-4 py-2.5">
                  <span className="text-xs font-medium text-gray-500">
                    {tools.length} {tools.length === 1 ? "tool" : "tools"}
                    {filtered && totalCount !== tools.length ? ` of ${totalCount}` : ""}
                  </span>
                </div>
              </>
            )}
          </div>
          {brokenCount > 0 && (
            <p className="mt-3 text-xs text-amber-700">
              {brokenCount} tool{brokenCount === 1 ? "" : "s"} no longer compile{brokenCount === 1 ? "s" : ""} and {brokenCount === 1 ? "is" : "are"} hidden.
            </p>
          )}
        </>
      )}

      <EstimatorRunner estimators={running ?? []} open={running !== null} onClose={() => setRunning(null)} showSamples={manager} />
    </div>
  );
}
