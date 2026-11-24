"use client";

import { useEffect, useMemo, useState } from "react";
import { ESTIMATOR_LIBRARY_ENABLED } from "@/lib/estimator-library-flag";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookOpen, Calculator, Play, Plus, X } from "lucide-react";
import { FlowDots } from "@/components/EstimatorFlow";
import PageTitle from "@/components/PageTitle";
import EmptyState from "@/components/EmptyState";
import FilterBar, { listHref } from "@/components/FilterBar";
import MobileSearch from "@/components/MobileSearch";
import EntityRowActions from "@/components/EntityRowActions";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { Chip, DsPage, PageHeader } from "@/components/ds";
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

/**
 * One tool as a row of the tools ledger (round 7, 2026-11-23: cards of
 * different heights read as a mess — every row is the same height and every
 * column lines up, so all the "$" ends of the question lines sit flush).
 * Hoisted so a parent re-render never remounts it and drops an open menu.
 */
function ToolRow({ t, manager, atlasName, onRun }: { t: Tool; manager: boolean; atlasName: string; onRun: (t: Tool) => void }) {
  const placeholders = (t.spec.placeholders?.length ?? 0) + (t.spec.rates ?? []).filter((r) => r.source !== "owner").length;
  const facts = toolFacts(t, atlasName);
  const missing = t.missingItems?.length ?? 0;
  const warn = manager && missing > 0 ? "Can't run: a price-book item is missing" : manager && placeholders > 0 ? `${placeholders} rate${placeholders === 1 ? "" : "s"} to confirm` : null;
  const web = Boolean(t.isPublic && t.publicSlug);
  return (
    <EntityRowActions meta={{ kind: "tool", id: t.id, name: t.name, isActive: t.isActive, isPublic: web, manager }} onRun={t.isActive ? () => onRun(t) : undefined}>
      <Link href={`/app/estimates/${t.id}`} prefetch={false} className={`ds-trow ds-etool ${t.isActive ? "" : "is-off"}`}>
        <span className="ds-etool-name">
          <span className="ds-trow-name block truncate">{t.name}</span>
          <span className={`ds-etool-sub ${warn ? "is-warn" : ""}`}>{warn ?? facts.join(" · ")}</span>
        </span>
        <span className="ds-etool-flow">
          <FlowDots spec={t.spec} />
        </span>
        <span className="ds-etool-num">
          <b>{t.runs.toLocaleString("en-US")}</b>
          <span>{t.runs === 1 ? "run" : "runs"}</span>
        </span>
        <span className="ds-etool-num">
          {web ? (
            <>
              <b>{t.submissions.toLocaleString("en-US")}</b>
              <span>{t.submissions === 1 ? "lead" : "leads"} of {t.publicCalcs.toLocaleString("en-US")}</span>
            </>
          ) : (
            <span className="ds-etool-quiet">Not online</span>
          )}
        </span>
        <span className="ds-etool-stamp">
          <ToolStamp t={t} />
        </span>
      </Link>
    </EntityRowActions>
  );
}

