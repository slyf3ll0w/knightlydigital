"use client";

import { GENERIC_ERROR } from "@/lib/safe-fetch";
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
  Flag,
  Loader2,
  Lock,
  Mic,
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
import AssistantVoice, { type RecordedExchange, type VoiceTurn } from "@/components/AssistantVoice";
import { ProposalCard, voiceConfirmable, type CardProposal, type CardState, type PlacedCard } from "@/components/AssistantCard";
import { micPlatform, requestMicrophone, type MicState } from "@/lib/voice-chat-client";
import { primeLiveAudio } from "@/lib/live-voice-client";
import { voiceLogLines } from "@/lib/voice-log";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { money } from "@/lib/statuses";
import { useMeasuredHeight } from "@/lib/use-measured-height";
import type { Proposal } from "@/lib/assistant";
// Only estimate-tool cards need the runner — keep it out of the drawer's first paint
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
 * Lexend numerals, and one solid pill to commit.
 *
 * Multi-step work: a reply can carry a queued next step (queue_next_step).
 * Once every card in that reply is confirmed the drawer sends the queued
 * instruction as the next turn by itself, shown as a "Continuing" line
 * rather than a bubble the user never typed.
 */


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
  /** What Atlas looked up for this reply (ids, names) — sent back with the
   *  next turns so "it" / "that call" resolve to the same record. */
  recap?: string;
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
  return money(cents / 100);
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
  // The live voice session records exchanges from socket callbacks (stale
  // closures) — it reads the latest list from here, not from `messages`.
  const messagesRef = useRef<Msg[]>([]);
  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  // What Atlas is doing right now ("Looking up clients…") — streamed from the
  // route as each tool round starts, so a long turn reads as work, not a hang
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  // Voice mode: a full-panel overlay that talks and listens (AssistantVoice);
  // every turn still lands in this chat underneath it.
  const [voiceOpen, setVoiceOpen] = useState(false);
  // "Report this conversation": a sentence from the user + the whole chat,
  // cards, recaps and the voice diary → a ticket we can read in the database.
  const [reportOpen, setReportOpen] = useState(false);
  const [reportNote, setReportNote] = useState("");
  const [reportState, setReportState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [reportError, setReportError] = useState("");
  const reportFromVoice = useRef(false);

  async function sendReport() {
    const note = reportNote.trim();
    if (!note || reportState === "sending") return;
    setReportState("sending");
    setReportError("");
    let device: Record<string, unknown> = {};
    try {
      device = {
        platform: micPlatform(),
        userAgent: navigator.userAgent,
        viewport: `${window.innerWidth}×${window.innerHeight}`,
        online: navigator.onLine,
        language: navigator.language,
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        page: window.location.pathname,
      };
    } catch {
      /* fine */
    }
    try {
      const res = await fetch("/api/app/assistant/report", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          note,
          messages: messagesRef.current.slice(-40).map((m) => ({
            role: m.role,
            content: m.content,
            tokens: m.tokens,
            auto: m.auto,
            recap: m.recap,
            proposals: (m.proposals ?? []).map((p) => ({ title: p.title, state: p.state, danger: p.danger, money: p.money, kind: p.kind, endpoint: p.endpoint, resultNote: p.resultNote })),
          })),
          voiceLog: voiceLogLines(),
          voiceOpen: reportFromVoice.current,
          device,
        }),
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(data.error || GENERIC_ERROR);
      }
      setReportState("sent");
      setReportNote("");
      hapticNotify("SUCCESS");
    } catch (err) {
      setReportState("error");
      setReportError((err as Error)?.message || GENERIC_ERROR);
    }
  }

  function openReport(fromVoice: boolean) {
    reportFromVoice.current = fromVoice;
    setReportState("idle");
    setReportError("");
    setReportOpen(true);
  }
  // The mic request started by the tap that opened voice mode — browsers
  // that only prompt from a gesture (iOS, Safari) need it asked right then.
  const micGrantRef = useRef<Promise<MicState> | null>(null);
  // Server truth arrives as a prop; each send moves it locally so the drawer
  // reacts without waiting on a refresh.
  const [liveAccess, setLiveAccess] = useState<AtlasDrawerAccess>(access);
  useEffect(() => setLiveAccess(access), [access]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // Phones: the input strip floats over the conversation (glass), so the
  // message list pads its bottom by the strip's live height.
  const [composerRef, composerH] = useMeasuredHeight();

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
  async function send(
    text: string,
    opts: { auto?: boolean; depth?: number; base?: Msg[]; voice?: boolean } = {}
  ): Promise<{ index: number; msg: Msg } | { error: string } | null> {
    const content = text.trim().slice(0, 4000);
    if (!content || loading) return null;
    let outcome: { index: number; msg: Msg } | { error: string } | null = null;
    setError("");
    setInput("");
    const next: Msg[] = [...(opts.base ?? messages), { role: "user", content, ...(opts.auto ? { auto: true } : {}) }];
    persist(next);
    setLoading(true);
    setProgress("");
    try {
      type TurnData = {
        reply?: string;
        proposals?: Proposal[];
        nextStep?: string;
        navigate?: string;
        error?: string;
        atlasLocked?: boolean;
        access?: AtlasDrawerAccess;
        turnTokens?: number;
        recap?: string;
      };
      // The model sees the text of earlier turns plus, for the last few
      // replies, the recap of what was looked up behind them.
      const assistantIdx = next.map((m, i) => (m.role === "assistant" ? i : -1)).filter((i) => i >= 0);
      const withRecap = new Set(assistantIdx.slice(-3));
      const sendable = next.map((m, i) => ({
        role: m.role,
        content: m.role === "assistant" && m.recap && withRecap.has(i) ? `${m.content}\n\n[Behind this reply: ${m.recap}]` : m.content,
      }));
      const res = await fetch("/api/app/assistant", {
        method: "POST",
        // NDJSON: progress lines while the tools run, then one final line —
        // the route answers plain JSON to callers that don't ask for this
        headers: { "Content-Type": "application/json", Accept: "application/x-ndjson" },
        // strip proposals from what we send — the model only needs the text
        body: JSON.stringify({
          messages: sendable,
          ...(opts.voice ? { voice: true } : {}),
        }),
      });
      let data: TurnData | null = null;
      let ok = res.ok;
      if (res.headers.get("content-type")?.includes("application/x-ndjson") && res.body) {
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffered = "";
        const take = (line: string) => {
          if (!line.trim()) return;
          let evt: { type?: string; text?: string; status?: number } & TurnData;
          try {
            evt = JSON.parse(line);
          } catch {
            return;
          }
          if (evt.type === "progress" && evt.text) setProgress(evt.text);
          else if (evt.type === "done") data = evt;
          else if (evt.type === "error") {
            ok = false;
            data = evt;
          }
        };
        for (;;) {
          const { value, done } = await reader.read();
          if (done) break;
          buffered += decoder.decode(value, { stream: true });
          const lines = buffered.split("\n");
          buffered = lines.pop() ?? "";
          lines.forEach(take);
        }
        take(buffered);
      } else {
        data = (await res.json().catch(() => null)) as TurnData | null;
      }
      if (!ok || !data?.reply) {
        if (data?.access) setLiveAccess(data.access);
        else if (data?.atlasLocked)
          setLiveAccess({ level: "locked", reason: "free-spent", resetsAt: new Date().toISOString() });
        setError(data?.error ?? GENERIC_ERROR);
        outcome = { error: data?.error ?? GENERIC_ERROR };
      } else {
        if (data.access) setLiveAccess(data.access);
        // metered accounts (free tier + plan) see what each reply cost; the
        // server sends 0 for whitelisted accounts
        const metered = typeof data.turnTokens === "number" && data.turnTokens > 0;
        const reply: Msg = {
          role: "assistant",
          content: data.reply,
          proposals: (data.proposals ?? []).map((p) => ({ ...p, state: "pending" as const })),
          ...(metered ? { tokens: data.turnTokens } : {}),
          ...(data.nextStep && (data.proposals?.length ?? 0) > 0 ? { nextStep: data.nextStep } : {}),
          ...(opts.depth ? { autoDepth: opts.depth } : {}),
          ...(data.recap ? { recap: data.recap } : {}),
        };
        persist([...next, reply]);
        outcome = { index: next.length, msg: reply };
        // A tool moved the work to a page (the Estimates builder): go there and get out of the way
        if (data.navigate && /^\/app\//.test(data.navigate)) {
          const to = data.navigate;
          setTimeout(() => {
            router.push(to);
            onClose();
          }, 600);
        }
      }
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
      outcome = { error: "I couldn't reach the server — check the connection and try again." };
    } finally {
      setLoading(false);
      setProgress("");
    }
    return outcome;
  }

  /** Live voice: a spoken exchange already happened out loud — put it (and
   *  any cards it staged) in the chat without another model call. */
  function recordExchange(userText: string, replyText: string, proposals: Proposal[]): RecordedExchange {
    const base = messagesRef.current;
    const reply: Msg = {
      role: "assistant",
      content: replyText,
      proposals: proposals.map((p) => ({ ...p, state: "pending" as const })),
    };
    const next: Msg[] = [...base, { role: "user", content: userText }, reply];
    messagesRef.current = next; // two exchanges in one tick must not overwrite each other
    persist(next);
    const index = next.length - 1;
    return { index, confirmOrdinary: () => confirmAll(index, reply.proposals ?? []) };
  }

  /** One spoken turn for the voice overlay: the same send, plus what to read
   *  out and how to confirm the ordinary cards by voice. */
  async function askByVoice(text: string): Promise<VoiceTurn> {
    const r = await send(text, { voice: true });
    if (!r) return { error: "One moment — still working on the last thing." };
    if ("error" in r) return r;
    const { index, msg } = r;
    const cards = (msg.proposals ?? []).map((p) => ({
      title: p.title,
      guarded: Boolean(p.danger || p.money || p.confirmText),
    }));
    return {
      reply: msg.content,
      cards,
      confirmOrdinary: () => confirmAll(index, msg.proposals ?? []),
    };
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
    const settled = patch.state === "done" || patch.state === "failed" || patch.state === "dismissed" ? { settledAt: Date.now() } : {};
    persist((prev) =>
      prev.map((m, i) =>
        i === msgIdx
          ? { ...m, proposals: m.proposals?.map((p) => (p.id === propId ? { ...p, ...patch, ...settled } : p)) }
          : m
      )
    );
  }

  /** The cards the talk screen shows: everything still waiting, plus cards
   *  settled in the last few seconds so the user sees the stamp land. */
  const voiceCards: PlacedCard[] = messages.flatMap((m, msgIdx) =>
    (m.proposals ?? [])
      .filter((p) => p.state === "pending" || p.state === "confirming" || (p.settledAt !== undefined && Date.now() - p.settledAt < 6000))
      .map((card) => ({ msgIdx, card }))
  );

  /** Spoken yes: confirm every ordinary card still waiting anywhere in the
   *  chat — not just the last turn's, since people ask a question or two
   *  before saying "go ahead" (David's 2026-10-23 report). Reads the live
   *  list, so it works from the socket's callbacks too. */
  async function confirmOrdinaryPending(): Promise<{ confirmed: number; failed: number; needsTap: number }> {
    const waiting: PlacedCard[] = messagesRef.current.flatMap((m, msgIdx) =>
      (m.proposals ?? []).filter((p) => p.state === "pending").map((card) => ({ msgIdx, card }))
    );
    let confirmed = 0;
    let failed = 0;
    for (const { msgIdx, card } of waiting) {
      if (!voiceConfirmable(card)) continue;
      if (await confirm(msgIdx, card, { skipRefresh: true })) confirmed++;
      else failed++;
    }
    if (confirmed + failed > 0) router.refresh();
    return { confirmed, failed, needsTap: waiting.filter((w) => !voiceConfirmable(w.card)).length };
  }

  /** Spoken no: dismiss every card still waiting. */
  function skipPending(): number {
    let n = 0;
    messagesRef.current.forEach((m, msgIdx) => {
      (m.proposals ?? []).forEach((p) => {
        if (p.state !== "pending") return;
        setCard(msgIdx, p.id, { state: "dismissed" });
        n++;
      });
    });
    return n;
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
      // Cards live in sessionStorage across page loads, so a card can outlive
      // the record it was staged against (deleted from its page, or by an
      // earlier card). Say that, instead of surfacing a bare 404.
      if (res.status === 404) {
        return "That record no longer exists — it was removed after Atlas suggested this. Ask again for a fresh card.";
      }
      return data?.error ?? "That didn't go through — try it from the page instead.";
    } catch {
      return "Network error — nothing was saved.";
    }
  }

  /**
   * A delete card confirmed while the deleted record's own page is open:
   * refreshing that page would call notFound() and land on a 404. Step up
   * to the list the record lived in instead. The record id is the last
   * id-shaped segment of the DELETE endpoint (/api/app/quotes/<id>,
   * /api/app/contacts/<id>/addresses/<addrId> → only the address id counts,
   * so deleting an address never leaves the contact's page).
   */
  function leaveDeletedRecordPage(items: { endpoint: string; method: string }[]): boolean {
    const pathname = window.location.pathname;
    for (const item of items) {
      if (item.method !== "DELETE") continue;
      const segments = item.endpoint.split("?")[0].split("/").filter(Boolean);
      const id = [...segments].reverse().find((s) => /^[a-z0-9]{20,}$/i.test(s));
      if (!id) continue;
      const at = pathname.indexOf(`/${id}`);
      if (at <= 0) continue;
      router.replace(pathname.slice(0, at) || "/app/dashboard");
      return true;
    }
    return false;
  }

  /** Submit one card; resolves true when it applied (or every item of a batch did). */
  async function confirm(msgIdx: number, prop: Proposal, opts?: { skipRefresh?: boolean }): Promise<boolean> {
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
      if (leaveDeletedRecordPage(prop.batch)) return failed === 0;
      if (!opts?.skipRefresh) router.refresh();
      return failed === 0;
    }
    const err = await submitOne(prop);
    if (err !== null) {
      setCard(msgIdx, prop.id, { state: "failed", resultNote: err });
      hapticNotify("ERROR");
      return false;
    }
    setCard(msgIdx, prop.id, { state: "done", resultNote: "Done" });
    hapticNotify("SUCCESS");
    if (leaveDeletedRecordPage([prop])) return true;
    if (!opts?.skipRefresh) router.refresh();
    return true;
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
        {voiceOpen && !locked && (
          <AssistantVoice
            name={name}
            accent={accent}
            progress={progress}
            micGrant={micGrantRef.current}
            ask={askByVoice}
            recordExchange={recordExchange}
            cards={voiceCards}
            onConfirmCard={(msgIdx, card) => void confirm(msgIdx, card)}
            onSkipCard={(msgIdx, id) => setCard(msgIdx, id, { state: "dismissed" })}
            confirmOrdinaryPending={confirmOrdinaryPending}
            skipPending={skipPending}
            onClose={() => setVoiceOpen(false)}
            onReport={() => {
              setVoiceOpen(false);
              openReport(true);
            }}
          />
        )}
        {/* No header bar — the empty state introduces Atlas, so the chrome is
            just two floating controls. White circles with a border so they
            stay visible over any message content. */}
        {/* Phones: the token meter also rides up here as a pill, so it is
            seen the moment the drawer opens — not only down in the composer
            behind the keyboard (David 2026-10-03). Desktop keeps the
            composer's meter alone. */}
        {(liveAccess.level === "free" || liveAccess.level === "plan") && (
          <div className="absolute left-3 z-10 sm:hidden" style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}>
            <span
              className={`flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold shadow-sm ${
                liveAccess.meter.remaining <= liveAccess.meter.included * 0.1 ? "text-amber-600" : "text-gray-600"
              }`}
            >
              <Coins size={13} />
              {fmtTokens(liveAccess.meter.remaining)} tokens left
            </span>
          </div>
        )}
        <div
          className="absolute right-3 z-10 flex items-center gap-2"
          style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
        >
          {messages.length > 0 && (
            <button
              type="button"
              onClick={() => openReport(false)}
              title="Report a problem with this conversation"
              aria-label="Report a problem with this conversation"
              className="glass-control glass-hit flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <span className="glass-press flex">
                <Flag size={15} />
              </span>
            </button>
          )}
          {messages.length > 0 && (
            <button
              type="button"
              onClick={reset}
              title="New chat"
              className="glass-control glass-hit flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-500 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
            >
              <span className="glass-press flex">
                <RotateCcw size={16} />
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close assistant"
            className="glass-control glass-hit flex h-9 w-9 items-center justify-center rounded-full border border-gray-200 bg-white text-gray-600 shadow-sm transition-colors hover:bg-gray-50 hover:text-gray-900"
          >
            <span className="glass-press flex">
              <X size={20} strokeWidth={2.2} />
            </span>
          </button>
        </div>

        {/* messages — top padding clears the floating controls; on phones
            the bottom pads for the floating composer (--composer-h) */}
        <div
          className="composer-pad flex-1 space-y-3 overflow-y-auto px-4 pb-4 pt-14"
          style={{ "--composer-h": `${composerH}px` } as React.CSSProperties}
        >
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
                    className="btn-tool-line block w-full rounded-[10px] bg-white px-3.5 py-2.5 text-left text-xs text-gray-700 hover:text-green-700"
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
              <span className="atlas-shimmer text-xs text-gray-500">{progress || "Looking that up…"}</span>
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
          <div
            ref={composerRef}
            className="atlas-composer glass-bar shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
          >
            <p className="text-center text-xs font-semibold text-gray-600">
              {planSpent
                ? `${name} is out of tokens for this period${resetsAt ? ` — refills ${fmtDay(resetsAt)}` : ""}.`
                : `${name} is out of free tokens for this month${resetsAt ? ` — refills ${fmtDay(resetsAt)}` : ""}.`}
            </p>
          </div>
        ) : (
        <div
          ref={composerRef}
          className="atlas-composer glass-bar shrink-0 border-t border-gray-200 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
        >
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
            {input.trim() ? (
              <button
                type="button"
                onClick={() => {
                  hapticImpact("LIGHT");
                  send(input);
                }}
                disabled={loading}
                aria-label="Send"
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-green-600 transition-colors hover:bg-green-500 disabled:opacity-40"
              >
                <ArrowUp size={17} strokeWidth={2.4} />
              </button>
            ) : (
              // Nothing typed: the button is the microphone — tap to talk
              // with Atlas (voice mode). Typing swaps it back to Send.
              <button
                type="button"
                onClick={() => {
                  hapticImpact("MEDIUM");
                  primeLiveAudio();
                  micGrantRef.current = requestMicrophone();
                  setVoiceOpen(true);
                }}
                disabled={loading}
                aria-label={`Talk to ${name}`}
                title={`Talk to ${name}`}
                className="flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-full bg-green-600 transition-colors hover:bg-green-500 disabled:opacity-40"
              >
                <Mic size={17} strokeWidth={2.2} />
              </button>
            )}
          </div>
          <p className="mt-1.5 text-center text-[10px] text-gray-400">
            AI answers can be wrong — verify anything important on its page.
          </p>
        </div>
        )}

        {/* ── Report this conversation: a bottom sheet over the drawer ── */}
        {reportOpen && (
          <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-label="Report a problem">
            <div className="absolute inset-0 bg-black/20" onClick={() => setReportOpen(false)} />
            <div className="relative rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-display text-[15px] font-bold text-gray-900">Report a problem</p>
                  <p className="mt-0.5 text-[12px] leading-snug text-gray-500">
                    This conversation, its cards and the voice timings go with your note so we can see exactly what {name} did.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setReportOpen(false)}
                  aria-label="Close"
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100"
                >
                  <X size={16} />
                </button>
              </div>
              {reportState === "sent" ? (
                <div className="mt-4 flex items-center gap-2 rounded-xl bg-green-50 px-3 py-3 text-[13px] font-semibold text-green-800">
                  <Check size={16} />
                  Sent — thanks. We'll look at it.
                </div>
              ) : (
                <>
                  <textarea
                    autoFocus
                    value={reportNote}
                    onChange={(e) => setReportNote(e.target.value)}
                    rows={3}
                    maxLength={2000}
                    placeholder="What went wrong? e.g. “took 20 seconds to answer”, “told me about the wrong call”"
                    className="mt-3 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-[14px] text-gray-900 outline-none focus:border-gray-400"
                  />
                  {reportError && <p className="mt-1 text-[12px] text-red-600">{reportError}</p>}
                  <button
                    type="button"
                    onClick={() => void sendReport()}
                    disabled={!reportNote.trim() || reportState === "sending"}
                    className="mt-2 flex h-11 w-full items-center justify-center gap-2 rounded-full text-[14px] font-semibold disabled:opacity-40"
                    style={{ background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" }}
                  >
                    {reportState === "sending" ? <Loader2 size={16} className="animate-spin" /> : <Flag size={15} />}
                    {reportState === "sending" ? "Sending…" : "Send report"}
                  </button>
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
