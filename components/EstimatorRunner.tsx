"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, Calculator, Check, Loader2, Sparkles } from "lucide-react";
import Modal from "@/components/Modal";
import { Input, Select, Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { postJson } from "@/lib/safe-fetch";
import type { EstimatorResultLine, EstimatorSpec } from "@/lib/estimator";

/**
 * Runs a saved estimate tool (docs/plans/ai-estimators-2026-09-19.md):
 * pick a tool → answer its inputs → the server does the math (free) → the
 * lines land on the quote. Tools that opted into `assist` also offer
 * "describe the job, let Atlas fill it in" — the one step that costs tokens,
 * labelled as such, and never required: every input stays hand-editable.
 */

export type RunnerEstimator = {
  id: string;
  name: string;
  description: string | null;
  usesAtlas: boolean;
  spec: EstimatorSpec;
};

export type EstimatorApply = {
  lines: EstimatorResultLine[];
  title?: string;
  clientMessage?: string;
};

type RunOk = { ok: true; lines: EstimatorResultLine[]; subtotal: number; title?: string; clientMessage?: string; warnings: string[] };

const money = (n: number) => `$${n.toFixed(2)}`;

function defaults(spec: EstimatorSpec): Record<string, string | boolean> {
  const v: Record<string, string | boolean> = {};
  for (const i of spec.inputs) {
    if (i.type === "toggle") v[i.id] = i.default === true;
    else if (i.default !== undefined && i.default !== null) v[i.id] = String(i.default);
    else v[i.id] = "";
  }
  return v;
}

export default function EstimatorRunner({
  estimators,
  open,
  onClose,
  onApply,
  applyLabel = "Add to quote",
}: {
  estimators: RunnerEstimator[];
  open: boolean;
  onClose: () => void;
  /** Omit for a try-it preview (settings): the result view just closes. */
  onApply?: (r: EstimatorApply) => void;
  applyLabel?: string;
}) {
  const atlas = useAssistant();
  const [selectedId, setSelectedId] = useState<string>("");
  const [values, setValues] = useState<Record<string, string | boolean>>({});
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState<"run" | "assist" | null>(null);
  const [error, setError] = useState("");
  const [assistNote, setAssistNote] = useState("");
  const [result, setResult] = useState<RunOk | null>(null);

  const tool = useMemo(() => estimators.find((e) => e.id === selectedId) ?? null, [estimators, selectedId]);

  // Fresh start every time the sheet opens; skip the picker when there's one tool
  useEffect(() => {
    if (!open) return;
    const first = estimators.length === 1 ? estimators[0] : null;
    setSelectedId(first?.id ?? "");
    setValues(first ? defaults(first.spec) : {});
    setDescription("");
    setError("");
    setAssistNote("");
    setResult(null);
    setBusy(null);
    // Deliberately only on open: a parent that rebuilds the estimators array
    // on every render must not wipe the user's half-typed inputs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function pick(e: RunnerEstimator) {
    setSelectedId(e.id);
    setValues(defaults(e.spec));
    setError("");
    setAssistNote("");
    setResult(null);
  }

  async function run() {
    if (!tool) return;
    setBusy("run");
    setError("");
    const { ok, data } = await postJson<RunOk & { error?: string; errors?: string[] }>(`/api/app/estimators/${tool.id}/run`, { inputs: values });
    setBusy(null);
    if (!ok || !data || !("lines" in data)) {
      setError(data?.errors?.join(" · ") ?? data?.error ?? "Couldn't compute that — check the inputs.");
      return;
    }
    setResult(data);
  }

  async function assist() {
    if (!tool) return;
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
    }>(`/api/app/estimators/${tool.id}/assist`, { description });
    setBusy(null);
    if (!ok || !data?.values) {
      setError(data?.error ?? `${atlas.name} couldn't read that — fill the inputs in by hand.`);
      return;
    }
    const filled = data.values;
    setValues((prev) => {
      const next = { ...prev };
      for (const [k, v] of Object.entries(filled)) next[k] = typeof v === "boolean" ? v : String(v);
      return next;
    });
    const n = Object.keys(filled).length;
    const bits = [
      n === 0 ? "Nothing in that description mapped to an input." : `${atlas.name} filled in ${n} input${n === 1 ? "" : "s"} — check them.`,
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

  const spec = tool?.spec ?? null;
  const showPicker = !tool;

  return (
    <Modal open={open} onClose={onClose} cardClassName="card-ledger w-full max-w-lg p-5 max-h-[85vh] overflow-y-auto">
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
              {tool.usesAtlas ? `Manual entry is free · ${atlas.name} fill-in uses tokens` : "Free to run — no Atlas tokens"}
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

          {tool.usesAtlas && atlas.available && (
            <div className="rounded-xl border border-dashed border-gray-300 p-3">
              <label className="mb-1.5 flex items-center gap-1.5 text-xs font-semibold text-gray-700">
                <Sparkles size={13} /> Describe the job and let {atlas.name} fill in the inputs
              </label>
              <Textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                placeholder="e.g. Two-car concrete driveway, about 20 by 24, heavy oil stains, they also want the sidewalk done"
                className="w-full"
              />
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-[11px] text-gray-500">Uses Atlas tokens · you can still type the inputs yourself</span>
                <button
                  type="button"
                  disabled={busy !== null || description.trim().length < 8 || atlas.locked}
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

          <div className="space-y-3">
            {spec.inputs.map((inp) => {
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
                      <input
                        type="checkbox"
                        checked={v === true}
                        onChange={(e) => setValues((p) => ({ ...p, [inp.id]: e.target.checked }))}
                        className="h-5 w-5 rounded accent-green-600"
                      />
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
                            onChange={(e) => setValues((p) => ({ ...p, [inp.id]: e.target.value }))}
                            className="w-full"
                          />
                          {inp.unit && <span className="shrink-0 text-sm text-gray-500">{inp.unit}</span>}
                        </div>
                      )}
                      {inp.type === "select" && (
                        <Select value={typeof v === "string" ? v : ""} required={required} onChange={(e) => setValues((p) => ({ ...p, [inp.id]: e.target.value }))} className="w-full">
                          <option value="">Choose…</option>
                          {inp.options.map((o) => (
                            <option key={o.value} value={o.value}>
                              {o.label}
                            </option>
                          ))}
                        </Select>
                      )}
                      {inp.type === "text" && (
                        <Textarea
                          value={typeof v === "string" ? v : ""}
                          rows={2}
                          placeholder={inp.placeholder}
                          required={required}
                          onChange={(e) => setValues((p) => ({ ...p, [inp.id]: e.target.value }))}
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

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button type="submit" disabled={busy !== null} className="btn-primary h-10 justify-center">
              {busy === "run" ? <Loader2 size={15} className="animate-spin" /> : <Calculator size={15} />}
              Calculate
            </button>
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
          <div className="flex items-center justify-end gap-2">
            <button type="button" onClick={() => setResult(null)} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Change inputs
            </button>
            {onApply ? (
              <button type="button" onClick={apply} className="btn-primary h-10 justify-center">
                <Check size={15} />
                {applyLabel}
              </button>
            ) : (
              <button type="button" onClick={onClose} className="btn-primary h-10 justify-center">
                Done
              </button>
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
