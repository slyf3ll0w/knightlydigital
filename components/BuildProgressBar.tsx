"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, Check, ChevronRight, Loader2, MessageCircleQuestion, Sparkles, X } from "lucide-react";
import { BUILD_EVENT, readPanelShowing, readTrackedBuild, untrackBuild, type TrackedBuild } from "@/lib/build-tracker";
import { confirmSheet } from "@/components/ConfirmSheet";
import { hapticNotify } from "@/lib/haptics";

/** The one question before a build is dropped — shared with the builder panel. */
export function confirmCancelBuild(): Promise<boolean> {
  return confirmSheet({
    title: "Cancel this build?",
    message: "Atlas stops right away and nothing is saved. The tokens for the steps already finished are spent.",
    confirmLabel: "Cancel Build",
    destructive: true,
  });
}

/**
 * The app-wide "your tool is building" bar. Builds run on the server
 * (lib/estimator-build-jobs.ts), so the owner is free to leave the
 * Estimates page — this bar follows the build from anywhere in the app: a
 * glass strip above the phone tab bar / bottom-right on desktop, with the
 * step it's on, a thin progress line and Cancel. When the tool lands it
 * turns into "ready — Open"; on the page that shows the build itself it
 * stays hidden (that page has the full picture).
 */

type Phase = "plan" | "draft" | "check" | "fix" | "test" | "save";
type Ev = { phase?: Phase; message?: string; done?: true; tool?: { id?: string; name?: string }; error?: string; questions?: unknown[]; ask?: string };
type Reply = { status: "running" | "questions" | "done" | "error" | "cancelled"; events: Ev[]; toolId: string | null; estimatorId: string | null };

const STEP_INDEX: Record<Phase, number> = { plan: 1, draft: 2, fix: 2, check: 3, test: 4, save: 5 };
const STEPS = 5;
const POLL_MS = 2000;
/** How long a finished bar stays before clearing itself. */
const LINGER_MS = 30_000;

type View =
  | { kind: "running"; step: number; message: string }
  | { kind: "questions" }
  | { kind: "done"; toolId: string; name: string }
  | { kind: "error"; message: string }
  | { kind: "cancelled" };

function viewOf(r: Reply, fallback: string): View {
  if (r.status === "cancelled") return { kind: "cancelled" };
  if (r.status === "questions") return { kind: "questions" };
  const done = r.events.find((e) => e.done);
  if (r.status === "done" && (r.toolId || done?.tool?.id)) return { kind: "done", toolId: (r.toolId ?? done?.tool?.id) as string, name: done?.tool?.name ?? fallback };
  if (r.status === "error") {
    const err = [...r.events].reverse().find((e) => typeof e.error === "string");
    return { kind: "error", message: err?.error ?? "The build stopped." };
  }
  const last = [...r.events].reverse().find((e) => e.phase);
  return { kind: "running", step: last?.phase ? STEP_INDEX[last.phase] : 1, message: last?.message?.replace(/…$/, "") ?? "Starting" };
}

