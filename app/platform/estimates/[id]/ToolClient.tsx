"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calculator, Check, Copy, Globe, History, LayoutDashboard, Loader2, MoreHorizontal, Play, Power, SlidersHorizontal, Sparkles, Trash2 } from "lucide-react";
import { EstimatorRunnerPanel, valuesToForm } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { APP_THEME, moneyExact, wash } from "@/components/EstimatorControls";
import RatesToConfirm from "@/components/RatesToConfirm";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { EstimatorSpec } from "@/lib/estimator";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "../BuildPanel";
import EstimatorEditor, { type EditorSection } from "../EstimatorEditor";
import PublishPanel from "../PublishPanel";

/**
 * One tool's page. Six sections, the fewest that cover the job: Overview ·
 * Try it · Ask Atlas (how most owners change a tool) · Website (one switch,
 * the link right there) · Advanced (the hand editor, for the few who want
 * it) · History. A left rail on desktop, a chip rail on phones; ?s= keeps
 * the section in the URL.
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
  updatedAt: string;
};

type Section = "overview" | "try" | "atlas" | "website" | "advanced" | "history";
type AdvancedTab = Exclude<EditorSection, "history">;

const SECTIONS: { key: Section; label: string; icon: typeof Play; manager?: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "try", label: "Try it", icon: Play },
  { key: "atlas", label: "Ask Atlas", icon: Sparkles, manager: true },
  { key: "website", label: "Website", icon: Globe, manager: true },
  { key: "advanced", label: "Advanced", icon: SlidersHorizontal, manager: true },
  { key: "history", label: "History", icon: History, manager: true },
];

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

export default function ToolClient({ tool: initial, manager, companySlug, baseUrl, initialSection }: { tool: ToolRecord; manager: boolean; companySlug: string; baseUrl: string; initialSection?: string }) {
  const router = useRouter();
  const atlas = useAssistant();
  const theme = APP_THEME;
  const [tool, setTool] = useState(initial);
  useEffect(() => setTool(initial), [initial]);
  const allowed = SECTIONS.filter((s) => !s.manager || manager);
  const legacy: Record<string, Section> = { questions: "advanced", pricing: "advanced", words: "advanced" };
  const [section, setSection] = useState<Section>(() => {
    const s = initialSection ? legacy[initialSection] ?? initialSection : "overview";
    return allowed.some((x) => x.key === s) ? (s as Section) : "overview";
  });
  const [advTab, setAdvTab] = useState<AdvancedTab>(initialSection === "pricing" || initialSection === "words" ? initialSection : "questions");
  const [busy, setBusy] = useState<"active" | "delete" | "publish" | "rates" | null>(null);
  const [error, setError] = useState("");
  const [menu, setMenu] = useState(false);
  const [copied, setCopied] = useState(false);
  const [runKey, setRunKey] = useState(0);

  function go(s: Section) {
    setSection(s);
    setMenu(false);
    try {
      const url = new URL(window.location.href);
      url.searchParams.set("s", s);
      window.history.replaceState(null, "", url.toString());
    } catch {
      /* ignore */
    }
  }

  const spec = tool.spec;
  const placeholders = spec?.placeholders ?? [];
  const assessed = spec?.inputs.filter((i) => i.askAtlas) ?? [];
  const tiers = spec?.inputs.find((i) => i.type === "select" && i.style === "packages");
  const facts = spec
    ? [
        `${spec.inputs.length} question${spec.inputs.length === 1 ? "" : "s"}`,
        tiers && tiers.type === "select" ? `${tiers.options.length} packages` : null,
        spec.inputs.some((i) => i.type === "map") ? "map measure" : null,
        spec.minimumTotal ? `$${Math.round(spec.minimumTotal)} minimum` : null,
        assessed.length > 0 ? `${atlas.name} assesses ${assessed.map((i) => i.label.toLowerCase()).join(", ")}` : null,
      ].filter(Boolean)
    : ["no longer compiles"];
  const hostedUrl = tool.isPublic && tool.publicSlug ? `${baseUrl}/book/${companySlug}/estimate/${tool.publicSlug}` : "";

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
    setMenu(false);
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
    setMenu(false);
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

  /** Overview: "Put it on your website" publishes on the spot and shows the link. */
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

  const navItem = (s: (typeof SECTIONS)[number], mobile: boolean) => {
    const active = section === s.key;
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => go(s.key)}
        className={
          mobile
            ? `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${active ? "border-transparent" : "border-gray-200 bg-white text-gray-700"}`
            : `flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2 text-left text-sm transition-colors ${active ? "bg-green-500/10 font-semibold text-green-700" : "font-medium text-gray-600 hover:bg-gray-50 hover:text-gray-900"}`
        }
        style={mobile && active ? { backgroundColor: theme.accent, color: theme.onAccent } : undefined}
      >
        <s.icon size={mobile ? 14 : 16} className={active || mobile ? undefined : "text-gray-400"} />
        {s.label}
      </button>
    );
  };

  const runner = spec ? { id: tool.id, name: tool.name, description: tool.description, usesAtlas: tool.usesAtlas, spec } : null;
  const advTabs: { key: AdvancedTab; label: string }[] = [
    { key: "questions", label: "Questions" },
    { key: "pricing", label: "Pricing" },
    { key: "words", label: "Words" },
  ];
  const editorSection: EditorSection = section === "history" ? "history" : advTab;

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-8" onClick={() => menu && setMenu(false)}>
      {/* header */}
      <Link href="/app/estimates" className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-gray-500 hover:text-gray-900">
        <ArrowLeft size={13} /> Estimates
      </Link>
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[12px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
            <Calculator size={20} strokeWidth={2.25} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <h1 className="text-xl font-bold tracking-tight text-gray-900">{tool.name}</h1>
              {!tool.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Off</span>}
              {tool.isPublic && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">On your website</span>}
            </div>
            <p className="mt-0.5 text-sm text-gray-600">{tool.description || facts.join(" · ")}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {tool.isActive && spec && (
            <button
              type="button"
              onClick={() => {
                setRunKey((k) => k + 1);
                go("try");
              }}
              className="btn-primary h-10 justify-center"
            >
              <Play size={15} /> Run
            </button>
          )}
          {manager && (
            <div className="relative">
              <button type="button" onClick={() => setMenu((m) => !m)} className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-gray-200 text-gray-500 hover:bg-gray-50" aria-label="More">
                <MoreHorizontal size={16} />
              </button>
              {menu && (
                <div className="absolute right-0 top-11 z-10 w-max min-w-[11rem] overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button type="button" disabled={busy !== null} onClick={() => void patch({ isActive: !tool.isActive }, "active")} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                    <Power size={14} /> {tool.isActive ? "Turn off" : "Turn on"}
                  </button>
                  <button type="button" disabled={busy !== null} onClick={() => void remove()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      <div className="lg:grid lg:grid-cols-[190px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <nav className="sticky top-8 hidden lg:block">
          <div className="space-y-0.5">{allowed.map((s) => navItem(s, false))}</div>
        </nav>
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 py-1 lg:hidden">{allowed.map((s) => navItem(s, true))}</div>

        <div className="min-w-0">
          {/* ── Overview ── */}
          {section === "overview" && (
            <div className="space-y-4">
              {!spec && <div className="form-error">This tool&apos;s saved rules no longer compile. Restore an earlier version under History, or rebuild it.</div>}

              {placeholders.length > 0 && manager && (
                <RatesToConfirm
                  items={placeholders}
                  onDone={(i) => void confirmRate(i)}
                  onOpenPricing={() => {
                    setAdvTab("pricing");
                    go("advanced");
                  }}
                />
              )}

              {spec && spec.samples && spec.samples.length > 0 && (
                <div className="card-ledger p-4">
                  <p className="text-sm font-semibold text-gray-900">What it prices</p>
                  <p className="mt-0.5 text-xs text-gray-500">Three sample jobs, priced by today&apos;s rules.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {spec.samples.map((s) => (
                      <div key={s.label} className="rounded-xl border border-gray-200 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-gray-900">{s.label in samplePrices ? (samplePrices[s.label] === null ? <span className="text-sm font-medium text-gray-400">didn&apos;t run</span> : moneyExact(samplePrices[s.label] as number)) : <span className="text-sm font-medium text-gray-400">…</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="card-ledger divide-y divide-gray-100">
                <button type="button" onClick={() => go("try")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <Play size={16} style={{ color: theme.accent }} />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">Try it</span>
                    <span className="block text-xs text-gray-500">Answer the questions, see the breakdown, start a quote.</span>
                  </span>
                </button>
                {manager && (
                  <button type="button" onClick={() => go("atlas")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <Sparkles size={16} style={{ color: theme.accent }} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">Change it — just tell {atlas.name}</span>
                      <span className="block text-xs text-gray-500">“Add a gate option at $250.” “Make the middle package the popular one.”</span>
                    </span>
                  </button>
                )}
                {manager && (
                  <div className="flex items-center gap-3 px-4 py-3">
                    <Globe size={16} style={{ color: theme.accent }} />
                    <button type="button" onClick={() => void publishNow()} disabled={busy === "publish"} className="min-w-0 flex-1 text-left">
                      <span className="block text-sm font-medium text-gray-900">{tool.isPublic ? "On your website" : "Put it on your website"}</span>
                      <span className="block truncate text-xs text-gray-500">{tool.isPublic ? hostedUrl : "One tap — you get a link and an embed code."}</span>
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
              <div className="mb-3">
                <h2 className="text-base font-semibold text-gray-900">Change “{tool.name}”</h2>
                <p className="mt-0.5 text-xs text-gray-500">Say what should be different. The current version is kept under History.</p>
              </div>
              <BuildPanel
                key={tool.updatedAt}
                compact
                estimatorId={tool.id}
                placeholder="e.g. Raise sealant to $0.50, add a gate option at $250, make the middle package the recommended one"
                onBuilt={(t: BuiltTool) => {
                  setTool((prev) => merge(t, prev));
                  router.refresh();
                }}
                onTry={() => go("try")}
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
              <p className="text-xs text-gray-500">Most changes are quicker to ask {atlas.name} for.</p>
            </div>
          )}
          {manager && spec && (
            <div className={section === "advanced" || section === "history" ? "" : "hidden"}>
              <EstimatorEditor tool={{ id: tool.id, name: tool.name, description: tool.description, spec, usesAtlas: tool.usesAtlas }} section={editorSection} onSaved={() => router.refresh()} />
            </div>
          )}

          {/* ── Website ── */}
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
    </div>
  );
}
