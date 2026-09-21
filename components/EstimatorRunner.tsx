"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Calculator, Camera, Check, FileText, Loader2, Sparkles, X } from "lucide-react";
import Modal from "@/components/Modal";
import { Input, Select, Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { postJson } from "@/lib/safe-fetch";
import { formDefaults, inputsComplete, sectionsOf, visibleInputIds, type EstimatorResultLine, type EstimatorSpec } from "@/lib/estimator";
import { fileToAssistPhoto, type AssistPhoto } from "@/lib/image-downscale";

/**
 * Runs a saved estimate tool (docs/plans/ai-estimators-2026-09-19.md):
 * pick a tool → answer its inputs → the server does the math (free) → the
 * lines land on the quote. Tools that opted into `assist` also offer
 * "describe the job / snap a photo, let Atlas fill it in" — the one step
 * that costs tokens, labelled as such, and never required: every input stays
 * hand-editable.
 *
 * Three homes: the quote editor (onApply adds the lines), the Estimate page
 * and the settings "Try it" (no onApply → "Create quote" stashes the result
 * and opens a new quote with it), and Atlas cards / the manual editor
 * (`preview: true` runs an UNSAVED spec through /api/app/estimators/preview).
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
type FormValues = Record<string, string | boolean | string[]>;

const money = (n: number) => `$${n.toFixed(2)}`;

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

function runRequest(tool: RunnerEstimator, values: FormValues, dry: boolean) {
  return tool.preview
    ? postJson<RunOk & { error?: string; errors?: string[] }>(`/api/app/estimators/preview`, { spec: tool.spec, inputs: values })
    : postJson<RunOk & { error?: string; errors?: string[] }>(`/api/app/estimators/${tool.id}/run${dry ? "?dry=1" : ""}`, { inputs: values });
}

// ── the panel (no chrome) ────────────────────────────────────────────────────

export function EstimatorRunnerPanel({
  estimators,
  onClose,
  onApply,
  applyLabel = "Add to quote",
  allowQuote = true,
  closeLabel = "Cancel",
}: {
  estimators: RunnerEstimator[];
  onClose: () => void;
  /** Omit → the result offers "Create quote" (allowQuote) or just Done. */
  onApply?: (r: EstimatorApply) => void;
  applyLabel?: string;
  /** Without onApply: offer to start a new quote from the result (the onsite flow). */
  allowQuote?: boolean;
  closeLabel?: string;
}) {
  const atlas = useAssistant();
  const router = useRouter();
  const single = estimators.length === 1 ? estimators[0] : null;
  const [selectedId, setSelectedId] = useState<string>(single?.id ?? "");
  const [values, setValues] = useState<FormValues>(single ? formDefaults(single.spec) : {});
  const [description, setDescription] = useState("");
  const [photo, setPhoto] = useState<AssistPhoto | null>(null);
  const [busy, setBusy] = useState<"run" | "assist" | "photo" | null>(null);
  const [error, setError] = useState("");
  const [assistNote, setAssistNote] = useState("");
  const [result, setResult] = useState<RunOk | null>(null);
  const [starting, setStarting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const tool = useMemo(() => estimators.find((e) => e.id === selectedId) ?? null, [estimators, selectedId]);
  const spec = tool?.spec ?? null;
  const visible = useMemo(() => (spec ? visibleInputIds(spec, values) : new Set<string>()), [spec, values]);
  const sections = useMemo(() => (spec ? sectionsOf(spec.inputs, visible) : []), [spec, visible]);

  // Running total while typing: once every visible required input has a
  // value, a debounced dry run (no counter) shows where the estimate is heading.
  const [live, setLive] = useState<number | null>(null);
  useEffect(() => {
    if (!tool || result || !inputsComplete(tool.spec, values)) {
      setLive(null);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const { ok, data } = await runRequest(tool, values, true);
      if (!cancelled) setLive(ok && data && "subtotal" in data ? data.subtotal : null);
    }, 450);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [tool, values, result]);

  function pick(e: RunnerEstimator) {
    setSelectedId(e.id);
    setValues(formDefaults(e.spec));
    setError("");
    setAssistNote("");
    setResult(null);
    setPhoto(null);
  }

  const setVal = (id: string, v: string | boolean | string[]) => setValues((p) => ({ ...p, [id]: v }));
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
    if (!ok || !data || !("lines" in data)) {
      setError(data?.errors?.join(" · ") ?? data?.error ?? "Couldn't compute that — check the inputs.");
      return;
    }
    setResult(data);
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
      setError(data?.error ?? `${atlas.name} couldn't read that — fill the inputs in by hand.`);
      return;
    }
    const filled = data.values;
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(filled)) next[k] = typeof v === "boolean" ? v : Array.isArray(v) ? v.map(String) : String(v);
      return next;
    });
    const n = Object.keys(filled).length;
    const bits = [
      n === 0 ? "Nothing in that mapped to an input." : `${atlas.name} filled in ${n} input${n === 1 ? "" : "s"} — check them.`,
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

  return (
    <>
      {/* header */}
      <div className="mb-4 flex items-start gap-3">
        {tool && estimators.length > 1 && !result && (
          <button type="button" onClick={() => setSelectedId("")} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600" aria-label="Back to tools">
            <ArrowLeft size={18} />
          </button>
        )}
        {result && (
          <button type="button" onClick={() => setResult(null)} className="mt-0.5 shrink-0 text-gray-400 hover:text-gray-600" aria-label="Back to inputs">
            <ArrowLeft size={18} />
          </button>
        )}
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">{tool ? tool.name : "Estimate tools"}</h2>
          {tool ? (
            <p className="mt-0.5 text-xs text-gray-500">
              {tool.preview ? "Trying unsaved rules — nothing is counted or saved" : tool.usesAtlas ? `Manual entry is free · ${atlas.name} fill-in uses tokens` : "Free to run — no Atlas tokens"}
            </p>
          ) : (
            <p className="mt-0.5 text-xs text-gray-500">Pick a tool, answer its questions, and the lines land on the quote.</p>
          )}
        </div>
      </div>

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
          onSubmit={(e) => {
            e.preventDefault();
            void run();
          }}
          className="space-y-4"
        >
          {spec.intro && <p className="text-sm text-gray-600">{spec.intro}</p>}

          {canAssist && (
            <div className="rounded-xl border border-dashed border-gray-300 p-3">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <Sparkles size={13} /> Describe the job or snap a photo — {atlas.name} fills in the inputs
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="e.g. Two-car concrete driveway, about 20 by 24, heavy oil stains, they also want the sidewalk done"
                className="w-full"
              />
              <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => void attachPhoto(e.target.files?.[0])} />
              <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  {photo ? (
                    <span className="flex items-center gap-1.5 rounded-lg border border-gray-200 py-0.5 pl-0.5 pr-1.5 text-[11px] text-gray-600">
                      <img src={photo.previewUrl} alt="" className="h-7 w-7 rounded-md object-cover" />
                      <span className="max-w-[9rem] truncate">{photo.name}</span>
                      <button type="button" onClick={() => setPhoto(null)} className="text-gray-400 hover:text-gray-700" aria-label="Remove photo">
                        <X size={12} />
                      </button>
                    </span>
                  ) : (
                    <button type="button" disabled={busy !== null} onClick={() => fileRef.current?.click()} className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                      {busy === "photo" ? <Loader2 size={13} className="animate-spin" /> : <Camera size={13} />}
                      Add a photo
                    </button>
                  )}
                  <span className="hidden text-[11px] text-gray-500 sm:inline">Uses Atlas tokens · inputs stay editable</span>
                </div>
                <button
                  type="button"
                  disabled={busy !== null || (description.trim().length < 8 && !photo) || atlas.locked}
                  onClick={() => void assist()}
                  className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {busy === "assist" ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  Fill in
                </button>
              </div>
              {atlas.locked && <p className="mt-1.5 text-[11px] text-amber-700">Your Atlas tokens are used up for now — the inputs below still work.</p>}
              {assistNote && <p className="mt-2 text-xs text-gray-600">{assistNote}</p>}
            </div>
          )}

          <div className="space-y-4">
            {sections.map((sec, si) => (
              <div key={`${sec.title ?? ""}-${si}`} className="space-y-3">
                {sec.title && <p className="border-b border-gray-100 pb-1 text-xs font-semibold uppercase tracking-wide text-gray-500">{sec.title}</p>}
                {sec.inputs.map((inp) => {
                  const v = values[inp.id];
                  const required = "required" in inp && inp.required !== false;
                  return (
                    <div key={inp.id}>
                      {inp.type === "toggle" ? (
                        <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
                          <span>
                            <span className="block text-sm font-medium text-gray-800">{inp.label}</span>
                            {inp.help && <span className="block text-xs text-gray-500">{inp.help}</span>}
                          </span>
                          <input type="checkbox" checked={v === true} onChange={(e) => setVal(inp.id, e.target.checked)} className="h-5 w-5 rounded accent-green-600" />
                        </label>
                      ) : (
                        <>
                          <label className="mb-1 block text-sm font-medium text-gray-800">
                            {inp.label}
                            {required && <span className="text-red-500"> *</span>}
                          </label>
                          {inp.type === "number" && (
                            <div className="flex items-center gap-2">
                              <Input
                                type="number"
                                inputMode="decimal"
                                value={typeof v === "string" ? v : ""}
                                min={inp.min}
                                max={inp.max}
                                step={inp.step ?? "any"}
                                required={required}
                                onChange={(e) => setVal(inp.id, e.target.value)}
                                className="w-full"
                              />
                              {inp.unit && <span className="shrink-0 text-sm text-gray-500">{inp.unit}</span>}
                            </div>
                          )}
                          {inp.type === "select" && (
                            <Select value={typeof v === "string" ? v : ""} required={required} onChange={(e) => setVal(inp.id, e.target.value)} className="w-full">
                              <option value="">Choose…</option>
                              {inp.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                          )}
                          {inp.type === "multi" && (
                            <div className="flex flex-wrap gap-1.5">
                              {inp.options.map((o) => {
                                const on = Array.isArray(v) && v.includes(o.value);
                                return (
                                  <button
                                    key={o.value}
                                    type="button"
                                    aria-pressed={on}
                                    onClick={() => toggleMulti(inp.id, o.value)}
                                    className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium ${on ? "border-gray-900 bg-gray-900 text-white" : "border-gray-300 text-gray-700 hover:bg-gray-50"}`}
                                  >
                                    {on && <Check size={12} strokeWidth={3} />}
                                    {o.label}
                                  </button>
                                );
                              })}
                            </div>
                          )}
                          {inp.type === "text" && (
                            <Textarea
                              value={typeof v === "string" ? v : ""}
                              rows={2}
                              placeholder={inp.placeholder}
                              required={required}
                              onChange={(e) => setVal(inp.id, e.target.value)}
                              className="w-full"
                            />
                          )}
                          {inp.help && <p className="mt-1 text-xs text-gray-500">{inp.help}</p>}
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between gap-3 pt-1">
            <span className="min-w-0 truncate text-sm text-gray-600">
              {live !== null && (
                <>
                  Running total: <span className="numeral font-semibold text-gray-900">{money(live)}</span>
                </>
              )}
            </span>
            <span className="flex shrink-0 items-center gap-2">
              <button type="button" onClick={onClose} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
                {closeLabel}
              </button>
              <button type="submit" disabled={busy !== null} className="btn-primary h-10 justify-center">
                {busy === "run" ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
                Calculate
              </button>
            </span>
          </div>
        </form>
      )}

      {/* step 3: result */}
      {result && tool && (
        <div className="space-y-4">
          {result.title && <p className="text-sm font-medium text-gray-800">{result.title}</p>}
          <div className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200">
            {result.lines.map((l, i) => (
              <div key={i} className="flex items-start gap-3 px-4 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {l.name}
                    {l.isOptional && <span className="ml-2 rounded-full bg-gray-100 px-1.5 py-0.5 text-[10px] font-medium text-gray-600">optional</span>}
                  </p>
                  {l.description && <p className="text-xs text-gray-500">{l.description}</p>}
                  <p className="text-xs text-gray-500">
                    {l.quantity} × {money(l.unitPrice)}
                  </p>
                </div>
                <p className="numeral shrink-0 text-sm font-semibold text-gray-900">{money(l.quantity * l.unitPrice)}</p>
              </div>
            ))}
            <div className="flex items-center justify-between bg-gray-50 px-4 py-2.5">
              <span className="text-sm text-gray-600">Subtotal{result.lines.some((l) => l.isOptional) ? " (without optional)" : ""}</span>
              <span className="numeral text-sm font-semibold text-gray-900">{money(result.subtotal)}</span>
            </div>
          </div>
          {result.warnings.length > 0 && <p className="text-xs text-amber-700">{result.warnings.join(" · ")}</p>}
          {result.clientMessage && <p className="text-xs text-gray-500">Client note: {result.clientMessage}</p>}
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button type="button" onClick={() => setResult(null)} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Change inputs
            </button>
            {onApply ? (
              <button type="button" onClick={apply} className="btn-primary h-10 justify-center">
                <Check size={15} />
                {applyLabel}
              </button>
            ) : allowQuote && !tool.preview ? (
              <>
                <button type="button" onClick={onClose} className="h-10 rounded-lg border border-gray-300 px-3 text-sm font-medium text-gray-700 hover:bg-gray-50">
                  Done
                </button>
                <button type="button" disabled={starting} onClick={startQuote} className="btn-primary h-10 justify-center">
                  {starting ? <Loader2 size={15} className="animate-spin" /> : <FileText size={15} />}
                  Create quote
                </button>
              </>
            ) : (
              <button type="button" onClick={onClose} className="btn-primary h-10 justify-center">
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </>
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
}) {
  // Fresh start every time the sheet opens: remount the panel
  const [session, setSession] = useState(0);
  useEffect(() => {
    if (open) setSession((s) => s + 1);
  }, [open]);
  return (
    <Modal open={open} onClose={onClose} portal={portal} cardClassName="card-ledger w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto">
      <EstimatorRunnerPanel key={session} estimators={estimators} onClose={onClose} onApply={onApply} applyLabel={applyLabel} allowQuote={allowQuote} />
    </Modal>
  );
}