export default function BuildProgressBar() {
  const router = useRouter();
  const [build, setBuild] = useState<TrackedBuild | null>(null);
  const [panelShowing, setPanelShowingState] = useState<string | null>(null);
  const [view, setView] = useState<View | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const lingerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const announcedRef = useRef<string | null>(null);

  // follow whatever the builder recorded (this tab, or another tab via `storage`)
  useEffect(() => {
    const sync = () => {
      const next = readTrackedBuild();
      setBuild((prev) => (prev?.id === next?.id ? prev : next));
      setPanelShowingState(readPanelShowing());
      if (!next) setView(null);
    };
    sync();
    window.addEventListener(BUILD_EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(BUILD_EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);

  const clear = useCallback(() => {
    if (lingerRef.current) clearTimeout(lingerRef.current);
    lingerRef.current = null;
    untrackBuild();
    setBuild(null);
    setView(null);
  }, []);

  // poll the build while it runs; a finished build lingers, then clears itself
  useEffect(() => {
    if (!build) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const tick = async () => {
      if (stopped) return;
      let reply: Reply | null = null;
      try {
        const res = await fetch(`/api/app/estimators/build/${build.id}`, { cache: "no-store" });
        if (res.status === 404 || res.status === 403) {
          clear();
          return;
        }
        reply = res.ok ? ((await res.json()) as Reply) : null;
      } catch {
        reply = null;
      }
      if (stopped) return;
      if (reply) {
        const v = viewOf(reply, build.label);
        setView(v);
        if (v.kind !== "running" && v.kind !== "questions") {
          if (announcedRef.current !== build.id) {
            announcedRef.current = build.id;
            if (v.kind === "done") hapticNotify("SUCCESS");
          }
          if (v.kind === "cancelled") {
            clear();
            return;
          }
          if (!lingerRef.current) lingerRef.current = setTimeout(clear, LINGER_MS);
          return;
        }
      }
      timer = setTimeout(tick, document.visibilityState === "visible" ? POLL_MS : POLL_MS * 5);
    };
    void tick();
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [build, clear]);

  async function cancel() {
    if (!build || cancelling) return;
    if (!(await confirmCancelBuild())) return;
    setCancelling(true);
    try {
      await fetch(`/api/app/estimators/build/${build.id}`, { method: "DELETE" });
    } catch {
      /* the next poll tells the truth */
    }
    setCancelling(false);
    clear();
  }

  function open(href: string) {
    clear();
    router.push(href);
  }

  // The builder panel showing this very build has the whole picture — stay out of its way
  if (!build || !view || panelShowing === build.id) return null;

  const changing = Boolean(build.estimatorId);
  const title =
    view.kind === "done"
      ? `“${view.name}” is ready`
      : view.kind === "questions"
        ? "Atlas has a quick question"
        : view.kind === "error"
          ? "The build stopped"
          : view.kind === "cancelled"
            ? "Build cancelled"
            : `${changing ? "Changing" : "Building"} “${build.label}”`;
  const sub = view.kind === "running" ? view.message : view.kind === "questions" ? "Answer it on the Estimates page and the build carries on." : view.kind === "error" ? view.message : view.kind === "done" ? "Try it, publish it, or ask Atlas for changes." : "";
  const progress = view.kind === "running" ? view.step / STEPS : view.kind === "done" ? 1 : 0;

  // desktop: left of the Atlas bubble (bottom-6 right-6, 52 px) so the two never overlap
  return (
    <div className="pointer-events-none fixed inset-x-3 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-40 lg:inset-x-auto lg:bottom-6 lg:right-[92px] lg:w-[380px]" role="status" aria-live="polite">
      <div className="sheet-material pointer-events-auto overflow-hidden rounded-2xl border border-white/60 shadow-[0_10px_30px_rgba(15,23,42,0.18)] dark:border-white/10">
        <div className="flex items-center gap-3 px-3.5 py-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-green-500/10 text-green-700" aria-hidden>
            {view.kind === "running" ? <Loader2 size={17} className="animate-spin" /> : view.kind === "done" ? <Check size={17} strokeWidth={2.5} /> : view.kind === "questions" ? <MessageCircleQuestion size={17} /> : view.kind === "error" ? <AlertTriangle size={17} /> : <Sparkles size={17} />}
          </span>
          <button
            type="button"
            onClick={() => open(view.kind === "done" ? `/app/estimates/${view.toolId}?s=try` : build.home)}
            className="min-w-0 flex-1 text-left"
          >
            <span className="block truncate text-[14px] font-semibold text-gray-900">{title}</span>
            {sub && <span className={`block truncate text-xs text-gray-600 ${view.kind === "running" ? "atlas-shimmer" : ""}`}>{sub}</span>}
          </button>
          {view.kind === "running" || view.kind === "questions" ? (
            <button type="button" onClick={() => void cancel()} disabled={cancelling} className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-gray-300/70 bg-white/60 px-2.5 text-xs font-semibold text-gray-700 hover:bg-white disabled:opacity-50" aria-label="Cancel the build">
              {cancelling ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />} Cancel
            </button>
          ) : view.kind === "done" ? (
            <button type="button" onClick={() => open(`/app/estimates/${view.toolId}?s=try`)} className="btn-primary h-8 shrink-0 justify-center rounded-full px-3 text-xs">
              Open <ChevronRight size={13} />
            </button>
          ) : (
            <button type="button" onClick={clear} className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-white/60" aria-label="Dismiss">
              <X size={15} />
            </button>
          )}
        </div>
        {(view.kind === "running" || view.kind === "done") && (
          <div className="h-[3px] w-full bg-gray-200/60" aria-hidden>
            <div className="h-full bg-green-600 transition-[width] duration-700 ease-out" style={{ width: `${Math.max(6, Math.round(progress * 100))}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
