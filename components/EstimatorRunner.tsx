"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { ArrowLeft, Calculator, Camera, Check, FileText, Loader2, Sparkles, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, Breakdown, ChoiceControl, CountsControl, MultiControl, NumberControl, PriceHero, ToggleRow, moneyExact, pickedIncludes, wash, useCountUp } from "@/components/EstimatorControls";
import { postJson } from "@/lib/safe-fetch";
import { askAtlasInputs, formDefaults, inputsComplete, sectionsOf, visibleInputIds, type EstimatorResultLine, type EstimatorSpec, type FormValue } from "@/lib/estimator";
import { fileToAssistPhoto, type AssistPhoto } from "@/lib/image-downscale";
import type { LatLngTuple } from "@/components/MapMeasure";

// Leaflet touches window — only the map question needs it
const MapMeasure = dynamic(() => import("@/components/MapMeasure"), { ssr: false, loading: () => <div className="h-80 animate-pulse rounded-lg bg-gray-100" /> });

/**
 * Runs a saved estimate tool (docs/plans/ai-estimators-2026-09-19.md):
 * pick a tool → answer its questions (presets, sliders, tap cards, package
 * tiers with live prices, item counts, the map) → the server does the math
 * (free) → a quote-shaped breakdown → the lines land on a quote. Tools that
 * opted into `assist` also offer "describe the job / snap a photo, let Atlas
 * fill it in" — the one step that costs tokens, labelled as such, never
 * required. Tools with Atlas-ASSESSED questions (askAtlas) put that step
 * first: Atlas judges condition / access / scope from the description and
 * the person can still override every answer.
 *
 * Homes: the quote editor (onApply adds the lines), the Estimates pages
 * (no onApply → "Create quote" stashes the result and opens a new quote with
 * it; `inline` renders it in the page instead of a dialog), and Atlas cards
 * / the editor (`preview: true` runs an UNSAVED spec via /preview).
 */

export type RunnerEstimator = {
  id: string;
  name: string;
  description: string | null;
  usesAtlas: boolean;
  spec: EstimatorSpec;
  /** An unsaved spec (Atlas card, manual editor) — runs via the preview route, no counters, no assist. */
  preview?: boolean;
};

export type EstimatorApply = {
  lines: EstimatorResultLine[];
  title?: string;
  clientMessage?: string;
};

type RunOk = { ok: true; lines: EstimatorResultLine[]; subtotal: number; title?: string; clientMessage?: string; warnings: string[] };
type RunReply = Partial<RunOk> & { ok?: boolean; error?: string; errors?: string[]; variants?: Record<string, number | null> };
type FormValues = Record<string, FormValue>;

// ── onsite hand-off: runner → new quote ──────────────────────────────────────

const DRAFT_KEY = "wb.estimateDraft";
export type EstimateDraft = EstimatorApply & { toolName: string };

export function stashEstimateDraft(d: EstimateDraft): void {
  try {
    sessionStorage.setItem(DRAFT_KEY, JSON.stringify(d));
  } catch {
    /* private mode — the quote just opens empty */
  }
}

/** Read-and-clear: the quote editor calls this once when opened with ?fromTool=1. */
export function takeEstimateDraft(): EstimateDraft | null {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    sessionStorage.removeItem(DRAFT_KEY);
    const d = JSON.parse(raw) as EstimateDraft;
    return Array.isArray(d.lines) ? d : null;
  } catch {
    return null;
  }
}

function runRequest(tool: RunnerEstimator, values: FormValues, dry: boolean, variants?: { input: string; values: string[] }) {
  const body = { inputs: values, ...(variants ? { variants } : {}) };
  return tool.preview
    ? postJson<RunReply>(`/api/app/estimators/preview`, { spec: tool.spec, ...body })
    : postJson<RunReply>(`/api/app/estimators/${tool.id}/run${dry ? "?dry=1" : ""}`, body);
}

