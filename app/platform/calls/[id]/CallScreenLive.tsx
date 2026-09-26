"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Grid3x3, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play, Voicemail, Volume2, type LucideIcon } from "lucide-react";
import { fmtElapsed, softphone, useSoftphone } from "@/lib/softphone-client";
import DialPad from "@/components/DialPad";
import Monogram from "@/components/Monogram";
import { MicRow, MicWarning } from "@/components/MicControls";
import CallFromLineButton from "@/components/CallFromLineButton";
import VoicemailPlayer from "@/components/VoicemailPlayer";

/**
 * The top of the call screen: who, and what's happening right now. When
 * the softphone in this tab is on THIS call, the card is the phone — the
 * iOS call face: avatar, name, the timer, a row of labelled round controls
 * (mute, hold, speaker on an iPhone, keypad) and the red hang-up under
 * them (or Decline / Answer while it rings). Otherwise it reports the row:
 * ringing the cell, on the cell with a running timer, or how it ended —
 * and offers Call back. A live row is polled so the screen turns over the
 * moment the call ends, and the page re-renders (durations, "On this
 * call") when the browser call closes.
 */

type Status = "RINGING" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED";
const LIVE = new Set<Status>(["RINGING", "IN_PROGRESS"]);

const fmtSecs = (secs: number) => `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;

function useNow(active: boolean): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!active) return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [active]);
  return now;
}

/** One labelled round control — the iOS call-face button. */
function Control({
  icon: Icon,
  label,
  onClick,
  on = false,
  disabled = false,
  tone = "neutral",
  size = "md",
  title,
}: {
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  /** Lit = the thing is on (muted, on hold, speaker, keypad open). */
  on?: boolean;
  disabled?: boolean;
  tone?: "neutral" | "green" | "red";
  size?: "md" | "lg";
  title?: string;
}) {
  const face =
    tone === "green"
      ? "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] hover:opacity-90"
      : tone === "red"
        ? "bg-[color:var(--ds-bad)] text-[color:var(--ds-surface)] hover:opacity-90"
        : on
          ? "bg-gray-900 text-white"
          : "bg-gray-100 text-gray-800 hover:bg-gray-200";
  const dim = size === "lg" ? "h-[68px] w-[68px]" : "h-[60px] w-[60px]";
  return (
    <button type="button" onClick={onClick} disabled={disabled} title={title ?? label} aria-label={label} aria-pressed={tone === "neutral" ? on : undefined} className="flex flex-col items-center gap-1.5 disabled:opacity-50">
      <span className={`flex ${dim} items-center justify-center rounded-full transition-[background-color,transform] duration-100 active:scale-95 ${face}`}>
        <Icon size={size === "lg" ? 26 : 22} />
      </span>
      <span className="text-[11px] font-medium text-gray-600">{label}</span>
    </button>
  );
}

export default function CallScreenLive({
  callId,
  direction,
  status,
  label,
  standing,
  number,
  customerNumber,
  contactId,
  answeredAt,
  durationSec,
  voicemailSec,
  voicemailRecordingId,
  who,
  placedAt,
  canCall,
  via,
}: {
  callId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: Status;
  /** "app" = placed/answered in a browser, "cell" = the owner's phone rang, null = not decided yet. */
  via: "app" | "cell" | null;
  /** Name, or the formatted number when there is no contact. */
  label: string;
  /** "lead" / "client" / "". */
  standing: string;
  /** Formatted number to show under a name; "" when the label already is the number. */
  number: string;
  customerNumber: string;
  contactId: string | null;
  answeredAt: string | null;
  durationSec: number | null;
  voicemailSec: number | null;
  voicemailRecordingId: string | null;
  who: string;
  placedAt: string;
  canCall: boolean;
}) {
  const router = useRouter();
  const sp = useSoftphone();
  const live = sp.call && sp.call.callId === callId ? sp.call : null;
  const [row, setRow] = useState({ status, answeredAt });
  const [pad, setPad] = useState(false);
  const wasLive = useRef(false);
  /** The browser call on this screen just ended; the row still says RINGING/IN_PROGRESS until its webhook lands. */
  const [ended, setEnded] = useState(false);

  // The row is live but the call isn't in this tab: watch it turn over.
  useEffect(() => {
    if (live || !LIVE.has(row.status)) return;
    let stop = false;
    const tick = async () => {
      try {
        const res = await fetch(`/api/app/line/softphone/call?id=${encodeURIComponent(callId)}`, { cache: "no-store" });
        const j = (await res.json()) as { call?: { status: Status; answeredAt: string | null } | null };
        if (stop || !j.call) return;
        if (j.call.status !== row.status || j.call.answeredAt !== row.answeredAt) {
          setRow({ status: j.call.status, answeredAt: j.call.answeredAt });
          if (!LIVE.has(j.call.status)) router.refresh();
        }
      } catch {
        /* next tick */
      }
    };
    const t = setInterval(tick, 3000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, [live, row.status, row.answeredAt, callId, router]);

  // The browser call on this screen just ended: pull the finished row (duration, what got done).
  useEffect(() => {
    if (live) {
      wasLive.current = true;
      return;
    }
    if (!wasLive.current) return;
    wasLive.current = false;
    setPad(false);
    setEnded(true);
    router.refresh();
    const t = setTimeout(() => router.refresh(), 2500);
    return () => clearTimeout(t);
  }, [live, router]);

  const onLine = live ? live.state === "active" || live.state === "held" : row.status === "IN_PROGRESS";
  const now = useNow(onLine);
  const ringing = live?.state === "ringing";
  const dialing = live?.state === "dialing";
  const held = live?.state === "held";

  // The one line under the name.
  let line: string;
  let tone = "text-gray-500";
  if (live) {
    if (ringing) line = "Calling your business line";
    else if (dialing) line = "Calling from your business line…";
    else if (held) line = `On hold · ${fmtElapsed(live.startedAt, now)}`;
    else line = fmtElapsed(live.startedAt, now);
    tone = ringing ? "text-[color:var(--ds-good)]" : "text-gray-700";
  } else if (ended && LIVE.has(row.status)) {
    // Hung up here a moment ago; the row catches up on the next poll. Never
    // "ringing your cell" — nothing is ringing anything.
    line = "Call ended";
  } else {
    switch (row.status) {
      case "RINGING":
        line = direction === "INBOUND" ? "Ringing…" : via === "app" ? "Calling from the app…" : "Ringing your cell first…";
        tone = "text-[color:var(--ds-warn)]";
        break;
      case "IN_PROGRESS":
        line = `On the line${who ? ` · ${who}` : ""} · ${fmtElapsed(row.answeredAt ? Date.parse(row.answeredAt) : null, now)}`;
        tone = "text-[color:var(--ds-good)]";
        break;
      case "COMPLETED":
        line = `Answered${durationSec !== null ? ` · ${fmtSecs(durationSec)}` : ""}${who ? ` · ${who}` : ""}`;
        break;
      case "MISSED":
        line = "Missed";
        tone = "text-[color:var(--ds-bad)]";
        break;
      case "VOICEMAIL":
        line = `Left a voicemail${voicemailSec !== null ? ` · ${fmtSecs(voicemailSec)}` : ""}`;
        tone = "text-[color:var(--ds-primary)]";
        break;
      case "NO_ANSWER":
        line = "No answer";
        break;
      default:
        line = "Didn't connect";
    }
  }

  const terminal = !live && !LIVE.has(row.status);
  const Icon = live
    ? ringing
      ? PhoneIncoming
      : Phone
    : row.status === "VOICEMAIL"
      ? Voicemail
      : row.status === "MISSED"
        ? PhoneMissed
        : direction === "INBOUND"
          ? PhoneIncoming
          : PhoneOutgoing;
  const ring = live
    ? ringing
      ? "bg-[color:var(--ds-good-soft)] text-[color:var(--ds-good)] ring-8 ring-[color:var(--ds-good-soft)] animate-pulse"
      : dialing
        ? "bg-gray-100 text-gray-700 ring-8 ring-gray-100 animate-pulse"
        : "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] ring-8 ring-[color:var(--ds-good-soft)]"
    : ended && LIVE.has(row.status)
      ? "bg-gray-100 text-gray-600"
      : row.status === "IN_PROGRESS"
        ? "bg-[color:var(--ds-good)] text-[color:var(--ds-surface)] ring-8 ring-[color:var(--ds-good-soft)]"
        : row.status === "RINGING"
          ? "bg-[color:var(--ds-warn-soft)] text-[color:var(--ds-warn)] ring-8 ring-[color:var(--ds-warn-soft)] animate-pulse"
          : "bg-gray-100 text-gray-600";
  // A saved caller shows as their monogram; the same halo as the icon face while the call is live.
  const halo = live
    ? ringing
      ? "ring-8 ring-[color:var(--ds-good-soft)] animate-pulse"
      : dialing
        ? "ring-8 ring-gray-100 animate-pulse"
        : "ring-8 ring-[color:var(--ds-good-soft)]"
    : !(ended && LIVE.has(row.status)) && row.status === "IN_PROGRESS"
      ? "ring-8 ring-[color:var(--ds-good-soft)]"
      : !(ended && LIVE.has(row.status)) && row.status === "RINGING"
        ? "ring-8 ring-[color:var(--ds-warn-soft)] animate-pulse"
        : "";
  const face = contactId ? (
    <span className={`mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full ${halo}`}>
      <Monogram name={label} size={76} />
    </span>
  ) : (
    <span className={`mx-auto flex h-[76px] w-[76px] items-center justify-center rounded-full ${ring}`}>
      <Icon size={30} />
    </span>
  );

  return (
    <div className="ds-card mt-3 px-5 pb-6 pt-8 text-center sm:px-8">
      {face}
      <h1 className="mt-4 truncate text-[26px] font-semibold leading-tight text-gray-900">
        {contactId ? (
          <Link href={`/app/contacts/${contactId}`} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </h1>
      <p className="numeral-ledger mt-1 text-sm text-gray-500">
        {standing && <span className="font-sans">{standing}</span>}
        {standing && number && " · "}
        {number}
      </p>
      <p className={`mt-2 text-[15px] ${tone} ${live && onLine ? "numeral-ledger text-lg tabular-nums" : ""}`}>
        {line}
        {!(live && onLine) && <span className="text-gray-400"> · {placedAt}</span>}
      </p>

      {live && ringing && (
        <div className="mt-7 flex items-start justify-center gap-10">
          <Control icon={PhoneOff} label="Decline" tone="red" size="lg" onClick={() => softphone.decline()} title="Decline — sends the call on to the cell / voicemail" />
          <Control icon={Phone} label="Answer" tone="green" size="lg" onClick={() => softphone.answer()} />
        </div>
      )}
      {live && !ringing && (
        <>
          <div className="mx-auto mt-7 flex max-w-[320px] items-start justify-center gap-5 sm:gap-6">
            <Control icon={live.muted ? MicOff : Mic} label={live.muted ? "Unmute" : "Mute"} on={live.muted} disabled={dialing} onClick={() => softphone.toggleMute()} />
            <Control icon={held ? Play : Pause} label={held ? "Resume" : "Hold"} on={held} disabled={dialing} onClick={() => softphone.toggleHold()} />
            {sp.speaker !== null && (
              // iPhone: speakerphone (the system call screen has the same switch).
              <Control icon={Volume2} label="Speaker" on={!!sp.speaker} disabled={dialing} onClick={() => softphone.toggleSpeaker()} />
            )}
            <Control icon={Grid3x3} label="Keypad" on={pad} disabled={dialing} onClick={() => setPad((v) => !v)} title="Keypad — touch-tones for phone menus" />
          </div>
          <div className="mt-5 flex justify-center">
            <Control icon={PhoneOff} label={dialing ? "Cancel" : "Hang up"} tone="red" size="lg" onClick={() => softphone.hangup()} />
          </div>
        </>
      )}
      {live && !ringing && (
        <div className="mx-auto mt-5 max-w-xs text-left">
          <MicRow />
          <MicWarning className="mt-2" />
        </div>
      )}
      {live && pad && !dialing && (
        <div className="mx-auto mt-5 max-w-[260px] border-t border-gray-100 pt-4">
          <DialPad mode="tones" />
        </div>
      )}

      {terminal && row.status === "VOICEMAIL" && (voicemailRecordingId || voicemailSec !== null) && (
        <div className="mx-auto mt-2 max-w-md text-left">
          <VoicemailPlayer callId={callId} seconds={voicemailSec} />
        </div>
      )}
      {terminal && canCall && customerNumber && customerNumber !== "unknown" && (
        <div className="mt-5 flex justify-center">
          <CallFromLineButton to={customerNumber} contactId={contactId} contactName={label} agentPhone="" label={direction === "INBOUND" ? "Call back" : "Call again"} />
        </div>
      )}
    </div>
  );
}
