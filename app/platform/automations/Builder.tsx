"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Clock, Filter, FlaskConical, Pause, Play, Sparkles, Trash2, Zap } from "lucide-react";
import BackLink from "@/components/BackLink";
import { useAssistant } from "@/components/AssistantContext";
import { confirmSheet } from "@/components/ConfirmSheet";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";
import { hapticNotify } from "@/lib/haptics";
import { SECTION_HUES } from "@/lib/section-colors";
import {
  ACTIONS,
  AUTOMATION_LIMITS,
  actionAllowedFor,
  compileAutomation,
  describeAutomation,
  fieldsFor,
  triggerEntity,
  type AutomationAction,
  type AutomationSpec,
  type FilterStep,
  type Step,
  type TriggerName,
  type TriggerSpec,
  type WaitStep,
} from "@/lib/automations";
import AutomationBuildPanel from "./AutomationBuildPanel";
import {
  Card,
  Connector,
  FilterEditor,
  GROUP_ICON,
  ParamForm,
  RunHistory,
  StepPicker,
  TestModal,
  TriggerEditor,
  TriggerPicker,
  WaitEditor,
  WebhookUrl,
  emptyFilter,
  extraFieldsBefore,
  isEmptyFilter,
  newAction,
  previewOf,
  triggerTitle,
  useOptions,
  type NewStep,
} from "./builder-parts";
import { type Draft, type Row, type Run, type TestResult } from "./types";

/**
 * The card builder: trigger → conditions → steps in a vertical Zapier-style
 * stack (desktop). Every change is compiled client-side with the same
 * compileAutomation the API runs, so Save is only enabled for a spec the
 * engine will accept. Atlas sits beside the stack and rewrites the cards in
 * place. On phones the same route renders the plain-English flow instead —
 * the summary, Atlas, Save — since cards need a desk.
 */

const TRIGGER_TINT = SECTION_HUES.business;
const FLOW_TINT = "#374151";
const ACTION_TINT: Record<string, string> = { Messaging: "#0ea5e9", Records: "#8b5cf6", Integrations: "#f59e0b" };

type State = { name: string; description: string; trigger: TriggerSpec; lead: FilterStep; steps: Step[] };

function fromSpec(spec: AutomationSpec | null, name = "", description = ""): State {
  if (!spec) return { name, description, trigger: { event: "request.created" }, lead: emptyFilter(), steps: [] };
  const [first, ...rest] = spec.steps;
  if (first && first.type === "filter") return { name, description, trigger: spec.trigger, lead: first, steps: rest };
  return { name, description, trigger: spec.trigger, lead: emptyFilter(), steps: spec.steps };
}

function toSpec(s: State): AutomationSpec {
  return { version: 2, trigger: s.trigger, steps: [...(isEmptyFilter(s.lead) ? [] : [s.lead]), ...s.steps] };
}

