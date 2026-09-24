import Link from "next/link";
import {
  ChevronRight,
  PhoneIncoming,
  PhoneOutgoing,
  PhoneMissed,
  Phone,
  Voicemail,
  Headphones,
  MessageSquare,
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
import Monogram from "@/components/Monogram";

/**
 * One call on the business line — a ROW in a recents list, the way a
 * phone's Recents and the Clients ledger lay theirs out: monogram (or a
 * tinted tile for a number nobody has saved), the name, one quiet line
 * under it saying what happened (incoming · 2:31 · Alex), the time on the
 * right. Rows have no border of their own; the list around them is the
 * `card-ledger divide-y` sheet, so /app/calls, the contact page's "Recent
 * calls" card and the call screen's "Earlier calls" all read the same.
 *
 * iOS conventions carried over: a missed call's name is red, an unseen
 * missed call or voicemail is bold with a dot on the avatar, and on a
 * phone the whole row opens the call screen (a stretched link under the
 * content; the voicemail player sits above it). Desktop keeps the name as
 * the link and shows Text / Call back at the end of the row.
 *
 * Server component; the interactive pieces are the in-app voicemail player
 * (components/VoicemailPlayer.tsx) and Call back, which rings the browser
 * softphone when it's registered and the cell otherwise
 * (components/CallFromLineButton.tsx). What got done on the call
 * (lib/call-events.ts) trails the status line as plain linked text.
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
  /** When the call ended; with createdAt it gives the time on the line for a call that never connected. */
  endedAt?: Date | string | null;
  contact: { id: string; firstName: string; lastName: string; status?: "LEAD" | "ACTIVE" | "ARCHIVED" } | null;
  user: { name: string } | null;
  /** "app" (browser softphone) or "cell"; null on older rows. */
  via?: string | null;
  /** Who picked up in the app (inbound only). */
  answeredBy?: { name: string } | null;
  /** What got done on this call — quote sent, appointment booked, saved as a lead… */
  events?: CallEvent[];
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

/**
 * No verdicts on calls that connected or didn't — like a phone's recents,
 * just the time on the line. (A carrier's voicemail picking up is an "answer"
 * to the network, so "Answered" was misleading.) Talk time when it connected,
 * ring time when it didn't; null for the statuses that keep a word.
 */
export function phoneTime(call: Pick<CallRowData, "status" | "durationSec" | "createdAt" | "endedAt">): string | null {
  if (call.status === "COMPLETED") return fmtDuration(call.durationSec ?? 0);
  if (call.status === "NO_ANSWER" || call.status === "FAILED") {
    if (!call.endedAt) return "0:00";
    const secs = Math.round((new Date(call.endedAt).getTime() - new Date(call.createdAt).getTime()) / 1000);
    return fmtDuration(Math.max(0, secs));
  }
  return null;
}

/** "lead" / "client" — the standing word shown after a name. */
export function standingWord(status: "LEAD" | "ACTIVE" | "ARCHIVED" | undefined): string {
  return status === "LEAD" ? "lead" : status === "ACTIVE" ? "client" : status === "ARCHIVED" ? "archived" : "";
}

/** A missed call, the way a phone counts one: they rang and nobody picked up (voicemail is its own thing). */
export function isMissed(call: Pick<CallRowData, "status" | "direction">): boolean {
  return call.status === "MISSED" || (call.direction === "INBOUND" && call.status === "NO_ANSWER");
}

/** The word under the name, its icon, and its ink. */
function describe(call: CallRowData): { label: string; Icon: LucideIcon; tone: string } {
  const inbound = call.direction === "INBOUND";
  switch (call.status) {
    case "RINGING":
      return { label: inbound ? "Ringing" : "Calling", Icon: inbound ? PhoneIncoming : PhoneOutgoing, tone: "text-amber-700" };
    case "IN_PROGRESS":
      return { label: "On the line", Icon: Phone, tone: "text-green-700" };
    case "VOICEMAIL":
      return { label: "Voicemail", Icon: Voicemail, tone: "text-blue-700" };
    case "MISSED":
      return { label: "Missed call", Icon: PhoneMissed, tone: "text-red-600" };
    case "NO_ANSWER":
      return inbound
        ? { label: "Missed call", Icon: PhoneMissed, tone: "text-red-600" }
        : { label: "No answer", Icon: PhoneOutgoing, tone: "text-gray-500" };
    case "FAILED":
      return { label: "Didn't connect", Icon: inbound ? PhoneIncoming : PhoneOutgoing, tone: "text-gray-500" };
    default:
      return inbound
        ? { label: "Incoming", Icon: PhoneIncoming, tone: "text-gray-500" }
        : { label: "Outgoing", Icon: PhoneOutgoing, tone: "text-gray-500" };
  }
}

/** The 40px avatar: the client's monogram when the caller is saved; a tinted tile that says what happened otherwise. */
function Avatar({ call, name, unseen }: { call: CallRowData; name: string; unseen: boolean }) {
  let inner: React.ReactNode;
  if (name) {
    inner = <Monogram name={name} size={40} />;
  } else {
    let cls = "bg-gray-100 text-gray-600";
    let Icon: LucideIcon = call.direction === "INBOUND" ? PhoneIncoming : PhoneOutgoing;
    if (call.status === "VOICEMAIL") {
      cls = "bg-blue-50 text-blue-600";
      Icon = Voicemail;
    } else if (isMissed(call)) {
      cls = "bg-red-50 text-red-600";
      Icon = PhoneMissed;
    } else if (call.status === "IN_PROGRESS") {
      cls = "bg-green-500 text-white";
      Icon = Phone;
    } else if (call.status === "RINGING") {
      cls = "bg-amber-50 text-amber-600";
    }
    inner = (
      <span className={`flex h-10 w-10 items-center justify-center rounded-full ${cls}`}>
        <Icon size={17} />
      </span>
    );
  }
  return (
    <span className="relative shrink-0">
      {inner}
      {unseen && <span className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-white bg-red-500" aria-label="New" />}
    </span>
  );
}

export default function CallRow({
  call,
  showContact = true,
  tz,
  canCall = false,
  canText = false,
}: {
  call: CallRowData;
  showContact?: boolean;
  /** Company timezone for the time-of-day; the day itself is the group header. */
  tz?: string;
  /** Show "Call back" (the line is on the voice app). */
  canCall?: boolean;
  /** Show "Text" for known callers (the texting registration is ACTIVE). */
  canText?: boolean;
}) {
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  // A withheld caller ID arrives as the literal "unknown" — no number to show.
  const number = call.customerNumber === "unknown" ? "" : fmtPhone(call.customerNumber);
  const label = name || number || "Unknown caller";
  const standing = standingWord(call.contact?.status);
  const live = call.status === "RINGING" || call.status === "IN_PROGRESS";
  const missed = isMissed(call);
  const unseen = !call.seenAt && (call.status === "MISSED" || call.status === "VOICEMAIL");
  const when = fmtTime(call.createdAt, tz);
  const { label: kind, Icon: KindIcon, tone } = describe(call);
  const onPhone = phoneTime(call);
  const first = (n: string) => n.split(" ")[0];
  const who =
    call.direction === "OUTBOUND" && call.user
      ? first(call.user.name)
      : call.direction === "INBOUND" && call.answeredBy
        ? first(call.answeredBy.name)
        : "";
  const parts: string[] = [];
  if (onPhone !== null) parts.push(onPhone);
  if (call.status === "VOICEMAIL" && call.voicemailSec !== null) parts.push(`${fmtDuration(call.voicemailSec)} message`);
  if (who) parts.push(who);
  const showCallBack = canCall && !live && Boolean(call.customerNumber && call.customerNumber !== "unknown");
  // Once the line can text, a known caller gets a Text button: the thread sends from the business number and replies land back in it.
  const showText = canText && !live && Boolean(call.contact);
  const events = call.events ?? [];
  const title = showContact ? label : call.direction === "INBOUND" ? "Incoming call" : "Outgoing call";
  const href = `/app/calls/${call.id}`;
  const nameInk = missed && !live ? "text-red-600" : "text-gray-900";

  return (
    <div className={`relative flex items-center gap-3 px-4 py-3 transition-colors hover:bg-gray-50 active:bg-gray-100 lg:py-2.5 ${live ? "bg-green-50/40" : ""}`}>
      {/* Phones: the whole row opens the call screen. Sits under the content so the voicemail player still takes taps. */}
      <Link href={href} aria-label={`Open the call with ${title}`} className="absolute inset-0 z-0 lg:hidden" />
      <Avatar call={call} name={showContact ? name : ""} unseen={unseen} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline gap-2">
          <Link
            href={href}
            className={`truncate text-[15.5px] hover:underline lg:text-sm ${nameInk} ${unseen ? "font-bold" : "font-semibold"}`}
            title={live ? "Open the call screen" : "Open this call"}
          >
            {title}
          </Link>
          {showContact && standing && <span className="shrink-0 text-xs text-gray-400">{standing}</span>}
          {name && showContact && <span className="numeral-ledger hidden truncate text-xs text-gray-400 lg:inline">{number}</span>}
          <span className="numeral-ledger ml-auto shrink-0 text-xs tabular-nums text-gray-500">{when}</span>
        </div>
        <div className="mt-0.5 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-gray-500">
          <KindIcon size={13} className={`shrink-0 ${tone}`} aria-hidden />
          <span className={live || missed || call.status === "VOICEMAIL" ? `font-medium ${tone}` : ""}>{kind}</span>
          {parts.map((p) => (
            <span key={p} className="flex items-center gap-1.5">
              <span className="text-gray-300">·</span>
              <span className="numeral-ledger">{p}</span>
            </span>
          ))}
          {call.direction === "OUTBOUND" && call.via === "app" && <Headphones size={12} className="text-gray-400" aria-label="Placed from the browser" />}
          {events.slice(0, 3).map((e) => {
            const Icon = EVENT_ICON[e.kind];
            return (
              <span key={`${e.kind}-${e.href}`} className="relative z-10 flex items-center gap-1.5 text-gray-700">
                <span className="text-gray-300">·</span>
                <Link href={e.href} className="inline-flex items-center gap-1 font-medium hover:underline">
                  <Icon size={12} className="text-gray-500" />
                  {e.label}
                </Link>
              </span>
            );
          })}
          {events.length > 3 && <span className="text-gray-400">+{events.length - 3}</span>}
        </div>
        {call.status === "VOICEMAIL" && (call.voicemailRecordingId || call.voicemailSec !== null) && (
          <div className="relative z-10">
            <VoicemailPlayer callId={call.id} seconds={call.voicemailSec} />
          </div>
        )}
      </div>
      {(showCallBack || showText) && (
        <div className="hidden shrink-0 items-center gap-1.5 lg:flex">
          {showText && call.contact && (
            <Link
              href={`/app/messages/thread/${call.contact.id}`}
              className="btn-tool-line inline-flex items-center gap-1 rounded-[10px] bg-white px-2.5 py-1 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <MessageSquare size={12} />
              Text
            </Link>
          )}
          {showCallBack && <CallFromLineButton to={call.customerNumber} contactId={call.contact?.id} contactName={label} agentPhone="" compact label="Call back" />}
        </div>
      )}
      <ChevronRight size={15} className="shrink-0 text-gray-300 lg:hidden" aria-hidden />
    </div>
  );
}
