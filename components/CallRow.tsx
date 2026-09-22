import Link from "next/link";
import {
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Voicemail,
  PhoneOff,
  Headphones,
  FileText,
  CalendarClock,
  Briefcase,
  Receipt,
  UserPlus,
  BadgeCheck,
  type LucideIcon,
} from "lucide-react";
import { fmtPhone, fmtTime } from "@/lib/format";
import type { CallEvent, CallEventKind } from "@/lib/call-events";
import VoicemailPlayer from "@/components/VoicemailPlayer";
import CallFromLineButton from "@/components/CallFromLineButton";

/**
 * One call on the business line, as /app/calls and the contact page's
 * "Recent calls" card show it. Server component; the interactive pieces are
 * the in-app voicemail player (components/VoicemailPlayer.tsx) and the
 * "Call back" button, which rings the browser softphone when it's registered
 * and the cell otherwise (components/CallFromLineButton.tsx).
 *
 * The name opens the call screen (/app/calls/[id]) — save the caller, quote,
 * schedule or invoice from there. Whether they're a lead or a client is a
 * quiet word after the name; what got done on the call (lib/call-events.ts)
 * sits in the second line as plain linked text, no badges.
 */

export type CallRowData = {
  id: string;
  direction: "INBOUND" | "OUTBOUND";
  status: "RINGING" | "IN_PROGRESS" | "COMPLETED" | "MISSED" | "VOICEMAIL" | "NO_ANSWER" | "FAILED";
  customerNumber: string;
  durationSec: number | null;
  voicemailSec: number | null;
  voicemailRecordingId: string | null;
  seenAt: Date | null;
  createdAt: Date;
  contact: { id: string; firstName: string; lastName: string; status?: "LEAD" | "ACTIVE" | "ARCHIVED" } | null;
  user: { name: string } | null;
  /** "app" (browser softphone) or "cell"; null on older rows. */
  via?: string | null;
  /** Who picked up in the app (inbound only). */
  answeredBy?: { name: string } | null;
  /** What got done on this call — quote sent, appointment booked, saved as a lead… */
  events?: CallEvent[];
};

const STATUS: Record<CallRowData["status"], { label: string; tone: string }> = {
  RINGING: { label: "Ringing", tone: "text-amber-700" },
  IN_PROGRESS: { label: "On the line", tone: "text-green-700" },
  COMPLETED: { label: "Answered", tone: "text-green-700" },
  MISSED: { label: "Missed", tone: "text-red-700" },
  VOICEMAIL: { label: "Voicemail", tone: "text-blue-700" },
  NO_ANSWER: { label: "No answer", tone: "text-gray-600" },
  FAILED: { label: "Didn't connect", tone: "text-gray-600" },
};

export const EVENT_ICON: Record<CallEventKind, LucideIcon> = {
  new_lead: UserPlus,
  new_client: UserPlus,
  became_client: BadgeCheck,
  quote_sent: FileText,
  quote_drafted: FileText,
  appointment: CalendarClock,
  job: Briefcase,
  invoice_sent: Receipt,
  invoice_drafted: Receipt,
};

