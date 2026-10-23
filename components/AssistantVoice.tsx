"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Square, Volume2, VolumeX, X } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { hapticImpact, hapticNotify } from "@/lib/haptics";
import { listenOnce, primeAudio, speak, speechInputKind, type ListenHandle, type SpeakHandle } from "@/lib/voice-chat-client";
import { cardsSpeech, isAffirmative, isNegative, isStopPhrase, spokenForm, type SpokenCard } from "@/lib/voice-chat-shared";

/**
 * Talking to Atlas. A conversation, not a form: tap once, speak, Atlas
 * answers out loud and listens again by itself (hands-free) until you say
 * "stop" or tap Done. The chat underneath still gets every turn and every
 * card, so nothing said here is lost — and money / permanent cards still
 * need a finger on the button (cardsSpeech says so out loud).
 *
 * The drawer owns the turn (`ask`); this component owns the ear, the
 * mouth and the little state machine between them.
 */

export type VoiceTurn =
  | { reply: string; cards: SpokenCard[]; confirmOrdinary: () => Promise<void> }
  | { error: string };

type Phase = "listening" | "thinking" | "speaking" | "idle";

const NATURAL_KEY = "wb-atlas-voice-natural";

export default function AssistantVoice({
  name,
  accent,
  progress,
  ask,
  onClose,
}: {
  name: string;
  accent?: string;
  /** What Atlas is doing right now (streamed from the route) — shown while thinking. */
  progress: string;
  ask: (text: string) => Promise<VoiceTurn>;
  onClose: () => void;
}) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [interim, setInterim] = useState("");
  const [heard, setHeard] = useState("");
  const [said, setSaid] = useState("");
  const [note, setNote] = useState("");
  const [natural, setNatural] = useState(true);
  const inputKind = speechInputKind();

  const listenRef = useRef<ListenHandle | null>(null);
  const speakRef = useRef<SpeakHandle | null>(null);
  const pendingConfirm = useRef<(() => Promise<void>) | null>(null);
  const emptyRuns = useRef(0);
  const alive = useRef(true);
  const phaseRef = useRef<Phase>("idle");
  const setPhaseBoth = (p: Phase) => {
    phaseRef.current = p;
    setPhase(p);
  };

  useEffect(() => {
    try {
      setNatural(localStorage.getItem(NATURAL_KEY) !== "off");
    } catch {
      /* fine */
    }
  }, []);

  const stopAll = useCallback(() => {
    listenRef.current?.cancel();
    listenRef.current = null;
    speakRef.current?.stop();
    speakRef.current = null;
  }, []);

  /** Say something, then (hands-free) listen again. */
  const say = useCallback(
    async (text: string, then: "listen" | "idle" = "listen") => {
      if (!alive.current) return;
      setSaid(text);
      setPhaseBoth("speaking");
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

  const handleUtterance = useCallback(
    async (text: string) => {
      setHeard(text);
      setInterim("");
      if (isStopPhrase(text)) {
        await say("Okay. I'm here when you need me.", "idle");
        onClose();
        return;
      }
      if (pendingConfirm.current) {
        const confirm = pendingConfirm.current;
        if (isAffirmative(text)) {
          pendingConfirm.current = null;
          setPhaseBoth("thinking");
          setNote("Confirming…");
          try {
            await confirm();
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
          await say("Okay, I'll leave it. Anything else?");
          return;
        }
        pendingConfirm.current = null; // they moved on — the card stays in the chat
      }
      setPhaseBoth("thinking");
      const turn = await ask(text);
      if (!alive.current) return;
      if ("error" in turn) {
        await say(turn.error.replace(/[*_`]/g, ""));
        return;
      }
      const cards = cardsSpeech(turn.cards);
      pendingConfirm.current = cards.voiceConfirmable ? turn.confirmOrdinary : null;
      await say([spokenForm(turn.reply), cards.text].filter(Boolean).join(" "));
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
    listenRef.current = listenOnce({
      onInterim: (t) => setInterim(t),
      onFinal: (text) => {
        listenRef.current = null;
        if (!alive.current || phaseRef.current !== "listening") return;
        if (!text) {
          // Nothing said: one quiet retry, then wait for a tap so the mic
          // isn't left open in a quiet truck forever.
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
        setNote(message);
        setPhaseBoth("idle");
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inputKind, handleUtterance]);

  // Enter: unlock audio on the opening tap, then listen.
  useEffect(() => {
    alive.current = true;
    primeAudio();
    const t = setTimeout(() => listen(), 150);
    return () => {
      alive.current = false;
      clearTimeout(t);
      stopAll();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function tapOrb() {
    hapticImpact("LIGHT");
    if (phase === "speaking") {
      // barge in: stop talking, start listening
      speakRef.current?.stop();
      speakRef.current = null;
      listen();
    } else if (phase === "listening") {
      listenRef.current?.stop(); // finalize what was heard so far
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

  const status =
    phase === "listening"
      ? interim
        ? interim
        : "Listening…"
      : phase === "thinking"
        ? note || progress || "One sec…"
        : phase === "speaking"
          ? said
          : note || "Tap the mic to talk";

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-paper-plain pt-[env(safe-area-inset-top)]" role="dialog" aria-label={`Talk to ${name}`}>
      <div className="flex items-center justify-between px-4 pt-3">
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

      <div className="flex flex-1 flex-col items-center justify-center px-6 text-center">
        <button
          type="button"
          onClick={tapOrb}
          aria-label={phase === "listening" ? "Stop listening" : phase === "speaking" ? "Interrupt" : "Talk"}
          className="relative flex h-40 w-40 items-center justify-center rounded-full"
        >
          {/* halo: breathes while listening, ripples while speaking, still while thinking */}
          <span
            aria-hidden
            className={`absolute inset-0 rounded-full ${
              phase === "listening" ? "atlas-voice-breathe" : phase === "speaking" ? "atlas-voice-ripple" : phase === "thinking" ? "atlas-voice-think" : ""
            }`}
            style={{ background: `${accent ?? "#3B82F6"}22` }}
          />
          <AtlasMark size={96} accent={accent} />
          <span
            className="absolute -bottom-1 right-2 flex h-11 w-11 items-center justify-center rounded-full border-2 border-white text-white shadow-md"
            style={{ background: phase === "idle" ? "#6b7280" : accent ?? "#3B82F6" }}
          >
            {phase === "listening" ? <Mic size={20} /> : phase === "speaking" ? <Square size={16} /> : phase === "idle" ? <MicOff size={20} /> : <Mic size={20} className="opacity-50" />}
          </span>
        </button>

        <p className="mt-6 min-h-[3.5rem] max-w-[320px] text-[15px] leading-relaxed text-gray-800">
          {status}
        </p>
        {heard && phase !== "listening" && (
          <p className="mt-2 max-w-[320px] text-[12px] text-gray-400">
            You said: “{heard}”
          </p>
        )}
      </div>

      <p className="px-6 pb-[max(1rem,env(safe-area-inset-bottom))] text-center text-[11px] text-gray-400">
        {inputKind === "recorder"
          ? "Tap the mic, speak, tap again when you're done."
          : `Say "stop" when you're finished. Money and permanent changes still need a tap in the chat.`}
      </p>
    </div>
  );
}
