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
  CornerDownRight,
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
import type { AtlasAccess, AtlasPricing } from "@/lib/assistant-access";

/** Meter state as the shell hands it over (lib/assistant-access.ts). */
export type AtlasDrawerAccess = AtlasAccess;

/** Fallback allowances if the shell didn't pass any — mirrors the env defaults. */
const DEFAULT_PRICING: AtlasPricing = { freeTokens: 10_000, planTokens: 150_000, planPriceCents: 2_000 };

/**
 * Owner assistant chat drawer (docs/plans/ai-assistant-plan.md). Reads are
 * answered directly; writes arrive as Proposal cards — nothing happens until
 * the user presses Confirm, which submits to the same existing API route the
 * equivalent button uses. History lives in sessionStorage only.
 *
 * Cards ride the console's own material: .card-ledger surface, a tinted
 * header band whose color says what kind of decision this is (brand accent
 * = ordinary change, amber = moves real money, red = permanent, green =
 * applied), the title in the display face, key/value ledger rows with
 * Oxanium numerals, and one solid pill to commit.
 *
 * Multi-step work: a reply can carry a queued next step (queue_next_step).
 * Once every card in that reply is confirmed the drawer sends the queued
 * instruction as the next turn by itself, shown as a "Continuing" line
 * rather than a bubble the user never typed.
 */

type CardState = "pending" | "confirming" | "done" | "failed" | "dismissed";

type CardProposal = Proposal & { state: CardState; resultNote?: string };

type Msg = {
  role: "user" | "assistant";
  content: string;
  proposals?: CardProposal[];
  /** Atlas tokens this reply cost (metered accounts: free tier + plan). */
  tokens?: number;
  /** Follow-up Atlas queued (queue_next_step) — the drawer sends it by
   *  itself once every card in this reply is confirmed. */
  nextStep?: string;
  /** The queued step already went out (or was dropped because a card was
   *  skipped) — never fire twice. */
  nextStepFired?: boolean;
  /** This user turn was sent by the drawer, not typed. */
  auto?: boolean;
  /** How many automatic turns led here — caps runaway chains. */
  autoDepth?: number;
};

/** Longest chain of self-sent turns before Atlas has to be asked again. */
const MAX_AUTO_CHAIN = 3;

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