/** The ledger's last row: a new tool is one sentence to Atlas. Same height as a tool row. */
function NewToolRow({ atlasName, onBuild }: { atlasName: string; onBuild: () => void }) {
  return (
    <button type="button" onClick={onBuild} className="ds-etool ds-etool-new">
      <span className="ds-etool-name">
        <span className="block truncate font-bold">Build another tool</span>
        <span className="ds-etool-sub">Tell {atlasName} how you price a job. It writes the questions and the math.</span>
      </span>
      <span className="ds-etool-flow" aria-hidden>
        <span className="ds-est-new-dots">
          <i />
          <i />
          <i />
          <b>$</b>
        </span>
      </span>
      <span className="ds-etool-new-plus" aria-hidden>
        <Plus size={16} strokeWidth={2.5} />
      </span>
    </button>
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
  picture = null,
}: {
  /** The page picture (server-rendered): what the tools priced lately. */
  picture?: React.ReactNode;
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

  const info = manager ? "Tell Atlas how you price a job. It builds a tool your team runs onsite and your website runs for you." : "Answer a tool's questions, show the number, turn it into a quote.";
  const runsTotal = tools.reduce((n, t) => n + t.runs, 0);
  const formsTotal = tools.reduce((n, t) => n + t.submissions, 0);
  const liveOnSite = tools.filter((t) => t.isPublic && t.publicSlug).length;
  // The desktop header's context line, from the tools themselves
  const contextLine =
    view === "library"
      ? "Ready-made tools for your trade"
      : [
          `${totalCount} ${totalCount === 1 ? "tool" : "tools"}`,
          active.length !== totalCount ? `${active.length} on` : null,
          liveOnSite > 0 ? `${liveOnSite} on your website` : null,
          runsTotal + formsTotal > 0 ? `${(runsTotal + formsTotal).toLocaleString("en-US")} prices given` : null,
        ]
          .filter(Boolean)
          .join(" · ");
  const headerActions = (
        <div className="flex items-center gap-2">
        {view === "tools" ? (
          !ESTIMATOR_LIBRARY_ENABLED ? null : <Link href="/app/estimates?view=library" prefetch={false} className="ds-btn ds-btn-outline h-10 shrink-0">
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
          <button type="button" onClick={() => setBuilding((b) => !b)} aria-label={building ? "Close the builder" : "Build a tool"} className={building ? "ds-btn ds-btn-outline h-10 shrink-0" : "ds-btn ds-btn-primary h-10 shrink-0"}>
            {building ? <X size={15} /> : <Plus size={15} />}
            <span className="hidden sm:inline">{building ? "Close" : "Build a tool"}</span>
          </button>
        ) : view === "tools" && active.length > 0 ? (
          <button type="button" onClick={() => setRunning(active)} className="ds-btn ds-btn-primary h-10 shrink-0">
            <Play size={15} /> Run a tool
          </button>
        ) : null}
        </div>
  );

  return (
    <DsPage
      open
      header={
        <>
          {/* Phone: the title row as before */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-y-3 lg:hidden">
            <PageTitle heavy section="quotes" icon={Calculator} info={info}>
              Estimator tools
            </PageTitle>
            {headerActions}
          </div>
          {/* Desk: the open page header with a context line */}
          <div className="hidden lg:block">
            <PageHeader eyebrow={contextLine} title={view === "library" ? "Tool library" : "Estimator tools"} info={info} actions={headerActions} />
          </div>
        </>
      }
    >
      {view === "library" ? (
        <>
          <div className="mb-4 lg:hidden">
            <h2 className="ds-heavy-h2">Tool library</h2>
            <p className="mt-1 text-[13.5px] text-[color:var(--ds-muted)]">Ready-made tools for your trade. Copy one and make it yours.</p>
          </div>
          <LibraryClient embedded manager={manager} defaultIndustry={libraryIndustry} />
        </>
      ) : (
        <>
          {picture}
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

          {tools.length === 0 && !filtered && manager && building ? null : tools.length === 0 ? (
            <div className="ds-card tl-open-card">
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
              <div className="ds-card ds-etools tl-open-card ds-rise overflow-hidden">
                <div className="ds-etool ds-etool-head" aria-hidden>
                  <span>Tool</span>
                  <span>Questions, then the price</span>
                  <span className="text-right">Team</span>
                  <span className="text-right">Website</span>
                  <span />
                </div>
                {tools.map((t) => (
                  <ToolRow key={t.id} t={t} manager={manager} atlasName={atlas.name} onRun={(x) => setRunning([x])} />
                ))}
                {manager && !building && !filtered && (
                  <NewToolRow
                    atlasName={atlas.name}
                    onBuild={() => {
                      setBuilding(true);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  />
                )}
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
    </DsPage>
  );
}
