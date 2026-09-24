"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Loader2, Zap } from "lucide-react";
import BottomSheet from "@/components/BottomSheet";
import { hapticImpact } from "@/lib/haptics";
import { postJson, GENERIC_ERROR } from "@/lib/safe-fetch";

/**
 * "Run automation" on a client / job / quote / invoice page — the manual.run
 * trigger's only doorway. Lists the company's active "you press Run on a
 * record" rules for this kind of record (GET /api/app/automations/runnable)
 * and runs the chosen one on this record (POST /api/app/automations/[id]/run).
 * Renders nothing at all when there are no such rules or the viewer isn't a
 * manager, so pages without automations look exactly as before.
 */

type Rule = { id: string; name: string };
type Result = { status: "ok" | "skipped" | "failed" | "waiting"; detail: string } | { error: string };

function resultLine(r: Result): string {
  if ("error" in r) return r.error;
  const detail = r.detail.replace(/^[a-z_]+: /, "");
  if (r.status === "ok") return `Done — ${detail}`;
  if (r.status === "waiting") return "Started — it's waiting on a later step";
  if (r.status === "skipped") return `Skipped — ${detail}`;
  return `Didn't finish — ${detail}`;
}

export default function RunAutomationMenu({
  entity,
  entityId,
  manager = true,
  className = "",
}: {
  entity: "contact" | "job" | "quote" | "invoice";
  entityId: string;
  /** Managers only — the routes 403 everyone else, so don't even ask. */
  manager?: boolean;
  className?: string;
}) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!manager) return;
    let alive = true;
    fetch(`/api/app/automations/runnable?entity=${entity}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((rows: unknown) => {
        if (alive && Array.isArray(rows)) setRules(rows.filter((r): r is Rule => !!r && typeof r.id === "string" && typeof r.name === "string"));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [entity, manager]);

  // Desktop dropdown closes on an outside click
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (wrap.current && !wrap.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  // The result line fades after a moment
  useEffect(() => {
    if (!result) return;
    const t = window.setTimeout(() => setResult(null), 6000);
    return () => window.clearTimeout(t);
  }, [result]);

  if (!manager || rules.length === 0) return null;

  async function run(rule: Rule) {
    hapticImpact("MEDIUM");
    setRunning(rule.id);
    setResult(null);
    const { ok, data } = await postJson<Result>(`/api/app/automations/${rule.id}/run`, { entityId });
    setRunning(null);
    setOpen(false);
    if (!data) setResult(GENERIC_ERROR);
    else if (!ok) setResult(("error" in data && data.error) || GENERIC_ERROR);
    else setResult(`${rule.name}: ${resultLine(data)}`);
  }

  const list = (
    <ul className="divide-y divide-gray-100">
      {rules.map((r) => (
        <li key={r.id}>
          <button
            type="button"
            disabled={running !== null}
            onClick={() => void run(r)}
            className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-gray-800 hover:bg-gray-50 disabled:opacity-60 lg:py-2"
          >
            {running === r.id ? <Loader2 size={14} className="animate-spin text-gray-400" /> : <Zap size={14} className="text-gray-400" />}
            <span className="min-w-0 flex-1 truncate">{r.name}</span>
          </button>
        </li>
      ))}
    </ul>
  );

  return (
    <div ref={wrap} className={`relative ${className}`}>
      <button
        type="button"
        onClick={() => {
          hapticImpact("LIGHT");
          setOpen((v) => !v);
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        title="Run automation"
        className="flex items-center gap-1.5 px-4 py-2 btn-tool-line bg-white text-gray-700 hover:bg-gray-50 text-sm font-semibold rounded-[10px] transition-colors"
      >
        {running ? <Loader2 size={14} className="animate-spin" /> : <Zap size={14} />}
        <span className="hidden sm:inline">Run automation</span>
      </button>

      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-1 hidden w-64 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg lg:block">
          {list}
        </div>
      )}

      <BottomSheet open={open} onClose={() => setOpen(false)} title="Run automation">
        {list}
      </BottomSheet>

      {result && (
        <p role="status" className="absolute right-0 top-full z-20 mt-1 flex max-w-xs items-start gap-1.5 rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-700 shadow-md">
          <Check size={12} className="mt-0.5 shrink-0 text-emerald-600" />
          <span>{result}</span>
        </p>
      )}
    </div>
  );
}