function fmtPrice(cents: number): string {
  return cents % 100 === 0 ? `$${cents / 100}` : `$${(cents / 100).toFixed(2)}`;
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

/** Money, counts, dates and clock times get the console's Oxanium numerals. */
function isNumeral(v: string): boolean {
  const s = v.trim();
  return (
    /^[-–]?\$\d[\d,]*(\.\d+)?$/.test(s) ||
    /^\d[\d,]*(\.\d+)?(%| ?h| ?hrs?| ?min)?$/.test(s) ||
    /^\d{4}-\d{2}-\d{2}/.test(s) ||
    /^\d{1,2}:\d{2}/.test(s)
  );
}

const BATCH_PREVIEW = 5;

type Tone = "pending" | "money" | "danger" | "done" | "failed";

/** One decision, one color. Ordinary changes wear the brand accent, money
 *  is amber, permanent is red, applied is green — the header wash, the
 *  kicker and the commit button all draw from the same ink. */
const TONE: Record<Tone, { ink: string; solid: string; onSolid: string; kicker: string }> = {
  pending: {
    ink: "var(--wb-accent, #0b57d8)",
    solid: "var(--wb-accent, #0b57d8)",
    onSolid: "var(--wb-on-accent, #ffffff)",
    kicker: "Needs your OK",
  },
  money: { ink: "#b45309", solid: "#d97706", onSolid: "#ffffff", kicker: "Moves real money" },
  danger: { ink: "#b91c1c", solid: "#dc2626", onSolid: "#ffffff", kicker: "Permanent" },
  done: { ink: "#15803d", solid: "#16a34a", onSolid: "#ffffff", kicker: "Applied" },
  failed: { ink: "#b91c1c", solid: "#dc2626", onSolid: "#ffffff", kicker: "Didn't go through" },
};

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
  // "Save all 3", "Send all 12" — the verb's first word carries the batch
  const commitLabel = p.confirmLabel ?? (isBatch ? `${verb.split(" ")[0]} all ${batchCount}` : verb);

  if (p.state === "dismissed") {
    return (
      <div className="flex items-center gap-2 px-1 py-1 text-xs text-gray-400">
        <X size={12} className="shrink-0" />
        <span className="truncate line-through decoration-gray-300">{p.title}</span>
        <span className="ml-auto shrink-0">Skipped</span>
      </div>
    );
  }

  const tone: Tone =
    p.state === "done"
      ? "done"
      : p.state === "failed"
        ? "failed"
        : p.danger
          ? "danger"
          : p.money
            ? "money"
            : "pending";
  const t = TONE[tone];
  const kicker = tone === "pending" && isBatch ? `${batchCount} changes · needs your OK` : t.kicker;
  const lines = isBatch && !expanded ? p.lines.slice(0, BATCH_PREVIEW) : p.lines;
  const hidden = isBatch && !expanded ? Math.max(0, p.lines.length - BATCH_PREVIEW) : 0;
  const busy = p.state === "confirming";
  const open = p.state === "pending" || p.state === "confirming";

  return (
    <div className="card-ledger overflow-hidden" role="group" aria-label={p.title}>
      {/* header — a tinted band in the decision's color: kicker, then the
          title in the console's display face. Applied cards get the
          rubber-stamp ritual the approve flow already uses. */}
      <div
        className="flex items-start gap-3 px-3.5 pb-2.5 pt-3"
        style={{ background: `color-mix(in srgb, ${t.ink} 9%, transparent)` }}
      >
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold leading-none" style={{ color: t.ink }}>
            {tone === "done" ? <Check size={12} strokeWidth={3} /> : tone === "failed" ? <AlertTriangle size={12} /> : <Icon size={12} />}
            {kicker}
          </p>
          <p className="font-display mt-1.5 text-[14px] font-bold leading-snug text-gray-900">{p.title}</p>
        </div>
        {tone === "done" && (
          <span
            className="stamp-slam font-display mt-0.5 shrink-0 rounded-[4px] border-2 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
            style={{ borderColor: t.ink, color: t.ink }}
          >
            Done
          </span>
        )}
      </div>

      {/* body — key/value ledger rows, or a numbered preview for batches */}
      {lines.length > 0 && (
        <div className="px-3.5">
          {isBatch ? (
            <ol className="divide-y divide-gray-100">
              {lines.map((l, j) => (
                <li key={j} className="flex items-baseline gap-2 py-1.5 text-xs">
                  <span className="numeral-ledger w-4 shrink-0 text-right text-[11px] text-gray-400">{j + 1}</span>
                  <span className="min-w-0 truncate text-gray-700">{l}</span>
                </li>
              ))}
            </ol>
          ) : (
            <div className="divide-y divide-gray-100">
              {lines.map((l, j) => {
                const kv = splitLine(l);
                return kv ? (
                  <div key={j} className="flex items-baseline justify-between gap-3 py-1.5 text-xs">
                    <span className="shrink-0 text-gray-500">{kv.label}</span>
                    <span
                      className={`min-w-0 text-right font-medium text-gray-800 [overflow-wrap:anywhere] ${
                        isNumeral(kv.value) ? "numeral-ledger text-[13px]" : ""
                      }`}
                    >
                      {kv.value}
                    </span>
                  </div>
                ) : (
                  <p key={j} className="whitespace-pre-wrap py-1.5 text-xs leading-relaxed text-gray-700 [overflow-wrap:anywhere]">
                    {l}
                  </p>
                );
              })}
            </div>
          )}
          {hidden > 0 && (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center gap-1 border-t border-gray-100 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
            >
              <ChevronDown size={13} />
              Show all {p.lines.length}
            </button>
          )}
        </div>
      )}

      {/* typed confirmation for destructive cards */}
      {needsTyping && open && (
        <div className="mx-3.5 mt-1 border-t border-gray-100 pt-2.5">
          <label className="block text-xs" style={{ color: t.ink }}>
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

      {/* footer — quiet skip on the left, one solid commit on the right */}
      {open ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2.5">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="rounded-full px-2.5 py-1.5 text-xs font-medium text-gray-500 transition-colors hover:bg-gray-100 hover:text-gray-800 disabled:opacity-50"
          >
            Skip
          </button>
          <button
            type="button"
            disabled={busy || !armed}
            onClick={onConfirm}
            className="btn-tool flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold disabled:opacity-40"
            style={{ background: t.solid, color: t.onSolid }}
          >
            {busy ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} strokeWidth={2.5} />}
            {commitLabel}
          </button>
        </div>
      ) : p.state === "failed" ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-red-100 bg-red-50/60 px-3.5 py-2 text-xs font-medium text-red-700">
          <span className="min-w-0 truncate">{p.resultNote}</span>
          <button type="button" onClick={onConfirm} className="shrink-0 underline-offset-2 hover:underline">
            Try again
          </button>
        </div>
      ) : isBatch || p.href ? (
        <div className="mt-1.5 flex items-center justify-between gap-2 border-t border-gray-100 px-3.5 py-2 text-xs text-gray-500">
          <span className="min-w-0 truncate">{isBatch ? p.resultNote : "Saved"}</span>
          {p.href && (
            <Link href={p.href} className="flex shrink-0 items-center gap-1 font-medium text-gray-700 underline-offset-2 hover:underline">
              Open <ExternalLink size={11} />
            </Link>
          )}
        </div>
      ) : null}
    </div>
  );
}

