"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Calculator, Check, Code2, Globe, MoreHorizontal, Pencil, Play, Power, Sparkles, Trash2, X } from "lucide-react";
import PageTitle from "@/components/PageTitle";
import EstimatorRunner, { type RunnerEstimator } from "@/components/EstimatorRunner";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { SECTION_HUES, hueInk } from "@/lib/section-colors";
import { sanitizePublicConfig, type EstimatorPublicConfig } from "@/lib/estimator-public";
import type { EstimatorSpec } from "@/lib/estimator";
import BuildPanel, { type BuiltTool } from "./BuildPanel";
import EditEstimatorSheet from "./EditEstimatorSheet";
import PublishEstimatorSheet from "./PublishEstimatorSheet";
import AskAtlasSheet from "./AskAtlasSheet";

/**
 * /app/estimates — the whole estimate-tool story on one page
 * (docs/plans/ai-estimators-2026-09-19.md, Batch 5): build from a sentence
 * at the top, then every tool as a card with Run (onsite → Create quote),
 * Ask Atlas (change by prompt), Edit (by hand), Website (form + embed code).
 * ?run=1 opens the runner straight away (the + menu's "Estimate");
 * ?prompt=… arrives from the Atlas chat with the owner's words filled in.
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

export default function EstimatesClient({
  tools: initialTools,
  brokenCount,
  companySlug,
  baseUrl,
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
  const [tools, setTools] = useState<Tool[]>(initialTools);
  useEffect(() => setTools(initialTools), [initialTools]);
  const [running, setRunning] = useState<Tool[] | null>(autoRun ? initialTools.filter((t) => t.isActive) : null);
  const [editing, setEditing] = useState<Tool | null>(null);
  const [publishing, setPublishing] = useState<Tool | null>(null);
  const [asking, setAsking] = useState<Tool | null>(null);
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const active = useMemo(() => tools.filter((t) => t.isActive), [tools]);
  const inactive = useMemo(() => tools.filter((t) => !t.isActive), [tools]);

  function upsert(t: BuiltTool, highlight = true) {
    const tool = toTool(t);
    setTools((prev) => (prev.some((x) => x.id === tool.id) ? prev.map((x) => (x.id === tool.id ? { ...x, ...tool } : x)) : [tool, ...prev]));
    if (highlight) {
      setFresh(tool.id);
      setTimeout(() => setFresh((f) => (f === tool.id ? null : f)), 4000);
    }
    router.refresh();
  }

  async function setActive(t: Tool, isActive: boolean) {
    setBusy(t.id);
    setError("");
    const { ok, data } = await postJson<BuiltTool & { error?: string }>(`/api/app/estimators/${t.id}`, { isActive }, "PATCH");
    setBusy(null);
    if (!ok || !data || !("id" in data)) setError(data?.error ?? GENERIC_ERROR);
    else upsert(data, false);
  }

  async function remove(t: Tool) {
    setMenuFor(null);
    if (
      !(await confirmSheet({
        title: `Delete “${t.name}”?`,
        message: "Quotes already made with it are untouched. The tool and its history are gone for good.",
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
    else {
      setTools((prev) => prev.filter((x) => x.id !== t.id));
      router.refresh();
    }
  }

  async function copyEmbed(t: Tool) {
    if (!t.publicSlug) return;
    const key = `${companySlug}/estimate/${t.publicSlug}`;
    const origin = baseUrl ? new URL(baseUrl).origin : "";
    const snippet = `<iframe src="${baseUrl}/embed/${key}" data-jobflow="${key}" style="width:100%;max-width:640px;height:720px;border:0;" title="Get an estimate"></iframe>
<script>window.addEventListener("message",function(e){var d=e.data;if(e.origin==="${origin}"&&d&&d.type==="jobflow:height"&&d.slug==="${key}"){var f=document.querySelector('iframe[data-jobflow="${key}"]');if(f)f.style.height=d.height+"px";if(e.source&&e.source.postMessage)e.source.postMessage({type:"jobflow:page",href:location.href},e.origin);}});</script>`;
    try {
      await navigator.clipboard.writeText(snippet);
      setCopied(t.id);
      setTimeout(() => setCopied((c) => (c === t.id ? null : c)), 2000);
    } catch {
      setPublishing(t);
    }
  }

  const iconBtn = "inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-200 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50";

  function Card({ t }: { t: Tool }) {
    const isFresh = fresh === t.id;
    return (
      <div className={`card-ledger relative p-4 transition-shadow ${isFresh ? "ring-2 ring-green-500 shadow-lg" : ""} ${t.isActive ? "" : "opacity-70"}`}>
        {isFresh && <span className="absolute -top-2 right-3 rounded-full bg-green-600 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">New</span>}
        <div className="flex items-start gap-3">
          <span className="chip-tool flex h-10 w-10 shrink-0 items-center justify-center rounded-[11px]" style={{ backgroundColor: SECTION_HUES.quotes, color: hueInk(SECTION_HUES.quotes) }} aria-hidden>
            <Calculator size={18} strokeWidth={2.25} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <p className="truncate text-sm font-semibold text-gray-900">{t.name}</p>
              {t.isPublic && <span className="rounded-full bg-sky-50 px-2 py-0.5 text-[11px] font-medium text-sky-700">On your website</span>}
              {!t.isActive && <span className="rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">Off</span>}
            </div>
            <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">
              {t.description || `${t.spec.inputs.length} question${t.spec.inputs.length === 1 ? "" : "s"} · ${t.spec.lines.length} line${t.spec.lines.length === 1 ? "" : "s"}`}
            </p>
            <p className="mt-1 text-[11px] text-gray-400">
              {t.usesAtlas ? `${atlas.name} fill-in available` : "Free to run"}
              {t.runs > 0 && ` · used ${t.runs}×`}
              {t.submissions > 0 && ` · ${t.submissions} website lead${t.submissions === 1 ? "" : "s"}`}
            </p>
          </div>
          {manager && (
            <div className="relative shrink-0">
              <button type="button" onClick={() => setMenuFor(menuFor === t.id ? null : t.id)} className="rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="More">
                <MoreHorizontal size={16} />
              </button>
              {menuFor === t.id && (
                <div className="absolute right-0 top-8 z-10 w-44 overflow-hidden rounded-xl border border-gray-200 bg-white py-1 shadow-lg">
                  <button
                    type="button"
                    disabled={busy === t.id}
                    onClick={() => {
                      setMenuFor(null);
                      void setActive(t, !t.isActive);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-gray-700 hover:bg-gray-50"
                  >
                    <Power size={14} /> {t.isActive ? "Turn off" : "Turn on"}
                  </button>
                  <button type="button" disabled={busy === t.id} onClick={() => void remove(t)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                    <Trash2 size={14} /> Delete
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          {t.isActive && (
            <button type="button" onClick={() => setRunning([t])} className="btn-primary h-9 justify-center px-3 text-xs">
              <Play size={14} /> Run
            </button>
          )}
          {manager && (
            <>
              <button type="button" onClick={() => setAsking(t)} className={iconBtn}>
                <Sparkles size={14} /> Ask {atlas.name}
              </button>
              <button type="button" onClick={() => setEditing(t)} className={iconBtn}>
                <Pencil size={14} /> Edit
              </button>
              <button type="button" onClick={() => setPublishing(t)} className={`${iconBtn} ${t.isPublic ? "text-sky-700" : ""}`}>
                <Globe size={14} /> Website
              </button>
              {t.isPublic && t.publicSlug && (
                <button type="button" onClick={() => void copyEmbed(t)} className={iconBtn} title="Copy the embed code">
                  {copied === t.id ? <Check size={14} className="text-green-600" /> : <Code2 size={14} />} {copied === t.id ? "Copied" : "Embed code"}
                </button>
              )}
            </>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-8" onClick={() => menuFor && setMenuFor(null)}>
      <PageTitle section="quotes" icon={Calculator}>
        Estimates
      </PageTitle>
      <p className="mb-5 mt-2 text-sm text-gray-500">{manager ? "Build a pricing tool from a sentence. Run it onsite, or put it on your website." : "Answer a tool’s questions, show the number, turn it into a quote."}</p>

      {error && (
        <div role="alert" className="form-error mb-4 flex items-center justify-between">
          {error}
          <button onClick={() => setError("")} className="p-0.5 text-red-400 hover:text-red-600" aria-label="Dismiss">
            <X size={14} />
          </button>
        </div>
      )}

      {manager && (
        <div className="mb-6">
          <BuildPanel initialPrompt={initialPrompt} autoFocus={Boolean(initialPrompt)} onBuilt={(t) => upsert(t)} />
        </div>
      )}

      {active.length === 0 && inactive.length === 0 ? (
        <div className="card-ledger flex flex-col items-center px-6 py-10 text-center">
          <span className="chip-tool flex h-11 w-11 items-center justify-center rounded-[12px]" style={{ backgroundColor: SECTION_HUES.quotes, color: hueInk(SECTION_HUES.quotes) }} aria-hidden>
            <Calculator size={20} strokeWidth={2.25} />
          </span>
          <p className="mt-3.5 text-sm font-semibold text-gray-900">No tools yet</p>
          <p className="mt-1 max-w-sm text-sm text-gray-500">{manager ? "Describe how you price a job above and press Build it." : "Ask a manager to build one — then this page prices jobs in a few taps."}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {active.map((t) => (
            <Card key={t.id} t={t} />
          ))}
          {inactive.length > 0 && (
            <>
              <p className="pt-2 text-xs font-semibold uppercase tracking-wide text-gray-500">Turned off</p>
              {inactive.map((t) => (
                <Card key={t.id} t={t} />
              ))}
            </>
          )}
        </div>
      )}
      {brokenCount > 0 && (
        <p className="mt-3 text-xs text-amber-700">
          {brokenCount} tool{brokenCount === 1 ? "" : "s"} no longer compile{brokenCount === 1 ? "s" : ""} and {brokenCount === 1 ? "is" : "are"} hidden.
        </p>
      )}

      <EstimatorRunner estimators={running ?? []} open={running !== null} onClose={() => setRunning(null)} />
      <EditEstimatorSheet
        tool={editing}
        open={editing !== null}
        onClose={() => setEditing(null)}
        onSaved={() => {
          setEditing(null);
          router.refresh();
        }}
      />
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
      <AskAtlasSheet tool={asking} open={asking !== null} onClose={() => setAsking(null)} onChanged={(t) => upsert(t)} />
    </div>
  );
}
