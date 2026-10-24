"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AudioLines, Check, Flag, Mic, MicOff, Square, Volume2, VolumeX, X } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import {
  listenOnce,
  micInstructions,
  primeAudio,
  requestMicrophone,
  speak,
  speechInputKind,
  type ListenHandle,
  type MicState,
  type SpeakHandle,
} from "@/lib/voice-chat-client";
import { startLiveSession, type LiveHandle, type LiveStatus } from "@/lib/live-voice-client";
import { voiceLog } from "@/lib/voice-log";
import { cardsSpeech, isAffirmative, isNegative, isStopPhrase, spokenForm, type SpokenCard } from "@/lib/voice-chat-shared";
import type { Proposal } from "@/lib/assistant";
import { ProposalCard, isOutreach, voiceConfirmable, type CardProposal, type PlacedCard } from "@/components/AssistantCard";
import { ATLAS_ACCENTS, ATLAS_VOICES, DEFAULT_ACCENT, describePick, getVoicePick, setVoicePick, type VoicePick } from "@/lib/atlas-voices";

/**
 * Talking to Atlas. Two engines:
 *
 * LIVE (the default, 2026-10-23): one two-way audio session with Gemini
 * Live — Atlas answers within a beat, you can talk over it, and it calls the
 * same tools on our server. Captions of both sides land in the chat as
 * messages; staged cards land there too, and a spoken "yes" confirms the
 * ordinary ones through the confirm_cards tool. Money / permanent cards
 * still need a tap, and Atlas says so.
 *
 * TURNS (fallback when the live session can't start): record or recognize
 * an utterance, run a normal Atlas turn, read the reply aloud, repeat.
 */

export type VoiceTurn =
  | { reply: string; cards: SpokenCard[]; confirmOrdinary: () => Promise<void> }
  | { error: string };

export type RecordedExchange = { index: number; confirmOrdinary: () => Promise<void> };

type Phase = "listening" | "thinking" | "speaking" | "idle" | "blocked";

const NATURAL_KEY = "wb-atlas-voice-natural";

/** JSON with object keys sorted, so {a,b} and {b,a} compare equal. */
function stableJson(v: unknown): string {
  if (Array.isArray(v)) return `[${v.map(stableJson).join(",")}]`;
  if (v && typeof v === "object") {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableJson((v as Record<string, unknown>)[k])}`)
      .join(",")}}`;
  }
  return JSON.stringify(v) ?? "null";
}
const ACKS = ["Let me check.", "One sec.", "Checking."];

