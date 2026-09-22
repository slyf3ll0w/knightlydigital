"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Globe, Loader2, MessageCircleQuestion, Pencil, Play, Sparkles } from "lucide-react";
import { Input, Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, moneyExact, useCountUp, wash } from "@/components/EstimatorControls";
import RatesToConfirm from "@/components/RatesToConfirm";
import type { BuildAnswer, BuildDraft, BuildPlan, BuildQuestion, BuildSample } from "@/lib/estimator-build";

/**
 * The Estimates builder: a sentence in, a saved tool out, with the tool
 * TAKING SHAPE on screen as the work happens (POST /api/app/estimators/build
 * streams phases + real content: the plan, the draft, the sample prices).
 * Nothing on screen is decorative — every row is something the model
 * actually produced. When the plan finds something only the owner knows
 * (rates per material, a minimum), it asks — one short round, with example
 * answers to tap — the way a colleague would, then builds with the answers.
 * The same panel changes an existing tool when `estimatorId` is set.
 */

export type BuiltTool = Record<string, unknown> & { id: string; name: string };
type Phase = "plan" | "draft" | "check" | "fix" | "test" | "save";
type StepKey = "plan" | "draft" | "check" | "test" | "save";
type Ev =
  | { phase: Phase; message: string }
  | { plan: BuildPlan }
  | { draft: BuildDraft }
  | { samples: BuildSample[] }
  | { questions: BuildQuestion[]; tokens: number }
  | { ask: string; tokens: number }
  | { done: true; tool: BuiltTool; changes: string[]; samples: BuildSample[]; placeholders: string[]; warnings: string[]; tokens: number }
  | { error: string; tokens: number; atlasLocked?: boolean };

type Finished = { tool: BuiltTool; changes: string[]; samples: BuildSample[]; placeholders: string[]; warnings: string[]; tokens: number };

const STEPS: { key: StepKey; label: string; changeLabel: string }[] = [
  { key: "plan", label: "Sizing up the job", changeLabel: "Reading the tool" },
  { key: "draft", label: "Questions & pricing", changeLabel: "Working out the change" },
  { key: "check", label: "Checking the rules", changeLabel: "Checking the rules" },
  { key: "test", label: "Pricing sample jobs", changeLabel: "Pricing sample jobs" },
  { key: "save", label: "Saving", changeLabel: "Saving" },
];

const EXAMPLES = [
  "Fence installation: customers draw the fence line; $28 per foot for 6-ft cedar privacy, $18 for chain link, gates $250 each, $600 minimum.",
  "Lawn mowing from the lawn area on a map: $45 up to 5,000 sq ft, $65 up to 10,000, then $6 per extra 1,000; weekly or every other week.",
  "Interior painting by room: walls $2.50 per sq ft, ceilings $1.75, $45 per door and $30 per window; two coats adds 30%.",
  "Roof replacement: draw the roof area; architectural shingles $4.25 per sq ft, metal $9.50, tear-off $0.85 per sq ft, skylights $350 each.",
  "House cleaning by bedrooms and bathrooms: $120 base + $25 per bedroom + $35 per bathroom; deep clean is 1.5×; weekly saves 15%.",
  "Window cleaning: count windows by type — standard $8, large picture $18, French pane $4 per pane; inside and out doubles it; $120 minimum.",
];

const CONTROL_WORD: Record<string, string> = {
  slider: "slider",
  stepper: "counter",
  field: "number",
  number: "number",
  map: "map",
  cards: "cards",
  packages: "packages",
  list: "pick one",
  select: "pick one",
  multi: "pick several",
  counts: "item counts",
  toggle: "yes / no",
  text: "text",
  atlas: "Atlas assesses",
};

/** One sample price tile: counts up when the number lands. */
function SampleTile({ s, pending }: { s: BuildSample | null; pending: boolean }) {
  const shown = useCountUp(s?.subtotal ?? null);
  return (
    <div className="msg-enter rounded-xl border border-gray-200 px-3 py-2.5">
      <p className="truncate text-[11px] font-medium text-gray-500">{s?.label ?? (pending ? "Sample job" : "—")}</p>
      {s?.error ? (
        <p className="mt-0.5 flex items-center gap-1 text-xs font-medium text-amber-700">
          <AlertTriangle size={12} /> didn&apos;t run
        </p>
      ) : (
        <p className="mt-0.5 text-lg font-bold tabular-nums tracking-tight text-gray-900">{shown === null ? <span className="text-sm font-medium text-gray-400">{pending ? "pricing…" : "—"}</span> : moneyExact(shown)}</p>
      )}
    </div>
  );
}

