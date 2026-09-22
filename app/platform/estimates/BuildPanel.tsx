"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Sparkles, Wand2 } from "lucide-react";
import { Textarea } from "@/components/Input";
import { useAssistant } from "@/components/AssistantContext";

/**
 * The Estimates builder: a sentence in, a saved tool out, with the work
 * shown as it happens (POST /api/app/estimators/build streams phases). The
 * same panel changes an existing tool when `estimatorId` is set (the
 * "Ask Atlas" sheet). When the model needs a fact only the owner knows it
 * asks ONE question here and the owner answers inline.
 */

export type BuiltTool = Record<string, unknown> & { id: string; name: string };
type Phase = "book" | "draft" | "check" | "fix" | "test" | "save";
type Ev =
  | { phase: Phase; message: string }
  | { ask: string; tokens: number }
  | { done: true; tool: BuiltTool; changes: string[]; sample: { subtotal: number; lines: number } | null; tokens: number }
  | { error: string; tokens: number; atlasLocked?: boolean };

const STEPS: { key: Phase; label: string; changeLabel?: string }[] = [
  { key: "book", label: "Reading your price book" },
  { key: "draft", label: "Drafting questions and pricing rules", changeLabel: "Working out the change" },
  { key: "check", label: "Checking the rules" },
  { key: "test", label: "Testing with a sample job" },
  { key: "save", label: "Saving" },
];

const EXAMPLES = [
  "Fence installation: customers draw the fence line; $28 per foot for 6-ft cedar privacy, $18 for chain link, gates $250 each, $600 minimum.",
  "Lawn mowing from the lawn area on a map: $45 up to 5,000 sq ft, $65 up to 10,000, then $6 per extra 1,000; weekly or every other week.",
  "Interior painting by room: walls $2.50 per sq ft, ceilings $1.75, $45 per door and $30 per window; two coats adds 30%.",
  "Roof replacement: draw the roof area; architectural shingles $4.25 per sq ft, metal $9.50, tear-off $0.85 per sq ft, skylights $350 each.",
];

