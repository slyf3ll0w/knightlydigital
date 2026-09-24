"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles, Zap } from "lucide-react";
import { Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";
import { APP_THEME, wash } from "@/components/EstimatorControls";
import { describeAutomation, type AutomationSpec } from "@/lib/automations";

/**
 * The Automations builder's Atlas panel: a sentence in, the cards filled in.
 * Same shape as the Estimates builder (app/platform/estimates/BuildPanel.tsx)
 * but ONE metered request — POST /api/app/automations/draft returns the whole
 * spec at once, so the step rail ticks on a timer while the call is in
 * flight and the plain-English rule lands when it answers. Nothing is saved
 * here: `onDraft` hands the spec to the page (the cards update in place) and
 * the owner presses Save, exactly as if they had built it by hand. With
 * `current` set the same box CHANGES the rule on screen ("also text them
 * after 2 days") — Atlas keeps what wasn't mentioned.
 */

export type DraftResult = { name: string; description: string; spec: AutomationSpec; notes: string[] };

type Phase = { key: "read" | "draft" | "check"; label: string; changeLabel: string };
const PHASES: Phase[] = [
  { key: "read", label: "Reading your rule", changeLabel: "Reading the rule" },
  { key: "draft", label: "Drafting the steps", changeLabel: "Working out the change" },
  { key: "check", label: "Checking it compiles", changeLabel: "Checking it compiles" },
];

const EXAMPLES = [
  "When a quote has sat unanswered for 5 days, email the client a friendly nudge and notify me.",
  "When a job is marked complete, wait a day, then send a review request.",
  "Every Monday at 7am, email the office how many invoices are overdue.",
  "When a lead moves to Estimate Scheduled, text them a confirmation.",
  "When a new lead comes in from the webhook, notify the assigned salesperson and add a note.",
];

type Reply = {
  name?: string;
  description?: string;
  spec?: AutomationSpec;
  notes?: string[];
  atlasTokens?: number;
  error?: string;
  errors?: string[];
  atlasLocked?: boolean;
};

export default function AutomationBuildPanel({
  current,
  onDraft,
  compact = false,
  autoFocus = false,
  placeholder,
}: {
  /** The rule on screen — set → the box changes it instead of starting fresh. */
  current: { name: string; description: string; spec: AutomationSpec | null } | null;
  /** The drafted rule; the page loads it into the cards. */
  onDraft: (d: DraftResult) => void;
  /** Tighter, no examples header — the phone sheet. */
  compact?: boolean;
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const atlas = useAssistant();
  const theme = APP_THEME;
  const changing = Boolean(current);
  const [prompt, setPrompt] = useState("");
  const [running, setRunning] = useState(false);
  const [phaseIdx, setPhaseIdx] = useState(0);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<string[]>([]);
  const [locked, setLocked] = useState(false);
  const [finished, setFinished] = useState<(DraftResult & { tokens: number }) | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (autoFocus) boxRef.current?.focus();
  }, [autoFocus]);

  // The rail ticks on a clock: the request is one call, so the phases are a
  // feel for the wait, not a report — the last one holds until the answer.
  useEffect(() => {
    if (!running) return;
    setPhaseIdx(0);
    const a = setTimeout(() => setPhaseIdx(1), 1800);
    const b = setTimeout(() => setPhaseIdx(2), 9000);
    return () => {
      clearTimeout(a);
      clearTimeout(b);
    };
  }, [running]);

  async function run() {
    const text = prompt.trim();
    if (text.length < 8 || running) return;
    setRunning(true);
    setError("");
    setErrors([]);
    setFinished(null);
    try {
      const res = await fetch("/api/app/automations/draft", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, ...(current ? { current: { name: current.name, description: current.description, spec: current.spec } } : {}) }),
      });
      const data = (await res.json().catch(() => null)) as Reply | null;
      if (!res.ok || !data?.spec) {
        setError(data?.error ?? "Couldn't draft that — please try again.");
        setErrors(Array.isArray(data?.errors) ? data.errors.slice(0, 6) : []);
        setLocked(Boolean(data?.atlasLocked));
        return;
      }
      const d: DraftResult = { name: data.name ?? "Untitled automation", description: data.description ?? "", spec: data.spec, notes: Array.isArray(data.notes) ? data.notes : [] };
      setFinished({ ...d, tokens: data.atlasTokens ?? 0 });
      // Applied at once: the cards on the page update in place; the owner
      // reads the summary here and presses Save when it looks right.
      onDraft(d);
    } catch {
      setError("Couldn't reach Atlas — check your connection and try again.");
    } finally {
      setRunning(false);
    }
  }

  const canRun = prompt.trim().length >= 8 && !running && !atlas.locked && !locked;
  const summary = finished ? describeAutomation(finished.spec) : null;

  return (
    <div className={compact ? "" : "card-ledger overflow-hidden"}>
      <div className={compact ? "" : "p-4 sm:p-6"}>
        {!compact && (
          <div className="mb-4">
            <h2 className="text-xl font-bold tracking-tight text-gray-900">{changing ? `Change it with ${atlas.name}` : `Build it with ${atlas.name}`}</h2>
            <p className="mt-1 text-sm text-gray-600">
              {changing
                ? `Say what should be different. ${atlas.name} keeps everything you don't mention and updates the cards — you press Save.`
                : `Say what should happen, the way you'd tell a new office manager. ${atlas.name} picks the trigger, the conditions and the steps; you check the cards and press Save.`}
            </p>
          </div>
        )}

        <Textarea
          ref={boxRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={compact ? 3 : 3}
          maxLength={2000}
          placeholder={placeholder ?? (changing ? "e.g. also text them after 2 days, only on weekdays" : "e.g. When a quote has sat unanswered for 5 days, email the client a friendly nudge and notify me.")}
          className="w-full text-[15px]"
          disabled={running}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) void run();
          }}
        />

        {(error || errors.length > 0) && (
          <div role="alert" className="form-error mt-3">
            {error}
            {errors.length > 0 && (
              <ul className="mt-1 list-disc pl-4 text-xs">
                {errors.map((e) => (
                  <li key={e}>{e}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-gray-500">
            {atlas.locked || locked ? "Your Atlas tokens are used up for now." : `Uses Atlas tokens once. The rule runs free, forever.`}
          </span>
          <button type="button" disabled={!canRun} onClick={() => void run()} className="btn-primary h-11 justify-center px-5">
            {running ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
            {changing ? "Change it" : "Build it"}
          </button>
        </div>

        {!compact && !changing && !prompt && !running && !finished && (
          <div className="mt-4">
            <p className="mb-1.5 text-[11px] font-medium text-gray-500">Try one</p>
            <div className="flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => setPrompt(e)} className="rounded-full border border-gray-200 px-3 py-1.5 text-left text-xs font-medium text-gray-700 hover:border-gray-300 hover:bg-gray-50">
                  {e}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── the rail while it works ── */}
        {running && (
          <ol className="mt-4 space-y-1.5" aria-label="Drafting progress">
            {PHASES.map((p, i) => {
              const done = i < phaseIdx;
              const active = i === phaseIdx;
              return (
                <li key={p.key} className="flex items-center gap-2 text-sm">
                  <span
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-bold ${done || active ? "" : "border-gray-200 text-gray-400"}`}
                    style={done || active ? { backgroundColor: done ? theme.accent : "transparent", borderColor: theme.accent, color: done ? theme.onAccent : theme.accent } : undefined}
                  >
                    {done ? <Check size={11} strokeWidth={3} /> : active ? <Loader2 size={11} className="animate-spin" /> : i + 1}
                  </span>
                  <span className={active ? "atlas-shimmer font-medium text-gray-900" : done ? "text-gray-600" : "text-gray-400"}>{changing ? p.changeLabel : p.label}</span>
                </li>
              );
            })}
          </ol>
        )}

        {/* ── the drafted rule, in plain English ── */}
        {finished && summary && !running && (
          <div className="msg-enter mt-4 rounded-2xl border border-gray-200 bg-white">
            <div className="flex items-start justify-between gap-3 border-b border-gray-100 px-4 py-3">
              <div className="flex min-w-0 items-start gap-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]" style={{ backgroundColor: wash(theme, 12), color: theme.accent }} aria-hidden>
                  <Zap size={18} strokeWidth={2.25} />
                </span>
                <div className="min-w-0">
                  <p className="truncate text-base font-semibold text-gray-900">{finished.name}</p>
                  {finished.description && <p className="mt-0.5 line-clamp-2 text-xs text-gray-500">{finished.description}</p>}
                </div>
              </div>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold" style={{ backgroundColor: wash(theme, 12), color: theme.accent }}>
                <Check size={12} strokeWidth={3} /> {changing ? "Cards updated" : "Cards filled in"}
              </span>
            </div>
            <ol className="space-y-1 px-4 py-3 text-sm">
              <li className="font-medium text-gray-900">{summary.trigger}</li>
              {summary.steps.map((s, i) => (
                <li key={`${i}-${s.text}`} className={`msg-enter pl-3 ${s.kind === "filter" ? "text-gray-500" : s.kind === "wait" ? "text-gray-500 italic" : "text-gray-800"}`} style={{ animationDelay: `${Math.min(i, 10) * 50}ms` }}>
                  → {s.text}
                </li>
              ))}
            </ol>
            {finished.notes.length > 0 && (
              <ul className="border-t border-gray-100 px-4 py-3 text-xs text-gray-600">
                {finished.notes.slice(0, 6).map((n) => (
                  <li key={n}>· {n}</li>
                ))}
              </ul>
            )}
            <div className="flex items-center justify-between gap-2 border-t border-gray-100 px-4 py-2.5">
              <span className="text-xs text-gray-600">Check the cards, then press <span className="font-semibold">Save</span>. Not right? Say what to change above.</span>
              <span className="shrink-0 text-[11px] text-gray-400">{finished.tokens > 0 ? `${finished.tokens.toLocaleString()} tokens` : ""}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
