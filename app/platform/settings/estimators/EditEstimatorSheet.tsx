"use client";

import { useEffect, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronUp, History, Loader2, Pencil, Play, Plus, RotateCcw, ShieldCheck, Trash2 } from "lucide-react";
import Modal from "@/components/Modal";
import { Input, Select, Textarea } from "@/components/Input";
import EstimatorRunner from "@/components/EstimatorRunner";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { ESTIMATOR_LIMITS, toIdentifier, type EstimatorInput, type EstimatorLine, type EstimatorOption, type EstimatorSpec, type EstimatorVariable } from "@/lib/estimator";

/**
 * Settings → Estimate tools → pencil. The manual side of a tool Atlas built:
 * questions (labels, help, sections, show-when, options), pricing (rates,
 * quantities, conditions, variables, minimum), the words (intro, quote
 * title, client message, Atlas fill-in guidance) and History — every saved
 * version with what changed and a Restore button. Formulas are plain text
 * here; the server compiles on save and hands back exact reasons when
 * something doesn't add up. "Check" and "Try it" run the unsaved rules.
 */

export type EditTool = { id: string; name: string; description: string | null; spec: EstimatorSpec; usesAtlas: boolean };

type Version = { id: string; note: string; byName: string | null; createdAt: string; name: string; inputs: number; lines: number; broken: boolean; changes: string[] };
type Tab = "questions" | "pricing" | "text" | "history";
type InputType = EstimatorInput["type"];

const TYPE_LABEL: Record<InputType, string> = { number: "Number", select: "Pick one", multi: "Pick several", toggle: "Yes / no", text: "Text" };

const CHEATSHEET = [
  ["Arithmetic", "+  -  *  /  %   and  ( )"],
  ["Compare", "==  !=  <  <=  >  >=   and / or / not"],
  ["Choose", "cond ? a : b   ·   if(cond, a, b)"],
  ["Tiers", "tier(sqft, [[500, 0.30], [2000, 0.22]], 0.18)"],
  ["Tables", "lookup(size, {small: 100, large: 200}, 150)"],
  ["Rounding", "round(x, 2)  floor  ceil  roundTo(x, 5)  clamp(x, lo, hi)"],
  ["Percent", "pct(amount, 15)  → 15% of amount"],
  ["Pick-several", "has(picks, 'Fence')  count(picks)  join(picks)"],
  ["Price book", "price(\"Item name\")  cost(\"Item name\")"],
  ["Text", "{sqft} sq ft at {rate|money}  in names and descriptions"],
] as const;

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

/** Number field that keeps what you typed until blur (so "1." doesn't snap to 1). */
function NumField({ value, onCommit, placeholder, className = "w-28", prefix }: { value: number | undefined; onCommit: (v: number | undefined) => void; placeholder?: string; className?: string; prefix?: string }) {
  const [text, setText] = useState(value === undefined ? "" : String(value));
  useEffect(() => setText(value === undefined ? "" : String(value)), [value]);
  return (
    <div className={`flex items-center gap-1 ${className}`}>
      {prefix && <span className="text-sm text-gray-500">{prefix}</span>}
      <Input
        type="number"
        inputMode="decimal"
        step="any"
        value={text}
        placeholder={placeholder}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          const n = text.trim() === "" ? undefined : Number(text);
          onCommit(n !== undefined && Number.isFinite(n) ? n : undefined);
        }}
        className="w-full"
      />
    </div>
  );
}

const iconBtn = "rounded-lg p-1.5 text-gray-400 hover:bg-gray-100 hover:text-gray-700 disabled:opacity-30";
const mono = "font-mono text-[13px]";

