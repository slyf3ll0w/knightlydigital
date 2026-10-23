"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Flag, Mic, MicOff, Square, Volume2, VolumeX, X } from "lucide-react";
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
import { ProposalCard, voiceConfirmable, type CardProposal, type PlacedCard } from "@/components/AssistantCard";

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
  confirmOrdinaryPending: () => Promise<{ confirmed: number; failed: number; needsTap: number }>;
  /** Spoken no: dismiss every card still waiting; returns how many. */
  skipPending: () => number;
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
        const r = await confirmPendingRef.current();
        voiceLog("live: confirm_cards", r);
        if (r.confirmed + r.failed + r.needsTap === 0) return { confirmed: 0, note: "No card is waiting — nothing to confirm. If the user wants something done, stage it now." };
        hapticNotify(r.failed > 0 ? "ERROR" : "SUCCESS");
        return {
          confirmed: r.confirmed,
          ...(r.failed > 0 ? { failed: r.failed, note: "Some didn't go through — the card on screen says why; offer to try again." } : {}),
          ...(r.needsTap > 0 ? { needsTap: r.needsTap, note: "Those move money or can't be undone — the user taps the card on screen." } : {}),
        };
      }
      if (toolName === "skip_cards") {
        const n = skipPendingRef.current();
        voiceLog("live: skip_cards", n);
        return { skipped: n };
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
            }
          } else {
            setSaid(text);
            if (final) flushExchange(text);
          }
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
    <div className="absolute inset-0 z-20 flex flex-col bg-paper-plain pt-[env(safe-area-inset-top)]" role="dialog" aria-label={`Talk to ${name}`}>
      <div className="flex items-center justify-between px-4 pt-3">
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
    </div>
  );
}