/** Model / sample values → form state (strings for fields, lists, count tables). */
export function valuesToForm(spec: EstimatorSpec, raw: Record<string, unknown>, base?: FormValues): FormValues {
  const v = { ...(base ?? formDefaults(spec)) };
  for (const inp of spec.inputs) {
    const x = raw[inp.id];
    if (x === undefined || x === null) continue;
    if (inp.type === "toggle") v[inp.id] = x === true || x === "true";
    else if (inp.type === "multi") v[inp.id] = Array.isArray(x) ? x.map(String) : String(x).split(",").map((s) => s.trim()).filter(Boolean);
    else if (inp.type === "counts") {
      const t: Record<string, number> = {};
      if (x && typeof x === "object" && !Array.isArray(x)) for (const [k, c] of Object.entries(x as Record<string, unknown>)) if (Number(c) > 0) t[k] = Math.floor(Number(c));
      v[inp.id] = t;
    } else v[inp.id] = String(x);
  }
  return v;
}

// ── the panel ────────────────────────────────────────────────────────────────

export function EstimatorRunnerPanel({
  estimators,
  onClose,
  onApply,
  applyLabel = "Add to quote",
  allowQuote = true,
  closeLabel = "Cancel",
  showSamples = false,
  inline = false,
}: {
  estimators: RunnerEstimator[];
  onClose: () => void;
  /** Omit → the result offers "Create quote" (allowQuote) or just Done. */
  onApply?: (r: EstimatorApply) => void;
  applyLabel?: string;
  /** Without onApply: offer to start a new quote from the result (the onsite flow). */
  allowQuote?: boolean;
  closeLabel?: string;
  /** Offer the tool's built-in sample jobs as one-tap fills (owners trying a tool). */
  showSamples?: boolean;
  /** Rendered in a page, not a dialog: no close button, the page scrolls. */
  inline?: boolean;
}) {
  const atlas = useAssistant();
  const router = useRouter();
  const theme = APP_THEME;
  const single = estimators.length === 1 ? estimators[0] : null;
  const [selectedId, setSelectedId] = useState<string>(single?.id ?? "");
  const [values, setValues] = useState<FormValues>(single ? formDefaults(single.spec) : {});
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<AssistPhoto | null>(null);
  const [busy, setBusy] = useState<"run" | "assist" | "photo" | null>(null);
  const [error, setError] = useState("");
  const [assistNote, setAssistNote] = useState("");
  const [byAtlas, setByAtlas] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<RunOk | null>(null);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  // map questions keep their drawn corners here; the form value is just the number
  const geomRef = useRef<Record<string, LatLngTuple[]>>({});

  const tool = useMemo(() => estimators.find((e) => e.id === selectedId) ?? null, [estimators, selectedId]);
  const spec = tool?.spec ?? null;
  const visible = useMemo(() => (spec ? visibleInputIds(spec, values) : new Set<string>()), [spec, values]);
  const sections = useMemo(() => (spec ? sectionsOf(spec.inputs, visible) : []), [spec, visible]);
  const assessed = useMemo(() => (spec ? askAtlasInputs(spec) : []), [spec]);
  // the first visible package question prices its tiers side by side
  const packageInput = useMemo(() => spec?.inputs.find((i) => i.type === "select" && i.style === "packages" && visible.has(i.id)) ?? null, [spec, visible]);
  const ignore = useMemo(() => new Set(packageInput ? [packageInput.id] : []), [packageInput]);

  // Live pricing while answering: once every visible required input (except
  // the package tiers) has a value, a debounced dry run (no counter) gives
  // the running total and each tier's price.
  const [live, setLive] = useState<number | null>(null);
  const [tierPrices, setTierPrices] = useState<Record<string, string | null> | undefined>(undefined);
  useEffect(() => {
    if (!tool || result || !inputsComplete(tool.spec, values, ignore)) {
      setLive(null);
      setTierPrices(undefined);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const variants = packageInput && packageInput.type === "select" ? { input: packageInput.id, values: packageInput.options.map((o) => o.value) } : undefined;
      const { data } = await runRequest(tool, values, true, variants);
      if (cancelled) return;
      setLive(data && data.ok && typeof data.subtotal === "number" ? data.subtotal : null);
      if (variants && data?.variants) {
        const out: Record<string, string | null> = {};
        for (const [k, v] of Object.entries(data.variants)) out[k] = v === null ? null : moneyExact(v);
        setTierPrices(out);
      } else setTierPrices(undefined);
    }, 400);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tool, values, result, ignore, packageInput]);
  const liveShown = useCountUp(live);

  function pick(e: RunnerEstimator) {
    setSelectedId(e.id);
    setValues(formDefaults(e.spec));
    setError("");
    setAssistNote("");
    setByAtlas(new Set());
    setResult(null);
    setPhoto(null);
  }

  const setVal = (id: string, v: FormValue) => {
    setValues((p) => ({ ...p, [id]: v }));
    setByAtlas((s) => {
      if (!s.has(id)) return s;
      const n = new Set(s);
      n.delete(id);
      return n;
    });
  };
  const toggleMulti = (id: string, value: string) =>
    setValues((p) => {
      const cur = Array.isArray(p[id]) ? (p[id] as string[]) : [];
      return { ...p, [id]: cur.includes(value) ? cur.filter((x) => x !== value) : [...cur, value] };
    });

  async function run() {
    if (!tool) return;
    setBusy("run");
    setError("");
    const { ok, data } = await runRequest(tool, values, false);
    setBusy(null);
    if (!ok || !data || !data.ok || !data.lines) {
      setError(data?.errors?.join(" · ") ?? data?.error ?? "Couldn't compute that — check the answers.");
      return;
    }
    setResult(data as RunOk);
  }

  async function attachPhoto(file: File | undefined) {
    if (!file) return;
    setBusy("photo");
    const p = await fileToAssistPhoto(file);
    setBusy(null);
    if (!p) {
      setError("That photo couldn't be read — try a JPEG or PNG.");
      return;
    }
    setPhoto(p);
  }

  async function assist() {
    if (!tool || tool.preview) return;
    setBusy("assist");
    setError("");
    setAssistNote("");
    const { ok, data } = await postJson<{
      values?: Record<string, unknown>;
      notes?: string;
      skipped?: string[];
      turnTokens?: number;
      error?: string;
      atlasLocked?: boolean;
    }>(`/api/app/estimators/${tool.id}/assist`, { description, ...(photo ? { imageBase64: photo.base64, imageMime: photo.mime } : {}) });
    setBusy(null);
    if (!ok || !data?.values) {
      setError(data?.error ?? `${atlas.name} couldn't read that — fill the answers in by hand.`);
      return;
    }
    const filled = data.values;
    setValues((prev) => valuesToForm(tool.spec, filled, prev));
    setByAtlas(new Set(Object.keys(filled)));
    const n = Object.keys(filled).length;
    const bits = [
      n === 0 ? "Nothing in that mapped to a question." : `${atlas.name} filled in ${n} answer${n === 1 ? "" : "s"} — check them.`,
      data.notes || "",
      data.skipped && data.skipped.length > 0 ? `Skipped: ${data.skipped.join("; ")}` : "",
      data.turnTokens ? `${data.turnTokens.toLocaleString()} tokens` : "",
    ].filter(Boolean);
    setAssistNote(bits.join(" "));
  }

  function apply() {
    if (!result) return;
    onApply?.({ lines: result.lines, title: result.title, clientMessage: result.clientMessage });
    onClose();
  }

  function startQuote() {
    if (!result || !tool) return;
    setStarting(true);
    stashEstimateDraft({ lines: result.lines, title: result.title, clientMessage: result.clientMessage, toolName: tool.name });
    router.push("/app/quotes/new?fromTool=1");
  }

  const showPicker = !tool;
  const canAssist = Boolean(tool?.usesAtlas && atlas.available && !tool?.preview);
  const samples = showSamples || tool?.preview ? (spec?.samples ?? []) : [];
  const included = result && spec ? pickedIncludes(spec.inputs, values) : null;
  const atlasTag = <span className="ml-2 inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold" style={{ backgroundColor: wash(theme, 12), color: theme.accent }}><Sparkles size={10} /> {atlas.name}</span>;

  const body = (
    <>
      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}

      {/* step 1: pick */}
      {showPicker && (
        <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
          {estimators.length === 0 && <p className="px-4 py-6 text-center text-sm text-gray-500">No estimate tools yet. Ask {atlas.name} to build one.</p>}
          {estimators.map((e) => (
            <button key={e.id} type="button" onClick={() => pick(e)} className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-gray-50">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-600">
                <Calculator size={16} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-gray-900">{e.name}</span>
                <span className="block truncate text-xs text-gray-500">{e.description || `${e.spec.inputs.length} question${e.spec.inputs.length === 1 ? "" : "s"}`}</span>
              </span>
              <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium ${e.usesAtlas ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>
                {e.usesAtlas ? "Atlas" : "Free"}
              </span>
            </button>
          ))}
        </div>
      )}

      {/* step 2: inputs */}
      {spec && tool && !result && (
        <form
          id="estimator-run-form"
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="space-y-6"
        >
          {spec.intro && <p className="text-sm text-gray-600">{spec.intro}</p>}

          {samples.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-xs text-gray-500">Fill with a sample:</span>
              {samples.map((s) => (
                <button key={s.label} type="button" onClick={() => setValues(valuesToForm(spec, s.inputs))} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50">
                  {s.label}
                </button>
              ))}
            </div>
          )}

          {canAssist && (
            <div className="rounded-xl border border-dashed border-gray-300 p-3.5" style={{ backgroundColor: wash(theme, 3) }}>
              <p className="flex items-center gap-1.5 text-sm font-semibold text-gray-900">
                <Sparkles size={14} style={{ color: theme.accent }} /> {assessed.length > 0 ? `Tell ${atlas.name} about the job` : `Describe the job or snap a photo`}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {assessed.length > 0 ? `${atlas.name} assesses ${assessed.map((i) => i.label.toLowerCase()).join(", ")} from what you say and any photo, then fills in the rest it can.` : `${atlas.name} fills in the answers it can read from your words or the photo.`}
              </p>
              <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} placeholder="e.g. Two-car concrete driveway, about 20 by 24, heavy oil stains, they also want the sidewalk done" className="mt-2.5 w-full" />
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void attachPhoto(e.target.files?.[0])} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {photo ? (
                    <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 bg-white py-0.5 pl-0.5 pr-1.5 text-[11px] text-gray-600">
                      <img src={photo.previewUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
                      <span className="max-w-[9rem] truncate">{photo.name}</span>
                      <button type="button" onClick={() => setPhoto(null)} className="text-gray-400 hover:text-gray-700" aria-label="Remove photo">
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {busy === "photo" ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      Add a photo
                    </button>
                  )}
                  <span className="hidden text-[11px] text-gray-500 sm:inline">Uses Atlas tokens · you can change every answer</span>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || (description.trim().length < 8 && !photo) || atlas.locked}
                  onClick={() => void assist()}
                  className="btn-primary h-9 justify-center px-3 text-xs"
                >
                  {busy === "assist" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  {assessed.length > 0 ? "Assess & fill in" : "Fill in"}
                </button>
              </div>
              {atlas.locked && <p className="mt-1.5 text-[11px] text-amber-700">Your Atlas tokens are used up for now — the questions below still work.</p>}
              {assistNote && <p className="mt-2 text-xs text-gray-600">{assistNote}</p>}
            </div>
          )}

          <div className="space-y-7">
            {sections.map((sec, si) => (
              <section key={`${sec.title ?? ""}-${si}`} className="space-y-5">
                {sec.title && (
                  <h3 className="flex items-center gap-2 border-b border-gray-100 pb-2 text-sm font-semibold text-gray-900">
                    {sections.length > 1 && (
                      <span className="flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold" style={{ backgroundColor: wash(theme, 12), color: theme.accent }}>
                        {si + 1}
                      </span>
                    )}
                    {sec.title}
                  </h3>
                )}
                {sec.inputs.map((inp) => {
                  const v = values[inp.id];
                  const required = "required" in inp && inp.required !== false;
                  const filled = byAtlas.has(inp.id);
                  if (inp.type === "toggle") return <ToggleRow key={inp.id} theme={theme} label={inp.label} help={inp.help} value={v === true} onChange={(b) => setVal(inp.id, b)} />;
                  return (
                    <div key={inp.id}>
                      {inp.image && <img src={inp.image} alt="" className="mb-2 max-h-44 w-full rounded-lg object-cover" />}
                      <label className="mb-1.5 block text-sm font-medium text-gray-800">
                        {inp.label}
                        {required && <span className="text-red-500"> *</span>}
                        {(filled || inp.askAtlas) && atlasTag}
                      </label>
                      {inp.type === "number" && <NumberControl inp={inp} theme={theme} value={typeof v === "string" ? v : ""} required={required} onChange={(val) => setVal(inp.id, val)} />}
                      {inp.type === "map" && (
                        <MapMeasure
                          measure={inp.measure}
                          points={geomRef.current[inp.id] ?? []}
                          onChange={(pts, val) => {
                            geomRef.current[inp.id] = pts;
                            setVal(inp.id, val === null ? "" : String(val));
                          }}
                        />
                      )}
                      {inp.type === "select" && (
                        <ChoiceControl inp={inp} theme={theme} value={typeof v === "string" ? v : ""} required={required} onChange={(val) => setVal(inp.id, val)} tierPrices={inp.style === "packages" && packageInput?.id === inp.id ? tierPrices : undefined} />
                      )}
                      {inp.type === "multi" && <MultiControl inp={inp} theme={theme} value={Array.isArray(v) ? v : []} onToggle={(val) => toggleMulti(inp.id, val)} />}
                      {inp.type === "counts" && <CountsControl inp={inp} theme={theme} value={v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {}} onChange={(val) => setVal(inp.id, val)} />}
                      {inp.type === "text" && <Textarea value={typeof v === "string" ? v : ""} rows={2} placeholder={inp.placeholder} required={required} onChange={(e) => setVal(inp.id, e.target.value)} className="w-full" />}
                      {inp.askAtlas && !filled && <p className="mt-1.5 text-xs text-gray-500">{atlas.name} assesses this from your description — or answer it yourself.</p>}
                      {inp.help && <p className="mt-1.5 text-xs text-gray-500">{inp.help}</p>}
                    </div>
                  );
                })}
              </section>
            ))}
          </div>
        </form>
      )}

      {/* step 3: result */}
      {result && tool && (
        <div className="space-y-4">
          <PriceHero theme={theme} label="Your estimate" amount={result.subtotal} sub={result.title} />
          {included && (
            <div className="rounded-xl border border-gray-200 p-4">
              <p className="text-xs font-semibold text-gray-500">{included.tier} includes</p>
              <ul className="mt-2 grid grid-cols-1 gap-1 sm:grid-cols-2">
                {included.includes.map((line) => (
                  <li key={line} className="flex items-start gap-1.5 text-sm text-gray-700">
                    <Check size={14} strokeWidth={2.5} className="mt-0.5 shrink-0" style={{ color: theme.accent }} />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <Breakdown theme={theme} lines={result.lines} subtotal={result.subtotal} />
          {result.warnings.length > 0 && <p className="text-xs text-amber-700">{result.warnings.join(" · ")}</p>}
          {result.clientMessage && <p className="text-xs text-gray-500">Client note: {result.clientMessage}</p>}
        </div>
      )}
    </>
  );

  const footer =
    spec && tool && !result ? (
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-gray-500">{liveShown !== null ? "Estimate so far" : "Answer the questions to see a price"}</p>
          <p className="text-xl font-bold tabular-nums tracking-tight text-gray-900">{liveShown !== null ? moneyExact(liveShown) : "—"}</p>
        </div>
        <span className="flex shrink-0 items-center gap-2">
          {!inline && (
            <button type="button" onClick={onClose} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              {closeLabel}
            </button>
          )}
          <button type="submit" form="estimator-run-form" disabled={busy !== null} className="btn-primary h-10 justify-center">
            {busy === "run" ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
            See the breakdown
          </button>
        </span>
      </div>
    ) : result && tool ? (
      <div className="flex flex-wrap items-center justify-end gap-2">
        <button type="button" onClick={() => setResult(null)} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
          Change answers
        </button>
        {onApply ? (
          <button type="button" onClick={apply} className="btn-primary h-10 justify-center">
            <Check size={15} />
            {applyLabel}
          </button>
        ) : allowQuote && !tool.preview ? (
          <>
            {!inline && (
              <button type="button" onClick={onClose} className="h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                Done
              </button>
            )}
            <button type="button" disabled={starting} onClick={startQuote} className="btn-primary h-10 justify-center">
              {starting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
              Create quote
            </button>
          </>
        ) : (
          <button type="button" onClick={inline ? () => setResult(null) : onClose} className="btn-primary h-10 justify-center">
            {inline ? "Try again" : "Done"}
          </button>
        )}
      </div>
    ) : null;

  if (inline) {
    return (
      <div className="space-y-5">
        {body}
        {footer && <div className="border-t border-gray-100 pt-4">{footer}</div>}
      </div>
    );
  }

  return (
    <div className="flex max-h-[inherit] flex-col">
      {/* header */}
      <div className="flex items-start gap-3 px-5 pb-3 pt-5">
        {tool && estimators.length > 1 && !result && (
          <button type="button" onClick={() => setSelectedId("")} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600" aria-label="Back to tools">
            <ArrowLeft size={18} />
          </button>
        )}
        {result && (
          <button type="button" onClick={() => setResult(null)} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600" aria-label="Back to answers">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-semibold text-gray-900">{tool ? tool.name : "Estimate tools"}</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            {tool ? (tool.preview ? "Trying unsaved rules — nothing is counted or saved" : tool.usesAtlas ? `Answering by hand is free · ${atlas.name} fill-in uses tokens` : "Free to run — no Atlas tokens") : "Pick a tool, answer its questions, and the lines land on the quote."}
          </p>
        </div>
        <button type="button" onClick={onClose} className="-mr-1 -mt-1 rounded-full p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700" aria-label="Close">
          <X size={16} />
        </button>
      </div>
      {/* body scrolls; the footer stays put */}
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5">{body}</div>
      {footer && <div className="border-t border-gray-100 bg-white px-5 py-3">{footer}</div>}
    </div>
  );
}

// ── the modal ────────────────────────────────────────────────────────────────

export default function EstimatorRunner({
  estimators,
  open,
  onClose,
  onApply,
  applyLabel = "Add to quote",
  allowQuote = true,
  portal = false,
  showSamples = false,
}: {
  estimators: RunnerEstimator[];
  open: boolean;
  onClose: () => void;
  /** Omit for a try-it (settings / Atlas card): the result offers Create quote or Done. */
  onApply?: (r: EstimatorApply) => void;
  applyLabel?: string;
  allowQuote?: boolean;
  /** Render into <body> — needed when opened from inside another dialog. */
  portal?: boolean;
  showSamples?: boolean;
}) {
  // Fresh start every time the sheet opens: remount the panel
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((s) => s + 1);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} portal={portal} cardClassName="card-ledger w-full max-w-xl p-0 max-h-[88vh] overflow-hidden">
      <EstimatorRunnerPanel key={session} estimators={estimators} onClose={onClose} onApply={onApply} applyLabel={applyLabel} allowQuote={allowQuote} showSamples={showSamples} />
    </Modal>
  );
}
