"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronDown, Clock, Copy, Filter, GripVertical, Loader2, Plus, Search, X, Zap, Mail, ClipboardList, Plug } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import Modal from "@/components/Modal";
import { Input, Select, Textarea } from "@/components/Input";
import {
  ACTIONS,
  ACTION_GROUPS,
  ACTION_TYPES,
  ATLAS_TEXT_FIELD,
  COMMON_FIELDS,
  ENTITY_LABEL,
  OPS,
  OP_NAMES,
  TRIGGERS,
  TRIGGER_GROUPS,
  TRIGGER_NAMES,
  WEEKDAYS,
  actionAllowedFor,
  fieldDefsFor,
  stepLabel,
  triggerEntity,
  triggerLabel,
  type ActionGroup,
  type ActionType,
  type AutomationAction,
  type AutomationSpec,
  type EntityType,
  type FieldDef,
  type FilterStep,
  type Op,
  type ParamDef,
  type Rule,
  type Step,
  type TriggerDef,
  type TriggerName,
  type TriggerSpec,
  type WaitStep,
} from "@/lib/automations";
import { ago, runDot, EMPTY_OPTIONS, type Options, type Run, type TestResult } from "./types";

/* ── options (pickers' choices) ─────────────────────────────────────────── */

export function useOptions(): Options {
  const [opts, setOpts] = useState<Options>(EMPTY_OPTIONS);
  useEffect(() => {
    let live = true;
    fetch("/api/app/automations/options")
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (live && j) setOpts({ ...EMPTY_OPTIONS, ...j });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return opts;
}

/* ── small bits ─────────────────────────────────────────────────────────── */

export const GROUP_ICON: Record<ActionGroup, LucideIcon> = { Messaging: Mail, Records: ClipboardList, Integrations: Plug };

export function hourLabel(h: number): string {
  return `${((h + 11) % 12) + 1}${h < 12 ? "am" : "pm"}`;
}

export const HOURS = Array.from({ length: 24 }, (_, i) => i);

/** Group a trigger's fields for the pickers: the client, the record, time. */
export function fieldGroups(trigger: TriggerSpec, extra: FieldDef[] = []): { label: string; fields: FieldDef[] }[] {
  const entity = triggerEntity(trigger);
  const all = [...fieldDefsFor(trigger), ...extra];
  const common = new Set(COMMON_FIELDS.map((f) => f.key));
  const client = all.filter((f) => f.key.startsWith("client_") || ["lead_source", "stage", "city", "zip", "assigned_to"].includes(f.key));
  const clientKeys = new Set(client.map((f) => f.key));
  const record = all.filter((f) => !clientKeys.has(f.key) && !common.has(f.key));
  const time = all.filter((f) => common.has(f.key));
  const out: { label: string; fields: FieldDef[] }[] = [];
  if (client.length) out.push({ label: "The client", fields: client });
  if (record.length) out.push({ label: entity === "company" ? "Your business" : `This ${ENTITY_LABEL[entity]}`, fields: record });
  out.push({ label: "Time & company", fields: time });
  return out;
}

/** Label of a field key (falls back to the key itself for custom_/data_ fields). */
export function fieldLabel(key: string, trigger: TriggerSpec): string {
  return fieldDefsFor(trigger).find((f) => f.key === key)?.label ?? key;
}

/* ── card chrome ────────────────────────────────────────────────────────── */

export function Card({
  icon: Icon,
  tint,
  title,
  preview,
  children,
  onRemove,
  dragHandle,
  changed,
  className = "",
  dragProps,
}: {
  icon: LucideIcon;
  tint: string;
  title: string;
  preview?: string;
  children?: React.ReactNode;
  onRemove?: () => void;
  dragHandle?: boolean;
  changed?: boolean;
  className?: string;
  dragProps?: React.HTMLAttributes<HTMLDivElement>;
}) {
  const [open, setOpen] = useState(true);
  return (
    <div {...dragProps} className={`ds-card transition-shadow ${changed ? "ring-2 ring-[color:var(--ds-warn)]" : ""} ${className}`}>
      <div className="flex items-center gap-2.5 px-3.5 py-2.5">
        {dragHandle && (
          <span className="cursor-grab text-gray-300 hover:text-gray-500 active:cursor-grabbing" title="Drag to reorder" aria-hidden>
            <GripVertical size={16} />
          </span>
        )}
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px]" style={{ backgroundColor: `color-mix(in srgb, ${tint} 14%, transparent)`, color: tint }} aria-hidden>
          <Icon size={15} strokeWidth={2.25} />
        </span>
        <button type="button" onClick={() => setOpen((o) => !o)} className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-semibold text-[color:var(--ds-ink)]">{title}</span>
          {preview && <span className="block truncate text-xs text-gray-500">{preview}</span>}
        </button>
        {children && (
          <button type="button" onClick={() => setOpen((o) => !o)} aria-label={open ? "Collapse" : "Expand"} className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
            <ChevronDown size={16} className={`transition-transform ${open ? "" : "-rotate-90"}`} />
          </button>
        )}
        {onRemove && (
          <button type="button" onClick={onRemove} aria-label="Remove" className="rounded-md p-1 text-gray-400 hover:bg-[color:var(--ds-bad-soft)] hover:text-[color:var(--ds-bad)]">
            <X size={16} />
          </button>
        )}
      </div>
      {children && open && <div className="border-t border-[color:var(--ds-line)] px-3.5 py-3">{children}</div>}
    </div>
  );
}

/** The vertical rule between cards with a "+" pill to insert a step there. */
export function Connector({ onAdd, dropProps, active }: { onAdd?: () => void; dropProps?: React.HTMLAttributes<HTMLDivElement>; active?: boolean }) {
  return (
    <div {...dropProps} className={`relative mx-auto flex h-10 w-full items-center justify-center ${active ? "rounded-xl bg-[color:var(--ds-primary-soft)]" : ""}`}>
      <span className="absolute inset-y-0 left-1/2 w-0.5 -translate-x-1/2 bg-gray-200" aria-hidden />
      {onAdd && (
        <button type="button" onClick={onAdd} aria-label="Add a step here" className="relative z-[1] flex h-7 w-7 items-center justify-center rounded-full border border-gray-300 bg-white text-gray-500 shadow-sm hover:border-gray-400 hover:text-gray-800">
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

/* ── template inputs with the "insert field" menu ───────────────────────── */

function InsertFieldMenu({ trigger, extra, onInsert }: { trigger: TriggerSpec; extra: FieldDef[]; onInsert: (token: string) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);
  const groups = fieldGroups(trigger, extra);
  const needle = q.trim().toLowerCase();
  return (
    <div ref={ref} className="relative">
      <button type="button" onClick={() => setOpen((o) => !o)} className="inline-flex h-7 items-center gap-1 rounded-md border border-gray-200 bg-gray-50 px-2 text-[11px] font-medium text-gray-600 hover:bg-gray-100">
        <Plus size={11} /> Insert field
      </button>
      {open && (
        <div className="absolute right-0 z-20 mt-1 w-72 rounded-xl border border-gray-200 bg-white p-2 shadow-lg">
          <div className="relative mb-1.5">
            <Search size={13} className="absolute left-2 top-2.5 text-gray-400" />
            <input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Find a field" className="w-full rounded-md border border-gray-200 py-1.5 pl-7 pr-2 text-xs focus:outline-none" />
          </div>
          <div className="max-h-64 overflow-y-auto">
            {groups.map((g) => {
              const fields = g.fields.filter((f) => !needle || f.label.toLowerCase().includes(needle) || f.key.includes(needle));
              if (fields.length === 0) return null;
              return (
                <div key={g.label} className="mb-1.5">
                  <p className="px-1.5 py-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400">{g.label}</p>
                  {fields.map((f) => (
                    <button
                      key={f.key}
                      type="button"
                      onClick={() => {
                        onInsert(f.type === "number" && /total|amount|balance/.test(f.key) ? `{${f.key}|money}` : `{${f.key}}`);
                        setOpen(false);
                        setQ("");
                      }}
                      className="flex w-full items-center justify-between rounded-md px-1.5 py-1 text-left text-xs text-gray-800 hover:bg-gray-100"
                    >
                      <span>{f.label}</span>
                      <span className="font-mono text-[10px] text-gray-400">{`{${f.key}}`}</span>
                    </button>
                  ))}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

export function TemplateField({
  label,
  value,
  onChange,
  long,
  trigger,
  extra,
  max,
  placeholder,
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  long?: boolean;
  trigger: TriggerSpec;
  extra: FieldDef[];
  max?: number;
  placeholder?: string;
  required?: boolean;
}) {
  const ref = useRef<HTMLInputElement & HTMLTextAreaElement>(null);
  function insert(token: string) {
    const el = ref.current;
    if (!el) return onChange(value + token);
    const start = el.selectionStart ?? value.length;
    const end = el.selectionEnd ?? value.length;
    const next = value.slice(0, start) + token + value.slice(end);
    onChange(next);
    requestAnimationFrame(() => {
      el.focus();
      el.setSelectionRange(start + token.length, start + token.length);
    });
  }
  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <label className="text-xs font-medium text-gray-600">
          {label}
          {required && <span className="text-[color:var(--ds-bad)]"> *</span>}
        </label>
        <InsertFieldMenu trigger={trigger} extra={extra} onInsert={insert} />
      </div>
      {long ? (
        <Textarea ref={ref} value={value} onChange={(e) => onChange(e.target.value)} rows={4} maxLength={max} placeholder={placeholder} className="w-full font-normal" />
      ) : (
        <Input ref={ref} value={value} onChange={(e) => onChange(e.target.value)} maxLength={max} placeholder={placeholder} className="w-full" />
      )}
    </div>
  );
}

/* ── action param form (generic, from ACTIONS[type].params) ─────────────── */

export function ParamForm({ action, onChange, trigger, extra, options }: { action: AutomationAction; onChange: (a: AutomationAction) => void; trigger: TriggerSpec; extra: FieldDef[]; options: Options }) {
  const def = ACTIONS[action.type];
  const set = (key: string, v: string | number | undefined) => onChange({ ...action, [key]: v === "" ? undefined : v });
  if (def.params.length === 0) return <p className="text-xs text-gray-500">{def.hint}</p>;
  return (
    <div className="space-y-3">
      {def.params.map((pd: ParamDef) => {
        const v = action[pd.key];
        const str = v === undefined ? "" : String(v);
        switch (pd.kind) {
          case "template":
          case "template_long":
            return <TemplateField key={pd.key} label={pd.label} value={str} onChange={(x) => set(pd.key, x)} long={pd.kind === "template_long"} trigger={trigger} extra={extra} max={pd.max} placeholder={pd.placeholder} required={pd.required} />;
          case "number":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Input type="number" min={pd.min} max={pd.max} value={str} onChange={(e) => set(pd.key, e.target.value === "" ? undefined : Number(e.target.value))} className="w-28" />
              </Labeled>
            );
          case "select":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Select value={str} onChange={(e) => set(pd.key, e.target.value)} className="w-full max-w-xs">
                  <option value="">Choose…</option>
                  {pd.options?.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </Select>
              </Labeled>
            );
          case "user":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Select value={str} onChange={(e) => set(pd.key, e.target.value)} className="w-full max-w-xs">
                  <option value="">Choose a team member…</option>
                  {options.users.map((u) => (
                    <option key={u.id} value={u.id}>{u.name}</option>
                  ))}
                </Select>
              </Labeled>
            );
          case "stage":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                {options.stages.length > 0 ? (
                  <Select value={str} onChange={(e) => set(pd.key, e.target.value)} className="w-full max-w-xs">
                    <option value="">Choose a stage…</option>
                    {options.stages.map((s) => (
                      <option key={s.id} value={s.name}>{s.name}</option>
                    ))}
                  </Select>
                ) : (
                  <Input value={str} onChange={(e) => set(pd.key, e.target.value)} placeholder="Stage name" className="w-full max-w-xs" />
                )}
              </Labeled>
            );
          case "custom_field":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Select value={str} onChange={(e) => set(pd.key, e.target.value)} className="w-full max-w-xs">
                  <option value="">Choose a field…</option>
                  {options.customFields.map((f) => (
                    <option key={f.id} value={f.id}>{f.label}</option>
                  ))}
                </Select>
                {options.customFields.length === 0 && <p className="mt-1 text-[11px] text-gray-500">No custom fields yet — add them under Settings → Client custom fields.</p>}
              </Labeled>
            );
          case "agreement_template":
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Select value={str} onChange={(e) => set(pd.key, e.target.value)} className="w-full max-w-xs">
                  <option value="">Choose a template…</option>
                  {options.agreementTemplates.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </Select>
              </Labeled>
            );
          default:
            return (
              <Labeled key={pd.key} label={pd.label} required={pd.required} help={pd.help}>
                <Input type={pd.kind === "email" ? "email" : pd.kind === "url" ? "url" : "text"} value={str} onChange={(e) => set(pd.key, e.target.value)} maxLength={pd.max} placeholder={pd.placeholder} className="w-full" />
              </Labeled>
            );
        }
      })}
    </div>
  );
}

function Labeled({ label, required, help, children }: { label: string; required?: boolean; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-600">
        {label}
        {required && <span className="text-[color:var(--ds-bad)]"> *</span>}
      </label>
      {children}
      {help && <p className="mt-1 text-[11px] text-gray-500">{help}</p>}
    </div>
  );
}

/* ── filter (conditions) editor ─────────────────────────────────────────── */

function opsFor(field: FieldDef | undefined, key: string): Op[] {
  const type = field?.type ?? "text";
  return OP_NAMES.filter((op) => {
    if (op === "weekday" || op === "weekend") return key === "now_weekday";
    if (op === "between_hours") return key === "now_hour";
    return OPS[op].types.includes(type);
  });
}

export function FilterEditor({ step, onChange, trigger, extra }: { step: FilterStep; onChange: (s: FilterStep) => void; trigger: TriggerSpec; extra: FieldDef[] }) {
  const groups = fieldGroups(trigger, extra);
  const all = groups.flatMap((g) => g.fields);
  const [advanced, setAdvanced] = useState(Boolean(step.expr));
  const setRule = (i: number, r: Rule) => onChange({ ...step, rules: step.rules.map((x, j) => (j === i ? r : x)) });
  const first = all[0]?.key ?? "client_name";

  return (
    <div className="space-y-2">
      {advanced ? (
        <div>
          <Textarea value={step.expr ?? ""} onChange={(e) => onChange({ ...step, expr: e.target.value || undefined })} rows={2} placeholder='e.g. quote_total >= 300 and client_email != ""' className="w-full font-mono text-xs" />
          <p className="mt-1 text-[11px] text-gray-500">
            An expression over the fields (== != &lt; &lt;= &gt; &gt;= and or not, contains(), lower()). While this is set it replaces the rules below.{" "}
            <button type="button" onClick={() => { setAdvanced(false); onChange({ ...step, expr: undefined }); }} className="underline">Back to simple rules</button>
          </p>
        </div>
      ) : (
        <>
          {step.rules.length > 1 && (
            <div className="flex items-center gap-2 text-xs text-gray-600">
              Match
              <Select value={step.match} onChange={(e) => onChange({ ...step, match: e.target.value === "any" ? "any" : "all" })} className="py-1 text-xs">
                <option value="all">all of these</option>
                <option value="any">any of these</option>
              </Select>
            </div>
          )}
          {step.rules.map((r, i) => {
            const fd = all.find((f) => f.key === r.field);
            const ops = opsFor(fd, r.field);
            const want = OPS[r.op]?.value ?? "one";
            return (
              <div key={i} className="flex flex-wrap items-center gap-1.5">
                <Select
                  value={r.field}
                  onChange={(e) => {
                    const nf = all.find((f) => f.key === e.target.value);
                    const nops = opsFor(nf, e.target.value);
                    setRule(i, { field: e.target.value, op: nops.includes(r.op) ? r.op : nops[0], value: undefined });
                  }}
                  className="max-w-[12rem] py-1.5 text-xs"
                >
                  {groups.map((g) => (
                    <optgroup key={g.label} label={g.label}>
                      {g.fields.map((f) => (
                        <option key={f.key} value={f.key}>{f.label}</option>
                      ))}
                    </optgroup>
                  ))}
                  {!fd && <option value={r.field}>{r.field}</option>}
                </Select>
                <Select value={r.op} onChange={(e) => setRule(i, { ...r, op: e.target.value as Op, value: undefined })} className="py-1.5 text-xs">
                  {ops.map((op) => (
                    <option key={op} value={op}>{OPS[op].label}</option>
                  ))}
                </Select>
                {want === "one" && fd?.type === "enum" && fd.options ? (
                  <Select value={String(r.value ?? "")} onChange={(e) => setRule(i, { ...r, value: e.target.value })} className="py-1.5 text-xs">
                    <option value="">Choose…</option>
                    {fd.options.map((o) => (
                      <option key={o} value={o}>{o}</option>
                    ))}
                  </Select>
                ) : want === "one" ? (
                  <Input type={fd?.type === "number" ? "number" : "text"} value={String(r.value ?? "")} onChange={(e) => setRule(i, { ...r, value: fd?.type === "number" ? Number(e.target.value) : e.target.value })} placeholder={fd?.type === "number" ? "0" : "value"} className="w-36 py-1.5 text-xs" />
                ) : want === "list" ? (
                  <Input value={Array.isArray(r.value) ? r.value.join(", ") : String(r.value ?? "")} onChange={(e) => setRule(i, { ...r, value: e.target.value.split(",").map((x) => x.trim()).filter(Boolean) })} placeholder="a, b, c" className="w-44 py-1.5 text-xs" />
                ) : want === "range" ? (
                  <span className="flex items-center gap-1 text-xs text-gray-500">
                    <Select value={String(Array.isArray(r.value) ? r.value[0] ?? 8 : 8)} onChange={(e) => setRule(i, { ...r, value: [Number(e.target.value), Array.isArray(r.value) ? Number(r.value[1] ?? 18) : 18] })} className="py-1.5 text-xs">
                      {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </Select>
                    and
                    <Select value={String(Array.isArray(r.value) ? r.value[1] ?? 18 : 18)} onChange={(e) => setRule(i, { ...r, value: [Array.isArray(r.value) ? Number(r.value[0] ?? 8) : 8, Number(e.target.value)] })} className="py-1.5 text-xs">
                      {HOURS.map((h) => <option key={h} value={h}>{hourLabel(h)}</option>)}
                    </Select>
                  </span>
                ) : null}
                <button type="button" onClick={() => onChange({ ...step, rules: step.rules.filter((_, j) => j !== i) })} aria-label="Remove condition" className="rounded-md p-1 text-gray-400 hover:bg-gray-100 hover:text-gray-700">
                  <X size={14} />
                </button>
              </div>
            );
          })}
          <div className="flex items-center gap-3">
            <button type="button" onClick={() => onChange({ ...step, rules: [...step.rules, { field: first, op: opsFor(all[0], first)[0] ?? "eq", value: undefined }] })} className="inline-flex items-center gap-1 text-xs font-medium text-gray-700 hover:text-gray-900">
              <Plus size={13} /> Add condition
            </button>
            <button type="button" onClick={() => setAdvanced(true)} className="text-[11px] text-gray-400 hover:text-gray-700">Advanced</button>
          </div>
        </>
      )}
    </div>
  );
}

/* ── wait editor ────────────────────────────────────────────────────────── */

export function WaitEditor({ step, onChange }: { step: WaitStep; onChange: (s: WaitStep) => void }) {
  return (
    <div className="flex items-center gap-2 text-sm text-gray-700">
      Wait
      <Input type="number" min={1} max={step.unit === "hours" ? 1440 : 60} value={step.amount} onChange={(e) => onChange({ ...step, amount: Math.max(1, Number(e.target.value) || 1) })} className="w-20 py-1.5" />
      <Select value={step.unit} onChange={(e) => onChange({ ...step, unit: e.target.value === "hours" ? "hours" : "days" })} className="py-1.5">
        <option value="hours">hours</option>
        <option value="days">days</option>
      </Select>
      <span className="text-xs text-gray-500">then continue (the record is re-read fresh).</span>
    </div>
  );
}

/* ── trigger editor + picker ────────────────────────────────────────────── */

export function TriggerEditor({ trigger, onChange, options }: { trigger: TriggerSpec; onChange: (t: TriggerSpec) => void; options: Options }) {
  const def: TriggerDef = TRIGGERS[trigger.event];
  const sc = trigger.schedule ?? { every: "day" as const, hour: 8, weekday: 1 };
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-gray-700">
      {def.days && (
        <label className="flex items-center gap-1.5">
          <Input type="number" min={1} max={120} value={trigger.days ?? def.days.default} onChange={(e) => onChange({ ...trigger, days: Math.max(1, Number(e.target.value) || 1) })} className="w-20 py-1.5" />
          <span className="text-xs text-gray-500">{def.days.help}</span>
        </label>
      )}
      {def.hours && (
        <label className="flex items-center gap-1.5">
          <Input type="number" min={1} max={720} value={trigger.hours ?? def.hours.default} onChange={(e) => onChange({ ...trigger, hours: Math.max(1, Number(e.target.value) || 1) })} className="w-20 py-1.5" />
          <span className="text-xs text-gray-500">{def.hours.help}</span>
        </label>
      )}
      {def.kind === "schedule" && (
        <>
          <Select value={sc.every} onChange={(e) => onChange({ ...trigger, schedule: { ...sc, every: e.target.value === "week" ? "week" : "day" } })} className="py-1.5">
            <option value="day">Every day</option>
            <option value="week">Every week</option>
          </Select>
          {sc.every === "week" && (
            <Select value={String(sc.weekday ?? 1)} onChange={(e) => onChange({ ...trigger, schedule: { ...sc, weekday: Number(e.target.value) } })} className="py-1.5">
              {WEEKDAYS.map((w, i) => (
                <option key={w} value={i}>{w}</option>
              ))}
            </Select>
          )}
          at
          <Select value={String(sc.hour)} onChange={(e) => onChange({ ...trigger, schedule: { ...sc, hour: Number(e.target.value) } })} className="py-1.5">
            {HOURS.map((h) => (
              <option key={h} value={h}>{hourLabel(h)}</option>
            ))}
          </Select>
          <span className="text-xs text-gray-500">{options.timezone}</span>
        </>
      )}
      {def.stagePick && (
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Stage</span>
          <Select value={trigger.stage ?? ""} onChange={(e) => onChange({ ...trigger, stage: e.target.value || undefined })} className="py-1.5">
            <option value="">Any stage</option>
            {options.stages.map((s) => (
              <option key={s.id} value={s.name}>{s.name}</option>
            ))}
          </Select>
        </label>
      )}
      {def.fieldPick && (
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">Field</span>
          <Select value={trigger.fieldId ?? ""} onChange={(e) => onChange({ ...trigger, fieldId: e.target.value || undefined })} className="py-1.5">
            <option value="">Any custom field</option>
            {options.customFields.map((f) => (
              <option key={f.id} value={f.id}>{f.label}</option>
            ))}
          </Select>
        </label>
      )}
      {def.entityPick && (
        <label className="flex items-center gap-1.5">
          <span className="text-xs text-gray-500">On a</span>
          <Select value={trigger.entity ?? def.entityPick[0]} onChange={(e) => onChange({ ...trigger, entity: e.target.value as EntityType })} className="py-1.5">
            {def.entityPick.map((e) => (
              <option key={e} value={e}>{ENTITY_LABEL[e]}</option>
            ))}
          </Select>
        </label>
      )}
      {!def.days && !def.hours && def.kind !== "schedule" && !def.stagePick && !def.fieldPick && !def.entityPick && <span className="text-xs text-gray-500">{def.recipe}</span>}
    </div>
  );
}

export function TriggerPicker({ open, onClose, current, onPick }: { open: boolean; onClose: () => void; current: TriggerName; onPick: (t: TriggerName) => void }) {
  const [group, setGroup] = useState<(typeof TRIGGER_GROUPS)[number]>(TRIGGERS[current].group);
  const [q, setQ] = useState("");
  const needle = q.trim().toLowerCase();
  const list = TRIGGER_NAMES.filter((t) => (needle ? TRIGGERS[t].label.toLowerCase().includes(needle) || t.includes(needle) : TRIGGERS[t].group === group));
  return (
    <Modal open={open} onClose={onClose} size="2xl">
      <div className="flex h-[min(70vh,34rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">When should this run?</p>
          <div className="relative ml-auto w-56">
            <Search size={14} className="absolute left-2.5 top-2.5 text-gray-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search triggers" className="w-full rounded-lg border border-gray-200 py-1.5 pl-8 pr-2 text-sm focus:outline-none" />
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-md p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="flex min-h-0 flex-1">
          <div className="w-44 shrink-0 overflow-y-auto border-r border-gray-100 py-2">
            {TRIGGER_GROUPS.map((g) => (
              <button key={g} type="button" onClick={() => { setGroup(g); setQ(""); }} className={`block w-full px-3 py-1.5 text-left text-xs ${!needle && group === g ? "bg-gray-100 font-semibold text-gray-900" : "text-gray-600 hover:bg-gray-50"}`}>
                {g}
              </button>
            ))}
          </div>
          <div className="min-w-0 flex-1 overflow-y-auto p-2">
            {list.length === 0 && <p className="p-4 text-sm text-gray-500">Nothing matches.</p>}
            {list.map((t) => {
              const d: TriggerDef = TRIGGERS[t];
              const active = t === current;
              return (
                <button key={t} type="button" onClick={() => { onPick(t); onClose(); }} className={`flex w-full items-start gap-3 rounded-lg px-3 py-2 text-left hover:bg-gray-50 ${active ? "bg-gray-50" : ""}`}>
                  <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-gray-100 text-gray-500"><Zap size={12} /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm text-gray-900">{d.label.replace("{days}", "N").replace("{hours}", "N")}</span>
                    <span className="block text-[11px] text-gray-500">{d.kind === "sweep" ? "Checked hourly" : d.kind === "schedule" ? "On a schedule" : d.kind === "webhook" ? "From outside" : d.kind === "manual" ? "By hand" : "The moment it happens"}{needle ? ` · ${d.group}` : ""}</span>
                  </span>
                  {active && <Check size={16} className="mt-1 shrink-0 text-gray-700" />}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Modal>
  );
}

/* ── step picker (actions, wait, filter) ────────────────────────────────── */

export type NewStep = { kind: "filter" } | { kind: "wait" } | { kind: "action"; type: ActionType };

export function StepPicker({ open, onClose, entity, onPick, options }: { open: boolean; onClose: () => void; entity: EntityType; onPick: (s: NewStep) => void; options: Options }) {
  const pick = (s: NewStep) => { onPick(s); onClose(); };
  const unavailable = (t: ActionType): string | null => {
    if (!actionAllowedFor(t, entity)) {
      const needs = ACTIONS[t].needs;
      return needs === "client" ? "needs a trigger with a client" : `needs a ${(needs as readonly EntityType[]).map((e) => ENTITY_LABEL[e]).join(" / ")} trigger`;
    }
    if (t === "atlas_draft" && !options.atlasAvailable) return "Atlas isn't on this account";
    if (t === "push_to_quickbooks" && !options.quickbooksConnected) return "QuickBooks isn't connected";
    return null;
  };
  return (
    <Modal open={open} onClose={onClose} size="2xl">
      <div className="flex max-h-[min(72vh,36rem)] flex-col">
        <div className="flex items-center gap-3 border-b border-gray-100 px-4 py-3">
          <p className="text-sm font-semibold text-gray-900">Add a step</p>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-md p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        <div className="overflow-y-auto p-3">
          <div className="mb-3 grid grid-cols-2 gap-2">
            <button type="button" onClick={() => pick({ kind: "filter" })} className="flex items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:border-gray-300 hover:bg-gray-50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-800 text-white"><Filter size={14} /></span>
              <span><span className="block text-sm font-medium text-gray-900">Only continue if…</span><span className="block text-[11px] text-gray-500">Stop here unless the conditions hold.</span></span>
            </button>
            <button type="button" onClick={() => pick({ kind: "wait" })} className="flex items-start gap-2.5 rounded-xl border border-gray-200 px-3 py-2.5 text-left hover:border-gray-300 hover:bg-gray-50">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gray-800 text-white"><Clock size={14} /></span>
              <span><span className="block text-sm font-medium text-gray-900">Wait</span><span className="block text-[11px] text-gray-500">Pause for hours or days, then carry on.</span></span>
            </button>
          </div>
          {ACTION_GROUPS.map((g) => {
            const Icon = GROUP_ICON[g];
            return (
              <div key={g} className="mb-3">
                <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Icon size={12} /> {g}</p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                  {ACTION_TYPES.filter((t) => ACTIONS[t].group === g).map((t) => {
                    const why = unavailable(t);
                    return (
                      <button key={t} type="button" disabled={Boolean(why)} title={why ?? undefined} onClick={() => pick({ kind: "action", type: t })} className="flex items-start gap-2 rounded-lg border border-gray-200 px-3 py-2 text-left hover:border-gray-300 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-40">
                        <span className="min-w-0">
                          <span className="block text-sm text-gray-900">{ACTIONS[t].label}</span>
                          <span className="block text-[11px] text-gray-500">{why ? `— ${why}` : ACTIONS[t].hint}</span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

/* ── test results ───────────────────────────────────────────────────────── */

export function TestModal({ open, onClose, result, loading }: { open: boolean; onClose: () => void; result: TestResult | null; loading: boolean }) {
  return (
    <Modal open={open} onClose={onClose} size="lg">
      <div className="p-4">
        <div className="mb-3 flex items-center gap-2">
          <p className="text-sm font-semibold text-gray-900">Dry run · last 30 days</p>
          <button type="button" onClick={onClose} aria-label="Close" className="ml-auto rounded-md p-1 text-gray-400 hover:text-gray-700"><X size={16} /></button>
        </div>
        {loading && <p className="flex items-center gap-2 text-sm text-gray-600"><Loader2 size={15} className="animate-spin" /> Checking your records…</p>}
        {!loading && result && !result.compiles && (
          <ul className="space-y-1 text-sm text-[color:var(--ds-bad)]">{(result.errors ?? []).map((e, i) => <li key={i}>{e}</li>)}</ul>
        )}
        {!loading && result?.compiles && (
          <>
            {result.preview && (
              <p className="text-2xl font-bold tabular-nums text-gray-900">
                {result.preview.matches} <span className="text-base font-medium text-gray-500">of {result.preview.candidates} would have fired</span>
              </p>
            )}
            {result.preview && result.preview.candidates === 0 && <p className="mt-1 text-xs text-gray-500">Nothing in the last 30 days matched the trigger — that's fine for a rule about something that hasn't happened yet. Nothing was sent.</p>}
            {result.warnings.length > 0 && (
              <ul className="mt-3 space-y-1">
                {result.warnings.map((w, i) => (
                  <li key={i} className="flex gap-2 rounded-lg bg-[color:var(--ds-warn-soft)] px-3 py-2 text-xs text-[color:var(--ds-warn)]"><AlertTriangle size={14} className="mt-0.5 shrink-0" /> {w}</li>
                ))}
              </ul>
            )}
            {result.preview && result.preview.errors.length > 0 && (
              <ul className="mt-3 space-y-1 text-xs text-[color:var(--ds-bad)]">{result.preview.errors.map((e, i) => <li key={i}>{e}</li>)}</ul>
            )}
            {result.preview && result.preview.sample.length > 0 && (
              <div className="mt-4 space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Examples</p>
                {result.preview.sample.map((s, i) => (
                  <div key={i} className="rounded-xl border border-gray-200 px-3 py-2">
                    {s.href ? <Link href={s.href} className="text-sm font-medium text-gray-900 underline decoration-gray-300">{s.label}</Link> : <p className="text-sm font-medium text-gray-900">{s.label}</p>}
                    <ul className="mt-1 space-y-0.5">
                      {s.rendered.map((r, j) => (
                        <li key={j} className="text-xs text-gray-600"><span className="text-gray-400">{r.type}:</span> {r.text}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
            <p className="mt-4 text-[11px] text-gray-400">A dry run never sends anything. Real fires show up in the run history.</p>
          </>
        )}
      </div>
    </Modal>
  );
}

/* ── run history + webhook url (builder side column) ────────────────────── */

export function RunHistory({ runs, onRefresh, loading }: { runs: Run[]; onRefresh?: () => void; loading?: boolean }) {
  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">Run history</p>
        {onRefresh && (
          <button type="button" onClick={onRefresh} className="text-[11px] text-gray-500 hover:text-gray-800">{loading ? "…" : "Refresh"}</button>
        )}
      </div>
      {runs.length === 0 ? (
        <p className="rounded-xl border border-dashed border-gray-200 px-3 py-4 text-center text-xs text-gray-500">Hasn't fired yet. Do the thing the trigger describes and a row lands here.</p>
      ) : (
        <div className="ds-card divide-y divide-[color:var(--ds-line)]">
          {runs.slice(0, 20).map((r) => (
            <div key={r.id} className="flex items-start gap-2 px-3 py-2 text-xs">
              <span className={`mt-1 h-2 w-2 shrink-0 rounded-full ${runDot(r.status)}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-gray-800">{r.detail || r.event}</span>
                <span className="block text-[10px] text-gray-400">{r.event} · {ago(r.createdAt)}</span>
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function WebhookUrl({ url }: { url: string | null }) {
  const [copied, setCopied] = useState(false);
  return (
    <div>
      <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500">Webhook URL</p>
      {url ? (
        <>
          <div className="flex items-center gap-1 rounded-lg border border-gray-200 bg-gray-50 px-2 py-1.5">
            <code className="min-w-0 flex-1 truncate text-[11px] text-gray-700">{url}</code>
            <button type="button" onClick={() => { navigator.clipboard?.writeText(url).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }} aria-label="Copy" className="rounded-md p-1 text-gray-500 hover:bg-gray-200">
              {copied ? <Check size={13} /> : <Copy size={13} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-gray-500">POST JSON here. Top-level keys become fields: <code className="font-mono">{"{data_name}"}</code>, <code className="font-mono">{"{data_email}"}</code>…</p>
        </>
      ) : (
        <p className="text-xs text-gray-500">Save the automation to get its URL.</p>
      )}
    </div>
  );
}

/* ── helpers shared with the builder ────────────────────────────────────── */

export function newAction(type: ActionType): AutomationAction {
  const a: AutomationAction = { type };
  for (const pd of ACTIONS[type].params) {
    if (pd.kind === "select" && pd.required && pd.options?.[0]) a[pd.key] = pd.options[0].value;
    if (pd.kind === "number" && pd.required) a[pd.key] = pd.min ?? 1;
  }
  return a;
}

export function emptyFilter(): FilterStep {
  return { type: "filter", match: "all", rules: [] };
}

export function isEmptyFilter(s: Step | undefined): boolean {
  return Boolean(s && s.type === "filter" && s.rules.length === 0 && !s.expr);
}

/** Fields an atlas_draft step earlier in the chain adds for later steps. */
export function extraFieldsBefore(steps: Step[], index: number): FieldDef[] {
  return steps.slice(0, index).some((s) => s.type === "atlas_draft") ? [{ key: ATLAS_TEXT_FIELD, label: "Atlas's draft", type: "text" }] : [];
}

export function previewOf(step: Step, spec: AutomationSpec): string {
  return stepLabel(step, spec);
}

export function triggerTitle(t: TriggerSpec): string {
  const label = triggerLabel(t);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

