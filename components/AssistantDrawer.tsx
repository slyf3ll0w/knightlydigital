"use client";

import { Fragment, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowUp,
  Check,
  ChevronDown,
  Clock,
  Coins,
  Copy,
  CreditCard,
  ExternalLink,
  Loader2,
  Lock,
  PencilLine,
  Plus,
  RotateCcw,
  Route,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import AtlasIcon, { AtlasMark } from "@/components/AtlasIcon";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import type { Proposal } from "@/lib/assistant";
import type { AtlasAccess } from "@/lib/assistant-access";

/** Paywall / meter state as the shell hands it over (lib/assistant-access.ts). */
export type AtlasDrawerAccess = AtlasAccess;

/**
 * Owner assistant chat drawer (docs/plans/ai-assistant-plan.md). Reads are
 * answered directly; writes arrive as Proposal cards — nothing happens until
 * the user presses Confirm, which submits to the same existing API route the
 * equivalent button uses. History lives in sessionStorage only.
 *
 * Cards ride the console's own material: .card-ledger surface, a status
 * stamp, key/value ledger rows, verb-specific commit buttons, and a colored
 * rule that says what kind of decision this is (accent = ordinary change,
 * amber = moves real money, red = permanent).
 */

type CardState = "pending" | "confirming" | "done" | "failed" | "dismissed";

type CardProposal = Proposal & { state: CardState; resultNote?: string };

type Msg = {
  role: "user" | "assistant";
  content: string;
  proposals?: CardProposal[];
  /** Atlas tokens this reply cost (metered accounts: trial + plan). */
  tokens?: number;
};

const STARTERS = [
  "What needs my attention right now?",
  "What's on the schedule today?",
  "Which clients owe us the most, and how old is it?",
  "Draft a friendly follow-up for last week's unanswered quotes.",
];

function loadHistory(key: string): Msg[] {
  try {
    const raw = sessionStorage.getItem(key);
    const parsed = raw ? (JSON.parse(raw) as Msg[]) : [];
    return Array.isArray(parsed) ? parsed.slice(-30) : [];
  } catch {
    return [];
  }
}

function fmtTokens(n: number): string {
  return n.toLocaleString("en-US");
}

function fmtDay(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

/** Render /app/... paths in assistant text as real links. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(/(\/app\/[a-z0-9\-/?=&]*)/g);
  return (
    <>
      {parts.map((part, i) =>
        part.startsWith("/app/") ? (
          <Link key={i} href={part} className="font-medium text-green-700 underline underline-offset-2">
            {part}
          </Link>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        )
      )}
    </>
  );
}

// ── proposal card ────────────────────────────────────────────────────────────

/** Icon + default verb from the proposal kind — tools set confirmLabel when
 *  the generic verb would read wrong. */
function kindMeta(p: Proposal): { Icon: typeof Plus; verb: string } {
  const k = p.kind;
  if (p.danger || /^delete_|^remove_/.test(k)) return { Icon: Trash2, verb: "Delete" };
  if (/charge|refund|payout|bill/.test(k)) return { Icon: CreditCard, verb: "Confirm" };
  if (/^email_|^send_|^reply_|^post_|^collect_deposit|^respond_/.test(k)) return { Icon: Send, verb: "Send" };
  if (/^duplicate_/.test(k)) return { Icon: Copy, verb: "Duplicate" };
  if (/^clock|time_entry|time_block/.test(k)) return { Icon: Clock, verb: "Confirm" };
  if (/route/.test(k)) return { Icon: Route, verb: "Apply" };
  if (/^create_|^add_|^log_|^schedule_|^record_|^convert_/.test(k)) return { Icon: Plus, verb: "Create" };
  if (/^update_|^set_|^move_|^manage_|^assign_|^close_|^cancel_|^undo_|^default_/.test(k)) return { Icon: PencilLine, verb: "Save changes" };
  return { Icon: Sparkles, verb: "Confirm" };
}

/** "Client: Sarah Lane" → a ledger row; anything else → a plain line. */
function splitLine(line: string): { label: string; value: string } | null {
  const m = /^([A-Za-z][A-Za-z0-9 /&()'-]{0,30}):\s+(.+)$/.exec(line);
  if (!m) return null;
  return { label: m[1], value: m[2] };
}

const BATCH_PREVIEW = 5;

function ProposalCard({
  proposal: p,
  onConfirm,
  onCancel,
}: {
  proposal: CardProposal;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const [expanded, setExpanded] = useState(false);
  const needsTyping = Boolean(p.confirmText);
  const armed = !needsTyping || typed.trim().toLowerCase() === p.confirmText!.trim().toLowerCase();
  const { Icon, verb } = kindMeta(p);
  const batchCount = p.batch?.length ?? 0;
  const isBatch = batchCount > 0;
  const commitLabel = p.confirmLabel ?? (isBatch ? `${verb} all ${batchCount}` : verb);

  if (p.state === "dismissed") {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-gray-400">
        <X size={12} className="shrink-0" />
        <span className="truncate line-through decoration-gray-300">{p.title}</span>
        <span className="ml-auto shrink-0">Skipped</span>
      </div>
    );
  }

  const tone =
    p.state === "done"
      ? "done"
      : p.state === "failed"
        ? "failed"
        : p.danger
          ? "danger"
          : p.money
            ? "money"
            : "pending";
  const rule =
    tone === "done"
      ? "#16a34a"
      : tone === "failed"
        ? "#dc2626"
        : tone === "danger"
          ? "#dc2626"
          : tone === "money"
            ? "#d97706"
            : "var(--wb-accent, #0b57d8)";
  const stamp =
    tone === "done"
      ? { label: "Done", cls: "text-green-700" }
      : tone === "failed"
        ? { label: "Didn't go through", cls: "text-red-700" }
        : tone === "danger"
          ? { label: "Permanent", cls: "text-red-700" }
          : tone === "money"
            ? { label: "Moves real money", cls: "text-amber-700" }
            : isBatch
              ? { label: `${batchCount} changes`, cls: "text-blue-700" }
              : { label: "Needs your OK", cls: "text-blue-700" };
  const iconTone =
    tone === "danger" || tone === "failed"
      ? "text-red-600"
      : tone === "money"
        ? "text-amber-600"
        : tone === "done"
          ? "text-green-600"
          : "text-gray-500";

  const lines = isBatch && !expanded ? p.lines.slice(0, BATCH_PREVIEW) : p.lines;
  const hidden = isBatch && !expanded ? Math.max(0, p.lines.length - BATCH_PREVIEW) : 0;
  const busy = p.state === "confirming";

  return (
    <div
      className="card-ledger overflow-hidden"
      style={{ borderLeft: `3px solid ${rule}` }}
      role="group"
      aria-label={p.title}
    >
      {/* header */}
      <div className="flex items-start gap-2.5 px-3.5 pb-2 pt-3">
        <span
          className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[8px] bg-gray-50 ${iconTone}`}
        >
          {p.state === "done" ? <Check size={15} strokeWidth={2.5} /> : <Icon size={15} />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[13px] font-semibold leading-snug text-gray-900">{p.title}</p>
          <span className={`stamp mt-1 ${stamp.cls}`}>{stamp.label}</span>
        </div>
      </div>

      {/* ledger rows */}
      {lines.length > 0 && (
        <div className="mx-3.5 divide-y divide-gray-100 border-t border-gray-100">
          {lines.map((l, j) => {
            const kv = isBatch ? null : splitLine(l);
            return kv ? (
              <div key={j} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                <span className="shrink-0 text-gray-500">{kv.label}</span>
                <span className="min-w-0 text-right font-medium text-gray-800 [overflow-wrap:anywhere]">
                  {kv.value}
                </span>
              </div>
            ) : (
              <p
                key={j}
                className={`py-1.5 text-xs leading-relaxed text-gray-700 [overflow-wrap:anywhere] ${
                  isBatch ? "truncate" : "whitespace-pre-wrap"
                }`}
              >
                {l}
              </p>
            );
          })}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-1 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              <ChevronDown size={13} />
              Show all {p.lines.length}
            </button>
          )}
        </div>
      )}

      {/* typed confirmation for destructive cards */}
      {needsTyping && (p.state === "pending" || p.state === "confirming") && (
        <div className="mx-3.5 mt-2 border-t border-gray-100 pt-2.5">
          <label className="block text-xs text-red-700">
            Type <span className="font-semibold">{p.confirmText}</span> to allow this
            <input
              type="text"
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={p.confirmText}
              autoComplete="off"
              className="mt-1.5 w-full rounded-[8px] border border-red-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 focus:outline-none focus:ring-2 focus:ring-red-300"
            />
          </label>
        </div>
      )}

      {/* footer */}
      {p.state === "pending" || p.state === "confirming" ? (
        <div className="mt-2.5 flex items-center justify-end gap-1.5 border-t border-gray-100 bg-gray-50/60 px-3 py-2">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full px-3 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={busy || !armed}
            onClick={onConfirm}
            className={`btn-tool flex items-center gap-1.5 rounded-[10px] px-3 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 ${
              tone === "danger"
                ? "bg-red-600 hover:bg-red-700"
                : tone === "money"
                  ? "bg-amber-500 hover:bg-amber-600"
                  : "bg-green-500 hover:bg-green-600"
            }`}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            {commitLabel}
          </button>
        </div>
      ) : (
        <div
          className={`mt-2.5 flex items-center justify-between gap-2 border-t px-3.5 py-2 text-xs font-medium ${
            p.state === "done" ? "border-green-100 bg-green-50/70 text-green-700" : "border-red-100 bg-red-50/70 text-red-700"
          }`}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {p.state === "done" ? <Check size={13} strokeWidth={2.5} /> : <AlertTriangle size={13} />}
            <span className="truncate">{p.resultNote}</span>
          </span>
          {p.state === "done" && p.href && (
            <Link href={p.href} className="flex shrink-0 items-center gap-1 text-green-800 underline-offset-2 hover:underline">
              Open <ExternalLink size={11} />
            </Link>
          )}
          {p.state === "failed" && (
            <button type="button" onClick={onConfirm} className="shrink-0 text-red-800 underline-offset-2 hover:underline">
              Try again
            </button>
          )}
        </div>
      )}
    </div>
  );
}

// ── meter ────────────────────────────────────────────────────────────────────

/** Token meter above the composer — the trial (one-time allowance) and the
 *  plan (monthly, refills) share it; only the right-hand note differs. */
function TokenMeter({
  meter,
  trial,
}: {
  meter: Extract<AtlasAccess, { level: "plan" | "trial" }>["meter"];
  trial: boolean;
}) {
  const pct = Math.min(100, Math.round((meter.used / Math.max(1, meter.included)) * 100));
  const low = meter.remaining <= meter.included * 0.1;
  return (
    <div className="mb-2 px-0.5">
      <div className="flex items-center justify-between text-[10px] font-semibold">
        <span className={`flex items-center gap-1 ${low ? "text-amber-600" : "text-gray-500"}`}>
          <Coins size={11} />
          {fmtTokens(meter.remaining)} of {fmtTokens(meter.included)} {trial ? "free " : ""}tokens left
        </span>
        <span className="text-gray-400">
          {trial ? "Full plan coming soon" : meter.refillsAt ? `refills ${fmtDay(meter.refillsAt)}` : ""}
        </span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full transition-[width] duration-500"
          style={{ width: `${pct}%`, background: low ? "#d97706" : "var(--wb-accent, #0b57d8)" }}
        />
      </div>
    </div>
  );
}

// ── drawer ───────────────────────────────────────────────────────────────────

export default function AssistantDrawer({
  open,
  onClose,
  name = "Atlas",
  storageScope = "",
  accent,
  access = { level: "full" },
  trialTokens = 10000,
  canStartTrial = false,
}: {
  open: boolean;
  onClose: () => void;
  /** Display name — company-customizable in Settings; defaults to Atlas. */
  name?: string;
  /** User id — history is keyed per user so switching accounts in the same
   *  tab never shows someone else's conversation. */
  storageScope?: string;
  /** Company brand accent for the Atlas mark; defaults to Streamflaire green. */
  accent?: string;
  /** Paywall / meter state from the server layout (lib/assistant-access.ts). */
  access?: AtlasDrawerAccess;
  /** Tokens in the one-time free trial allowance — paywall copy. */
  trialTokens?: number;
  /** Owners/admins can start the company's free trial. */
  canStartTrial?: boolean;
}) {
  const router = useRouter();
  const storageKey = `sf-assistant-chat:${storageScope || "shared"}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Server truth arrives as a prop; sends and trial-start move it locally so
  // the drawer reacts without waiting on a refresh.
  const [liveAccess, setLiveAccess] = useState<AtlasDrawerAccess>(access);
  const [startingTrial, setStartingTrial] = useState(false);
  useEffect(() => setLiveAccess(access), [access]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      sessionStorage.removeItem("sf-assistant-chat"); // pre-scoping key — held cross-account history
    } catch {
      // ignore
    }
    setMessages(loadHistory(storageKey));
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      inputRef.current?.focus();
      bottomRef.current?.scrollIntoView();
    }
  }, [open]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  function persist(updater: Msg[] | ((prev: Msg[]) => Msg[])) {
    setMessages((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        sessionStorage.setItem(storageKey, JSON.stringify(next.slice(-30)));
      } catch {
        // storage full/blocked — chat still works for the session
      }
      return next;
    });
  }

  async function send(text: string) {
    const content = text.trim().slice(0, 4000);
    if (!content || loading) return;
    setError("");
    setInput("");
    const next: Msg[] = [...messages, { role: "user", content }];
    persist(next);
    setLoading(true);
    try {
      const res = await fetch("/api/app/assistant", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // strip proposals from what we send — the model only needs the text
        body: JSON.stringify({ messages: next.map((m) => ({ role: m.role, content: m.content })) }),
      });
      const data = (await res.json().catch(() => null)) as
        | {
            reply?: string;
            proposals?: Proposal[];
            error?: string;
            atlasLocked?: boolean;
            access?: AtlasDrawerAccess;
            turnTokens?: number;
          }
        | null;
      if (!res.ok || !data?.reply) {
        if (data?.access) setLiveAccess(data.access);
        else if (data?.atlasLocked) setLiveAccess({ level: "locked", trialUsed: true, reason: "trial-ended" });
        setError(data?.error ?? "Something went wrong — please try again.");
      } else {
        if (data.access) setLiveAccess(data.access);
        // metered accounts (trial + plan) see what each reply cost; the
        // server sends 0 for whitelisted accounts
        const metered = typeof data.turnTokens === "number" && data.turnTokens > 0;
        persist([
          ...next,
          {
            role: "assistant",
            content: data.reply,
            proposals: (data.proposals ?? []).map((p) => ({ ...p, state: "pending" as const })),
            ...(metered ? { tokens: data.turnTokens } : {}),
          },
        ]);
      }
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  function setCard(msgIdx: number, propId: string, patch: Partial<{ state: CardState; resultNote: string }>) {
    persist((prev) =>
      prev.map((m, i) =>
        i === msgIdx
          ? { ...m, proposals: m.proposals?.map((p) => (p.id === propId ? { ...p, ...patch } : p)) }
          : m
      )
    );
  }

  /** Run one staged request; returns null on success, an error message on failure. */
  async function submitOne(item: { endpoint: string; method: string; payload: Record<string, unknown> }) {
    try {
      const hasBody = Object.keys(item.payload).length > 0;
      const res = await fetch(item.endpoint, {
        method: item.method,
        ...(hasBody
          ? { headers: { "Content-Type": "application/json" }, body: JSON.stringify(item.payload) }
          : {}),
      });
      if (res.ok) return null;
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      return data?.error ?? "That didn't go through — try it from the page instead.";
    } catch {
      return "Network error — nothing was saved.";
    }
  }

  async function confirm(msgIdx: number, prop: Proposal, opts?: { skipRefresh?: boolean }) {
    setCard(msgIdx, prop.id, { state: "confirming" });
    hapticImpact("LIGHT");
    // batch card: one Confirm, many requests, run in order
    if (prop.batch && prop.batch.length > 0) {
      let ok = 0;
      let firstError = "";
      for (const item of prop.batch) {
        const err = await submitOne(item);
        if (err === null) ok++;
        else if (!firstError) firstError = err;
      }
      const failed = prop.batch.length - ok;
      setCard(msgIdx, prop.id, {
        state: failed === 0 ? "done" : "failed",
        resultNote:
          failed === 0
            ? `All ${ok} applied`
            : `${ok} of ${prop.batch.length} applied — ${failed} failed (${firstError})`,
      });
      hapticNotify(failed === 0 ? "SUCCESS" : "ERROR");
      if (!opts?.skipRefresh) router.refresh();
      return;
    }
    const err = await submitOne(prop);
    if (err !== null) {
      setCard(msgIdx, prop.id, { state: "failed", resultNote: err });
      hapticNotify("ERROR");
    } else {
      setCard(msgIdx, prop.id, { state: "done", resultNote: "Done" });
      hapticNotify("SUCCESS");
      if (!opts?.skipRefresh) router.refresh();
    }
  }

  /** Confirm every pending ordinary card in one message, in order. Danger and
   *  money cards stay individual — each needs its own decision. */
  async function confirmAll(msgIdx: number, props: CardProposal[]) {
    for (const p of props) {
      if (p.state !== "pending" || p.danger || p.money) continue;
      await confirm(msgIdx, p, { skipRefresh: true });
    }
    router.refresh();
  }

  function reset() {
    persist([]);
    setError("");
    setInput("");
    inputRef.current?.focus();
  }

  async function startTrial() {
    if (startingTrial) return;
    setError("");
    setStartingTrial(true);
    try {
      const res = await fetch("/api/app/assistant/trial", { method: "POST" });
      const data = (await res.json().catch(() => null)) as
        | { success?: boolean; tokens?: number; error?: string }
        | null;
      if (!res.ok || !data?.success) {
        setError(data?.error ?? "Couldn't start the trial — please try again.");
        return;
      }
      const included = data.tokens ?? trialTokens;
      setLiveAccess({
        level: "trial",
        meter: { included, used: 0, remaining: included, refillsAt: null },
      });
      router.refresh();
    } catch {
      setError("Couldn't start the trial — please try again.");
    } finally {
      setStartingTrial(false);
    }
  }

  const locked = liveAccess.level === "locked";
  const lockReason = liveAccess.level === "locked" ? liveAccess.reason : null;
  const trialEnded = lockReason === "trial-ended";
  const planSpent = lockReason === "plan-spent";
  const resetsAt = liveAccess.level === "locked" ? liveAccess.resetsAt : undefined;

  if (!open) return null;
  return (
    <>
      {/* backdrop (mobile emphasis; click closes everywhere) */}
      <div className="drawer-scrim-in fixed inset-0 z-40 bg-black/20 sm:bg-black/10" onClick={onClose} />
      <div className="drawer-slide-in fixed inset-y-0 right-0 z-50 flex w-full max-w-full flex-col border-l border-gray-200 bg-paper-plain pt-[env(safe-area-inset-top)] shadow-2xl sm:w-[400px]">
        {/* No header bar — the empty state introduces Atlas, so the chrome is
            just two floating controls. White circles with a border so they
            stay visible over any message content. */}
        <div
          className="absolute right-3 z-10 flex items-center gap-2"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              title="New chat"
              className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <RotateCcw size={16} />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <X size={20} strokeWidth={2.2} />
          </button>
        </div>

        {/* messages — top padding clears the floating controls */}
        <div className="flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-14">
          {/* ── Paywall: Atlas is a premium add-on. Fresh drawer shows the
                 trial offer / Coming-Soon upsell / spent-meter notice; if a
                 chat is already on screen the messages stay and the input
                 strip below carries the notice instead. ── */}
          {locked && messages.length === 0 && (
            <div className="pt-2">
              <div className="mb-6 text-center">
                <AtlasMark size={52} accent={accent} className="mx-auto mb-3" />
                <p className="font-display text-base font-bold text-gray-900">
                  Meet {name}.
                </p>
                <p className="mx-auto mt-1 max-w-[290px] text-xs leading-relaxed text-gray-500">
                  Your AI teammate for the whole business — schedule, money, clients, routes,
                  and agreements. Ask anything, or hand off the busywork and confirm each action
                  before it happens.
                </p>
              </div>
              {planSpent ? (
                <div className="card-ledger p-4">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-500" />
                    <p className="text-sm font-bold text-gray-900">This period&apos;s tokens are used up.</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {name} paused so your plan never spends past its allowance.
                    {resetsAt ? ` Your tokens refill on ${fmtDay(resetsAt)}.` : ""}
                  </p>
                </div>
              ) : !trialEnded ? (
                <div className="card-ledger p-4">
                  <div className="flex items-center gap-2">
                    <Sparkles size={15} className="text-amber-500" />
                    <p className="text-sm font-bold text-gray-900">Try {name} free</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {fmtTokens(trialTokens)} tokens on us — no card needed, right on your free plan.
                    Quick questions cost a few tokens, big jobs cost more, and every reply shows
                    what it used.
                  </p>
                  {canStartTrial ? (
                    <button
                      type="button"
                      onClick={startTrial}
                      disabled={startingTrial}
                      className="btn-tool mt-3 flex w-full items-center justify-center gap-1.5 rounded-[10px] bg-green-500 px-3 py-2 text-xs font-semibold transition-colors hover:bg-green-600 disabled:opacity-50"
                    >
                      {startingTrial ? (
                        <Loader2 size={12} className="animate-spin" />
                      ) : (
                        <Sparkles size={12} />
                      )}
                      Start my free trial
                    </button>
                  ) : (
                    <p className="mt-3 rounded-lg bg-gray-50 px-3 py-2 text-xs text-gray-500">
                      Ask your account owner or an admin to start the free trial.
                    </p>
                  )}
                </div>
              ) : (
                <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4">
                  <p className="text-sm font-bold text-amber-900">Your free trial tokens are used up.</p>
                  <p className="mt-1 text-xs leading-relaxed text-amber-800">
                    Thanks for trying {name} — the full plan is almost here.
                  </p>
                </div>
              )}
              {!planSpent && (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 p-4">
                  <div className="flex items-center gap-2">
                    <Lock size={14} className="text-gray-400" />
                    <p className="text-sm font-bold text-gray-900">{name} Full</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    A monthly token allowance that refills — the same meter as the trial, and{" "}
                    {name} never spends past it. Every tool, the whole business on tap.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-3 w-full cursor-not-allowed rounded-[10px] border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-400"
                  >
                    Coming Soon!
                  </button>
                </div>
              )}
            </div>
          )}
          {!locked && messages.length === 0 && (
            <div className="pt-2">
              <div className="mb-6 text-center">
                <AtlasMark size={52} accent={accent} className="mx-auto mb-3" />
                <p className="font-display text-base font-bold text-gray-900">
                  Hi, I&apos;m {name}.
                </p>
                <p className="mx-auto mt-1 max-w-[290px] text-xs leading-relaxed text-gray-500">
                  Ask me anything about your business — schedule, money, clients, routes, hours,
                  and agreements. With your confirmation I can also manage clients, quotes,
                  invoices, jobs, payments, your team, and your settings — one record or a
                  hundred at a time.
                </p>
              </div>
              <p className="mb-2 px-0.5 text-[11px] font-semibold text-gray-400">
                Try asking
              </p>
              <div className="space-y-2">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => send(s)}
                    className="block w-full rounded-xl border border-gray-200 bg-white px-3.5 py-2.5 text-left text-xs text-gray-700 shadow-sm transition-colors hover:border-green-500 hover:text-green-700"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div
                key={i}
                className="ml-auto w-fit max-w-[85%] rounded-2xl rounded-br-md bg-green-600 px-3.5 py-2"
              >
                {/* No text-white here — the accent bridge puts the readable
                    on-accent ink on bg-green-600 (light brand colors get dark
                    ink); hardcoding white broke light-brand companies */}
                <p className="whitespace-pre-wrap text-sm font-medium">{m.content}</p>
              </div>
            ) : (
              <div key={i} className="mr-4 space-y-2">
                {/* Atlas speaks in plain text, not a boxed bubble (Claude-app
                    pattern) — only his action cards get containers. */}
                <div className="px-0.5 py-1">
                  <p className="whitespace-pre-wrap text-sm leading-relaxed text-gray-800">
                    <Linkified text={m.content} />
                  </p>
                  {typeof m.tokens === "number" && (
                    <p className="mt-1 flex items-center gap-1 text-[10px] text-gray-400">
                      <Coins size={10} />
                      {fmtTokens(m.tokens)} tokens
                    </p>
                  )}
                </div>
                {(m.proposals?.filter((p) => p.state === "pending" && !p.danger && !p.money).length ?? 0) >= 2 && (
                  <button
                    type="button"
                    onClick={() => confirmAll(i, m.proposals ?? [])}
                    className="btn-tool flex items-center gap-1.5 rounded-[10px] bg-green-500 px-3 py-1.5 text-xs font-semibold transition-colors hover:bg-green-600"
                  >
                    <Check size={12} strokeWidth={2.5} />
                    Confirm all ({m.proposals!.filter((p) => p.state === "pending" && !p.danger && !p.money).length})
                  </button>
                )}
                {m.proposals?.map((p) => (
                  <ProposalCard
                    key={p.id}
                    proposal={p}
                    onConfirm={() => confirm(i, p)}
                    onCancel={() => setCard(i, p.id, { state: "dismissed" })}
                  />
                ))}
              </div>
            )
          )}
          {loading && (
            <div className="mr-4 flex items-center gap-2 px-1 py-2">
              {/* The compass hunts for a heading while Atlas works — his own
                  mark doing the thinking, not a generic spinner */}
              <AtlasIcon size={15} thinking className="text-green-600" />
              <span className="atlas-shimmer text-xs text-gray-500">Looking that up...</span>
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
          <div ref={bottomRef} />
        </div>

        {/* input — or the notice strip once the paywall is down */}
        {locked ? (
          <div className="shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            <p className="text-center text-xs font-semibold text-gray-600">
              {planSpent
                ? `${name} is out of tokens for this period${resetsAt ? ` — refills ${fmtDay(resetsAt)}` : ""}.`
                : trialEnded
                  ? `Your free trial tokens are used up — ${name} Full is coming soon!`
                  : `Start the free trial above to chat with ${name}.`}
            </p>
          </div>
        ) : (
        <div className="shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {(liveAccess.level === "trial" || liveAccess.level === "plan") && (
            <TokenMeter meter={liveAccess.meter} trial={liveAccess.level === "trial"} />
          )}
          <div className="flex items-end gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              maxLength={4000}
              placeholder={`Ask ${name}, or tell it what to do...`}
              className="max-h-32 min-h-[42px] flex-1 resize-none rounded-2xl border border-gray-300 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
            />
            <button
              type="button"
              onClick={() => {
                hapticImpact("LIGHT");
                send(input);
              }}
              disabled={loading || !input.trim()}
              aria-label="Send"
              className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-green-600 transition-colors hover:bg-green-500 disabled:opacity-40"
            >
              <ArrowUp size={17} strokeWidth={2.4} />
            </button>
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            AI answers can be wrong — verify anything important on its page.
          </p>
        </div>
        )}
      </div>
    </>
  );
}
