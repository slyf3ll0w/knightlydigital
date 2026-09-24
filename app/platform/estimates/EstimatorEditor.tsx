"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowUp, Check, ChevronDown, ChevronRight, ChevronUp, ImagePlus, Loader2, Play, Plus, RotateCcw, ShieldCheck, Sparkles, Trash2, X } from "lucide-react";
import { fileToJpegBlob } from "@/lib/image-downscale";
import { Input, Select, Textarea } from "@/components/Input";
import EstimatorRunner from "@/components/EstimatorRunner";
import RatesToConfirm from "@/components/RatesToConfirm";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { useUnsavedWarning } from "@/lib/use-unsaved-warning";
import { ESTIMATOR_LIMITS, toIdentifier, type EstimatorInput, type EstimatorLine, type EstimatorOption, type EstimatorSpec, type EstimatorVariable } from "@/lib/estimator";

/**
 * The manual side of a tool, on the tool page (Questions / Pricing / Words /
 * History). Every question and every pricing line is a collapsed row that
 * reads at a glance — label, kind, section, rate, condition — and opens to
 * its settings, so a 20-question tool is a list, not a wall. Formulas are
 * plain text; the server compiles on save and hands back exact reasons.
 * "Check" runs the compile + the quality audit; "Try it" runs the unsaved
 * rules. The component stays mounted across sections so unsaved edits
 * survive switching between them; a docked bar shows when there's
 * something to save.
 */

export type EditTool = { id: string; name: string; description: string | null; spec: EstimatorSpec; usesAtlas: boolean };
export type EditorSection = "questions" | "pricing" | "words" | "history";

type Version = { id: string; note: string; byName: string | null; createdAt: string; name: string; inputs: number; lines: number; broken: boolean; changes: string[] };
type InputType = EstimatorInput["type"];

const TYPE_LABEL: Record<InputType, string> = { number: "Number", select: "Pick one", multi: "Pick several", counts: "Item counts", map: "Draw on a map", toggle: "Yes / no", text: "Text" };

const CHEATSHEET = [
  ["Arithmetic", "+  -  *  /  %   and  ( )"],
  ["Compare", "==  !=  <  <=  >  >=   and / or / not"],
  ["Choose", "cond ? a : b   ·   if(cond, a, b)"],
  ["Tiers", "tier(sqft, [[500, 0.30], [2000, 0.22]], 0.18)"],
  ["Tables", "lookup(size, {small: 100, large: 200}, 150)"],
  ["Rounding", "round(x, 2)  floor  ceil  roundTo(x, 5)  clamp(x, lo, hi)"],
  ["Percent", "pct(amount, 15)  → 15% of amount"],
  ["Pick-several", "has(picks, 'Fence')  count(picks)  join(picks)"],
  ["Item counts", "qty(windows, 'picture')  total(windows)  join(windows)"],
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
const pill = "shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600";
const fieldLabel = "mb-1 block text-xs font-medium text-gray-600";

/** Add / replace / remove the picture on a question or an option. */
function PictureButton({ url, onChange, upload, forget, small = false }: { url?: string; onChange: (url: string | undefined) => void; upload: (f: File) => Promise<string | null>; forget: (url: string | undefined) => void; small?: boolean }) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  return (
    <span className="inline-flex shrink-0 items-center gap-1">
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          setBusy(true);
          const u = await upload(f);
          setBusy(false);
          if (u) {
            forget(url);
            onChange(u);
          }
        }}
      />
      {url ? (
        <>
          <button type="button" onClick={() => ref.current?.click()} title="Replace picture" className="overflow-hidden rounded-md">
            <img src={url} alt="" className={small ? "h-8 w-8 object-cover" : "h-12 w-16 object-cover"} />
          </button>
          <button
            type="button"
            onClick={() => {
              forget(url);
              onChange(undefined);
            }}
            className={iconBtn}
            aria-label="Remove picture"
          >
            <X size={13} />
          </button>
        </>
      ) : (
        <button type="button" disabled={busy} onClick={() => ref.current?.click()} className={`${iconBtn} inline-flex items-center gap-1 text-xs`} title="Add a picture" aria-label="Add a picture">
          {busy ? <Loader2 size={13} className="animate-spin" /> : <ImagePlus size={13} />}
          {!small && "Picture"}
        </button>
      )}
    </span>
  );
}

