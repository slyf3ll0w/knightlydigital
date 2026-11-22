"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Calculator, Play, Plus, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import FilterBar, { listHref } from "@/components/FilterBar";
import MobileSearch from "@/components/MobileSearch";
import EntityRowActions from "@/components/EntityRowActions";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { Chip } from "@/components/ds";
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
  /** Price-book items the rules name that are gone (renamed / archived) — the tool can't run until they're back */
  missingItems?: string[];
};


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
    t.spec.minimumTotal ? `$${Math.round(t.spec.minimumTotal).toLocaleString("en-US")} minimum` : null,
    t.spec.inputs.some((i) => i.askAtlas) ? `${atlasName} assesses` : null,
  ].filter((x): x is string => Boolean(x));
}

/** One stamp, only when it says something: Off, or Published (the web form is on — whether or not it's embedded anywhere). A plain working tool wears nothing. */
function ToolStamp({ t }: { t: Tool }) {
  if (!t.isActive) return <Chip>Off</Chip>;
  if (t.isPublic && t.publicSlug) return <Chip tone="primary">Published</Chip>;
  return null;
}

/** One tool card — hoisted so a parent re-render (opening the runner, the builder) never remounts it and drops an open menu. Heavy look (2026-11-21): tools read as a shelf of solid cards, not a ledger. */
function ToolCard({ t, manager, atlasName, tz, onRun }: { t: Tool; manager: boolean; atlasName: string; tz: string; onRun: (t: Tool) => void }) {
  const placeholders = (t.spec.placeholders?.length ?? 0) + (t.spec.rates ?? []).filter((r) => r.source !== "owner").length;
  const facts = toolFacts(t, atlasName);
  const missing = t.missingItems?.length ?? 0;
  const warn = [placeholders > 0 && manager ? `${placeholders} rate${placeholders === 1 ? "" : "s"} to confirm` : null, missing > 0 && manager ? `can't run — ${missing === 1 ? "a price-book item is" : `${missing} price-book items are`} missing` : null].filter(Boolean).join(" · ");
  return (
    <EntityRowActions meta={{ kind: "tool", id: t.id, name: t.name, isActive: t.isActive, isPublic: Boolean(t.isPublic && t.publicSlug), manager }} onRun={t.isActive ? () => onRun(t) : undefined}>
      <Link href={`/app/estimates/${t.id}`} prefetch={false} className={`ds-card ds-card-raised ds-tool-card ${t.isActive ? "" : "is-off"}`}>
        <div className="flex items-start justify-between gap-3">
          <span className="ds-tool-icon" aria-hidden>
            <Calculator size={18} strokeWidth={2.2} />
          </span>
          <ToolStamp t={t} />
        </div>
        <p className="mt-3 text-[16.5px] font-bold leading-snug tracking-[-0.012em] text-[color:var(--ds-ink)]">{t.name}</p>
        {t.description && <p className="mt-1 line-clamp-2 text-[13.5px] leading-snug text-[color:var(--ds-ink-2)]">{t.description}</p>}
        {facts.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {facts.map((f) => (
              <span key={f} className="ds-tool-fact">{f}</span>
            ))}
          </div>
        )}
        {warn && <p className="mt-2 text-[12.5px] font-semibold text-[color:var(--ds-warn)]">{warn}</p>}
        <div className="ds-tool-foot">
          <span>{t.runs === 1 ? "Run once" : `Run ${t.runs} times`}</span>
          <span>Updated {shortDate(t.updatedAt, tz)}</span>
        </div>
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
        <PageTitle heavy section="quotes" icon={Calculator} info={manager ? "Tell Atlas how you price a job. It builds a tool your team runs onsite and your website runs for you." : "Answer a tool's questions, show the number, turn it into a quote."}>
          Estimates
        </PageTitle>
        <div className="flex items-center gap-2">
        {view === "tools" ? (
          <Link href="/app/estimates?view=library" prefetch={false} className="ds-btn ds-btn-outline h-10 shrink-0">
            <BookOpen size={15} />
            <span className="hidden sm:inline">Browse library</span>
          </Link>
        ) : (
          <Link href="/app/estimates" prefetch={false} className="ds-btn ds-btn-outline h-10 shrink-0">
            <ArrowLeft size={15} />
            Your tools
          </Link>
        )}
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
      </div>

      {view === "library" ? (
        <>
          <div className="mb-4">
            <h2 className="ds-heavy-h2">Tool library</h2>
            <p className="mt-1 text-[13.5px] text-[color:var(--ds-muted)]">Ready-made tools for your trade. Copy one and make it yours.</p>
          </div>
          <LibraryClient embedded manager={manager} defaultIndustry={libraryIndustry} />
        </>
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
                  // the list this page rendered is now stale — refresh it so coming back shows the new tool at once —
                  // then straight into the new tool: the form, the sample chips, Ask Atlas one tap away
                  router.refresh();
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
                  options={statusFilters}
                  value={filter}
                  href={(v) => listHref("/app/estimates", current, { status: v })}
                  sort={{ options: ESTIMATE_SORTS, value: sort, href: (v) => listHref("/app/estimates", current, { sort: v }) }}
                />
              ) : (
                <FilterBar options={statusFilters.slice(0, 2)} value={filter === "published" ? filter : ""} href={(v) => listHref("/app/estimates", current, { status: v })} sort={{ options: ESTIMATE_SORTS, value: sort, href: (v) => listHref("/app/estimates", current, { sort: v }) }} />
              )}
            </>
          )}

          {tools.length === 0 ? (
            <div className="ds-card">
              <EmptyState
                art="quotes"
                hue="var(--ds-primary)"
                title={filtered ? "No tools match this filter" : "No tools yet"}
                body={filtered ? "Try a different search or status." : manager ? "Describe how you price a job above and press Build it." : "Ask a manager to build one — then this page prices jobs in a few taps."}
                actionHref={filtered ? "/app/estimates" : undefined}
                actionLabel={filtered ? "Show all tools" : undefined}
                showPlusIcon={false}
              />
            </div>
          ) : (
            <>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {tools.map((t, i) => (
                  <div key={t.id} className="ds-rise" style={{ "--ds-i": i } as React.CSSProperties}>
                    <ToolCard t={t} manager={manager} atlasName={atlas.name} tz={tz} onRun={(x) => setRunning([x])} />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-xs font-medium text-[color:var(--ds-muted)]">
                {tools.length} {tools.length === 1 ? "tool" : "tools"}
                {filtered && totalCount !== tools.length ? ` of ${totalCount}` : ""}
              </p>
            </>
          )}
          {brokenCount > 0 && (
            <p className="mt-3 text-xs text-[color:var(--ds-warn)]">
              {brokenCount} tool{brokenCount === 1 ? "" : "s"} no longer compile{brokenCount === 1 ? "s" : ""} and {brokenCount === 1 ? "is" : "are"} hidden.
            </p>
          )}
        </>
      )}

      <EstimatorRunner estimators={running ?? []} open={running !== null} onClose={() => setRunning(null)} showSamples={manager} />
    </div>
  );
}
