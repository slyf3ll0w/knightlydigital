"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { BookOpen, Calculator, Check, ChevronLeft, ChevronRight, Copy, Globe, History, LayoutDashboard, Loader2, MoreHorizontal, Play, Power, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import BackLink from "@/components/BackLink";
import { EstimatorRunnerPanel, valuesToForm } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { QuickMenu, type MenuAnchor, type QuickAction } from "@/components/QuickMenu";
import { APP_THEME, moneyExact, wash } from "@/components/EstimatorControls";
import RatesToConfirm from "@/components/RatesToConfirm";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { EstimatorSpec } from "@/lib/estimator";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "../BuildPanel";
import EstimatorEditor, { type EditorSection } from "../EstimatorEditor";
import PublishPanel from "../PublishPanel";
import SharePanel from "../SharePanel";
import { toolFacts } from "../EstimatesClient";

/**
 * One tool's page. Seven sections, the fewest that cover the job: Overview ·
 * Try it · Ask Atlas (how most owners change a tool) · Web form (one switch,
 * the link right there) · Library · Advanced (the hand editor, for the few
 * who want it) · History.
 *
 * Desktop: a Settings-style left rail, one panel at a time. Phones: the
 * iOS-Settings pattern — Overview IS the index (facts, rates to confirm,
 * sample prices, then a list of rows), a row pushes into one section with
 * "‹ Tool name" at the top, and the browser back returns to the index. The
 * section rides in the URL as ?s= either way.
 */

export type ToolRecord = {
  id: string;
  name: string;
  description: string | null;
  spec: EstimatorSpec | null;
  usesAtlas: boolean;
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

type Section = "overview" | "try" | "atlas" | "website" | "share" | "advanced" | "history";
type AdvancedTab = Exclude<EditorSection, "history">;

const SECTIONS: { key: Section; label: string; icon: typeof Play; manager?: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "try", label: "Try it", icon: Play },
  { key: "atlas", label: "Ask Atlas", icon: Sparkles, manager: true },
  { key: "website", label: "Web form", icon: Globe, manager: true },
  { key: "share", label: "Library", icon: BookOpen, manager: true },
  { key: "advanced", label: "Advanced", icon: SlidersHorizontal, manager: true },
  { key: "history", label: "History", icon: History, manager: true },
];
const LEGACY: Record<string, Section> = { questions: "advanced", pricing: "advanced", words: "advanced" };

function merge(t: Record<string, unknown>, prev: ToolRecord): ToolRecord {
  return {
    ...prev,
    ...(typeof t.name === "string" ? { name: t.name } : {}),
    ...(typeof t.description === "string" || t.description === null ? { description: t.description as string | null } : {}),
    ...(t.spec ? { spec: t.spec as EstimatorSpec } : {}),
    ...(typeof t.usesAtlas === "boolean" ? { usesAtlas: t.usesAtlas } : {}),
    ...(typeof t.isActive === "boolean" ? { isActive: t.isActive } : {}),
    ...(typeof t.isPublic === "boolean" ? { isPublic: t.isPublic } : {}),
    ...(typeof t.publicSlug === "string" || t.publicSlug === null ? { publicSlug: t.publicSlug as string | null } : {}),
    ...(t.publicConfig ? { publicConfig: sanitizePublicConfig(t.publicConfig) } : {}),
    ...(typeof t.updatedAt === "string" ? { updatedAt: t.updatedAt } : {}),
  };
}

const isPhone = () => typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;