/** A collapsed row that opens to its settings. */
function Row({ open, onToggle, header, actions, children }: { open: boolean; onToggle: () => void; header: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className={`rounded-xl border ${open ? "border-gray-300 shadow-sm" : "border-gray-200"} bg-white`}>
      <div className="flex items-center gap-2 pr-2">
        <button type="button" onClick={onToggle} className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left" aria-expanded={open}>
          <span className="shrink-0 text-gray-400">{open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</span>
          {header}
        </button>
        {actions}
      </div>
      {open && <div className="space-y-3 border-t border-gray-100 p-3">{children}</div>}
    </div>
  );
}

export default function EstimatorEditor({ tool, section, onSaved }: { tool: EditTool; section: EditorSection; onSaved: () => void }) {
  const [name, setName] = useState(tool.name);
  const [description, setDescription] = useState(tool.description ?? "");
  const [spec, setSpec] = useState<EstimatorSpec>(() => clone(tool.spec));
  const [newIds, setNewIds] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<"save" | "check" | "restore" | null>(null);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [checked, setChecked] = useState(false);
  const [tips, setTips] = useState<string[]>([]);
  const [trying, setTrying] = useState(false);
  const [cheat, setCheat] = useState(false);
  const [versions, setVersions] = useState<Version[] | null>(null);
  const [workItemNames, setWorkItemNames] = useState<string[]>([]);
  const [openQ, setOpenQ] = useState<Set<string>>(new Set());
  const [openL, setOpenL] = useState<Set<string>>(new Set());
  const [openVars, setOpenVars] = useState(false);
  const [saved, setSaved] = useState(false);
  const baseline = useRef(JSON.stringify({ name: tool.name, description: tool.description ?? "", spec: tool.spec }));

  // A save (or an Atlas change) hands us a fresh tool: re-baseline
  useEffect(() => {
    const next = JSON.stringify({ name: tool.name, description: tool.description ?? "", spec: tool.spec });
    if (next === baseline.current) return;
    baseline.current = next;
    setName(tool.name);
    setDescription(tool.description ?? "");
    setSpec(clone(tool.spec));
    setNewIds(new Set());
    setChecked(false);
    setErrors([]);
    setTips([]);
    setVersions(null);
  }, [tool]);

  useEffect(() => {
    fetch("/api/app/work-items")
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: unknown) => setWorkItemNames(Array.isArray(rows) ? rows.map((w) => String((w as { name?: unknown }).name ?? "")).filter(Boolean) : []))
      .catch(() => setWorkItemNames([]));
  }, []);

  useEffect(() => {
    if (section !== "history" || versions !== null) return;
    fetch(`/api/app/estimators/${tool.id}/versions`)
      .then((r) => (r.ok ? r.json() : { versions: [] }))
      .then((d: { versions?: Version[] }) => setVersions(d.versions ?? []))
      .catch(() => setVersions([]));
  }, [section, tool.id, versions]);

  const dirty = useMemo(() => JSON.stringify({ name, description, spec }) !== baseline.current, [name, description, spec]);
  useUnsavedWarning(dirty);

  const touch = (fn: (s: EstimatorSpec) => void) => {
    setSpec((s) => {
      const next = clone(s);
      fn(next);
      return next;
    });
    setChecked(false);
    setErrors([]);
    setTips([]);
    setSaved(false);
  };
  const toggleSet = (set: Set<string>, id: string) => {
    const n = new Set(set);
    if (n.has(id)) n.delete(id);
    else n.add(id);
    return n;
  };

  /** "Label=550, Two-car=550" ⇄ presets */
  const presetsText = (p: { label: string; value: number }[] | undefined) => (p ?? []).map((x) => `${x.label}=${x.value}`).join(", ");
  const parsePresetsText = (t: string) =>
    t
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => {
        const eq = s.lastIndexOf("=");
        const label = eq >= 0 ? s.slice(0, eq).trim() : s;
        const value = Number(eq >= 0 ? s.slice(eq + 1).trim() : "");
        return { label, value };
      })
      .filter((x) => x.label && Number.isFinite(x.value))
      .slice(0, ESTIMATOR_LIMITS.presets);

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
    const base = { label: "New question", help: undefined, section: spec.inputs[spec.inputs.length - 1]?.section };
    let id = "new_question";
    let n = 2;
    while (spec.inputs.some((x) => x.id === id)) id = `new_question_${n++}`;
    const two = [{ value: "Option A", label: "Option A" }, { value: "Option B", label: "Option B" }];
    const inp: EstimatorInput =
      type === "number"
        ? { ...base, id, type, required: true }
        : type === "select"
          ? { ...base, id, type, options: two, required: true }
          : type === "multi"
            ? { ...base, id, type, options: two }
            : type === "counts"
              ? { ...base, id, type, options: two }
              : type === "map"
                ? { ...base, id, type, measure: "area", required: true }
                : type === "toggle"
                  ? { ...base, id, type, default: false }
                  : { ...base, id, type };
    setNewIds((prev) => new Set(prev).add(id));
    setOpenQ((o) => new Set(o).add(id));
    touch((s) => s.inputs.push(inp));
  }
  /** New questions get an id from their label until saved; existing ids never move (formulas point at them). */
  function relabel(i: number, label: string) {
    const cur = spec.inputs[i];
    if (!newIds.has(cur.id)) return setInput(i, { label });
    const fresh = toIdentifier(label) || cur.id;
    const taken = spec.inputs.some((x, k) => k !== i && x.id === fresh);
    const id = taken ? cur.id : fresh;
    if (id !== cur.id) {
      setNewIds((prev) => {
        const n = new Set(prev);
        n.delete(cur.id);
        n.add(id);
        return n;
      });
      setOpenQ((o) => {
        const n = new Set(o);
        n.delete(cur.id);
        n.add(id);
        return n;
      });
    }
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
  const addLine = () => {
    const id = `line_${Date.now().toString(36)}`;
    setOpenL((o) => new Set(o).add(id));
    touch((s) => s.lines.push({ id, name: "New line", description: "", unitPrice: "0" }));
  };
  const setVar = (i: number, patch: Partial<EstimatorVariable>) => touch((s) => Object.assign(s.variables[i], patch));
  const addVar = () => {
    setOpenVars(true);
    touch((s) => s.variables.push({ id: `rate${s.variables.length + 1}`, expr: "0" }));
  };
  const removeVar = (i: number) => touch((s) => s.variables.splice(i, 1));

  // ── actions ──
  async function check(): Promise<boolean> {
    setBusy("check");
    setError("");
    setErrors([]);
    setTips([]);
    const { ok, data } = await postJson<{ errors?: string[]; error?: string; audit?: { errors: string[]; warnings: string[] } }>(`/api/app/estimators/preview`, { spec });
    setBusy(null);
    if (!ok) {
      setErrors(data?.errors ?? [data?.error ?? GENERIC_ERROR]);
      return false;
    }
    setChecked(true);
    setTips([...(data?.audit?.errors ?? []), ...(data?.audit?.warnings ?? [])]);
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
    const { ok, data } = await postJson<{ errors?: string[]; error?: string }>(`/api/app/estimators/${tool.id}`, { name: name.trim(), description: description.trim() || null, spec }, "PATCH");
    setBusy(null);
    if (!ok) {
      if (data?.errors?.length) setErrors(data.errors);
      else setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    baseline.current = JSON.stringify({ name: name.trim(), description: description.trim(), spec });
    setNewIds(new Set());
    setSaved(true);
    onSaved();
  }
  /** Pictures upload straight away (downsized to ~1024 px) and the spec keeps the URL. */
  async function uploadPicture(file: File): Promise<string | null> {
    const blob = await fileToJpegBlob(file);
    if (!blob) {
      setError("That picture couldn't be read — try a JPG or PNG.");
      return null;
    }
    const fd = new FormData();
    fd.append("file", new File([blob], "picture.jpg", { type: "image/jpeg" }));
    const res = await fetch(`/api/app/estimators/${tool.id}/images`, { method: "POST", body: fd });
    const data = (await res.json().catch(() => null)) as { url?: string; error?: string } | null;
    if (!res.ok || !data?.url) {
      setError(data?.error ?? GENERIC_ERROR);
      return null;
    }
    return data.url;
  }
  function forgetPicture(url: string | undefined) {
    const m = url ? /^\/api\/estimate-images\/([A-Za-z0-9_-]+)$/.exec(url) : null;
    if (m) void fetch(`/api/app/estimators/${tool.id}/images/${m[1]}`, { method: "DELETE" }).catch(() => undefined);
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
    const { ok, data } = await postJson<{ error?: string }>(`/api/app/estimators/${tool.id}/versions/${v.id}`, {});
    setBusy(null);
    if (!ok) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    setVersions(null);
    onSaved();
  }

  const sectionNames = Array.from(new Set(spec.inputs.map((i) => i.section).filter((s): s is string => Boolean(s))));
  const names = [...spec.inputs.map((x) => x.id), ...spec.variables.map((x) => x.id)];
  const rateText = (l: EstimatorLine) => (l.unitPrice ? (/^\d+(\.\d+)?$/.test(l.unitPrice) ? `$${Number(l.unitPrice).toFixed(2)}` : l.unitPrice) : l.workItemName ? `price book: ${l.workItemName}` : "—");

  const alerts = (
    <>
      {error && (
        <div role="alert" className="form-error">
          {error}
        </div>
      )}
      {errors.length > 0 && (
        <div role="alert" className="form-error">
          <p className="font-medium">The rules don&apos;t add up yet:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {checked && tips.length > 0 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <p className="font-semibold">Adds up — a pro would still tweak:</p>
          <ul className="mt-1 list-disc space-y-0.5 pl-5">
            {tips.map((t) => (
              <li key={t}>{t}</li>
            ))}
          </ul>
        </div>
      )}
    </>
  );

  // ── the docked bar ──
  const bar = section !== "history" && (
    <div className="glass-control sticky bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-10 flex flex-wrap items-center justify-between gap-2 rounded-xl px-3 py-2 lg:bottom-4">
      <div className="flex items-center gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void check()} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          {busy === "check" ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} className={checked ? "text-green-600" : undefined} />}
          {checked ? (tips.length ? "Adds up · tips" : "Adds up") : "Check"}
        </button>
        <button type="button" disabled={busy !== null} onClick={() => setTrying(true)} className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-gray-300 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
          <Play size={13} /> Try it
        </button>
      </div>
      <div className="flex items-center gap-2">
        <span className="text-xs text-gray-500">{dirty ? "Unsaved changes" : saved ? "Saved" : ""}</span>
        <button type="button" disabled={busy !== null || !dirty} onClick={() => void save()} className="btn-primary h-9 justify-center">
          {busy === "save" ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
          Save
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-4">
      {alerts}

      {/* ── Questions ── */}
      {section === "questions" && (
        <>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-gray-600">
              {spec.inputs.length} question{spec.inputs.length === 1 ? "" : "s"}
              {sectionNames.length > 1 ? ` in ${sectionNames.length} sections` : ""}. Tap one to change it.
            </p>
            <div className="flex flex-wrap items-center gap-1">
              <span className="mr-1 text-xs font-medium text-gray-500">Add:</span>
              {(Object.keys(TYPE_LABEL) as InputType[]).map((t) => (
                <button key={t} type="button" disabled={spec.inputs.length >= ESTIMATOR_LIMITS.inputs} onClick={() => addInput(t)} className="rounded-full border border-gray-200 px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
                  {TYPE_LABEL[t]}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            {spec.inputs.map((inp, i) => {
              const open = openQ.has(inp.id);
              const newSection = inp.section && (i === 0 || spec.inputs[i - 1].section !== inp.section);
              const required = inp.type !== "toggle" && "required" in inp && inp.required !== false;
              return (
                <div key={inp.id}>
                  {newSection && <p className="mb-1.5 mt-3 text-xs font-semibold text-gray-700">{inp.section}</p>}
                  <Row
                    open={open}
                    onToggle={() => setOpenQ((o) => toggleSet(o, inp.id))}
                    header={
                      <>
                        <span className={pill}>{TYPE_LABEL[inp.type]}</span>
                        <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">
                          {inp.label}
                          {required && <span className="text-red-500"> *</span>}
                        </span>
                        {inp.askAtlas && (
                          <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-800">
                            <Sparkles size={10} /> Atlas
                          </span>
                        )}
                        {inp.showWhen && <span className={`${pill} hidden sm:inline`}>only when {inp.showWhen}</span>}
                      </>
                    }
                    actions={
                      <span className="flex shrink-0 items-center">
                        <button type="button" onClick={() => moveInput(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up">
                          <ArrowUp size={14} />
                        </button>
                        <button type="button" onClick={() => moveInput(i, 1)} disabled={i === spec.inputs.length - 1} className={iconBtn} aria-label="Move down">
                          <ArrowDown size={14} />
                        </button>
                      </span>
                    }
                  >
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div className="sm:col-span-2">
                        <label className={fieldLabel}>Question</label>
                        <div className="flex items-center gap-2">
                          <Input value={inp.label} onChange={(e) => relabel(i, e.target.value)} maxLength={80} className="min-w-0 flex-1" placeholder="Question" />
                          <PictureButton small url={inp.image} onChange={(u) => setInput(i, { image: u })} upload={uploadPicture} forget={forgetPicture} />
                        </div>
                      </div>
                      <div>
                        <label className={fieldLabel}>Help text</label>
                        <Input value={inp.help ?? ""} onChange={(e) => setInput(i, { help: e.target.value || undefined })} maxLength={200} placeholder="Shown under the question (optional)" className="w-full" />
                      </div>
                      <div>
                        <label className={fieldLabel}>Section</label>
                        <Input list={`sections-${tool.id}`} value={inp.section ?? ""} onChange={(e) => setInput(i, { section: e.target.value || undefined })} maxLength={60} placeholder="e.g. The driveway" className="w-full" />
                        <datalist id={`sections-${tool.id}`}>
                          {sectionNames.map((s) => (
                            <option key={s} value={s} />
                          ))}
                        </datalist>
                      </div>
                    </div>

                    {inp.type === "map" && (
                      <div>
                        <label className={fieldLabel}>The customer draws</label>
                        <Select value={inp.measure} onChange={(e) => setInput(i, { measure: e.target.value as "length" | "area" } as Partial<EstimatorInput>)} className="w-full sm:w-80">
                          <option value="length">a line — the value is feet (fences, gutters)</option>
                          <option value="area">an area — the value is square feet (lawns, roofs, driveways)</option>
                        </Select>
                      </div>
                    )}

                    {inp.type === "number" && (
                      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                        <div>
                          <label className={fieldLabel}>Unit</label>
                          <Input value={inp.unit ?? ""} onChange={(e) => setInput(i, { unit: e.target.value || undefined })} maxLength={20} placeholder="sq ft" className="w-full" />
                        </div>
                        <div>
                          <label className={fieldLabel}>Min</label>
                          <NumField value={inp.min} onCommit={(v) => setInput(i, { min: v })} className="w-full" />
                        </div>
                        <div>
                          <label className={fieldLabel}>Max</label>
                          <NumField value={inp.max} onCommit={(v) => setInput(i, { max: v })} className="w-full" />
                        </div>
                        <div>
                          <label className={fieldLabel}>Default</label>
                          <NumField value={inp.default} onCommit={(v) => setInput(i, { default: v })} className="w-full" />
                        </div>
                        <div className="col-span-2">
                          <label className={fieldLabel}>Answered with</label>
                          <Select value={inp.control ?? "field"} onChange={(e) => setInput(i, { control: e.target.value === "field" ? undefined : (e.target.value as "slider" | "stepper") } as Partial<EstimatorInput>)} className="w-full">
                            <option value="field">a typed number</option>
                            <option value="slider">a slider (needs max)</option>
                            <option value="stepper">a − / + counter</option>
                          </Select>
                        </div>
                        <div className="col-span-2">
                          <label className={fieldLabel}>Quick-picks</label>
                          <Input defaultValue={presetsText(inp.presets)} key={`${inp.id}-presets`} onBlur={(e) => setInput(i, { presets: parsePresetsText(e.target.value).length > 0 ? parsePresetsText(e.target.value) : undefined } as Partial<EstimatorInput>)} placeholder="One-car=300, Two-car=550" className="w-full" />
                        </div>
                      </div>
                    )}

                    {(inp.type === "select" || inp.type === "multi" || inp.type === "counts") && (
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label className={fieldLabel}>{inp.type === "counts" ? "Items to count" : "Options"}</label>
                          {inp.type === "select" && (
                            <Select value={inp.style ?? "list"} onChange={(e) => setInput(i, { style: e.target.value === "list" ? undefined : (e.target.value as "cards" | "packages") } as Partial<EstimatorInput>)} className="w-56 !py-1.5 text-xs">
                              <option value="list">shown as a dropdown list</option>
                              <option value="cards">shown as tap cards</option>
                              <option value="packages">shown as package tiers with prices</option>
                            </Select>
                          )}
                        </div>
                        {inp.options.map((o, k) => (
                          <div key={k} className="space-y-1.5 rounded-lg border border-gray-100 bg-gray-50/60 p-2">
                            <div className="flex items-center gap-2">
                              <Input
                                value={o.label}
                                onChange={(e) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, label: e.target.value, value: x.value === x.label ? e.target.value : x.value } : x)))}
                                maxLength={60}
                                placeholder="Label"
                                className="min-w-0 flex-1"
                              />
                              <Input value={o.value} onChange={(e) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, value: e.target.value } : x)))} maxLength={60} placeholder="value" className={`w-28 ${mono}`} title="The value formulas compare against" />
                              <PictureButton small url={o.image} onChange={(u) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, image: u } : x)))} upload={uploadPicture} forget={forgetPicture} />
                              <button type="button" onClick={() => setOptions(i, inp.options.filter((_, m) => m !== k))} disabled={inp.options.length <= (inp.type === "counts" ? 1 : 2)} className={iconBtn} aria-label="Remove option">
                                <Trash2 size={13} />
                              </button>
                            </div>
                            {(inp.type !== "select" || inp.style === "cards" || inp.style === "packages") && (
                              <Input value={o.blurb ?? ""} onChange={(e) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, blurb: e.target.value || undefined } : x)))} maxLength={120} placeholder="One line under the label (optional)" className="w-full" />
                            )}
                            {inp.type === "select" && inp.style === "packages" && (
                              <div className="flex flex-wrap items-start gap-2">
                                <Textarea
                                  value={(o.includes ?? []).join("\n")}
                                  onChange={(e) => setOptions(i, inp.options.map((x, m) => (m === k ? { ...x, includes: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, ESTIMATOR_LIMITS.includes) } : x)))}
                                  rows={3}
                                  placeholder={"What this tier includes — one per line\nSurface clean\nDegreaser on stains"}
                                  className="min-w-0 flex-1"
                                />
                                <label className="flex items-center gap-1.5 text-xs text-gray-600">
                                  <input type="radio" name={`rec-${tool.id}-${inp.id}`} checked={o.recommended === true} onChange={() => setOptions(i, inp.options.map((x, m) => ({ ...x, recommended: m === k ? true : undefined })))} className="h-4 w-4 accent-green-600" />
                                  Most popular
                                </label>
                              </div>
                            )}
                          </div>
                        ))}
                        <button type="button" disabled={inp.options.length >= ESTIMATOR_LIMITS.options} onClick={() => setOptions(i, [...inp.options, { label: `Option ${inp.options.length + 1}`, value: `Option ${inp.options.length + 1}` }])} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
                          <Plus size={12} /> Add {inp.type === "counts" ? "item" : "option"}
                        </button>
                        {inp.type === "select" && (
                          <div>
                            <label className={fieldLabel}>Default</label>
                            <Select value={inp.default ?? ""} onChange={(e) => setInput(i, { default: e.target.value || undefined } as Partial<EstimatorInput>)} className="w-full sm:w-60">
                              <option value="">None</option>
                              {inp.options.map((o) => (
                                <option key={o.value} value={o.value}>
                                  {o.label}
                                </option>
                              ))}
                            </Select>
                          </div>
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

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className={fieldLabel}>Only show when</label>
                        <Input value={inp.showWhen ?? ""} onChange={(e) => setInput(i, { showWhen: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="always — or e.g. has(extras, 'Fence')" className={`w-full ${mono}`} />
                      </div>
                      <div className="flex flex-wrap items-end gap-4 pb-1">
                        {inp.type !== "toggle" && (
                          <label className="flex items-center gap-1.5 text-xs text-gray-600">
                            <input type="checkbox" checked={inp.required !== false && (inp.type !== "text" && inp.type !== "multi" && inp.type !== "counts" ? true : inp.required === true)} onChange={(e) => setInput(i, { required: e.target.checked } as Partial<EstimatorInput>)} className="h-4 w-4 rounded accent-green-600" />
                            Required
                          </label>
                        )}
                        {inp.type !== "text" && (
                          <label className="flex items-center gap-1.5 text-xs text-gray-600" title="Atlas answers this from the job description or photo — costs tokens per estimate; the person can still change it">
                            <input type="checkbox" checked={inp.askAtlas === true} onChange={(e) => setInput(i, { askAtlas: e.target.checked ? true : undefined })} className="h-4 w-4 rounded accent-green-600" />
                            Atlas assesses this
                          </label>
                        )}
                        <span className={`ml-auto text-[11px] text-gray-400 ${mono}`}>{inp.id}</span>
                      </div>
                    </div>
                    <div className="flex justify-end">
                      <button type="button" onClick={() => removeInput(i)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                        <Trash2 size={12} /> Remove question
                      </button>
                    </div>
                  </Row>
                </div>
              );
            })}
          </div>
          <p className="text-xs text-gray-500">A new question does nothing until a rate or line under Pricing uses its id. Removing one that formulas still use is caught when you save.</p>
        </>
      )}

      {/* ── Pricing ── */}
      {section === "pricing" && (
        <>
          <datalist id={`groups-${tool.id}`}>
            {Array.from(new Set(["Labor", "Materials", "Add-ons", "Package", ...spec.lines.map((l) => l.group).filter((g): g is string => Boolean(g))])).map((g) => (
              <option key={g} value={g} />
            ))}
          </datalist>
          <datalist id={`workitems-${tool.id}`}>
            {workItemNames.map((n) => (
              <option key={n} value={n} />
            ))}
          </datalist>

          {spec.placeholders && spec.placeholders.length > 0 && <RatesToConfirm items={spec.placeholders} onDone={(k) => touch((s) => (s.placeholders = (s.placeholders ?? []).filter((_, m) => m !== k)))} />}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <label className="card-ledger flex items-center justify-between gap-3 px-3 py-2.5">
              <span>
                <span className="block text-sm font-medium text-gray-800">Minimum job charge</span>
                <span className="block text-xs text-gray-500">A top-up line brings small jobs to this.</span>
              </span>
              <NumField value={spec.minimumTotal} onCommit={(v) => touch((s) => (s.minimumTotal = v && v > 0 ? v : undefined))} prefix="$" className="w-28" />
            </label>
            <Row
              open={openVars}
              onToggle={() => setOpenVars((o) => !o)}
              header={
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-gray-900">Variables</span>
                  <span className="block truncate text-xs text-gray-500">{spec.variables.length === 0 ? "None — name a rate once, reuse it in every line" : spec.variables.map((v) => v.id).join(", ")}</span>
                </span>
              }
            >
              {spec.variables.map((v, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input value={v.id} onChange={(e) => setVar(i, { id: e.target.value.replace(/[^A-Za-z0-9_]/g, "_") })} maxLength={40} className={`w-28 ${mono}`} placeholder="name" />
                  <span className="text-gray-400">=</span>
                  <Input value={v.expr} onChange={(e) => setVar(i, { expr: e.target.value })} maxLength={ESTIMATOR_LIMITS.exprLen} className={`min-w-0 flex-1 ${mono}`} placeholder="tier(sqft, [[500, 0.30]], 0.22)" />
                  <button type="button" onClick={() => removeVar(i)} className={iconBtn} aria-label="Remove variable">
                    <Trash2 size={13} />
                  </button>
                </div>
              ))}
              <button type="button" disabled={spec.variables.length >= ESTIMATOR_LIMITS.variables} onClick={addVar} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:underline disabled:opacity-50">
                <Plus size={12} /> Add variable
              </button>
            </Row>
          </div>

          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-600">
              {spec.lines.length} quote line{spec.lines.length === 1 ? "" : "s"}. Tap one to change it.
            </p>
            <button type="button" disabled={spec.lines.length >= ESTIMATOR_LIMITS.lines} onClick={addLine} className="inline-flex h-8 items-center gap-1 rounded-full border border-gray-200 px-3 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50">
              <Plus size={12} /> Add line
            </button>
          </div>
          <div className="space-y-2">
            {spec.lines.map((l, i) => {
              const open = openL.has(l.id);
              return (
                <Row
                  key={l.id}
                  open={open}
                  onToggle={() => setOpenL((o) => toggleSet(o, l.id))}
                  header={
                    <>
                      {l.group && <span className={pill}>{l.group}</span>}
                      <span className="min-w-0 flex-1 truncate text-sm font-medium text-gray-900">{l.name}</span>
                      <span className={`hidden shrink-0 text-xs text-gray-500 sm:inline ${mono}`}>
                        {rateText(l)}
                        {l.quantity && l.quantity !== "1" ? ` × ${l.quantity}` : ""}
                      </span>
                      {l.when && <span className={`${pill} hidden md:inline`}>when {l.when}</span>}
                      {l.isOptional && <span className={pill}>optional</span>}
                    </>
                  }
                  actions={
                    <span className="flex shrink-0 items-center">
                      <button type="button" onClick={() => moveLine(i, -1)} disabled={i === 0} className={iconBtn} aria-label="Move up">
                        <ArrowUp size={14} />
                      </button>
                      <button type="button" onClick={() => moveLine(i, 1)} disabled={i === spec.lines.length - 1} className={iconBtn} aria-label="Move down">
                        <ArrowDown size={14} />
                      </button>
                    </span>
                  }
                >
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    <div className="sm:col-span-2">
                      <label className={fieldLabel}>Line name (may use {"{sqft}"})</label>
                      <Input value={l.name} onChange={(e) => setLine(i, { name: e.target.value })} maxLength={160} className="w-full" />
                    </div>
                    <div>
                      <label className={fieldLabel}>Group</label>
                      <Input list={`groups-${tool.id}`} value={l.group ?? ""} onChange={(e) => setLine(i, { group: e.target.value || undefined })} maxLength={40} placeholder="Labor" className="w-full" />
                    </div>
                    <div className="sm:col-span-3">
                      <label className={fieldLabel}>Description on the quote</label>
                      <Input value={l.description ?? ""} onChange={(e) => setLine(i, { description: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.templateLen} placeholder="{sqft} sq ft at {rate|money}/sq ft" className="w-full" />
                    </div>
                    <div>
                      <label className={fieldLabel}>Unit price</label>
                      <Input value={l.unitPrice ?? ""} onChange={(e) => setLine(i, { unitPrice: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder={l.workItemName ? "price book" : "0.25 or a formula"} className={`w-full ${mono}`} />
                    </div>
                    <div>
                      <label className={fieldLabel}>Quantity</label>
                      <Input value={l.quantity ?? ""} onChange={(e) => setLine(i, { quantity: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="1" className={`w-full ${mono}`} />
                    </div>
                    <div>
                      <label className={fieldLabel}>Only when</label>
                      <Input value={l.when ?? ""} onChange={(e) => setLine(i, { when: e.target.value || undefined })} maxLength={ESTIMATOR_LIMITS.exprLen} placeholder="always" className={`w-full ${mono}`} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className={fieldLabel}>Price-book item</label>
                      <Input list={`workitems-${tool.id}`} value={l.workItemName ?? ""} onChange={(e) => setLine(i, { workItemName: e.target.value || undefined })} maxLength={120} placeholder="none — plain line" className="w-full" />
                    </div>
                    <label className="flex items-end gap-1.5 pb-2.5 text-xs text-gray-600">
                      <input type="checkbox" checked={l.isOptional === true} onChange={(e) => setLine(i, { isOptional: e.target.checked })} className="h-4 w-4 rounded accent-green-600" />
                      Optional on the quote
                    </label>
                  </div>
                  <div className="flex justify-end">
                    <button type="button" onClick={() => removeLine(i)} className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50">
                      <Trash2 size={12} /> Remove line
                    </button>
                  </div>
                </Row>
              );
            })}
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
                <dd className={`text-gray-600 ${mono}`}>{names.join("  ") || "—"}</dd>
              </div>
            </dl>
          )}
        </>
      )}

      {/* ── Words ── */}
      {section === "words" && (
        <div className="card-ledger space-y-4 p-4 sm:p-5">
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
              <span className="block text-xs text-gray-500">“Describe the job / snap a photo” on this tool. Costs tokens per use; typing the answers stays free. Always on when a question is assessed by Atlas.</span>
            </span>
            <input type="checkbox" checked={Boolean(spec.assist)} disabled={spec.inputs.some((i) => i.askAtlas)} onChange={(e) => touch((s) => (s.assist = e.target.checked ? { instructions: s.assist?.instructions } : null))} className="h-5 w-5 rounded accent-green-600" />
          </label>
          {spec.assist && (
            <div>
              <label className="mb-1 block text-sm font-medium text-gray-800">Guidance for Atlas</label>
              <Textarea value={spec.assist.instructions ?? ""} onChange={(e) => touch((s) => (s.assist = { instructions: e.target.value || undefined }))} rows={3} maxLength={1000} placeholder="What to look for in a photo or description, what to assume when it can't tell, what never to guess — e.g. A two-car driveway is about 500 sq ft; count the garage as one story; if the photo doesn't show the stains, assume moderate." className="w-full" />
            </div>
          )}
        </div>
      )}

      {/* ── History ── */}
      {section === "history" && (
        <div className="space-y-2">
          {versions === null && (
            <p className="flex items-center gap-2 text-sm text-gray-500">
              <Loader2 size={14} className="animate-spin" /> Loading…
            </p>
          )}
          {versions && versions.length === 0 && <p className="text-sm text-gray-500">No saved versions yet — the first edit or Atlas update creates one.</p>}
          {versions?.map((v, i) => (
            <div key={v.id} className="card-ledger p-3">
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

      {bar}

      <EstimatorRunner portal estimators={[{ id: "preview", name: name || tool.name, description: null, usesAtlas: false, spec, preview: true }]} open={trying} onClose={() => setTrying(false)} />
    </div>
  );
}