export default function Builder({ initial, initialRuns, atlasFirst = false }: { initial: Row | null; initialRuns: Run[]; atlasFirst?: boolean }) {
  const router = useRouter();
  const atlas = useAssistant();
  const options = useOptions();
  const [st, setSt] = useState<State>(() => fromSpec(initial?.spec ?? null, initial?.name ?? "", initial?.description ?? ""));
  const [isActive, setIsActive] = useState(initial?.isActive ?? true);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(!initial);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [triggerOpen, setTriggerOpen] = useState(false);
  const [pickerAt, setPickerAt] = useState<number | null>(null);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [hoverIdx, setHoverIdx] = useState<number | null>(null);
  const [changed, setChanged] = useState<Set<number>>(new Set());
  const [testOpen, setTestOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);
  const [runs, setRuns] = useState<Run[]>(initialRuns);
  const [runsLoading, setRunsLoading] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState<string | null>(initial?.webhookUrl ?? null);
  const nameRef = useRef<HTMLInputElement>(null);

  const spec = useMemo(() => toSpec(st), [st]);
  const compiled = useMemo(() => compileAutomation(spec), [spec]);
  const errors = compiled.ok ? [] : compiled.errors;
  const entity = triggerEntity(st.trigger);
  const actionCount = st.steps.filter((s) => s.type !== "filter" && s.type !== "wait").length;

  const update = useCallback((patch: Partial<State> | ((s: State) => State)) => {
    setSt((s) => (typeof patch === "function" ? patch(s) : { ...s, ...patch }));
    setDirty(true);
  }, []);

  function flash(msg: string) {
    setToast(msg);
    window.setTimeout(() => setToast(""), 2200);
  }

  useEffect(() => {
    if (!initial && !atlasFirst) nameRef.current?.focus();
  }, [initial, atlasFirst]);

  /* ── trigger ─────────────────────────────────────────────────────────── */

  async function pickTrigger(t: TriggerName) {
    const next: TriggerSpec = { event: t };
    const nextEntity = triggerEntity(next);
    if (nextEntity !== entity) {
      const dropped = st.steps.filter((s) => s.type !== "filter" && s.type !== "wait" && !actionAllowedFor((s as AutomationAction).type, nextEntity));
      if (dropped.length > 0) {
        const ok = await confirmSheet({
          title: "Change the trigger?",
          message: `${dropped.length} step${dropped.length === 1 ? "" : "s"} (${dropped.map((s) => ACTIONS[(s as AutomationAction).type].label).join(", ")}) can't run on a ${nextEntity} trigger and will be removed.`,
          confirmLabel: "Change trigger",
        });
        if (!ok) return;
      }
      const known = new Set(fieldsFor(next));
      const keepRule = (r: { field: string }) => known.has(r.field) || r.field.startsWith("custom_") || r.field.startsWith("data_");
      update((s) => ({
        ...s,
        trigger: next,
        lead: { ...s.lead, rules: s.lead.rules.filter(keepRule), expr: undefined },
        steps: s.steps
          .filter((x) => x.type === "filter" || x.type === "wait" || actionAllowedFor((x as AutomationAction).type, nextEntity))
          .map((x) => (x.type === "filter" ? { ...x, rules: x.rules.filter(keepRule), expr: undefined } : x)),
      }));
    } else {
      update({ trigger: next });
    }
  }

  /* ── steps ───────────────────────────────────────────────────────────── */

  function addStep(at: number, ns: NewStep) {
    const step: Step = ns.kind === "filter" ? emptyFilter() : ns.kind === "wait" ? { type: "wait", amount: 1, unit: "days" } : newAction(ns.type);
    update((s) => ({ ...s, steps: [...s.steps.slice(0, at), step, ...s.steps.slice(at)] }));
    markChanged([at]);
  }
  function setStep(i: number, step: Step) {
    update((s) => ({ ...s, steps: s.steps.map((x, j) => (j === i ? step : x)) }));
  }
  function removeStep(i: number) {
    update((s) => ({ ...s, steps: s.steps.filter((_, j) => j !== i) }));
  }
  function moveStep(from: number, to: number) {
    if (from === to || from + 1 === to) return;
    update((s) => {
      const arr = [...s.steps];
      const [item] = arr.splice(from, 1);
      arr.splice(to > from ? to - 1 : to, 0, item);
      return { ...s, steps: arr };
    });
  }
  function markChanged(idx: number[]) {
    setChanged(new Set(idx));
    window.setTimeout(() => setChanged(new Set()), 2000);
  }

  /* ── atlas ───────────────────────────────────────────────────────────── */

  function onDraft(d: Draft) {
    const next = fromSpec(d.spec, d.name || st.name, d.description || st.description);
    const before = st.steps.map((s) => JSON.stringify(s));
    setSt(next);
    setDirty(true);
    const idx = next.steps.map((s, i) => (before[i] === JSON.stringify(s) ? -1 : i)).filter((i) => i >= 0);
    markChanged(idx.length ? idx : next.steps.map((_, i) => i));
    flash(`${atlas.name} updated ${idx.length || next.steps.length} step${(idx.length || next.steps.length) === 1 ? "" : "s"} — check them, then save.`);
  }

  /* ── save / test / pause / delete ────────────────────────────────────── */

  async function save() {
    if (!compiled.ok) return;
    if (!st.name.trim()) {
      setError("Give it a name.");
      nameRef.current?.focus();
      return;
    }
    setSaving(true);
    setError("");
    const body = { name: st.name.trim(), description: st.description.trim() || null, spec: compiled.compiled.spec };
    const { ok, data } = initial ? await postJson<Row>(`/api/app/automations/${initial.id}`, body, "PATCH") : await postJson<Row>("/api/app/automations", body);
    setSaving(false);
    if (!ok || !data) {
      setError(data?.error ?? GENERIC_ERROR);
      return;
    }
    hapticNotify("SUCCESS");
    setDirty(false);
    if (data.webhookUrl) setWebhookUrl(data.webhookUrl);
    if (!initial) {
      router.replace(`/app/automations/${data.id}`);
      return;
    }
    flash("Saved.");
    router.refresh();
  }

  async function test() {
    setTestOpen(true);
    setTesting(true);
    setTestResult(null);
    const { ok, data } = await postJson<TestResult>("/api/app/automations/test", { spec });
    setTesting(false);
    setTestResult(ok && data ? { ...data, warnings: data.warnings ?? [] } : { compiles: false, errors: [data?.error ?? GENERIC_ERROR], warnings: [] });
  }

  async function toggleActive() {
    if (!initial) return;
    const { ok, data } = await postJson(`/api/app/automations/${initial.id}`, { isActive: !isActive }, "PATCH");
    if (!ok) return setError(data?.error ?? GENERIC_ERROR);
    setIsActive((v) => !v);
    router.refresh();
  }

  async function remove() {
    if (!initial) return;
    const ok = await confirmSheet({ title: `Delete "${initial.name}"?`, message: "It stops immediately and its run history goes with it. Anything it already did stays.", confirmLabel: "Delete Automation", destructive: true });
    if (!ok) return;
    const res = await postJson(`/api/app/automations/${initial.id}`, undefined, "DELETE");
    if (!res.ok) return setError(res.data?.error ?? GENERIC_ERROR);
    router.replace("/app/automations");
    router.refresh();
  }

  async function refreshRuns() {
    if (!initial) return;
    setRunsLoading(true);
    try {
      const r = await fetch(`/api/app/automations/${initial.id}`);
      const j = (await r.json()) as { recentRuns?: Run[]; webhookUrl?: string | null };
      if (Array.isArray(j.recentRuns)) setRuns(j.recentRuns.map((x) => ({ ...x, createdAt: typeof x.createdAt === "string" ? x.createdAt : new Date(x.createdAt).toISOString() })));
      if (j.webhookUrl) setWebhookUrl(j.webhookUrl);
    } catch {
      /* stays as it was */
    }
    setRunsLoading(false);
  }

  /* ── drag & drop (native HTML5, like the Leads board) ────────────────── */

  const dragProps = (i: number): React.HTMLAttributes<HTMLDivElement> => ({
    draggable: true,
    onDragStart: (e) => {
      e.dataTransfer.setData("text/plain", String(i));
      e.dataTransfer.effectAllowed = "move";
      setDragIdx(i);
    },
    onDragEnd: () => {
      setDragIdx(null);
      setHoverIdx(null);
    },
  });
  const dropProps = (slot: number): React.HTMLAttributes<HTMLDivElement> => ({
    onDragOver: (e) => {
      if (dragIdx === null) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "move";
      if (hoverIdx !== slot) setHoverIdx(slot);
    },
    onDragLeave: () => {
      if (hoverIdx === slot) setHoverIdx(null);
    },
    onDrop: (e) => {
      e.preventDefault();
      const from = dragIdx ?? Number(e.dataTransfer.getData("text/plain"));
      setDragIdx(null);
      setHoverIdx(null);
      if (Number.isFinite(from)) moveStep(from, slot);
    },
  });

  /* ── render ──────────────────────────────────────────────────────────── */

  const described = compiled.ok ? describeAutomation(compiled.compiled.spec) : null;
  const isWebhook = st.trigger.event === "webhook.received";
  const canSave = compiled.ok && st.name.trim().length > 0 && !saving && (dirty || !initial);

  const header = (
    <div className="mb-5 flex flex-wrap items-start gap-3">
      <BackLink href="/app/automations" className="mt-2 shrink-0" />
      <div className="min-w-0 flex-1">
        <input
          ref={nameRef}
          value={st.name}
          onChange={(e) => update({ name: e.target.value })}
          placeholder="Name this automation"
          maxLength={80}
          className="w-full border-0 bg-transparent p-0 text-[22px] font-semibold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-0 lg:text-2xl"
        />
        <input
          value={st.description}
          onChange={(e) => update({ description: e.target.value })}
          placeholder="Why this rule exists (optional)"
          maxLength={200}
          className="mt-0.5 w-full border-0 bg-transparent p-0 text-sm text-gray-500 placeholder:text-gray-300 focus:outline-none focus:ring-0"
        />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {initial && (
          <>
            <button type="button" onClick={() => void toggleActive()} className="btn-tool-line inline-flex h-10 items-center gap-1.5 px-3 text-sm" title={isActive ? "Pause" : "Resume"}>
              {isActive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}
            </button>
            <button type="button" onClick={() => void remove()} aria-label="Delete" title="Delete" className="btn-tool-line inline-flex h-10 w-10 items-center justify-center text-red-600">
              <Trash2 size={15} />
            </button>
          </>
        )}
        <button type="button" onClick={() => void test()} disabled={!compiled.ok} className="btn-tool-line inline-flex h-10 items-center gap-1.5 px-3.5 text-sm disabled:opacity-50" title="Dry run over the last 30 days — nothing is sent">
          <FlaskConical size={14} /> Test
        </button>
        <button type="button" onClick={() => void save()} disabled={!canSave} className="btn-primary h-10 justify-center px-4 disabled:opacity-50">
          {saving ? "Saving…" : initial ? "Save" : "Turn it on"}
        </button>
      </div>
    </div>
  );

  const problems = (
    <>
      {error && (
        <div role="alert" className="form-error mb-4">{error}</div>
      )}
      {errors.length > 0 && st.steps.length > 0 && (
        <ul className="mb-4 space-y-0.5 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          {errors.slice(0, 6).map((e, i) => <li key={i}>{e}</li>)}
        </ul>
      )}
      {!isActive && initial && <p className="mb-4 rounded-xl bg-gray-100 px-3 py-2 text-xs text-gray-600">Paused — nothing fires until you resume it.</p>}
    </>
  );

  const stack = (
    <div className="mx-auto w-full max-w-2xl">
      <Card icon={Zap} tint={TRIGGER_TINT} title={triggerTitle(st.trigger)} preview="Trigger — what starts this automation" className={changed.has(-1) ? "ring-2 ring-amber-300" : ""}>
        <div className="space-y-3">
          <button type="button" onClick={() => setTriggerOpen(true)} className="btn-tool-line inline-flex h-9 items-center px-3 text-sm">Change trigger</button>
          <TriggerEditor trigger={st.trigger} onChange={(t) => update({ trigger: t })} options={options} />
        </div>
      </Card>

      <Connector />

      <Card icon={Filter} tint={FLOW_TINT} title="Only if…" preview={isEmptyFilter(st.lead) ? "Always — add a condition to narrow it down" : previewOf(st.lead, spec)}>
        <FilterEditor step={st.lead} onChange={(f) => update({ lead: f })} trigger={st.trigger} extra={[]} />
      </Card>

      <Connector onAdd={() => setPickerAt(0)} dropProps={dropProps(0)} active={hoverIdx === 0} />

      {st.steps.map((step, i) => {
        const extra = extraFieldsBefore(st.steps, i);
        const dimmed = dragIdx === i ? "opacity-40" : "";
        const card =
          step.type === "filter" ? (
            <Card icon={Filter} tint={FLOW_TINT} title="Only continue if…" preview={previewOf(step, spec)} onRemove={() => removeStep(i)} dragHandle changed={changed.has(i)} className={dimmed} dragProps={dragProps(i)}>
              <FilterEditor step={step} onChange={(f) => setStep(i, f)} trigger={st.trigger} extra={extra} />
            </Card>
          ) : step.type === "wait" ? (
            <Card icon={Clock} tint={FLOW_TINT} title="Wait" preview={previewOf(step, spec)} onRemove={() => removeStep(i)} dragHandle changed={changed.has(i)} className={dimmed} dragProps={dragProps(i)}>
              <WaitEditor step={step as WaitStep} onChange={(w) => setStep(i, w)} />
            </Card>
          ) : (
            (() => {
              const a = step as AutomationAction;
              const def = ACTIONS[a.type];
              const Icon = GROUP_ICON[def.group];
              return (
                <Card icon={Icon} tint={ACTION_TINT[def.group]} title={def.label} preview={previewOf(step, spec)} onRemove={() => removeStep(i)} dragHandle changed={changed.has(i)} className={dimmed} dragProps={dragProps(i)}>
                  <ParamForm action={a} onChange={(x) => setStep(i, x)} trigger={st.trigger} extra={extra} options={options} />
                </Card>
              );
            })()
          );
        return (
          <div key={i}>
            {card}
            <Connector onAdd={() => setPickerAt(i + 1)} dropProps={dropProps(i + 1)} active={hoverIdx === i + 1} />
          </div>
        );
      })}

      <button type="button" onClick={() => setPickerAt(st.steps.length)} className="flex w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-gray-300 bg-white px-4 py-4 text-sm font-medium text-gray-600 hover:border-gray-400 hover:bg-gray-50 hover:text-gray-900">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gray-800 text-white">+</span>
        {st.steps.length === 0 ? "Add the first action" : "Add a step"}
        <span className="text-xs font-normal text-gray-400">{actionCount}/{AUTOMATION_LIMITS.actions} actions</span>
      </button>
    </div>
  );

  const side = (
    <aside className="space-y-6">
      {atlas.available && (
        <div>
          <p className="mb-1.5 flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-gray-500"><Sparkles size={12} /> {initial ? `Change it with ${atlas.name}` : `Or describe it to ${atlas.name}`}</p>
          <AutomationBuildPanel current={initial || st.steps.length > 0 ? { name: st.name, description: st.description, spec: compiled.ok ? compiled.compiled.spec : null } : null} onDraft={onDraft} autoFocus={atlasFirst} compact />
        </div>
      )}
      {isWebhook && <WebhookUrl url={webhookUrl} />}
      {initial && <RunHistory runs={runs} onRefresh={refreshRuns} loading={runsLoading} />}
    </aside>
  );

  return (
    <div className="mx-auto max-w-6xl p-4 lg:p-8">
      {/* ── desktop: the card builder ───────────────────────────────────── */}
      <div className="hidden lg:block">
        {header}
        {problems}
        <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_20rem]">
          {stack}
          {side}
        </div>
      </div>

      {/* ── phone: plain English + Atlas ────────────────────────────────── */}
      <div className="lg:hidden">
        <div className="mb-4">
          <input ref={nameRef} value={st.name} onChange={(e) => update({ name: e.target.value })} placeholder="Name this automation" maxLength={80} className="numeral-ledger w-full border-0 bg-transparent p-0 text-[26px] font-bold text-gray-900 placeholder:text-gray-300 focus:outline-none focus:ring-0" />
          {st.description && <p className="mt-1 text-sm text-gray-500">{st.description}</p>}
        </div>
        {problems}
        <div className="card-ledger px-4 py-3">
          {described ? (
            <ol className="space-y-1.5">
              {[{ kind: "trigger", text: described.trigger }, ...described.steps].map((s, i) => (
                <li key={i} className="flex gap-2.5 text-sm text-gray-800">
                  <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-gray-100 text-[11px] font-semibold text-gray-600">{i + 1}</span>
                  <span className={s.kind === "filter" || s.kind === "wait" ? "text-gray-500" : ""}>{s.text}</span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-gray-500">Describe what should happen and {atlas.name} will lay it out here.</p>
          )}
        </div>
        {atlas.available ? (
          <div className="mt-4">
            <AutomationBuildPanel current={st.steps.length > 0 ? { name: st.name, description: st.description, spec: compiled.ok ? compiled.compiled.spec : null } : null} onDraft={onDraft} autoFocus={atlasFirst || !initial} compact placeholder={initial ? "What should change?" : "When a quote is sent, wait 3 days, then…"} />
          </div>
        ) : (
          <p className="mt-4 text-center text-xs text-gray-500">Build the cards on a desktop.</p>
        )}
        <div className="mt-4 flex gap-2">
          <button type="button" onClick={() => void save()} disabled={!canSave} className="btn-primary flex-1 justify-center disabled:opacity-50">{saving ? "Saving…" : initial ? "Save" : "Turn it on"}</button>
          {initial && (
            <button type="button" onClick={() => void toggleActive()} className="btn-tool-line inline-flex h-10 items-center gap-1.5 px-3 text-sm">{isActive ? <><Pause size={14} /> Pause</> : <><Play size={14} /> Resume</>}</button>
          )}
        </div>
        {initial && <div className="mt-6"><RunHistory runs={runs} onRefresh={refreshRuns} loading={runsLoading} /></div>}
        <p className="mt-4 text-center text-[11px] text-gray-400">Edit the cards on a desktop.</p>
      </div>

      <TriggerPicker open={triggerOpen} onClose={() => setTriggerOpen(false)} current={st.trigger.event} onPick={(t) => void pickTrigger(t)} />
      <StepPicker open={pickerAt !== null} onClose={() => setPickerAt(null)} entity={entity} options={options} onPick={(ns) => addStep(pickerAt ?? st.steps.length, ns)} />
      <TestModal open={testOpen} onClose={() => setTestOpen(false)} result={testResult} loading={testing} />

      {toast && (
        <div className="pointer-events-none fixed inset-x-0 bottom-[calc(env(safe-area-inset-bottom)+5rem)] z-[80] flex justify-center lg:bottom-8">
          <span className="rounded-full bg-gray-900 px-4 py-2 text-sm text-white shadow-lg">{toast}</span>
        </div>
      )}
    </div>
  );
}