export default function ToolClient({
  tool: initial,
  manager,
  companySlug,
  companyName = "",
  companyIndustry = null,
  baseUrl,
  initialSection,
  resumeBuildId = null,
}: {
  tool: ToolRecord;
  manager: boolean;
  companySlug: string;
  companyName?: string;
  companyIndustry?: string | null;
  baseUrl: string;
  initialSection?: string;
  /** An Atlas change to this tool still running on the server — the Ask Atlas panel picks it up. */
  resumeBuildId?: string | null;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const atlas = useAssistant();
  const theme = APP_THEME;
  const [tool, setTool] = useState(initial);
  useEffect(() => setTool(initial), [initial]);
  const allowed = useMemo(() => SECTIONS.filter((s) => !s.manager || manager), [manager]);

  // the section lives in the URL: ?s=, legacy tab names map into Advanced,
  // a change still building opens on Ask Atlas so it's seen landing
  const resolve = useCallback(
    (raw: string | null | undefined): Section => {
      const s = raw ? LEGACY[raw] ?? raw : resumeBuildId ? "atlas" : "overview";
      return allowed.some((x) => x.key === s) ? (s as Section) : "overview";
    },
    [allowed, resumeBuildId]
  );
  const sParam = params.get("s") ?? initialSection ?? null;
  const section = resolve(sParam);
  const [advTab, setAdvTab] = useState<AdvancedTab>(sParam === "pricing" || sParam === "words" ? sParam : "questions");
  const [busy, setBusy] = useState<"active" | "delete" | "publish" | "rates" | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState<MenuAnchor | null>(null);
  const [copied, setCopied] = useState(false);
  const [runKey, setRunKey] = useState(0);

  const go = useCallback((s: Section, tab?: AdvancedTab) => {
    if (tab) setAdvTab(tab);
    try {
      const url = new URL(window.location.href);
      if (s === "overview") url.searchParams.delete("s");
      else url.searchParams.set("s", s);
      // phones push (back returns to the index); desktop just keeps the URL current
      if (isPhone()) {
        window.history.pushState(null, "", url.toString());
        window.scrollTo({ top: 0 });
      } else window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }, []);

  const spec = tool.spec;
  const placeholders = spec?.placeholders ?? [];
  const facts = spec ? toolFacts({ spec }, atlas.name) : ["no longer compiles"];
  const hostedUrl = tool.isPublic && tool.publicSlug ? `${baseUrl}/book/${companySlug}/estimate/${tool.publicSlug}` : "";
  const published = Boolean(tool.isPublic && tool.publicSlug);

  // Overview: the sample jobs priced by the live rules (free dry runs)
  const [samplePrices, setSamplePrices] = useState<Record<string, number | null>>({});
  useEffect(() => {
    if (!spec || !spec.samples?.length || section !== "overview") return;
    let cancelled = false;
    (async () => {
      const out: Record<string, number | null> = {};
      for (const s of spec.samples ?? []) {
        const { data } = await postJson<{ ok?: boolean; subtotal?: number }>(`/api/app/estimators/${tool.id}/run?dry=1`, { inputs: valuesToForm(spec, s.inputs) });
        out[s.label] = data && data.ok && typeof data.subtotal === "number" ? data.subtotal : null;
      }
      if (!cancelled) setSamplePrices(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [spec, section, tool.id]);

  async function patch(body: Record<string, unknown>, kind: NonNullable<typeof busy>): Promise<boolean> {
    setBusy(kind);
    setError("");
    const { ok, data } = await postJson<Record<string, unknown> & { error?: string }>(`/api/app/estimators/${tool.id}`, body, "PATCH");
    setBusy(null);
    if (!ok || !data || !("id" in data)) {
      setError(typeof data?.error === "string" ? data.error : GENERIC_ERROR);
      return false;
    }
    setTool((t) => merge(data, t));
    router.refresh();
    return true;
  }

  async function remove() {
    if (
      !(await confirmSheet({
        title: `Delete “${tool.name}”?`,
        message: "Quotes already made with it are untouched. The tool and its history are gone for good.",
        confirmLabel: "Delete Tool",
        destructive: true,
      }))
    )
      return;
    setBusy("delete");
    const { ok, data } = await postJson(`/api/app/estimators/${tool.id}`, undefined, "DELETE");
    setBusy(null);
    if (!ok) setError(data?.error ?? GENERIC_ERROR);
    else router.push("/app/estimates");
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(hostedUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* ignore */
    }
  }

  /** Overview: "Publish as a web form" publishes on the spot and shows the link. */
  async function publishNow() {
    if (tool.isPublic) {
      go("website");
      return;
    }
    if (await patch({ isPublic: true }, "publish")) go("website");
  }

  /** Overview: tick a rate off — the spec minus that line, saved as a manual edit. */
  async function confirmRate(index: number) {
    if (!spec) return;
    const next = { ...spec, placeholders: (spec.placeholders ?? []).filter((_, i) => i !== index) };
    await patch({ spec: next }, "rates");
  }

  function run() {
    setRunKey((k) => k + 1);
    go("try");
  }

  const menuActions: QuickAction[] = [
    ...(published ? [{ key: "copy", label: copied ? "Link copied" : "Copy web form link", icon: Copy, onSelect: () => void copyLink() } as QuickAction] : []),
    { key: "power", label: tool.isActive ? "Turn off" : "Turn on", icon: Power, disabled: busy !== null, onSelect: () => void patch({ isActive: !tool.isActive }, "active") },
    { key: "delete", label: "Delete", icon: Trash2, destructive: true, disabled: busy !== null, onSelect: () => void remove() },
  ];

  const runner = spec ? { id: tool.id, name: tool.name, description: tool.description, usesAtlas: tool.usesAtlas, spec } : null;
  const advTabs: { key: AdvancedTab; label: string }[] = [
    { key: "questions", label: "Questions" },
    { key: "pricing", label: "Pricing" },
    { key: "words", label: "Words" },
  ];
  const editorSection: EditorSection = section === "history" ? "history" : advTab;
  const sectionLabel = SECTIONS.find((s) => s.key === section)?.label ?? "";

  const subline: Record<Section, string> = {
    overview: "",
    try: "Answer the questions, see the breakdown, start a quote.",
    atlas: `“Add a gate option at $250.” “Make the middle package the popular one.”`,
    website: published ? "Published — share the link or embed it on your site." : "One switch — a link to share and an embed code for your site.",
    share: "Share it with other businesses, or update your listing.",
    advanced: "Questions, pricing and words, by hand.",
    history: "Every version of the rules — restore any of them.",
  };

  const pills = (
    <>
      {!tool.isActive && <span className="stamp text-gray-500">Off</span>}
      {published && <span className="stamp text-sky-700">Published</span>}
      {tool.sourceListingId && <span className="stamp text-gray-500">From the Library</span>}
    </>
  );

  const railItem = (s: (typeof SECTIONS)[number]) => {
    const active = section === s.key;
    return (
      <button key={s.key} type="button" onClick={() => go(s.key)} className={`flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${active ? "bg-green-500/10 font-semibold text-green-700" : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`}>
        <s.icon size={16} className={active ? undefined : "text-gray-400"} />
        {s.label}
      </button>
    );
  };

  const indexRow = (s: (typeof SECTIONS)[number]) => (
    <button key={s.key} type="button" onClick={() => (s.key === "try" ? run() : go(s.key))} className="flex w-full items-center gap-3 px-4 py-3 text-left active:bg-gray-100">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-green-500/10 text-green-700">
        <s.icon size={17} strokeWidth={2.25} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium text-gray-900">{s.key === "atlas" ? `Change it — ask ${atlas.name}` : s.label}</span>
        <span className="block truncate text-xs text-gray-500">{subline[s.key]}</span>
      </span>
      <ChevronRight size={16} className="shrink-0 text-gray-300" />
    </button>
  );

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 lg:p-8">
      {/* ── header: desktop always, phones only on the index ── */}
      <div className={section === "overview" ? "" : "hidden lg:block"}>
        <BackLink href="/app/estimates" className="mb-3" />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
          <div className="flex min-w-0 items-start gap-3">
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
              <Calculator size={20} strokeWidth={2.25} />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                <h1 className="text-[22px] font-bold tracking-tight text-gray-900 lg:text-xl">{tool.name}</h1>
                {pills}
              </div>
              <p className="mt-0.5 text-sm text-gray-600">{tool.description || facts.join(" · ")}</p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {tool.isActive && spec && (
              <button type="button" onClick={run} className="btn-primary hidden h-10 justify-center lg:flex">
                <Play size={15} /> Run
              </button>
            )}
            {manager && (
              <button
                type="button"
                onClick={(e) => {
                  const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
                  setMenu({ x: r.right, y: r.bottom + 4, alignRight: true });
                }}
                className="btn-tool-line flex h-10 w-10 items-center justify-center rounded-[10px] bg-white text-gray-500 hover:bg-gray-50"
                aria-label="More"
              >
                <MoreHorizontal size={16} />
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── phone header inside a section: back to the index + the section's title ── */}
      {section !== "overview" && (
        <div className="mb-4 lg:hidden">
          <button type="button" onClick={() => go("overview")} className="-ml-1.5 flex max-w-full items-center gap-0.5 text-[15px] font-medium text-green-700">
            <ChevronLeft size={19} className="shrink-0" />
            <span className="truncate">{tool.name}</span>
          </button>
          <h2 className="mt-1 text-[22px] font-bold text-gray-900">{section === "atlas" ? `Ask ${atlas.name}` : sectionLabel}</h2>
          {subline[section] && <p className="mt-0.5 text-sm text-gray-500">{subline[section]}</p>}
        </div>
      )}

      {manager && <QuickMenu open={menu !== null} anchor={menu} title={tool.name} actions={menuActions} onClose={() => setMenu(null)} />}

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[230px_minmax(0,1fr)] lg:items-start lg:gap-10">
        <nav className="sticky top-8 hidden lg:block">
          <div className="space-y-0.5">{allowed.map(railItem)}</div>
        </nav>

        <div className="min-w-0">
          {/* ── Overview (desktop panel · phone index) ── */}
          {section === "overview" && (
            <div className="space-y-4">
              {!spec && <div className="form-error">This tool&apos;s saved rules no longer compile. Restore an earlier version under History, or rebuild it.</div>}

              {placeholders.length > 0 && manager && <RatesToConfirm items={placeholders} onDone={(i) => void confirmRate(i)} onOpenPricing={() => go("advanced", "pricing")} />}

              {spec && spec.samples && spec.samples.length > 0 && (
                <div className="card-ledger p-4">
                  <p className="text-sm font-semibold text-gray-900">What it prices</p>
                  <p className="mt-0.5 text-xs text-gray-500">Sample jobs, priced by today&apos;s rules.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {spec.samples.map((s) => (
                      <div key={s.label} className="flex items-baseline justify-between gap-3 rounded-xl border border-gray-200 px-3 py-2.5 sm:block">
                        <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
                        <p className="numeral-ledger mt-0.5 text-lg font-bold tabular-nums tracking-tight text-gray-900">{s.label in samplePrices ? (samplePrices[s.label] === null ? <span className="text-sm font-medium text-gray-400">didn&apos;t run</span> : moneyExact(samplePrices[s.label] as number)) : <span className="text-sm font-medium text-gray-400">…</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* phones: the index rows; desktop: the three things people come here for */}
              <div className="card-ledger divide-y divide-gray-100 overflow-hidden lg:hidden">{allowed.filter((s) => s.key !== "overview").map(indexRow)}</div>

              <div className="card-ledger hidden divide-y divide-gray-100 lg:block">
                <button type="button" onClick={run} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <Play size={16} style={{ color: theme.accent }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">Try it</span>
                    <span className="block text-xs text-gray-500">{subline.try}</span>
                  </span>
                </button>
                {manager && (
                  <button type="button" onClick={() => go("atlas")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <Sparkles size={16} style={{ color: theme.accent }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">Change it — just tell {atlas.name}</span>
                      <span className="block text-xs text-gray-500">{subline.atlas}</span>
                    </span>
                  </button>
                )}
                {manager && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Globe size={16} style={{ color: theme.accent }} />
                    <button type="button" onClick={() => void publishNow()} disabled={busy === "publish"} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-gray-900">{tool.isPublic ? "Published as a web form" : "Publish as a web form"}</span>
                      <span className="block truncate text-xs text-gray-500">{tool.isPublic ? `Share the link or embed it on your site · ${hostedUrl}` : "One tap — you get a link to share and an embed code for your website."}</span>
                    </button>
                    {busy === "publish" ? (
                      <Loader2 size={14} className="animate-spin text-gray-400" />
                    ) : tool.isPublic ? (
                      <button type="button" onClick={() => void copyLink()} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100">
                        {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
                      </button>
                    ) : null}
                  </div>
                )}
              </div>

              {(tool.runs > 0 || tool.publicViews > 0) && (
                <p className="px-1 text-xs text-gray-500">
                  {tool.runs > 0 ? `Run ${tool.runs.toLocaleString()} time${tool.runs === 1 ? "" : "s"} in the app` : ""}
                  {tool.runs > 0 && tool.publicViews > 0 ? " · " : ""}
                  {tool.publicViews > 0 ? `website: ${tool.publicViews.toLocaleString()} views → ${tool.publicCalcs.toLocaleString()} estimates → ${tool.submissions.toLocaleString()} leads` : ""}
                </p>
              )}
            </div>
          )}

          {/* ── Try it ── */}
          {section === "try" && runner && (
            <div className="card-ledger p-4 sm:p-5">
              <EstimatorRunnerPanel key={runKey} inline estimators={[runner]} onClose={() => go("overview")} showSamples={manager} />
            </div>
          )}

          {/* ── Ask Atlas ── */}
          {section === "atlas" && manager && (
            <div className="card-ledger p-4 sm:p-5">
              <div className="mb-3 hidden lg:block">
                <h2 className="text-base font-semibold text-gray-900">Change “{tool.name}”</h2>
                <p className="mt-0.5 text-xs text-gray-500">Say what should be different. The current version is kept under History.</p>
              </div>
              <BuildPanel
                key={tool.updatedAt}
                compact
                estimatorId={tool.id}
                resumeBuildId={resumeBuildId}
                placeholder="e.g. Raise sealant to $0.50, add a gate option at $250, make the middle package the recommended one"
                onBuilt={(t: BuiltTool) => {
                  setTool((prev) => merge(t, prev));
                  router.refresh();
                }}
                onTry={run}
              />
            </div>
          )}

          {/* ── Advanced: the hand editor ── */}
          {section === "advanced" && manager && spec && (
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div className="inline-flex rounded-full border border-gray-200 bg-gray-100 p-1">
                {advTabs.map((t) => (
                  <button key={t.key} type="button" onClick={() => setAdvTab(t.key)} className={`rounded-full px-3.5 py-1.5 text-[13px] font-medium ${advTab === t.key ? "bg-white text-gray-900 shadow-sm" : "text-gray-600"}`}>
                    {t.label}
                  </button>
                ))}
              </div>
              <p className="hidden text-xs text-gray-500 sm:block">Most changes are quicker to ask {atlas.name} for.</p>
            </div>
          )}
          {manager && spec && (
            <div className={section === "advanced" || section === "history" ? "" : "hidden"}>
              <EstimatorEditor tool={{ id: tool.id, name: tool.name, description: tool.description, spec, usesAtlas: tool.usesAtlas }} section={editorSection} onSaved={() => router.refresh()} />
            </div>
          )}

          {/* ── Library ── */}
          {section === "share" && manager && <SharePanel toolId={tool.id} toolName={tool.name} companyName={companyName} companyIndustry={companyIndustry} />}

          {/* ── Web form ── */}
          {section === "website" && manager && (
            <PublishPanel
              tool={{ id: tool.id, name: tool.name, usesAtlas: tool.usesAtlas, isPublic: tool.isPublic, publicSlug: tool.publicSlug, publicConfig: tool.publicConfig, publicViews: tool.publicViews, publicCalcs: tool.publicCalcs, submissions: tool.submissions }}
              companySlug={companySlug}
              baseUrl={baseUrl}
              onSaved={(t) => {
                setTool((prev) => merge(t as Record<string, unknown>, prev));
                router.refresh();
              }}
            />
          )}
        </div>
      </div>

      {/* phones: Run docks as a floating pill on the index (no transform — iOS drops the glass blur on transformed elements) */}
      {section === "overview" && tool.isActive && spec && (
        <button type="button" onClick={run} className="btn-primary glass-tinted fixed inset-x-0 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-30 mx-auto w-max rounded-full px-6 py-3 text-[15px] lg:hidden">
          <Play size={15} /> Run this tool
        </button>
      )}
    </div>
  );
}
