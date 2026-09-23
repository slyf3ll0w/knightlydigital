"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Grid3x3, Mic, MicOff, Pause, Phone, PhoneIncoming, PhoneMissed, PhoneOff, PhoneOutgoing, Play, UserRound, Voicemail } from "lucide-react";
import { fmtElapsed, softphone, useSoftphone } from "@/lib/softphone-client";
import DialPad from "@/components/DialPad";
import { MicRow, MicWarning } from "@/components/MicControls";
import CallFromLineButton from "@/components/CallFromLineButton";
import VoicemailPlayer from "@/components/VoicemailPlayer";

/**
 * The top of the call screen: who, and what's happening right now. When
 * the softphone in this tab is on THIS call, the card is the phone — timer,
 * mute, hold, a touch-tone keypad, hang up (or Answer / Decline while it
 * rings). Otherwise it reports the row: ringing the cell, on the cell with
 * a running timer, or how it ended — and offers Call back. A live row is
 * polled so the screen turns over the moment the call ends, and the page
 * re-renders (durations, "On this call") when the browser call closes.
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
}: {
  callId: string;
  direction: "INBOUND" | "OUTBOUND";
  status: Status;
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
    tone = ringing ? "text-green-700" : "text-gray-700";
  } else {
    switch (row.status) {
      case "RINGING":
        line = direction === "INBOUND" ? "Ringing…" : "Ringing your cell first…";
        tone = "text-amber-700";
        break;
      case "IN_PROGRESS":
        line = `On the line${who ? ` · ${who}` : ""} · ${fmtElapsed(row.answeredAt ? Date.parse(row.answeredAt) : null, now)}`;
        tone = "text-green-700";
        break;
      case "COMPLETED":
        line = `Answered${durationSec !== null ? ` · ${fmtSecs(durationSec)}` : ""}${who ? ` · ${who}` : ""}`;
        break;
      case "MISSED":
        line = "Missed";
        tone = "text-red-700";
        break;
      case "VOICEMAIL":
        line = `Left a voicemail${voicemailSec !== null ? ` · ${fmtSecs(voicemailSec)}` : ""}`;
        tone = "text-blue-700";
        break;
      case "NO_ANSWER":
        line = "No answer";
        break;
      default:
        line = "Didn't connect";
    }
  }

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
      ? "bg-green-100 text-green-700 ring-8 ring-green-100/70 animate-pulse"
      : dialing
        ? "bg-gray-100 text-gray-700 ring-8 ring-gray-100 animate-pulse"
        : "bg-green-500 text-white ring-8 ring-green-100"
    : row.status === "IN_PROGRESS"
      ? "bg-green-500 text-white ring-8 ring-green-100"
      : row.status === "RINGING"
        ? "bg-amber-100 text-amber-700 ring-8 ring-amber-50 animate-pulse"
        : "bg-gray-100 text-gray-600";
  const btn = "flex h-12 w-12 items-center justify-center rounded-full transition-colors disabled:opacity-50";
  const terminal = !live && !LIVE.has(row.status);

  return (
    <div className="card-tool mt-3 px-5 pb-5 pt-7 text-center sm:px-8">
      <span className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full ${ring}`}>
        {contactId && !live && terminal ? <UserRound size={26} /> : <Icon size={26} />}
      </span>
      <h1 className="mt-4 truncate text-2xl font-semibold text-gray-900">
        {contactId ? (
          <Link href={`/app/contacts/${contactId}`} className="hover:underline">
            {label}
          </Link>
        ) : (
          label
        )}
      </h1>
      <p className="numeral-ledger mt-0.5 text-sm text-gray-500">
        {standing && <span className="font-sans">{standing}</span>}
        {standing && number && " · "}
        {number}
      </p>
      <p className={`mt-2 text-sm ${tone}`}>
        {line}
        <span className="text-gray-400"> · {placedAt}</span>
      </p>

      {live && (
        <div className="mt-6 flex items-center justify-center gap-3">
          {ringing ? (
            <>
              <button type="button" onClick={() => softphone.decline()} className={`${btn} bg-red-500 text-white hover:bg-red-600`} title="Decline — sends the call on to the cell / voicemail" aria-label="Decline">
                <PhoneOff size={20} />
              </button>
              <button type="button" onClick={() => softphone.answer()} className={`${btn} w-auto gap-2 bg-green-500 px-6 text-sm font-semibold text-white hover:bg-green-600`} aria-label="Answer">
                <Phone size={20} /> Answer
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={() => softphone.toggleMute()}
                disabled={dialing}
                className={`${btn} ${live.muted ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                title={live.muted ? "Unmute" : "Mute"}
                aria-label={live.muted ? "Unmute" : "Mute"}
              >
                {live.muted ? <MicOff size={20} /> : <Mic size={20} />}
              </button>
              <button
                type="button"
                onClick={() => softphone.toggleHold()}
                disabled={dialing}
                className={`${btn} ${held ? "bg-amber-100 text-amber-800" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                title={held ? "Resume" : "Hold"}
                aria-label={held ? "Resume" : "Hold"}
              >
                {held ? <Play size={20} /> : <Pause size={20} />}
              </button>
              <button
                type="button"
                onClick={() => setPad((v) => !v)}
                disabled={dialing}
                className={`${btn} ${pad ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-700 hover:bg-gray-200"}`}
                title="Keypad — touch-tones for phone menus"
                aria-label="Keypad"
                aria-pressed={pad}
              >
                <Grid3x3 size={20} />
              </button>
              <button type="button" onClick={() => softphone.hangup()} className={`${btn} w-auto gap-2 bg-red-500 px-6 text-sm font-semibold text-white hover:bg-red-600`} aria-label="Hang up">
                <PhoneOff size={20} /> {dialing ? "Cancel" : "Hang up"}
              </button>
            </>
          )}
        </div>
      )}
      {live && !ringing && (
        <div className="mx-auto mt-4 max-w-xs text-left">
          <MicRow className="justify-center" />
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
