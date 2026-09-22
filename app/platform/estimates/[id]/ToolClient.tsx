"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, ArrowLeft, Calculator, Check, Clock, Copy, DollarSign, Globe, History, LayoutDashboard, ListChecks, MessageSquareText, MoreHorizontal, Play, Power, Sparkles, Trash2, Type } from "lucide-react";
import { EstimatorRunnerPanel, valuesToForm } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { APP_THEME, moneyExact, wash } from "@/components/EstimatorControls";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import type { EstimatorSpec } from "@/lib/estimator";
import type { EstimatorPublicConfig } from "@/lib/estimator-public";
import BuildPanel, { type BuiltTool } from "../BuildPanel";
import EstimatorEditor, { type EditorSection } from "../EstimatorEditor";
import PublishPanel from "../PublishPanel";

/**
 * One tool's page. A left rail on desktop (the Settings idiom) and a chip
 * rail on phones switch between: Overview (what it is, how it's doing, the
 * sample jobs priced, what still needs a real rate) · Try it (the runner,
 * in the page) · Ask Atlas (change it in a sentence) · Questions · Pricing ·
 * Words · Website · History. The section rides in ?s= so links land on it.
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

type Section = "overview" | "try" | "atlas" | EditorSection | "website";

const SECTIONS: { key: Section; label: string; icon: typeof Play; manager?: boolean }[] = [
  { key: "overview", label: "Overview", icon: LayoutDashboard },
  { key: "try", label: "Try it", icon: Play },
  { key: "atlas", label: "Ask Atlas", icon: Sparkles, manager: true },
  { key: "questions", label: "Questions", icon: ListChecks, manager: true },
  { key: "pricing", label: "Pricing", icon: DollarSign, manager: true },
  { key: "words", label: "Words", icon: Type, manager: true },
  { key: "website", label: "Website", icon: Globe, manager: true },
  { key: "history", label: "History", icon: History, manager: true },
];

function toRecord(t: BuiltTool, prev: ToolRecord): ToolRecord {
  const r = t as Record<string, unknown>;
  return {
    ...prev,
    id: t.id,
    name: t.name,
    description: typeof r.description === "string" ? r.description : prev.description,
    spec: (r.spec as EstimatorSpec) ?? prev.spec,
    usesAtlas: r.usesAtlas === true,
    isActive: r.isActive !== false,
    updatedAt: typeof r.updatedAt === "string" ? r.updatedAt : new Date().toISOString(),
  };
}

export default function ToolClient({ tool: initial, manager, companySlug, baseUrl, initialSection }: { tool: ToolRecord; manager: boolean; companySlug: string; baseUrl: string; initialSection?: string }) {
  const router = useRouter();
  const atlas = useAssistant();
  const theme = APP_THEME;
  const [tool, setTool] = useState(initial);
  useEffect(() => setTool(initial), [initial]);
  const allowed = SECTIONS.filter((s) => !s.manager || manager);
  const [section, setSection] = useState<Section>(() => (allowed.some((s) => s.key === initialSection) ? (initialSection as Section) : "overview"));
  const [busy, setBusy] = useState(false);
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
  const sectionsCount = new Set(spec?.inputs.map((i) => i.section).filter(Boolean)).size;
  const facts = spec
    ? [
        `${spec.inputs.length} question${spec.inputs.length === 1 ? "" : "s"}${sectionsCount > 1 ? ` in ${sectionsCount} steps` : ""}`,
        tiers && tiers.type === "select" ? `${tiers.options.length} packages` : null,
        spec.inputs.some((i) => i.type === "map") ? "map measure" : null,
        spec.minimumTotal ? `$${Math.round(spec.minimumTotal)} minimum` : null,
        assessed.length > 0 ? `${atlas.name} assesses ${assessed.length}` : null,
      ].filter(Boolean)
    : ["no longer compiles"];
  const hostedUrl = tool.isPublic && tool.publicSlug ? `${baseUrl}/book/${companySlug}/estimate/${tool.publicSlug}` : "";

  // Overview: the sample jobs priced by the live rules (free preview runs)
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

  async function setActive(isActive: boolean) {
    setBusy(true);
    setError("");
    setMenu(false);
    const { ok, data } = await postJson<BuiltTool & { error?: string }>(`/api/app/estimators/${tool.id}`, { isActive }, "PATCH");
    setBusy(false);
    if (!ok || !data || !("id" in data)) setError(data?.error ?? GENERIC_ERROR);
    else {
      setTool((t) => toRecord(data, t));
      router.refresh();
    }
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
    setBusy(true);
    const { ok, data } = await postJson(`/api/app/estimators/${tool.id}`, undefined, "DELETE");
    setBusy(false);
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

  const navItem = (s: (typeof SECTIONS)[number], mobile: boolean) => {
    const active = section === s.key;
    return (
      <button
        key={s.key}
        type="button"
        onClick={() => go(s.key)}
        className={
          mobile
            ? `inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] font-medium ${active ? "border-transparent text-white" : "border-gray-200 bg-white text-gray-700"}`
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
            {tool.description && <p className="mt-0.5 text-sm text-gray-600">{tool.description}</p>}
            <p className="mt-1 text-xs text-gray-500">{facts.join(" · ")}</p>
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
                  <button type="button" disabled={busy} onClick={() => void setActive(!tool.isActive)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50">
                    <Power size={14} /> {tool.isActive ? "Turn off" : "Turn on"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => void remove()} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
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

      <div className="lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-8">
        {/* desktop rail */}
        <nav className="sticky top-8 hidden lg:block">
          <div className="space-y-0.5">{allowed.map((s) => navItem(s, false))}</div>
        </nav>
        {/* phone rail */}
        <div className="no-scrollbar -mx-4 mb-4 flex gap-2 overflow-x-auto px-4 py-1 lg:hidden">{allowed.map((s) => navItem(s, true))}</div>

        <div className="min-w-0">
          {/* ── Overview ── */}
          {section === "overview" && (
            <div className="space-y-4">
              {!spec && (
                <div className="form-error">This tool&apos;s saved rules no longer compile. Restore an earlier version under History, or rebuild it.</div>
              )}
              {placeholders.length > 0 && manager && (
                <button type="button" onClick={() => go("pricing")} className="flex w-full items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left hover:bg-amber-100/60">
                  <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-700" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold text-amber-900">
                      {placeholders.length} rate{placeholders.length === 1 ? "" : "s"} to set — {atlas.name} used placeholders
                    </span>
                    <span className="mt-0.5 block text-xs text-amber-900/90">{placeholders.slice(0, 3).join(" · ")}{placeholders.length > 3 ? ` · +${placeholders.length - 3} more` : ""}</span>
                  </span>
                </button>
              )}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                {[
                  { label: "Estimates run", value: tool.runs, icon: Play },
                  { label: "Website views", value: tool.publicViews, icon: Globe },
                  { label: "Website estimates", value: tool.publicCalcs, icon: Calculator },
                  { label: "Website leads", value: tool.submissions, icon: MessageSquareText },
                ].map((s) => (
                  <div key={s.label} className="card-ledger px-4 py-3">
                    <p className="flex items-center gap-1.5 text-[11px] font-medium text-gray-500">
                      <s.icon size={12} /> {s.label}
                    </p>
                    <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-gray-900">{s.value.toLocaleString()}</p>
                  </div>
                ))}
              </div>
              {spec && spec.samples && spec.samples.length > 0 && (
                <div className="card-ledger p-4">
                  <p className="text-sm font-semibold text-gray-900">Sample jobs, priced by today&apos;s rules</p>
                  <p className="mt-0.5 text-xs text-gray-500">The jobs {atlas.name} proved the math on. Change a rate and these move.</p>
                  <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {spec.samples.map((s) => (
                      <div key={s.label} className="rounded-xl border border-gray-200 px-3 py-2.5">
                        <p className="text-[11px] font-medium text-gray-500">{s.label}</p>
                        <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-gray-900">{s.label in samplePrices ? (samplePrices[s.label] === null ? <span className="text-sm font-medium text-amber-700">didn&apos;t run</span> : moneyExact(samplePrices[s.label] as number)) : <span className="text-sm font-medium text-gray-400">…</span>}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {assessed.length > 0 && (
                <div className="card-ledger flex items-start gap-3 p-4">
                  <Sparkles size={16} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-gray-900">{atlas.name} assesses {assessed.map((i) => i.label.toLowerCase()).join(", ")}</p>
                    <p className="mt-0.5 text-xs text-gray-500">From the job description or photo, each estimate — that costs your tokens per use. Answering by hand is always free.</p>
                  </div>
                </div>
              )}
              <div className="card-ledger divide-y divide-gray-100">
                <button type="button" onClick={() => go("try")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                  <Play size={16} className="text-gray-400" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium text-gray-900">Try it</span>
                    <span className="block text-xs text-gray-500">Answer the questions, see the breakdown, start a quote.</span>
                  </span>
                </button>
                {manager && (
                  <button type="button" onClick={() => go("atlas")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <Sparkles size={16} className="text-gray-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">Change it with {atlas.name}</span>
                      <span className="block text-xs text-gray-500">“Add a gate option at $250” — the current version is kept.</span>
                    </span>
                  </button>
                )}
                {manager && (
                  <button type="button" onClick={() => go("website")} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
                    <Globe size={16} className="text-gray-400" />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium text-gray-900">{tool.isPublic ? "On your website" : "Put it on your website"}</span>
                      <span className="block text-xs text-gray-500">{tool.isPublic ? hostedUrl : "A lead-capture form that prices the job for visitors."}</span>
                    </span>
                    {tool.isPublic && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          void copyLink();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") void copyLink();
                        }}
                        className="inline-flex h-8 items-center gap-1 rounded-lg border border-gray-200 px-2 text-xs font-medium text-gray-700 hover:bg-gray-100"
                      >
                        {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />} {copied ? "Copied" : "Copy link"}
                      </span>
                    )}
                  </button>
                )}
              </div>
              <p className="flex items-center gap-1 text-[11px] text-gray-400">
                <Clock size={11} /> Last changed {new Date(tool.updatedAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
              </p>
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
                <p className="mt-0.5 text-xs text-gray-500">Tell {atlas.name} what should be different. The current version is kept under History, so you can always go back.</p>
              </div>
              <BuildPanel
                key={tool.updatedAt}
                compact
                estimatorId={tool.id}
                placeholder="e.g. Raise sealant to $0.50, add a gate option at $250, make the middle package the recommended one"
                onBuilt={(t) => {
                  setTool((prev) => toRecord(t, prev));
                  router.refresh();
                }}
                onTry={() => go("try")}
                onEdit={() => go("questions")}
              />
            </div>
          )}

          {/* ── the editor (stays mounted so edits survive switching sections) ── */}
          {manager && spec && (
            <div className={section === "questions" || section === "pricing" || section === "words" || section === "history" ? "" : "hidden"}>
              <EstimatorEditor
                tool={{ id: tool.id, name: tool.name, description: tool.description, spec, usesAtlas: tool.usesAtlas }}
                section={section === "questions" || section === "pricing" || section === "words" || section === "history" ? section : "questions"}
                onSaved={() => router.refresh()}
              />
            </div>
          )}

          {/* ── Website ── */}
          {section === "website" && manager && (
            <PublishPanel
              tool={{ id: tool.id, name: tool.name, usesAtlas: tool.usesAtlas, isPublic: tool.isPublic, publicSlug: tool.publicSlug, publicConfig: tool.publicConfig, publicViews: tool.publicViews, publicCalcs: tool.publicCalcs, submissions: tool.submissions }}
              companySlug={companySlug}
              baseUrl={baseUrl}
              onSaved={() => router.refresh()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