export default function AssistantVoice({
  name,
  accent,
  progress,
  micGrant,
  ask,
  recordExchange,
  cards,
  onConfirmCard,
  onSkipCard,
  confirmOrdinaryPending,
  skipPending,
  findCard,
  onClose,
  onReport,
}: {
  name: string;
  accent?: string;
  /** What Atlas is doing right now (streamed from the route) — shown while thinking (turns engine). */
  progress: string;
  /** The microphone request the opening tap already started (iOS and Safari only prompt from a gesture). */
  micGrant: Promise<MicState> | null;
  /** Turns engine: one normal Atlas turn. */
  ask: (text: string) => Promise<VoiceTurn>;
  /** Live engine: put a spoken exchange (and any cards it staged) into the chat. */
  recordExchange: (userText: string, replyText: string, proposals: Proposal[]) => RecordedExchange;
  /** The cards waiting (or just settled) anywhere in the chat — shown on this screen. */
  cards: PlacedCard[];
  onConfirmCard: (msgIdx: number, card: CardProposal) => void;
  onSkipCard: (msgIdx: number, id: string) => void;
  /** Spoken yes: confirm every ordinary card still waiting. */
  confirmOrdinaryPending: (opts?: { hold?: (card: CardProposal) => boolean }) => Promise<{ confirmed: number; failed: number; needsTap: number; applied: string[]; failures: { title: string; why: string }[]; held: string[] }>;
  /** Spoken no: dismiss every card still waiting; returns how many. */
  skipPending: () => number;
  /** A card by id, wherever it is in the chat (the duplicate guard checks its state). */
  findCard: (id: string) => CardProposal | null;
  onClose: () => void;
  /** "Report a problem": closes voice and opens the drawer's report sheet. */
  onReport: () => void;
}) {
  const [engine, setEngine] = useState<"live" | "turns">("live");
  // Why the turns engine is running instead of live (shown in the footer).
  const [fellBack, setFellBack] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [note, setNote] = useState("");
  const [natural, setNatural] = useState(true);
  const [muted, setMuted] = useState(false);
  // Voice picker (lib/atlas-voices.ts): the listener's voice + accent.
  const [pickOpen, setPickOpen] = useState(false);
  const [pick, setPick] = useState<VoicePick | null>(null);
  useEffect(() => {
    setPick(getVoicePick());
  }, []);
  const inputKind = speechInputKind();

  const alive = useRef(true);
  const phaseRef = useRef<Phase>("idle");
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };
  // Turns engine only: the last reply staged ordinary cards, so a bare "yes"
  // means confirm. (The live engine's model calls confirm_cards itself.)
  const pendingConfirm = useRef<{ run: () => Promise<void>; guarded: number } | null>(null);
  // The socket's callbacks are bound once per session; read the drawer's
  // card functions through refs so they are never stale.
  const confirmPendingRef = useRef(confirmOrdinaryPending);
  confirmPendingRef.current = confirmOrdinaryPending;
  const skipPendingRef = useRef(skipPending);
  skipPendingRef.current = skipPending;
  const findCardRef = useRef(findCard);
  findCardRef.current = findCard;
  // Duplicate guard: the same action with the same arguments within ten
  // minutes returns the earlier card's state instead of staging again. The
  // 2026-10-23 report had one request staged twelve times (and a quote
  // created twice) because the model re-staged on every "yes".
  const recentActions = useRef<Map<string, { at: number; ids: string[] }>>(new Map());
  // What Atlas said last turn, flushed into the chat when the turn ends.
  const lastAtlas = useRef("");
  // Which user turn each card was staged in. A card that talks to a client
  // is applied only once the user has spoken AGAIN after it was staged —
  // i.e. heard it and said yes — never on the instruction alone.
  const userTurn = useRef(0);
  const stagedAtTurn = useRef<Map<string, number>>(new Map());
  // Re-render a few seconds after a card settles so it can leave the screen.
  const [, setSettleTick] = useState(0);
  useEffect(() => {
    if (!cards.some((c) => c.card.settledAt !== undefined)) return;
    const t = setTimeout(() => setSettleTick((n) => n + 1), 6200);
    return () => clearTimeout(t);
  }, [cards]);

  // ── live engine state ──
  const liveRef = useRef<LiveHandle | null>(null);
  const turnUser = useRef("");
  const turnProposals = useRef<Proposal[]>([]);

  // ── turns engine state ──
  const listenRef = useRef<ListenHandle | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const ackRef = useRef<SpeakHandle | null>(null);
  const ackedTurn = useRef(false);
  const emptyRuns = useRef(0);

  useEffect(() => {
    try {
      setNatural(localStorage.getItem(NATURAL_KEY) !== "off");
    } catch {
      /* fine */
    }
  }, []);

  const stopAll = useCallback(() => {
    liveRef.current?.stop();
    liveRef.current = null;
    listenRef.current?.cancel();
    listenRef.current = null;
    speakRef.current?.stop();
    speakRef.current = null;
    ackRef.current?.stop();
    ackRef.current = null;
  }, []);

  // ────────────────────────────────────────────────────────────────────────
  // LIVE
  // ────────────────────────────────────────────────────────────────────────

  const onLiveStatus = useCallback((s: LiveStatus, detail?: string) => {
    if (!alive.current) return;
    if (s === "connecting") {
      setNote("Connecting…");
      setPhaseBoth("thinking");
    } else if (s === "listening") {
      setNote("");
      setPhaseBoth("listening");
    } else if (s === "speaking") {
      setPhaseBoth("speaking");
    } else if (s === "working") {
      setNote(detail ? `Looking up ${detail.replace(/_/g, " ")}…` : "Looking that up…");
      setPhaseBoth("thinking");
    } else if (s === "ended") {
      setNote("The conversation ended — tap the mic to start again.");
      setPhaseBoth("idle");
    }
  }, []);

  const flushExchange = useCallback(
    (atlasText: string) => {
      const userText = turnUser.current.trim();
      const proposals = turnProposals.current;
      turnUser.current = "";
      turnProposals.current = [];
      if (!userText && !atlasText && proposals.length === 0) return;
      recordExchange(userText || "(spoken)", atlasText || "(spoken)", proposals);
    },
    [recordExchange]
  );

  const onToolCall = useCallback(
    async (toolName: string, args: Record<string, unknown>): Promise<Record<string, unknown>> => {
      if (toolName === "confirm_cards") {
        // Cards staged earlier in THIS turn are still only in turnProposals —
        // put them in the chat first, or the confirm finds nothing (the
        // 2026-10-23 "I've archived it" that never happened).
        if (turnProposals.current.length > 0) flushExchange("");
        const turnNow = userTurn.current;
        const r = await confirmPendingRef.current({
          hold: (card) => isOutreach(card) && (stagedAtTurn.current.get(card.id) ?? -1) >= turnNow,
        });
        voiceLog("live: confirm_cards", { confirmed: r.confirmed, failed: r.failed, needsTap: r.needsTap, held: r.held, failures: r.failures });
        if (r.confirmed + r.failed + r.needsTap + r.held.length === 0) return { confirmed: 0, note: "No card is waiting — nothing to confirm. If the user wants something done, stage it now (once)." };
        if (r.confirmed + r.failed > 0) hapticNotify(r.failed > 0 ? "ERROR" : "SUCCESS");
        return {
          confirmed: r.confirmed,
          applied: r.applied,
          ...(r.held.length > 0
            ? { heldForApproval: r.held, holdNote: "These go to a client, so they are NOT sent yet: read the message to the user word for word and ask. When they say yes, call confirm_cards again." }
            : {}),
          ...(r.failed > 0 ? { failed: r.failures, note: "These didn't go through for the reason given — fix the cause and redo, or ask one question." } : {}),
          ...(r.needsTap > 0 ? { needsTap: r.needsTap, tapNote: "Those move money or can't be undone — the user taps the card on screen." } : {}),
        };
      }
      if (toolName === "skip_cards") {
        const n = skipPendingRef.current();
        voiceLog("live: skip_cards", n);
        return { skipped: n };
      }
      const actionKey = `${toolName}:${stableJson(args)}`;
      const earlier = recentActions.current.get(actionKey);
      if (earlier && Date.now() - earlier.at < 10 * 60_000) {
        const states = earlier.ids.map((id) => findCardRef.current(id)?.state ?? "gone");
        if (states.some((s) => s === "pending" || s === "confirming")) {
          voiceLog("live: duplicate blocked", `${toolName} (card still waiting)`);
          return { alreadyStaged: true, note: "That exact card is already waiting on screen — do not stage it again. If the user agreed, call confirm_cards; otherwise ask them." };
        }
        if (states.length > 0 && states.every((s) => s === "done")) {
          voiceLog("live: duplicate blocked", `${toolName} (already applied)`);
          return { alreadyDone: true, note: "That was already applied a moment ago — do not do it again. Tell the user it's done and move on to the next step." };
        }
      }
      const res = await fetch("/api/app/assistant/live/tool", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: toolName, args }),
      });
      const data = (await res.json().catch(() => ({}))) as { result?: Record<string, unknown>; proposals?: Proposal[]; error?: string };
      if (!res.ok) {
        voiceLog("live: tool route failed", `${toolName} ${res.status} ${data.error ?? ""}`);
        return { error: data.error ?? "That didn't work." };
      }
      voiceLog("live: tool result", `${toolName}(${JSON.stringify(args).slice(0, 120)}) → ${JSON.stringify(data.result ?? {}).slice(0, 160)}${data.proposals?.length ? ` +${data.proposals.length} card(s)` : ""}`);
      if (data.proposals?.length) {
        recentActions.current.set(actionKey, { at: Date.now(), ids: data.proposals.map((p) => p.id) });
        data.proposals.forEach((p) => stagedAtTurn.current.set(p.id, userTurn.current));
        turnProposals.current = [...turnProposals.current, ...data.proposals];
        const guarded = data.proposals.filter((p) => p.danger || p.money || p.confirmText).length;
        return {
          ...(data.result ?? {}),
          staged: data.proposals.map((p) => ({ title: p.title, needsTap: Boolean(p.danger || p.money || p.confirmText) })),
          howToConfirm:
            guarded === data.proposals.length
              ? "These move money or can't be undone — tell the user they need a tap in the chat."
              : "Ask the user if they want it; a spoken yes = call confirm_cards.",
        };
      }
      return data.result ?? {};
    },
    []
  );

  const startLive = useCallback(async () => {
    try {
      const handle = await startLiveSession({
        onStatus: onLiveStatus,
        onCaption: (role, text, final) => {
          if (!alive.current) return;
          if (role === "user") {
            setInterim(text);
            if (final) {
              setHeard(text);
              setInterim("");
              turnUser.current = text;
              userTurn.current += 1;
            }
          } else {
            setSaid(text);
            if (final) lastAtlas.current = text;
          }
        },
        onTurnComplete: () => {
          if (!alive.current) return;
          // Flush whatever happened this turn — words, or just cards staged
          // behind a silent turn or one that got interrupted — so a later
          // "yes" always finds them.
          const said = lastAtlas.current;
          lastAtlas.current = "";
          flushExchange(said);
        },
        onToolCall,
        onError: (message) => {
          voiceLog("live: error", message);
          if (!alive.current) return;
          setNote(message);
        },
        onUsage: (inSeconds, outSeconds) => {
          void fetch("/api/app/assistant/live/usage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ inSeconds, outSeconds }),
            keepalive: true,
          }).catch(() => undefined);
        },
      });
      if (!alive.current) {
        handle.stop();
        return;
      }
      liveRef.current = handle;
    } catch (err) {
      const message = (err as Error)?.message ?? "";
      if (/NotAllowed|denied|blocked/i.test(message) || (err as { name?: string })?.name === "NotAllowedError") {
        voiceLog("live: blocked", message);
        setPhaseBoth("blocked");
        return;
      }
      // No live session (not configured, token refused, socket failed): the turn-based engine.
      voiceLog("live: FALLBACK to turns", message || (err as { name?: string })?.name || "unknown");
      setFellBack(message || "The live connection couldn't start.");
      setEngine("turns");
      void begin(micGrant ?? requestMicrophone());
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onLiveStatus, onToolCall, flushExchange, micGrant]);

  // ────────────────────────────────────────────────────────────────────────
  // TURNS (fallback)
  // ────────────────────────────────────────────────────────────────────────

  const say = useCallback(
    async (text: string, then: "listen" | "idle" = "listen") => {
      if (!alive.current) return;
      setSaid(text);
      setPhaseBoth("speaking");
      if (ackRef.current) {
        await Promise.race([ackRef.current.done, new Promise((r) => setTimeout(r, 2500))]);
        ackRef.current = null;
      }
      const h = speak(text, { natural });
      speakRef.current = h;
      await h.done;
      speakRef.current = null;
      if (!alive.current || phaseRef.current !== "speaking") return;
      if (then === "listen") listen();
      else setPhaseBoth("idle");
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [natural]
  );

  useEffect(() => {
    if (engine !== "turns" || phase !== "thinking" || !progress || ackedTurn.current) return;
    ackedTurn.current = true;
    const phrase = ACKS[Math.floor(Math.random() * ACKS.length)];
    ackRef.current = speak(phrase, { natural, cache: true });
  }, [engine, phase, progress, natural]);

  const handleUtterance = useCallback(
    async (text: string) => {
      setHeard(text);
      setInterim("");
      ackedTurn.current = false;
      if (isStopPhrase(text)) {
        await say("Okay. I'm here when you need me.", "idle");
        onClose();
        return;
      }
      if (pendingConfirm.current) {
        const pending = pendingConfirm.current;
        if (isAffirmative(text)) {
          pendingConfirm.current = null;
          setPhaseBoth("thinking");
          setNote("Confirming…");
          try {
            await pending.run();
            hapticNotify("SUCCESS");
            await say("Done.");
          } catch {
            hapticNotify("ERROR");
            await say("That didn't go through — it's in the chat if you want to try again.");
          } finally {
            setNote("");
          }
          return;
        }
        if (isNegative(text)) {
          pendingConfirm.current = null;
          skipPendingRef.current();
          await say("Okay, I'll leave it. Anything else?");
          return;
        }
        pendingConfirm.current = null;
      }
      setPhaseBoth("thinking");
      const tAsk = Date.now();
      const turn = await ask(text);
      voiceLog("turns: answer", `${Date.now() - tAsk}ms ${"error" in turn ? `error: ${turn.error.slice(0, 80)}` : `“${turn.reply.slice(0, 80)}”`}`);
      if (!alive.current) return;
      if ("error" in turn) {
        await say(turn.error.replace(/[*_`]/g, ""));
        return;
      }
      const spoken = cardsSpeech(turn.cards);
      pendingConfirm.current = spoken.voiceConfirmable
        ? { run: () => confirmPendingRef.current().then(() => undefined), guarded: turn.cards.filter((c) => c.guarded).length }
        : null;
      await say([spokenForm(turn.reply), spoken.text].filter(Boolean).join(" "));
    },
    [ask, onClose, say]
  );

  const listen = useCallback(() => {
    if (!alive.current) return;
    if (inputKind === "none") {
      setNote("This browser can't hear you — type in the chat instead.");
      setPhaseBoth("idle");
      return;
    }
    listenRef.current?.cancel();
    setInterim("");
    setPhaseBoth("listening");
    const tListen = Date.now();
    voiceLog("turns: listening", inputKind);
    listenRef.current = listenOnce({
      onInterim: (t) => setInterim(t),
      onFinal: (text) => {
        listenRef.current = null;
        voiceLog("turns: heard", `${Date.now() - tListen}ms “${text.slice(0, 80)}”`);
        if (!alive.current || phaseRef.current !== "listening") return;
        if (!text) {
          emptyRuns.current += 1;
          if (emptyRuns.current >= 2) {
            emptyRuns.current = 0;
            setPhaseBoth("idle");
            setNote("Tap the mic when you're ready.");
          } else listen();
          return;
        }
        emptyRuns.current = 0;
        setNote("");
        void handleUtterance(text);
      },
      onError: (message) => {
        listenRef.current = null;
        voiceLog("turns: listen error", message);
        setNote(message);
        setPhaseBoth("idle");
      },
      onBlocked: () => {
        listenRef.current = null;
        voiceLog("turns: blocked");
        setPhaseBoth("blocked");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKind, handleUtterance]);

  const begin = useCallback(
    async (grant: Promise<MicState>) => {
      const state = await grant;
      if (!alive.current) return;
      if (state === "granted") listen();
      else if (state === "unavailable") {
        setNote("No microphone was found on this device — type in the chat instead.");
        setPhaseBoth("idle");
      } else setPhaseBoth("blocked");
    },
    [listen]
  );

  // Enter: audio was unlocked and the mic requested on the opening tap.
  useEffect(() => {
    alive.current = true;
    voiceLog("voice: opened", `${typeof navigator !== "undefined" ? navigator.userAgent.slice(0, 120) : ""}`);
    primeAudio();
    void startLive();
    return () => {
      alive.current = false;
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tryAgain() {
    hapticImpact("LIGHT");
    if (engine === "live") void startLive();
    else void begin(requestMicrophone());
  }

  function tapOrb() {
    hapticImpact("LIGHT");
    if (engine === "live") {
      if (phase === "speaking") liveRef.current?.hush();
      else if (phase === "idle" && !liveRef.current) void startLive();
      return;
    }
    if (phase === "speaking") {
      speakRef.current?.stop();
      speakRef.current = null;
      listen();
    } else if (phase === "listening") {
      listenRef.current?.stop();
    } else if (phase === "idle") {
      setNote("");
      listen();
    }
  }

  function toggleNatural() {
    const next = !natural;
    setNatural(next);
    try {
      localStorage.setItem(NATURAL_KEY, next ? "on" : "off");
    } catch {
      /* fine */
    }
  }

  /** A new voice or accent: remember it, and restart the live session with it
   *  (a session's voice is fixed at setup). The turns engine just uses it on
   *  the next spoken reply. */
  function choosePick(next: VoicePick | null) {
    hapticImpact("LIGHT");
    setVoicePick(next);
    setPick(next);
    voiceLog("voice: pick", next ? `${next.voice || "default"} ${next.accent}` : "default");
    if (engine === "live") {
      stopAll();
      setMuted(false);
      void startLive();
    }
  }

  function toggleMute() {
    const next = !muted;
    setMuted(next);
    liveRef.current?.setMuted(next);
  }

  const hasCards = cards.length > 0;
  const status =
    phase === "listening"
      ? interim || (engine === "live" ? "Listening — just talk." : "Listening…")
      : phase === "thinking"
        ? note || progress || "One sec…"
        : phase === "speaking"
          ? said
          : note || "Tap the mic to talk";

  return (
    <div className="atlas-voice-in absolute inset-0 z-20 flex flex-col bg-paper-plain pt-[env(safe-area-inset-top)]" role="dialog" aria-label={`Talk to ${name}`}>
      <div className="flex items-center justify-between px-4 pt-3">
        <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            setPickOpen(true);
          }}
          title={`Voice: ${describePick(pick, "Achird")}`}
          className="glass-control glass-hit flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 shadow-sm"
        >
          <span className="glass-press flex items-center gap-1.5">
            <AudioLines size={14} />
            Voice
          </span>
        </button>
        {engine === "live" ? (
          <button
            type="button"
            onClick={toggleMute}
            title={muted ? "Unmute" : "Mute the mic"}
            className="glass-control glass-hit flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 shadow-sm"
          >
            <span className="glass-press flex items-center gap-1.5">
              {muted ? <MicOff size={14} /> : <Mic size={14} />}
              {muted ? "Muted" : "Mic on"}
            </span>
          </button>
        ) : (
          <button
            type="button"
            onClick={toggleNatural}
            title={natural ? "Natural voice (uses tokens) — tap for the device voice" : "Device voice — tap for the natural voice"}
            className="glass-control glass-hit flex h-9 items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-600 shadow-sm"
          >
            <span className="glass-press flex items-center gap-1.5">
              {natural ? <Volume2 size={14} /> : <VolumeX size={14} />}
              {natural ? "Natural voice" : "Device voice"}
            </span>
          </button>
        )}
        </div>
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            onClose();
          }}
          aria-label="Done talking"
          className="glass-control glass-hit flex h-9 items-center gap-1 rounded-full border border-gray-200 bg-white px-3 text-[12px] font-semibold text-gray-700 shadow-sm"
        >
          <span className="glass-press flex items-center gap-1">
            <X size={14} strokeWidth={2.4} />
            Done
          </span>
        </button>
      </div>

      {phase === "blocked" ? (
        <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
          <MicOff size={40} className="text-gray-400" />
          <p className="mt-5 font-display text-[17px] font-bold text-gray-900">The microphone is blocked</p>
          <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-gray-600">{micInstructions()}</p>
          <div className="mt-6 flex flex-col items-stretch gap-2">
            <button
              type="button"
              onClick={tryAgain}
              className="rounded-full px-6 py-3 text-[15px] font-semibold"
              style={{ background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" }}
            >
              Try again
            </button>
            <button type="button" onClick={onClose} className="rounded-full px-6 py-3 text-[14px] font-semibold text-gray-600">
              Type instead
            </button>
          </div>
        </div>
      ) : (
        <div className={`flex min-h-0 flex-1 flex-col items-center px-6 text-center ${hasCards ? "justify-start pt-2" : "justify-center"}`}>
          <button
            type="button"
            onClick={tapOrb}
            aria-label={phase === "speaking" ? "Interrupt" : phase === "listening" ? "Listening" : "Talk"}
            className={`relative flex shrink-0 items-center justify-center rounded-full transition-[width,height] duration-300 ${hasCards ? "h-24 w-24" : "h-40 w-40"}`}
          >
            <span
              aria-hidden
              className={`absolute inset-0 rounded-full ${
                phase === "listening" ? "atlas-voice-breathe" : phase === "speaking" ? "atlas-voice-ripple" : phase === "thinking" ? "atlas-voice-think" : ""
              }`}
              style={{ background: "color-mix(in srgb, var(--wb-accent, #0b57d8) 14%, transparent)" }}
            />
            <AtlasMark size={hasCards ? 56 : 96} accent={accent} />
            <span
              className={`absolute flex items-center justify-center rounded-full border-2 border-white shadow-md ${hasCards ? "-bottom-1 right-0 h-8 w-8" : "-bottom-1 right-2 h-11 w-11"}`}
              style={
                phase === "idle"
                  ? { background: "#6b7280", color: "#ffffff" }
                  : { background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" }
              }
            >
              {phase === "listening" ? <Mic size={hasCards ? 15 : 20} /> : phase === "speaking" ? <Square size={hasCards ? 12 : 16} /> : phase === "idle" ? <MicOff size={hasCards ? 15 : 20} /> : <Mic size={hasCards ? 15 : 20} className="opacity-50" />}
            </span>
          </button>

          <p className={`max-w-[320px] leading-relaxed text-gray-800 ${hasCards ? "mt-3 min-h-0 text-[13px]" : "mt-6 min-h-[3.5rem] text-[15px]"}`}>{status}</p>
          {heard && phase !== "listening" && !hasCards && (
            <p className="mt-2 max-w-[320px] text-[12px] text-gray-400">You said: “{heard}”</p>
          )}

          {/* The cards Atlas staged, right here on the talk screen: say "yes"
              (or "I confirm") for the ordinary ones, tap the ones that move
              money or can't be undone. Settled cards linger a moment so the
              stamp is seen, then leave. */}
          {hasCards && (
            <div className="mt-3 flex w-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto pb-2 text-left" aria-live="polite">
              {cards.map(({ msgIdx, card }) => (
                <ProposalCard key={card.id} proposal={card} onConfirm={() => onConfirmCard(msgIdx, card)} onCancel={() => onSkipCard(msgIdx, card.id)} />
              ))}
              {cards.some((c) => c.card.state === "pending") && (
                <p className="px-1 text-center text-[11px] text-gray-500">
                  {cards.some((c) => c.card.state === "pending" && voiceConfirmable(c.card))
                    ? "Say “yes” or “I confirm” for these, or tap. "
                    : ""}
                  {cards.some((c) => c.card.state === "pending" && !voiceConfirmable(c.card)) ? "Money and permanent changes need a tap." : ""}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] text-gray-400">
        <p>
          {engine === "live"
            ? "Talk like you would to a person — you can interrupt. Money and permanent changes still need a tap in the chat."
            : fellBack
              ? `Live voice couldn't connect, so Atlas is taking turns: speak, pause, hear the answer. (${fellBack})`
              : inputKind === "recorder"
                ? `Speak, then pause — Atlas answers when you stop talking. Say "stop" when you're finished.`
                : `Say "stop" when you're finished. Money and permanent changes still need a tap in the chat.`}
        </p>
        <button
          type="button"
          onClick={() => {
            hapticImpact("LIGHT");
            onReport();
          }}
          className="mt-2 inline-flex items-center gap-1 text-[11px] font-semibold text-gray-500 underline-offset-2 hover:underline"
        >
          <Flag size={11} />
          Report a problem
        </button>
      </div>

      {/* ── Voice picker: a voice (character) and an accent (language code) ── */}
      {pickOpen && (
        <div className="absolute inset-0 z-30 flex flex-col justify-end" role="dialog" aria-label="Choose a voice">
          <div className="absolute inset-0 bg-black/20" onClick={() => setPickOpen(false)} />
          <div className="relative max-h-[80%] overflow-y-auto rounded-t-2xl border-t border-gray-200 bg-white px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-4 shadow-2xl">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-[15px] font-bold text-gray-900">{name}&rsquo;s voice</p>
                <p className="mt-0.5 text-[12px] text-gray-500">Now: {describePick(pick, "Achird")}. Remembered on this device.</p>
              </div>
              <button type="button" onClick={() => setPickOpen(false)} aria-label="Close" className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100">
                <X size={16} />
              </button>
            </div>

            <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">Accent</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {ATLAS_ACCENTS.map((a) => {
                const on = (pick?.accent ?? DEFAULT_ACCENT) === a.code;
                return (
                  <button
                    key={a.code}
                    type="button"
                    onClick={() => choosePick({ voice: pick?.voice ?? "", accent: a.code })}
                    className={`rounded-full border px-3 py-1.5 text-[12px] font-semibold ${on ? "border-transparent" : "border-gray-200 bg-white text-gray-700"}`}
                    style={on ? { background: "var(--wb-accent, #0b57d8)", color: "var(--wb-on-accent, #ffffff)" } : undefined}
                  >
                    {a.label}
                  </button>
                );
              })}
            </div>

            {(["male", "female"] as const).map((g) => (
              <div key={g}>
                <p className="mt-4 text-[11px] font-semibold uppercase tracking-wide text-gray-400">{g === "male" ? "Male voices" : "Female voices"}</p>
                <div className="mt-1.5 divide-y divide-gray-100 rounded-xl border border-gray-200">
                  {ATLAS_VOICES.filter((v) => v.gender === g).map((v) => {
                    const on = (pick?.voice || "Achird") === v.id;
                    return (
                      <button
                        key={v.id}
                        type="button"
                        onClick={() => choosePick({ voice: v.id, accent: pick?.accent ?? DEFAULT_ACCENT })}
                        className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left"
                      >
                        <span>
                          <span className="block text-[14px] font-semibold text-gray-900">{v.label}</span>
                          <span className="block text-[12px] text-gray-500">{v.blurb}</span>
                        </span>
                        {on && <Check size={16} style={{ color: "var(--wb-accent, #0b57d8)" }} />}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}
            <p className="mt-3 text-center text-[11px] text-gray-400">Picking one restarts the conversation with that voice.</p>
          </div>
        </div>
      )}
    </div>
  );
}