export default function BuildPanel({
  estimatorId,
  initialPrompt = "",
  placeholder,
  onBuilt,
  compact = false,
  autoFocus = false,
}: {
  /** Set → change this tool instead of creating one */
  estimatorId?: string;
  initialPrompt?: string;
  placeholder?: string;
  onBuilt: (tool: BuiltTool, info: { changes: string[]; sample: { subtotal: number; lines: number } | null; tokens: number }) => void;
  compact?: boolean;
  autoFocus?: boolean;
}) {
  const atlas = useAssistant();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [answer, setAnswer] = useState("");
  const [ask, setAsk] = useState("");
  const [running, setRunning] = useState(false);
  const [doneKeys, setDoneKeys] = useState<Phase[]>([]);
  const [current, setCurrent] = useState<{ key: Phase; message: string } | null>(null);
  const [error, setError] = useState("");
  const [finished, setFinished] = useState<{ name: string; tokens: number; sample: { subtotal: number; lines: number } | null; changes: string[] } | null>(null);
  const boxRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (initialPrompt) setPrompt(initialPrompt);
  }, [initialPrompt]);
  useEffect(() => {
    if (autoFocus) boxRef.current?.focus();
  }, [autoFocus]);

  async function run(fullPrompt: string) {
    setRunning(true);
    setError("");
    setAsk("");
    setFinished(null);
    setDoneKeys([]);
    setCurrent({ key: "book", message: "Starting…" });
    try {
      const res = await fetch("/api/app/estimators/build", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: fullPrompt, ...(estimatorId ? { estimatorId } : {}) }),
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(data?.error ?? "Couldn't start the build — please try again.");
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let lastKey: Phase | null = null;
      const handle = (ev: Ev) => {
        if ("phase" in ev) {
          const key = ev.phase === "fix" ? "draft" : ev.phase;
          if (lastKey && lastKey !== key) setDoneKeys((d) => (d.includes(lastKey!) ? d : [...d, lastKey!]));
          lastKey = key;
          setCurrent({ key, message: ev.message });
        } else if ("ask" in ev) {
          setCurrent(null);
          setAsk(ev.ask);
        } else if ("done" in ev) {
          setDoneKeys(STEPS.map((s) => s.key));
          setCurrent(null);
          setFinished({ name: ev.tool.name, tokens: ev.tokens, sample: ev.sample, changes: ev.changes });
          onBuilt(ev.tool, { changes: ev.changes, sample: ev.sample, tokens: ev.tokens });
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
    } finally {
      setRunning(false);
    }
  }

  const canRun = prompt.trim().length >= 8 && !running && !atlas.locked;
  const stepLabel = (s: (typeof STEPS)[number]) => (estimatorId && s.changeLabel ? s.changeLabel : s.label);
  const showSteps = running || (finished && !compact);

  return (
    <div className={compact ? "" : "card-ledger p-4 sm:p-5"}>
      <style>{`
        @keyframes wbOrbSpin { to { transform: rotate(360deg); } }
        @keyframes wbOrbBreathe { 0%,100% { transform: scale(0.92); opacity: .75; } 50% { transform: scale(1.08); opacity: 1; } }
        @keyframes wbOrbit { to { transform: rotate(-360deg); } }
        @keyframes wbTwinkle { 0%,100% { opacity: .2; transform: scale(.6); } 50% { opacity: 1; transform: scale(1); } }
        @keyframes wbShimmer { to { background-position: 200% 0; } }
        @keyframes wbPop { 0% { transform: scale(.6); opacity: 0; } 60% { transform: scale(1.12); opacity: 1; } 100% { transform: scale(1); } }
        .wb-orb-ring { animation: wbOrbSpin 2.6s linear infinite; background: conic-gradient(from 0deg, #22c55e, #a3e635, #38bdf8, #22c55e); -webkit-mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px)); mask: radial-gradient(farthest-side, transparent calc(100% - 5px), #000 calc(100% - 4px)); }
        .wb-orb-core { animation: wbOrbBreathe 1.8s ease-in-out infinite; background: radial-gradient(circle at 35% 30%, #bbf7d0, #22c55e 55%, #15803d); }
        .wb-orbit { animation: wbOrbit 4s linear infinite; }
        .wb-twinkle { animation: wbTwinkle 1.4s ease-in-out infinite; }
        .wb-shimmer { background: linear-gradient(90deg, #6b7280 0%, #111827 45%, #6b7280 60%); background-size: 200% 100%; -webkit-background-clip: text; background-clip: text; color: transparent; animation: wbShimmer 1.6s linear infinite; }
        .wb-pop { animation: wbPop .5s cubic-bezier(.2,.9,.3,1.2) both; }
      `}</style>

      {!compact && (
        <div className="mb-3 flex items-start gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px] bg-gray-900 text-white">
            <Wand2 size={17} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-semibold text-gray-900">Build a tool</h2>
            <p className="text-xs text-gray-500">Say how you price the job. {atlas.name} writes the questions and the math.</p>
          </div>
        </div>
      )}

      {!running && !finished && (
        <>
          <Textarea
            ref={boxRef}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            rows={compact ? 3 : 3}
            maxLength={4000}
            placeholder={placeholder ?? "e.g. Driveway pressure washing: $0.25 per sq ft, $150 minimum, sealant optional at $0.45 per sq ft"}
            className="w-full"
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canRun) void run(prompt);
            }}
          />
          {ask && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3">
              <p className="text-sm font-medium text-amber-900">{atlas.name} needs one thing first</p>
              <p className="mt-1 text-sm text-amber-900/90">{ask}</p>
              <Textarea value={answer} onChange={(e) => setAnswer(e.target.value)} rows={2} placeholder="Your answer" className="mt-2 w-full" />
            </div>
          )}
          {error && (
            <div role="alert" className="form-error mt-3">
              {error}
            </div>
          )}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-[11px] text-gray-500">{atlas.locked ? "Your Atlas tokens are used up for now." : "Uses Atlas tokens once. Running the tool is free."}</span>
            <button
              type="button"
              disabled={!canRun || (Boolean(ask) && answer.trim().length < 1)}
              onClick={() => void run(ask ? `${prompt}\n\n${atlas.name} asked: ${ask}\nOwner's answer: ${answer.trim()}` : prompt)}
              className="btn-primary h-10 justify-center"
            >
              <Sparkles size={15} />
              {ask ? "Continue" : estimatorId ? "Make the change" : "Build it"}
            </button>
          </div>
          {!compact && !estimatorId && !prompt && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {EXAMPLES.map((e) => (
                <button key={e} type="button" onClick={() => setPrompt(e)} className="rounded-full border border-gray-200 px-2.5 py-1 text-left text-[11px] text-gray-600 hover:bg-gray-50">
                  {e.split(":")[0]}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {showSteps && (
        <div className="flex flex-col items-center py-4 sm:flex-row sm:items-start sm:gap-6">
          {/* the orb */}
          <div className="relative mb-4 h-24 w-24 shrink-0 sm:mb-0">
            {finished ? (
              <div className="wb-pop flex h-24 w-24 items-center justify-center rounded-full bg-green-600 text-white shadow-lg">
                <Check size={40} strokeWidth={3} />
              </div>
            ) : (
              <>
                <div className="wb-orb-ring absolute inset-0 rounded-full" />
                <div className="wb-orb-core absolute inset-4 rounded-full shadow-inner" />
                <div className="wb-orbit absolute inset-[-6px]">
                  <span className="wb-twinkle absolute left-1/2 top-0 h-2 w-2 -translate-x-1/2 rounded-full bg-lime-300" />
                  <span className="wb-twinkle absolute bottom-1 right-2 h-1.5 w-1.5 rounded-full bg-sky-300" style={{ animationDelay: ".5s" }} />
                  <span className="wb-twinkle absolute left-1 top-1/2 h-1.5 w-1.5 rounded-full bg-emerald-200" style={{ animationDelay: ".9s" }} />
                </div>
              </>
            )}
          </div>
          {/* the steps */}
          <ol className="w-full max-w-sm space-y-2">
            {STEPS.map((s) => {
              const done = doneKeys.includes(s.key);
              const active = current?.key === s.key;
              return (
                <li key={s.key} className={`flex items-center gap-2.5 text-sm ${done ? "text-gray-700" : active ? "text-gray-900" : "text-gray-300"}`}>
                  <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${done ? "border-green-600 bg-green-600 text-white" : active ? "border-gray-900" : "border-gray-200"}`}>
                    {done ? <Check size={12} strokeWidth={3} /> : active ? <Loader2 size={12} className="animate-spin" /> : null}
                  </span>
                  <span className={active ? "wb-shimmer font-medium" : done ? "" : ""}>{active && current ? current.message.replace(/…$/, "") : stepLabel(s)}</span>
                </li>
              );
            })}
            {finished && (
              <li className="pt-2 text-sm text-gray-700">
                <span className="font-semibold text-gray-900">“{finished.name}” is ready.</span>
                {finished.sample && <> Sample job priced at ${finished.sample.subtotal.toFixed(2)} across {finished.sample.lines} line{finished.sample.lines === 1 ? "" : "s"}.</>}
                {finished.tokens > 0 && <span className="text-gray-500"> {finished.tokens.toLocaleString()} tokens.</span>}
                {finished.changes.length > 0 && (
                  <ul className="mt-1.5 space-y-0.5 text-xs text-gray-600">
                    {finished.changes.slice(0, 8).map((c) => (
                      <li key={c}>→ {c}</li>
                    ))}
                  </ul>
                )}
                {!compact && (
                  <button
                    type="button"
                    onClick={() => {
                      setFinished(null);
                      setPrompt("");
                    }}
                    className="mt-3 text-xs font-medium text-gray-700 underline-offset-2 hover:underline"
                  >
                    Build another
                  </button>
                )}
              </li>
            )}
          </ol>
        </div>
      )}
    </div>
  );
}