// ── meter ────────────────────────────────────────────────────────────────────

/** Token meter above the composer — the free tier (monthly, refills on the
 *  1st) and the plan (monthly, refills on the billing day) share it. */
function TokenMeter({
  meter,
  free,
}: {
  meter: Extract<AtlasAccess, { level: "plan" | "free" }>["meter"];
  free: boolean;
}) {
  const pct = Math.min(100, Math.round((meter.used / Math.max(1, meter.included)) * 100));
  const low = meter.remaining <= meter.included * 0.1;
  return (
    <div className="mb-2 px-0.5">
      <div className="flex items-center justify-between text-[10px] font-semibold">
        <span className={`flex items-center gap-1 ${low ? "text-amber-600" : "text-gray-500"}`}>
          <Coins size={11} />
          {fmtTokens(meter.remaining)} of {fmtTokens(meter.included)} {free ? "free " : ""}tokens left
        </span>
        <span className="text-gray-400">refills {fmtDay(meter.refillsAt)}</span>
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
  pricing = DEFAULT_PRICING,
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
  /** Meter state from the server layout (lib/assistant-access.ts). */
  access?: AtlasDrawerAccess;
  /** The allowances (free tokens, plan tokens, plan price) — for copy. */
  pricing?: AtlasPricing;
}) {
  const router = useRouter();
  const storageKey = `sf-assistant-chat:${storageScope || "shared"}`;
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  // Server truth arrives as a prop; each send moves it locally so the drawer
  // reacts without waiting on a refresh.
  const [liveAccess, setLiveAccess] = useState<AtlasDrawerAccess>(access);
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

  /**
   * One turn. `auto` marks a turn the drawer sent itself (a queued next
   * step); `base` lets the caller hand over a fresher message list than the
   * closure has, so the fired flag it just wrote isn't overwritten.
   */
  async function send(text: string, opts: { auto?: boolean; depth?: number; base?: Msg[] } = {}) {
    const content = text.trim().slice(0, 4000);
    if (!content || loading) return;
    setError("");
    setInput("");
    const next: Msg[] = [...(opts.base ?? messages), { role: "user", content, ...(opts.auto ? { auto: true } : {}) }];
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
            nextStep?: string;
            error?: string;
            atlasLocked?: boolean;
            access?: AtlasDrawerAccess;
            turnTokens?: number;
          }
        | null;
      if (!res.ok || !data?.reply) {
        if (data?.access) setLiveAccess(data.access);
        else if (data?.atlasLocked)
          setLiveAccess({ level: "locked", reason: "free-spent", resetsAt: new Date().toISOString() });
        setError(data?.error ?? "Something went wrong — please try again.");
      } else {
        if (data.access) setLiveAccess(data.access);
        // metered accounts (free tier + plan) see what each reply cost; the
        // server sends 0 for whitelisted accounts
        const metered = typeof data.turnTokens === "number" && data.turnTokens > 0;
        persist([
          ...next,
          {
            role: "assistant",
            content: data.reply,
            proposals: (data.proposals ?? []).map((p) => ({ ...p, state: "pending" as const })),
            ...(metered ? { tokens: data.turnTokens } : {}),
            ...(data.nextStep && (data.proposals?.length ?? 0) > 0 ? { nextStep: data.nextStep } : {}),
            ...(opts.depth ? { autoDepth: opts.depth } : {}),
          },
        ]);
      }
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  // Queued next step: once every card in a reply is settled, the drawer
  // sends Atlas's own follow-up as the next turn. Fires only when every
  // card was applied — a skipped or failed card means the plan changed and
  // the user should steer. Depth-capped so a chain can't run away.
  const firedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (loading) return;
    const idx = messages.findIndex((m) => m.role === "assistant" && m.nextStep && !m.nextStepFired);
    if (idx < 0) return;
    const m = messages[idx];
    const cards = m.proposals ?? [];
    if (cards.length === 0 || cards.some((c) => c.state === "pending" || c.state === "confirming")) return;
    const key = `${idx}:${m.nextStep}`;
    if (firedRef.current.has(key)) return;
    firedRef.current.add(key);
    const marked = messages.map((x, i) => (i === idx ? { ...x, nextStepFired: true } : x));
    persist(marked);
    const depth = (m.autoDepth ?? 0) + 1;
    if (cards.every((c) => c.state === "done") && depth <= MAX_AUTO_CHAIN) {
      void send(m.nextStep!, { auto: true, depth, base: marked });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [messages, loading]);

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

  const locked = liveAccess.level === "locked";
  const planSpent = liveAccess.level === "locked" && liveAccess.reason === "plan-spent";
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
          {/* ── Out of tokens: a fresh drawer shows the spent-meter notice
                 (+ the plan upsell on the free tier); if a chat is already
                 on screen the messages stay and the input strip below
                 carries the notice instead. ── */}
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
                    {resetsAt ? ` Your ${fmtTokens(pricing.planTokens)} tokens refill on ${fmtDay(resetsAt)}.` : ""}
                  </p>
                </div>
              ) : (
                <div className="card-ledger p-4">
                  <div className="flex items-center gap-2">
                    <Coins size={15} className="text-amber-500" />
                    <p className="text-sm font-bold text-gray-900">This month&apos;s free tokens are used up.</p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    Every account gets {fmtTokens(pricing.freeTokens)} free tokens a month, and{" "}
                    {name} paused so it never spends past them.
                    {resetsAt ? ` Your next ${fmtTokens(pricing.freeTokens)} arrive on ${fmtDay(resetsAt)}.` : ""}
                  </p>
                </div>
              )}
              {!planSpent && (
                <div className="mt-3 rounded-2xl border border-dashed border-gray-300 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <Sparkles size={14} className="text-amber-500" />
                      <p className="text-sm font-bold text-gray-900">{name} Full</p>
                    </div>
                    <p className="numeral-ledger text-sm font-bold text-gray-900">
                      {fmtPrice(pricing.planPriceCents)}
                      <span className="text-[11px] font-semibold text-gray-400">/mo</span>
                    </p>
                  </div>
                  <p className="mt-1 text-xs leading-relaxed text-gray-500">
                    {fmtTokens(pricing.planTokens)} tokens every month, refilled on your billing day —
                    fifteen times the free tier, on the same meter, and {name} never spends past it.
                  </p>
                  <button
                    type="button"
                    disabled
                    className="mt-3 flex w-full cursor-not-allowed items-center justify-center gap-1.5 rounded-[10px] border border-gray-300 bg-gray-50 px-3 py-2 text-xs font-bold text-gray-400"
                  >
                    <Lock size={12} />
                    Coming soon
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
            m.role === "user" && m.auto ? (
              // a turn the drawer sent itself — a quiet continuation line,
              // not a bubble the user never typed
              <div key={i} className="flex items-start gap-1.5 px-0.5 py-1 text-[11px] leading-relaxed text-gray-500">
                <CornerDownRight size={12} className="mt-0.5 shrink-0" />
                <span>
                  <span className="font-semibold text-gray-600">Continuing on its own: </span>
                  {m.content}
                </span>
              </div>
            ) : m.role === "user" ? (
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
                    className="btn-tool flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-semibold"
                    style={{ background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" }}
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
                {m.nextStep && !m.nextStepFired && (
                  <p className="flex items-start gap-1.5 px-0.5 text-[11px] leading-relaxed text-gray-500">
                    <CornerDownRight size={12} className="mt-0.5 shrink-0" />
                    <span>
                      <span className="font-semibold text-gray-600">Then, on its own: </span>
                      {m.nextStep}
                    </span>
                  </p>
                )}
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
                : `${name} is out of free tokens for this month${resetsAt ? ` — refills ${fmtDay(resetsAt)}` : ""}.`}
            </p>
          </div>
        ) : (
        <div className="shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          {(liveAccess.level === "free" || liveAccess.level === "plan") && (
            <TokenMeter meter={liveAccess.meter} free={liveAccess.level === "free"} />
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