export default function BuildPanel({
  estimatorId,
  initialPrompt = "",
  placeholder,
  onBuilt,
  onTry,
  onPublish,
  onEdit,
  compact = false,
  autoFocus = false,
}: {
  /** Set → change this tool instead of creating one */
  estimatorId?: string;
  initialPrompt?: string;
  placeholder?: string;
  onBuilt: (tool: BuiltTool, info: { changes: string[]; samples: BuildSample[]; placeholders: string[]; tokens: number }) => void;
  /** The finished card's actions (the Estimates page wires them to its sheets). */
  onTry?: (tool: BuiltTool) => void;
  onPublish?: (tool: BuiltTool) => void;
  onEdit?: (tool: BuiltTool) => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const atlas = useAssistant();
  const theme = APP_THEME;
  const [prompt, setPrompt] = useState(initialPrompt);
  const [running, setRunning] = useState(false);
  const [doneKeys, setDoneKeys] = useState<StepKey[]>([]);
  const [current, setCurrent] = useState<{ key: StepKey; message: string } | null>(null);
  const [plan, setPlan] = useState<BuildPlan | null>(null);
  const [draft, setDraft] = useState<BuildDraft | null>(null);
  const [samples, setSamples] = useState<BuildSample[] | null>(null);
  const [questions, setQuestions] = useState<BuildQuestion[] | null>(null);
  const [answers, setAnswers] = useState<string[]>([]);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState<Finished | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);
  useEffect(() => {
    if (autoFocus) boxRef.current?.focus();
  }, [autoFocus]);

  function reset() {
    setError("");
    setQuestions(null);
    setAnswers([]);
    setFinished(null);
    setDoneKeys([]);
    setPlan(null);
    setDraft(null);
    setSamples(null);
  }

  async function run(fullPrompt: string, withAnswers?: BuildAnswer[]) {
    setRunning(true);
    reset();
    setCurrent({ key: "plan", message: "Starting…" });
    try {
      const res = await fetch("/api/app/estimators/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, ...(estimatorId ? { estimatorId } : {}), ...(withAnswers && withAnswers.length > 0 ? { answers: withAnswers } : {}) }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Couldn't start the build — please try again.");
        setCurrent(null);
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastKey: StepKey | null = null;
      const handle = (ev: Ev) => {
        if ("phase" in ev) {
          const key: StepKey = ev.phase === "fix" ? "draft" : ev.phase;
          if (lastKey && lastKey !== key) {
            const finishedKey = lastKey;
            setDoneKeys((d) => (d.includes(finishedKey) ? d : [...d, finishedKey]));
          }
          // a fix round re-opens the draft step
          if (ev.phase === "fix") setDoneKeys((d) => d.filter((k) => k === "plan"));
          lastKey = key;
          setCurrent({ key, message: ev.message });
        } else if ("plan" in ev) {
          setPlan(ev.plan);
        } else if ("draft" in ev) {
          setDraft(ev.draft);
        } else if ("questions" in ev) {
          setCurrent(null);
          setQuestions(ev.questions);
          setAnswers(ev.questions.map(() => ""));
        } else if ("ask" in ev) {
          setCurrent(null);
          setQuestions([{ question: ev.ask, why: "", suggestions: [] }]);
          setAnswers([""]);
        } else if ("done" in ev) {
          setDoneKeys(STEPS.map((s) => s.key));
          setCurrent(null);
          setSamples(ev.samples);
          const fin = { tool: ev.tool, changes: ev.changes, samples: ev.samples, placeholders: ev.placeholders, warnings: ev.warnings, tokens: ev.tokens };
          setFinished(fin);
          onBuilt(ev.tool, { changes: ev.changes, samples: ev.samples, placeholders: ev.placeholders, tokens: ev.tokens });
        } else if ("samples" in ev) {
          setSamples(ev.samples);
        } else if ("error" in ev) {
          setCurrent(null);
          setError(ev.error);
        }
      };
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        let nl: number;
        while ((nl = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, nl).trim();
          buf = buf.slice(nl + 1);
          if (!line) continue;
          try {
            handle(JSON.parse(line) as Ev);
          } catch {
            /* partial line — ignore */
          }
        }
      }
      if (buf.trim()) {
        try {
          handle(JSON.parse(buf.trim()) as Ev);
        } catch {
          /* ignore */
        }
      }
    } catch {
      setError("Lost the connection while building — check your connection and try again.");
      setCurrent(null);
    } finally {
      setRunning(false);
    }
  }

  const canRun = prompt.trim().length >= 8 && !running && !atlas.locked;
  const stepLabel = (s: (typeof STEPS)[number]) => (estimatorId ? s.changeLabel : s.label);
  const stage = running || finished || (error && (plan || draft));

  // what the preview shows: the draft when we have it, else the plan's planned questions
  const rows = useMemo(() => {
    if (draft) return draft.inputs.map((i) => ({ label: i.label, kind: CONTROL_WORD[i.type] ?? i.type, section: i.section, planned: false }));
    if (plan) return plan.questions.map((q) => ({ label: q.label, kind: CONTROL_WORD[q.control] ?? q.control, section: undefined as string | undefined, planned: true }));
    return [];
  }, [draft, plan]);
  const packages = draft?.packages ?? plan?.packages ?? null;
  const title = finished?.tool.name ?? draft?.name ?? null;
  const sampleSlots: (BuildSample | null)[] = samples && samples.length > 0 ? samples.slice(0, 3) : [null, null, null];
  const pricing = current?.key === "test" || (Boolean(draft) && !samples);

  const submitAnswers = (skip: boolean) => {
    if (!questions) return;
    const a: BuildAnswer[] = questions.map((q, i) => ({ question: q.question, answer: skip ? "" : answers[i] ?? "" }));
    void run(prompt, a);
  };

  return (
    <div className={compact ? "" : "card-ledger overflow-hidden"}>
      {/* ── the ask ── */}
      {!stage && !questions && (
        <div className={compact ? "" : "p-4 sm:p-6"}>
          {!compact && (
            <div className="mb-4">
              <h2 className="text-xl font-bold tracking-tight text-gray-900">Build an estimate tool</h2>
              <p className="mt-1 text-sm text-gray-600">Say how you price the job, the way you&apos;d explain it to a new hire. {atlas.name} asks about anything it needs, writes the questions, the packages and the math, then proves it on sample jobs.</p>
            </div>
          )}
          <Textarea
            ref={boxRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={compact ? 3 : 4}
            maxLength={4000}
            placeholder={placeholder ?? "e.g. Driveway pressure washing: $0.25 per sq ft, $150 minimum, sealant optional at $0.45 per sq ft. Two-story homes add 15%."}
            className="w-full text-[15px]"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) void run(prompt);
            }}
          />
          {error && (
            <div role="alert" className="form-error mt-3">
              {error}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
            <span className="text-xs text-gray-500">{atlas.locked ? "Your Atlas tokens are used up for now." : "Uses Atlas tokens once. Running the tool is free, forever."}</span>
            <button type="button" disabled={!canRun} onClick={() => void run(prompt)} className="btn-primary h-11 justify-center px-5">
              <Sparkles size={16} />
              {estimatorId ? "Make the change" : "Build it"}
            </button>
          </div>
          {!compact && !estimatorId && !prompt && (
            <div className="mt-4">
              <p className="mb-1.5 text-[11px] font-medium text-gray-500">Try one</p>
              <div className="flex flex-wrap gap-1.5">
                {EXAMPLES.map((e) => (
                  <button key={e} type="button" onClick={() => setPrompt(e)} className="rounded-full border border-gray-200 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50">
                    {e.split(":")[0]}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── clarifying questions ── */}
      {questions && !running && !finished && (
        <div className={compact ? "" : "p-4 sm:p-6"}>
          <div className="flex items-start gap-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }}>
              <MessageCircleQuestion size={18} />
            </span>
            <div className="min-w-0 flex-1">
              <h3 className="text-base font-semibold text-gray-900">Before I build this, {questions.length === 1 ? "one quick question" : `${questions.length} quick questions`}</h3>
              <p className="mt-0.5 text-xs text-gray-500">Answer what you can. Anything you skip, I&apos;ll fill with a typical number for you to confirm later.</p>
            </div>
          </div>
          <ol className="mt-4 space-y-4">
            {questions.map((q, i) => (
              <li key={q.question} className="msg-enter rounded-xl border border-gray-200 p-3.5" style={{ animationDelay: `${i * 60}ms` }}>
                <p className="text-sm font-medium text-gray-900">{q.question}</p>
                {q.why && <p className="mt-0.5 text-xs text-gray-500">{q.why}</p>}
                {q.suggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {q.suggestions.map((s) => {
                      const on = answers[i] === s;
                      return (
                        <button key={s} type="button" onClick={() => setAnswers((a) => a.map((x, k) => (k === i ? (on ? "" : s) : x)))} className={`rounded-full border px-2.5 py-1 text-xs font-medium ${on ? "" : "border-gray-200 text-gray-700 hover:bg-gray-50"}`} style={on ? { backgroundColor: theme.accent, borderColor: theme.accent, color: theme.onAccent } : undefined}>
                          {s}
                        </button>
                      );
                    })}
                  </div>
                )}
                <Input value={answers[i] ?? ""} onChange={(e) => setAnswers((a) => a.map((x, k) => (k === i ? e.target.value : x)))} placeholder="Your answer" maxLength={600} className="mt-2 w-full" autoFocus={i === 0} />
              </li>
            ))}
          </ol>
          {error && (
            <div role="alert" className="form-error mt-3">
              {error}
            </div>
          )}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <button type="button" onClick={() => submitAnswers(true)} className="text-xs font-medium text-gray-600 underline-offset-2 hover:underline">
              Skip — I&apos;ll confirm the rates later
            </button>
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setQuestions(null)} className="h-10 rounded-lg px-3 text-sm font-medium text-gray-600 hover:bg-gray-100">
                Edit my description
              </button>
              <button type="button" disabled={atlas.locked} onClick={() => submitAnswers(false)} className="btn-primary h-10 justify-center">
                <Sparkles size={15} /> Build with these answers
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── the stage: rail + the tool taking shape ── */}
      {stage && !questions && (
        <div className={compact ? "" : "p-4 sm:p-6"}>
          <ol className="flex items-center gap-1.5 sm:gap-2" aria-label="Build progress">
            {STEPS.map((s, i) => {
              const done = doneKeys.includes(s.key);
              const active = current?.key === s.key;
              return (
                <li key={s.key} className={`flex min-w-0 items-center gap-1.5 ${i < STEPS.length - 1 ? "flex-1" : ""}`}>
                  <span
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px] font-bold ${done || active ? "" : "border-gray-200 text-gray-400"}`}
                    style={done || active ? { backgroundColor: done ? theme.accent : "transparent", borderColor: theme.accent, color: done ? theme.onAccent : theme.accent } : undefined}
                  >
                    {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={12} className="animate-spin" /> : i + 1}
                  </span>
                  <span className={`hidden truncate text-xs font-medium sm:inline ${active ? "text-gray-900" : done ? "text-gray-600" : "text-gray-400"}`}>{stepLabel(s)}</span>
                  {i < STEPS.length - 1 && <span className="h-px min-w-2 flex-1" style={{ backgroundColor: done ? theme.accent : wash(theme, 18) }} aria-hidden />}
                </li>
              );
            })}
          </ol>
          <p className="mt-2 min-h-5 text-sm font-medium text-gray-700">
            {current ? <span className="atlas-shimmer">{current.message.replace(/…$/, "")}</span> : finished ? `“${finished.tool.name}” is ready.` : error ? "Stopped." : ""}
          </p>
          {error && (
            <div role="alert" className="form-error mt-3">
              {error}
            </div>
          )}

          {/* the tool taking shape */}
          <div className="mt-4 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-base font-semibold text-gray-900">{title ?? <span className="atlas-shimmer">{estimatorId ? "Reading the tool" : plan?.trade ?? "Working out your tool"}</span>}</p>
                <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{draft?.description || plan?.note || (estimatorId ? "The change lands here as it happens." : "The plan lands here in a few seconds, then the questions and pricing.")}</p>
              </div>
              {finished ? (
                <span className="msg-enter inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: wash(theme, 12), color: theme.accent }}>
                  <Check size={12} strokeWidth={3} /> Ready
                </span>
              ) : plan?.trade && !estimatorId ? (
                <span className="msg-enter shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">{plan.trade}</span>
              ) : null}
            </div>

            {plan && plan.drivers.length > 0 && !draft && (
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[11px] font-medium text-gray-500">What drives the price</p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {plan.drivers.map((d, i) => (
                    <span key={d} className="msg-enter rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700" style={{ animationDelay: `${i * 70}ms` }}>
                      {d}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {rows.length > 0 && (
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[11px] font-medium text-gray-500">{draft ? `${rows.length} question${rows.length === 1 ? "" : "s"}` : "Planned questions"}</p>
                <ul className="mt-1.5 space-y-1">
                  {rows.map((r, i) => {
                    const newSection = r.section && (i === 0 || rows[i - 1].section !== r.section);
                    return (
                      <li key={`${r.label}-${i}`} className="msg-enter" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                        {newSection && <p className="mb-1 mt-2 text-[11px] font-semibold text-gray-700">{r.section}</p>}
                        <div className="flex items-center gap-2">
                          <span className={`min-w-0 flex-1 truncate text-sm ${r.planned ? "text-gray-500" : "text-gray-800"}`}>{r.label}</span>
                          {r.planned ? <span className="h-2 w-16 shrink-0 rounded-full bg-gray-100 atlas-shimmer" aria-hidden /> : <span className="shrink-0 rounded-full bg-gray-100 px-2 py-0.5 text-[10px] font-medium text-gray-600">{r.kind}</span>}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}

            {packages && packages.length > 0 && (
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[11px] font-medium text-gray-500">Packages</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {packages.slice(0, 3).map((p, i) => (
                    <span key={p} className="msg-enter truncate rounded-lg border border-gray-200 px-2 py-1.5 text-center text-xs font-medium text-gray-800" style={{ animationDelay: `${i * 80}ms` }}>
                      {p}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {draft && draft.lines.length > 0 && (
              <div className="border-b border-gray-100 px-4 py-3">
                <p className="text-[11px] font-medium text-gray-500">
                  {draft.lines.length} pricing line{draft.lines.length === 1 ? "" : "s"}
                </p>
                <ul className="mt-1.5 flex flex-wrap gap-1.5">
                  {draft.lines.map((l, i) => (
                    <li key={`${l.name}-${i}`} className="msg-enter rounded-full border border-gray-200 px-2.5 py-1 text-xs text-gray-700" style={{ animationDelay: `${Math.min(i, 12) * 45}ms` }}>
                      {l.group ? <span className="text-gray-400">{l.group} · </span> : null}
                      {l.name.replace(/\{[^}]*\}/g, "…")}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {(draft || samples) && (
              <div className="px-4 py-3">
                <p className="text-[11px] font-medium text-gray-500">Sample jobs, priced by the tool</p>
                <div className="mt-1.5 grid grid-cols-3 gap-1.5">
                  {sampleSlots.map((s, i) => (
                    <SampleTile key={s?.label ?? i} s={s} pending={pricing} />
                  ))}
                </div>
              </div>
            )}

            {finished && (
              <div className="border-t border-gray-100 px-4 py-3">
                {finished.placeholders.length > 0 && (
                  <div className="mb-3">
                    <RatesToConfirm compact items={finished.placeholders} />
                  </div>
                )}
                {finished.changes.length > 0 && (
                  <ul className="mb-3 space-y-0.5 text-xs text-gray-600">
                    {finished.changes.slice(0, 8).map((c) => (
                      <li key={c}>→ {c}</li>
                    ))}
                    {finished.changes.length > 8 && <li>… and {finished.changes.length - 8} more</li>}
                  </ul>
                )}
                {finished.warnings.length > 0 && <p className="mb-3 text-[11px] text-gray-500">{finished.warnings.slice(0, 3).join(" · ")}</p>}
                <div className="flex flex-wrap items-center gap-2">
                  {onTry && (
                    <button type="button" onClick={() => onTry(finished.tool)} className="btn-primary h-10 justify-center">
                      <Play size={15} /> Try it
                    </button>
                  )}
                  {onPublish && (
                    <button type="button" onClick={() => onPublish(finished.tool)} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-300 px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <Globe size={15} /> Put it on your website
                    </button>
                  )}
                  {onEdit && (
                    <button type="button" onClick={() => onEdit(finished.tool)} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] border border-gray-300 px-3.5 text-sm font-medium text-gray-700 hover:bg-gray-50">
                      <Pencil size={15} /> Edit by hand
                    </button>
                  )}
                  <span className="ml-auto text-[11px] text-gray-400">{finished.tokens > 0 ? `${finished.tokens.toLocaleString()} tokens` : ""}</span>
                </div>
              </div>
            )}
          </div>

          {(finished || (error && !running)) && (
            <button
              type="button"
              onClick={() => {
                reset();
                setCurrent(null);
                if (finished && !estimatorId) setPrompt("");
              }}
              className="mt-3 text-xs font-medium text-gray-700 underline-offset-2 hover:underline"
            >
              {finished ? (estimatorId ? "Make another change" : "Build another") : "Try again"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