export function fmtDuration(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

/** "lead" / "client" — the standing word shown after a name. */
export function standingWord(status: "LEAD" | "ACTIVE" | "ARCHIVED" | undefined): string {
  return status === "LEAD" ? "lead" : status === "ACTIVE" ? "client" : status === "ARCHIVED" ? "archived" : "";
}

/** The 40px tile: shape + tint say what happened before the text does. */
function Tile({ call }: { call: CallRowData }) {
  const unseen = !call.seenAt && (call.status === "MISSED" || call.status === "VOICEMAIL");
  let cls = "bg-gray-100 text-gray-600";
  let Icon = call.direction === "INBOUND" ? PhoneIncoming : PhoneOutgoing;
  if (call.status === "VOICEMAIL") {
    cls = "bg-blue-50 text-blue-600";
    Icon = Voicemail;
  } else if (call.status === "MISSED") {
    cls = "bg-red-50 text-red-600";
    Icon = PhoneMissed;
  } else if (call.status === "NO_ANSWER" || call.status === "FAILED") {
    cls = "bg-gray-100 text-gray-400";
    Icon = PhoneOff;
  } else if (call.status === "COMPLETED" || call.status === "IN_PROGRESS") {
    cls = call.direction === "INBOUND" ? "bg-green-50 text-green-600" : "bg-gray-100 text-gray-700";
  } else if (call.status === "RINGING") {
    cls = "bg-amber-50 text-amber-600";
  }
  return (
    <span className={`relative flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${cls}`}>
      <Icon size={17} />
      {unseen && <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" aria-label="New" />}
    </span>
  );
}

export default function CallRow({
  call,
  showContact = true,
  tz,
  canCall = false,
}: {
  call: CallRowData;
  showContact?: boolean;
  /** Company timezone for the time-of-day; the day itself is the group header. */
  tz?: string;
  /** Show "Call back" (the line is on the voice app). */
  canCall?: boolean;
}) {
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  const number = fmtPhone(call.customerNumber);
  const label = name || number || "Unknown caller";
  const standing = standingWord(call.contact?.status);
  const s = STATUS[call.status];
  const live = call.status === "RINGING" || call.status === "IN_PROGRESS";
  const unseen = !call.seenAt && (call.status === "MISSED" || call.status === "VOICEMAIL");
  const when = fmtTime(call.createdAt, tz);
  const first = (n: string) => n.split(" ")[0];
  const who =
    call.direction === "OUTBOUND" && call.user
      ? `${first(call.user.name)}${call.via === "app" ? " · in the app" : ""}`
      : call.direction === "INBOUND" && call.answeredBy
        ? `${first(call.answeredBy.name)} · in the app`
        : call.direction === "INBOUND" && call.status === "COMPLETED"
          ? "on the cell"
          : "";
  const parts: string[] = [];
  if (call.status === "COMPLETED" && call.durationSec !== null) parts.push(fmtDuration(call.durationSec));
  if (call.status === "VOICEMAIL" && call.voicemailSec !== null) parts.push(`${fmtDuration(call.voicemailSec)} message`);
  if (who) parts.push(who);
  const showCallBack = canCall && !live && Boolean(call.customerNumber && call.customerNumber !== "unknown");
  const events = call.events ?? [];
  const title = showContact ? label : call.direction === "INBOUND" ? "Incoming call" : "Outgoing call";

  return (
    <div className={`card-ledger px-4 py-3 ${unseen ? "border-l-2 border-l-red-400" : live ? "border-l-2 border-l-green-400" : ""}`}>
      <div className="flex items-start gap-3">
        <Tile call={call} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <Link
              href={`/app/calls/${call.id}`}
              className={`truncate text-[15px] hover:underline ${unseen ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}
              title={live ? "Open the call screen" : "Open this call"}
            >
              {title}
            </Link>
            {showContact && standing && <span className="shrink-0 text-xs text-gray-400">{standing}</span>}
            {name && showContact && <span className="numeral-ledger hidden truncate text-xs text-gray-400 sm:inline">{number}</span>}
            <span className="numeral-ledger ml-auto shrink-0 text-xs tabular-nums text-gray-500">{when}</span>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px]">
            <span className={`stamp ${s.tone}`}>{s.label}</span>
            {parts.length > 0 && <span className="text-gray-500">{parts.join(" · ")}</span>}
            {call.direction === "OUTBOUND" && call.via === "app" && <Headphones size={12} className="text-gray-400" aria-label="Placed from the browser" />}
            {events.slice(0, 3).map((e, i) => {
              const Icon = EVENT_ICON[e.kind];
              return (
                <span key={`${e.kind}-${e.href}`} className="flex items-center gap-2 text-gray-700">
                  {(i > 0 || parts.length > 0) && <span className="text-gray-300">·</span>}
                  <Link href={e.href} className="inline-flex items-center gap-1 font-medium hover:underline">
                    <Icon size={12} className="text-gray-500" />
                    {e.label}
                  </Link>
                </span>
              );
            })}
            {events.length > 3 && <span className="text-gray-400">+{events.length - 3}</span>}
            {showCallBack && (
              <span className="ml-auto">
                <CallFromLineButton to={call.customerNumber} contactId={call.contact?.id} contactName={label} agentPhone="" compact label="Call back" />
              </span>
            )}
          </div>
          {call.status === "VOICEMAIL" && (call.voicemailRecordingId || call.voicemailSec !== null) && <VoicemailPlayer callId={call.id} seconds={call.voicemailSec} />}
        </div>
      </div>
    </div>
  );
}