export default function EditEstimatorSheet({ tool, open, onClose, onSaved }: { tool: EditTool | null; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [tab, setTab] = useState<Tab>("questions");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [spec, setSpec] = useState<EstimatorSpec | null>(null);
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"save" | "check" | "restore" | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [trying, setTrying] = useState(false);
  const [cheat, setCheat] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [workItemNames, setWorkItemNames] = useState<string[]>([]);

  useEffect(() => {
    if (!open || !tool) return;
    setTab("questions");
    setName(tool.name);
    setDescription(tool.description ?? "");
    setSpec(clone(tool.spec));
    setNewIds(new Set());
    setError("");
    setErrors([]);
    setChecked(false);
    setVersions(null);
    fetch("/api/app/work-items")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => setWorkItemNames(Array.isArray(rows) ? rows.map((w) => String((w as { name?: unknown }).name ?? "")).filter(Boolean) : []))
      .catch(() => setWorkItemNames([]));
  }, [open, tool]);

  useEffect(() => {
    if (tab !== "history" || !tool || versions !== null) return;
    fetch(`/api/app/estimators/${tool.id}/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d: { versions?: Version[] }) => setVersions(d.versions ?? []))
      .catch(() => setVersions([]));
  }, [tab, tool, versions]);

  if (!tool || !spec) return <Modal open={open} onClose={onClose}>{null}</Modal>;

  const touch = (fn: (s: EstimatorSpec) => void) => {
    setSpec((s) => {
      if (!s) return s;
      const next = clone(s);
      fn(next);
      return next;
    });
    setChecked(false);
    setErrors([]);
  };

  // ── questions ──
  const setInput = (i: number, patch: Partial<EstimatorInput>) => touch((s) => Object.assign(s.inputs[i], patch));
  const moveInput = (i: number, d: -1 | 1) =>
    touch((s) => {
      const j = i + d;
      if (j < 0 || j >= s.inputs.length) return;
      [s.inputs[i], s.inputs[j]] = [s.inputs[j], s.inputs[i]];
    });
  const removeInput = (i: number) => touch((s) => s.inputs.splice(i, 1));
  function addInput(type: InputType) {
    const base = { label: "New question", help: undefined, section: spec!.inputs[spec!.inputs.length - 1]?.section };
    let id = "new_question";
    let n = 2;
    while (spec!.inputs.some((x) => x.id === id)) id = `new_question_${n++}`;
    const inp: EstimatorInput =
      type === "number"
        ? { ...base, id, type, required: true }
        : type === "select"
          ? { ...base, id, type, options: [{ value: "Option A", label: "Option A" }, { value: "Option B", label: "Option B" }], required: true }
          : type === "multi"
            ? { ...base, id, type, options: [{ value: "Option A", label: "Option A" }, { value: "Option B", label: "Option B" }] }
            : type === "toggle"
              ? { ...base, id, type, default: false }
              : { ...base, id, type };
    setNewIds((prev) => new Set(prev).add(id));
    touch((s) => s.inputs.push(inp));
  }
  /** New questions get an id from their label until saved; existing ids never move (formulas point at them). */
  function relabel(i: number, label: string) {
    const cur = spec!.inputs[i];
    if (!newIds.has(cur.id)) return setInput(i, { label });
    const fresh = toIdentifier(label) || cur.id;
    const taken = spec!.inputs.some((x, k) => k !== i && x.id === fresh);
    const id = taken ? cur.id : fresh;
    if (id !== cur.id)
      setNewIds((prev) => {
        const n = new Set(prev);
        n.delete(cur.id);
        n.add(id);
        return n;
      });
    setInput(i, { label, id });
  }
  const setOptions = (i: number, opts: EstimatorOption[]) => touch((s) => Object.assign(s.inputs[i], { options: opts }));

  // ── pricing ──
  const setLine = (i: number, patch: Partial<EstimatorLine>) => touch((s) => Object.assign(s.lines[i], patch));
  const moveLine = (i: number, d: -1 | 1) =>
    touch((s) => {
      const j = i + d;
      if (j < 0 || j >= s.lines.length) return;
      [s.lines[i], s.lines[j]] = [s.lines[j], s.lines[i]];
    });
  const removeLine = (i: number) => touch((s) => s.lines.splice(i, 1));
  const addLine = () => touch((s) => s.lines.push({ id: `line_${Date.now().toString(36)}`, name: "New line", unitPrice: "0" }));
  const setVar = (i: number, patch: Partial<EstimatorVariable>) => touch((s) => Object.assign(s.variables[i], patch));
  const addVar = () => touch((s) => s.variables.push({ id: `rate${s.variables.length + 1}`, expr: "0" }));
  const removeVar = (i: number) => touch((s) => s.variables.splice(i, 1));

  // ── actions ──
  async function check(): Promise<boolean> {
    setBusy("check");
    setError("");
    setErrors([]);
    const { ok, data } = await postJson<{ errors?: string[]; error?: string }>(`/api/app/estimators/preview`, { spec });
    setBusy(null);
    if (!ok) {
      setErrors(data?.errors ?? [data?.error ?? GENERIC_ERROR]);
      return false;
    }
    setChecked(true);
    return true;
  }
  async function save() {
    if (!name.trim()) {
      setError("Give the tool a name.");
      return;
    }
    setBusy("save");
    setError("");
    setErrors([]);
    const { ok, data } = await postJson<{ errors?: string[]; error?: string }>(`/api/app/estimators/${tool!.id}`, { name: name.trim(), description: description.trim() || null, spec }, "PATCH");
    setBusy(null);
    if (!ok) {
      if (data?.errors?.length) setErrors(data.errors);
      else setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onSaved();
  }
  async function restore(v: Version) {
    if (
      !(await confirmSheet({
        title: "Restore this version?",
        message: `The rules go back to how they were on ${new Date(v.createdAt).toLocaleString()}. Today's rules are kept in History, so you can come back.`,
        confirmLabel: "Restore",
      }))
    )
      return;
    setBusy("restore");
    setError("");
    const { ok, data } = await postJson<{ error?: string }>(`/api/app/estimators/${tool!.id}/versions/${v.id}`, {});
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    onSaved();
  }

  const sectionNames = Array.from(new Set(spec.inputs.map((i) => i.section).filter((s): s is string => Boolean(s))));
  const tabBtn = (t: Tab, label: string, Icon?: typeof History) => (
    <button
      type="button"
      onClick={() => setTab(t)}
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium ${tab === t ? "bg-gray-900 text-white" : "text-gray-600 hover:bg-gray-100"}`}
    >
      {Icon && <Icon size={13} />}
      {label}
    </button>
  );

  return (
    <Modal open={open} onClose={onClose} cardClassName="card-ledger w-full max-w-2xl p-5 max-h-[90vh] overflow-y-auto">
      <div className="mb-3 flex items-start gap-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-100 text-gray-700">
          <Pencil size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-semibold text-gray-900">Edit “{tool.name}”</h2>
          <p className="mt-0.5 text-xs text-gray-500">Change anything by hand. Every save keeps the previous version under History, so nothing is ever lost.</p>
        </div>
      </div>

      <div className="mb-4 flex flex-wrap gap-1 border-b border-gray-100 pb-3">
        {tabBtn("questions", `Questions (${spec.inputs.length})`)}
        {tabBtn("pricing", `Pricing (${spec.lines.length})`)}
        {tabBtn("text", "Words")}
        {tabBtn("history", "History", History)}
      </div>

      {error && (
        <div role="alert" className="form-error mb-4">
          {error}
        </div>
      )}
      {errors.length > 0 && (
        <div role="alert" className="form-error mb-4">
          <p className="font-medium">The rules don&apos;t add up yet:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* ── Questions ── */}
      {tab === "questions" && (
        <div className="space-y-3">
          {spec.inputs.map((inp, i) => (
            <div key={inp.id} className="space-y-2 rounded-xl border border-gray-200 p-3">
              <div className="flex items-center gap-2">
                <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{TYPE_LABEL[inp.type]}</span>
                <Input value={inp.label} onChange={(e) => relabel(i, e.target.value)} maxLength={80} className="min-w-0 flex-1" placeholder="Question" />
                <button type="button" onClick={() => moveInput(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up">
                  <ArrowUp size={14} />
                </button>
                <button type="button" onClick={() => moveInput(i, 1)} disabled={i === spec.inputs.length - 1} className={iconBtn} aria-label="Move down">
                  <ArrowDown size={14} />
                </button>
                <button type="button" onClick={() => removeInput(i)} className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600`} aria-label="Remove question">
                  <Trash2 size={14} />
                </button>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={inp.help ?? ""} onChange={(e) => setInput(i, { help: e.target.value || undefined })} maxLength={200} placeholder="Help text (optional)" className="w-full" />
                <div>
                  <Input list={`sections-${tool.id}`} value={inp.section ?? ""} onChange={(e) => setInput(i, { section: e.target.value || undefined })} maxLength={60} placeholder="Section (optional)" className="w-full" />
                  <datalist id={`sections-${tool.id}`}>
                    {sectionNames.map((s) => (
                      <option key={s} value={s} />
                    ))}
                  </datalist>
                </div>
              </div>
              {inp.type === "number" && (
                <div className="flex flex-wrap items-end gap-2">
                  <label className="text-xs text-gray-600">
                    Unit
                    <Input value={inp.unit ?? ""} onChange={(e) => setInput(i, { unit: e.target.value || undefined })} maxLength={20} placeholder="sq ft" className="mt-0.5 w-24" />
                  </label>
                  <label className="text-xs text-gray-600">
                    Min
                    <NumField value={inp.min} onCommit={(v) => setInput(i, { min: v })} className="mt-0.5 w-20" />
                  </label>
                  <label className="text-xs text-gray-600">
                    Max
                    <NumField value={inp.max} onCommit={(v) => setInput(i, { max: v })} className="mt-0.5 w-20" />
                  </label>
                  <label className="text-xs text-gray-600">
                    Default
                    <NumField value={inp.default} onCommit={(v) => setInput(i, { default: v })} className="mt-0.5 w-24" />
                  </label>
                </div>
              )}
              {(inp.type === "select" || inp.type === "multi") && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-gray-600">Options</p>
                  {inp.options.map((o, k) => (
                    <div key={k} className="flex items-center gap-2">
                      <Input
                        value={o.label}
                        onChange={(e) => {
                          const opts = inp.options.map((x, m) => (m === k ? { label: e.target.value, value: x.value === x.label ? e.target.value : x.value } : x));
                          setOptions(i, opts);
                        }}
                        maxLength={60}
                        placeholder="Label"
                        className="min-w-0 flex-1"
                      />
                      <Input
                        value={o.value}
                        onChange={(e) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, value: e.target.value } : x)))}
                        maxLength={60}
                        placeholder="value"
                        className={`w-32 ${mono}`}
                        title="The value formulas compare against"
                      />
                      <button type="button" onClick={() => setOptions(i, inp.options.filter((_, m) => m !== k))} disabled={inp.options.length <= 2} className={iconBtn} aria-label="Remove option">
                        <Trash2 size={13} />
                      </button>
                    </div>
                  ))}
                  <button
                    type="button"
                    disabled={inp.options.length >= ESTIMATOR_LIMITS.options}
                    onClick={() => setOptions(i, [...inp.options, { label: `Option ${inp.options.length + 1}`, value: `Option ${inp.options.length + 1}` }])}
                    className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline disabled:opacity-50"
                  >
                    <Plus size={12} /> Add option
                  </button>
                  {inp.type === "select" && (
                    <label className="flex items-center gap-2 text-xs text-gray-600">
                      Default
                      <Select value={inp.default ?? ""} onChange={(e) => setInput(i, { default: e.target.value || undefined } as Partial<EstimatorInput>)} className="w-44">
                        <option value="">None</option>
                        {inp.options.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </label>
                  )}
                </div>
              )}
              {inp.type === "toggle" && (
                <label className="flex items-center gap-2 text-xs text-gray-600">
                  <input type="checkbox" checked={inp.default === true} onChange={(e) => setInput(i, { default: e.target.checked } as Partial<EstimatorInput>)} className="h-4 w-4 rounded accent-green-600" />
                  On by default
                </label>
              )}
              {inp.type === "text" && <Input value={inp.placeholder ?? ""} onChange={(e) => setInput(i, { placeholder: e.target.value || undefined } as Partial<EstimatorInput>)} maxLength={80} placeholder="Placeholder (optional)" className="w-full" />}
              <div className="flex flex-wrap items-center gap-3">
                {inp.type !== "toggle" && (
                  <label className="flex items-center gap-1.5 text-xs text-gray-600">
                    <input type="checkbox" checked={inp.required !== false && (inp.type !== "text" && inp.type !== "multi" ? true : inp.required === true)} onChange={(e) => setInput(i, { required: e.target.checked } as Partial<EstimatorInput>)} className="h-4 w-4 rounded accent-green-600" />
                    Required
                  </label>
                )}
                <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-gray-600">
                  <span className="shrink-0">Show when</span>
                  <Input value={inp.showWhen ?? ""} onChange={(e) => setInput(i, { showWhen: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="always — or e.g. has(extras, 'Fence')" className={`min-w-0 flex-1 ${mono}`} />
                </label>
                <span className={`shrink-0 text-[11px] text-gray-400 ${mono}`}>{inp.id}</span>
              </div>
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-gray-600">
            <span className="mr-1 font-medium">Add a question:</span>
            {(Object.keys(TYPE_LABEL) as InputType[]).map((t) => (
              <button key={t} type="button" disabled={spec.inputs.length >= ESTIMATOR_LIMITS.inputs} onClick={() => addInput(t)} className="rounded-full border border-gray-300 px-2.5 py-1 hover:bg-gray-50 disabled:opacity-50">
                {TYPE_LABEL[t]}
              </button>
            ))}
          </div>
          <p className="text-xs text-gray-500">A new question does nothing until a rate or line under Pricing uses its id. Removing one that formulas still use is caught when you save.</p>
        </div>
      )}

      {/* ── Pricing ── */}
      {tab === "pricing" && (
        <div className="space-y-4">
          <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-gray-800">Minimum job charge</span>
              <span className="block text-xs text-gray-500">A top-up line brings small jobs to this amount. Blank = none.</span>
            </span>
            <NumField value={spec.minimumTotal} onCommit={(v) => touch((s) => (s.minimumTotal = v && v > 0 ? v : undefined))} prefix="$" className="w-32" />
          </label>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Variables</p>
              <button type="button" disabled={spec.variables.length >= ESTIMATOR_LIMITS.variables} onClick={addVar} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
                <Plus size={12} /> Add variable
              </button>
            </div>
            {spec.variables.length === 0 && <p className="text-xs text-gray-500">None — rates can be named here once and reused in every line (e.g. rate = tier(sqft, [[500, 0.30]], 0.22)).</p>}
            <div className="space-y-1.5">
              {spec.variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={v.id} onChange={(e) => setVar(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} maxLength={40} className={`w-32 ${mono}`} placeholder="name" />
                  <span className="text-gray-400">=</span>
                  <Input value={v.expr} onChange={(e) => setVar(i, { expr: e.target.value })} maxLength={ESTIMATOR_LIMITS.exprLen} className={`min-w-0 flex-1 ${mono}`} placeholder="formula" />
                  <button type="button" onClick={() => removeVar(i)} className={iconBtn} aria-label="Remove variable">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
            </div>
          </div>

          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Quote lines</p>
              <button type="button" disabled={spec.lines.length >= ESTIMATOR_LIMITS.lines} onClick={addLine} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
                <Plus size={12} /> Add line
              </button>
            </div>
            <datalist id={`workitems-${tool.id}`}>
              {workItemNames.map((n) => (
                <option key={n} value={n} />
              ))}
            </datalist>
            <div className="space-y-3">
              {spec.lines.map((l, i) => (
                <div key={l.id} className="space-y-2 rounded-xl border border-gray-200 p-3">
                  <div className="flex items-center gap-2">
                    <Input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={160} className="min-w-0 flex-1" placeholder="Line name — may use {sqft}" />
                    <button type="button" onClick={() => moveLine(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up">
                      <ArrowUp size={14} />
                    </button>
                    <button type="button" onClick={() => moveLine(i, 1)} disabled={i === spec.lines.length - 1} className={iconBtn} aria-label="Move down">
                      <ArrowDown size={14} />
                    </button>
                    <button type="button" onClick={() => removeLine(i)} className={`${iconBtn} hover:!bg-red-50 hover:!text-red-600`} aria-label="Remove line">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  <Input value={l.description ?? ""} onChange={(e) => setLine(i, { description: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.templateLen} placeholder="Description on the quote (optional) — {sqft} sq ft at {rate|money}" className="w-full" />
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                    <label className="text-xs text-gray-600">
                      Unit price
                      <Input value={l.unitPrice ?? ""} onChange={(e) => setLine(i, { unitPrice: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder={l.workItemName ? "price book" : "0.25 or a formula"} className={`mt-0.5 w-full ${mono}`} />
                    </label>
                    <label className="text-xs text-gray-600">
                      Quantity
                      <Input value={l.quantity ?? ""} onChange={(e) => setLine(i, { quantity: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="1" className={`mt-0.5 w-full ${mono}`} />
                    </label>
                    <label className="text-xs text-gray-600">
                      Only when
                      <Input value={l.when ?? ""} onChange={(e) => setLine(i, { when: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="always" className={`mt-0.5 w-full ${mono}`} />
                    </label>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <label className="flex min-w-0 flex-1 items-center gap-1.5 text-xs text-gray-600">
                      <span className="shrink-0">Price-book item</span>
                      <Input list={`workitems-${tool.id}`} value={l.workItemName ?? ""} onChange={(e) => setLine(i, { workItemName: e.target.value || undefined })} maxLength={120} placeholder="none — plain line" className="min-w-0 flex-1" />
                    </label>
                    <label className="flex items-center gap-1.5 text-xs text-gray-600">
                      <input type="checkbox" checked={l.isOptional === true} onChange={(e) => setLine(i, { isOptional: e.target.checked })} className="h-4 w-4 rounded accent-green-600" />
                      Optional on the quote
                    </label>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <button type="button" onClick={() => setCheat((c) => !c)} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline">
            {cheat ? <ChevronUp size={13} /> : <ChevronDown size={13} />} Formula cheat sheet
          </button>
          {cheat && (
            <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-gray-50 p-3 text-xs">
              {CHEATSHEET.map(([k, v]) => (
                <div key={k} className="contents">
                  <dt className="font-medium text-gray-700">{k}</dt>
                  <dd className={`text-gray-600 ${mono}`}>{v}</dd>
                </div>
              ))}
              <div className="contents">
                <dt className="font-medium text-gray-700">Names</dt>
                <dd className={`text-gray-600 ${mono}`}>{[...spec.inputs.map((x) => x.id), ...spec.variables.map((x) => x.id)].join("  ") || "—"}</dd>
              </div>
            </dl>
          )}
        </div>
      )}

      {/* ── Words ── */}
      {tab === "text" && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Tool name</label>
              <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={80} className="w-full" />
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Use it for</label>
              <Input value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200} placeholder="Shown in the tool list" className="w-full" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Intro</label>
            <Textarea value={spec.intro ?? ""} onChange={(e) => touch((s) => (s.intro = e.target.value || undefined))} rows={2} maxLength={ESTIMATOR_LIMITS.textLen} placeholder="One or two sentences above the questions" className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Quote title</label>
            <Input value={spec.quoteTitle ?? ""} onChange={(e) => touch((s) => (s.quoteTitle = e.target.value || undefined))} maxLength={ESTIMATOR_LIMITS.templateLen} placeholder="Pressure washing — {sqft} sq ft" className="w-full" />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-gray-800">Client message</label>
            <Textarea value={spec.clientMessage ?? ""} onChange={(e) => touch((s) => (s.clientMessage = e.target.value || undefined))} rows={3} maxLength={1200} placeholder="Goes on the quote — may use {subtotal|money}" className="w-full" />
          </div>
          <label className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 px-3 py-2.5">
            <span>
              <span className="block text-sm font-medium text-gray-800">Atlas fill-in</span>
              <span className="block text-xs text-gray-500">“Describe the job / snap a photo” on this tool. Costs tokens per use; typing the answers stays free.</span>
            </span>
            <input type="checkbox" checked={Boolean(spec.assist)} onChange={(e) => touch((s) => (s.assist = e.target.checked ? { instructions: s.assist?.instructions } : null))} className="h-5 w-5 rounded accent-green-600" />
          </label>
          {spec.assist && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Guidance for Atlas</label>
              <Textarea value={spec.assist.instructions ?? ""} onChange={(e) => touch((s) => (s.assist = { instructions: e.target.value || undefined }))} rows={2} maxLength={600} placeholder="e.g. A two-car driveway is about 500 sq ft; count the garage as one story." className="w-full" />
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {tab === "history" && (
        <div className="space-y-2">
          {versions === null && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </p>
          )}
          {versions && versions.length === 0 && <p className="text-sm text-gray-500">No saved versions yet — the first edit or Atlas update creates one.</p>}
          {versions?.map((v, i) => (
            <div key={v.id} className="rounded-xl border border-gray-200 p-3">
              <div className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-gray-900">
                    {new Date(v.createdAt).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                    <span className="ml-2 text-xs font-normal text-gray-500">
                      {v.note}
                      {v.byName ? ` · ${v.byName}` : ""}
                    </span>
                  </p>
                  <p className="text-xs text-gray-500">
                    {v.inputs} question{v.inputs === 1 ? "" : "s"} · {v.lines} line{v.lines === 1 ? "" : "s"}
                    {v.broken ? " · no longer compiles" : ""}
                  </p>
                  {v.changes.length > 0 && (
                    <ul className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                      {v.changes.slice(0, 8).map((c) => (
                        <li key={c}>→ {c}</li>
                      ))}
                      {v.changes.length > 8 && <li>… and {v.changes.length - 8} more</li>}
                    </ul>
                  )}
                  {v.changes.length === 0 && i === 0 && <p className="mt-1 text-xs text-gray-400">Same rules as now.</p>}
                </div>
                <button type="button" disabled={busy !== null || v.broken} onClick={() => void restore(v)} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  <RotateCcw size={12} /> Restore
                </button>
              </div>
            </div>
          ))}
          <p className="text-xs text-gray-500">Each entry is how the tool looked right before that change. The arrows say what the change did.</p>
        </div>
      )}

      {/* footer */}
      {tab !== "history" && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-gray-100 pt-4">
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy !== null} onClick={() => void check()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              {busy === "check" ? <Loader2 size={13} className="animate-spin" /> : checked ? <ShieldCheck size={13} className="text-green-600" /> : <ShieldCheck size={13} />}
              {checked ? "Rules add up" : "Check"}
            </button>
            <button type="button" disabled={busy !== null} onClick={() => setTrying(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Play size={13} /> Try it
            </button>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} className="h-9 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
              Cancel
            </button>
            <button type="button" disabled={busy !== null} onClick={() => void save()} className="btn-primary h-9 justify-center">
              {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              Save
            </button>
          </div>
        </div>
      )}

      <EstimatorRunner
        portal
        estimators={[{ id: "preview", name: name || tool.name, description: null, usesAtlas: false, spec, preview: true }]}
        open={trying}
        onClose={() => setTrying(false)}
      />
    </Modal>
  );
}
