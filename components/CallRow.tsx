import Link from "next/link";
import { PhoneIncoming, PhoneOutgoing, PhoneMissed, Voicemail, PhoneOff } from "lucide-react";
import { fmtPhone } from "@/lib/format";

/**
 * One call on the business line, as /app/calls and the contact page's
 * "Recent calls" card show it. Server component — the only interactive
 * piece is the native <audio> for a voicemail, which streams through
 * /api/app/calls/[id]/voicemail (a redirect to Telnyx's short-lived URL).
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
  contact: { id: string; firstName: string; lastName: string } | null;
  user: { name: string } | null;
  /** "app" (browser softphone) or "cell"; null on older rows. */
  via?: string | null;
  /** Who picked up in the app (inbound only). */
  answeredBy?: { name: string } | null;
};

const STATUS: Record<CallRowData["status"], { label: string; tone: string }> = {
  RINGING: { label: "Ringing", tone: "text-amber-700" },
  IN_PROGRESS: { label: "On the line", tone: "text-green-700" },
  COMPLETED: { label: "Answered", tone: "text-gray-500" },
  MISSED: { label: "Missed", tone: "text-red-700" },
  VOICEMAIL: { label: "Voicemail", tone: "text-blue-700" },
  NO_ANSWER: { label: "No answer", tone: "text-gray-500" },
  FAILED: { label: "Didn't connect", tone: "text-gray-500" },
};

export function fmtDuration(secs: number): string {
  return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, "0")}`;
}

function Icon({ call }: { call: CallRowData }) {
  const cls = "shrink-0";
  if (call.status === "VOICEMAIL") return <Voicemail size={16} className={`${cls} text-blue-600`} />;
  if (call.status === "MISSED") return <PhoneMissed size={16} className={`${cls} text-red-600`} />;
  if (call.status === "NO_ANSWER" || call.status === "FAILED") return <PhoneOff size={16} className={`${cls} text-gray-400`} />;
  return call.direction === "INBOUND" ? (
    <PhoneIncoming size={16} className={`${cls} text-green-600`} />
  ) : (
    <PhoneOutgoing size={16} className={`${cls} text-gray-500`} />
  );
}

export default function CallRow({ call, showContact = true }: { call: CallRowData; showContact?: boolean }) {
  const name = call.contact ? `${call.contact.firstName} ${call.contact.lastName}`.trim() : "";
  const label = name || fmtPhone(call.customerNumber) || "Unknown caller";
  const s = STATUS[call.status];
  const unseen = !call.seenAt && (call.status === "MISSED" || call.status === "VOICEMAIL");
  const when = call.createdAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  const first = (n: string) => n.split(" ")[0];
  const who =
    call.direction === "OUTBOUND" && call.user
      ? `by ${first(call.user.name)}${call.via === "app" ? " · in the app" : ""}`
      : call.direction === "INBOUND" && call.answeredBy
        ? `${first(call.answeredBy.name)} · in the app`
        : "";
  const detail =
    call.status === "COMPLETED" && call.durationSec !== null
      ? [fmtDuration(call.durationSec), who].filter(Boolean).join(" · ")
      : call.status === "VOICEMAIL" && call.voicemailSec !== null
        ? `${fmtDuration(call.voicemailSec)} message`
        : who;

  return (
    <div className="card-ledger px-4 py-3">
      <div className="flex items-center gap-3">
        <Icon call={call} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            {showContact && call.contact ? (
              <Link href={`/app/contacts/${call.contact.id}`} className={`text-sm truncate hover:underline ${unseen ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>
                {label}
              </Link>
            ) : (
              <p className={`text-sm truncate ${unseen ? "font-bold text-gray-900" : "font-semibold text-gray-800"}`}>{showContact ? label : ""}</p>
            )}
            {name && showContact && <span className="text-xs text-gray-400 truncate">{fmtPhone(call.customerNumber)}</span>}
            <span className="ml-auto shrink-0 text-xs text-gray-500">{when}</span>
          </div>
          <p className="text-[13px] mt-0.5 flex items-center gap-2">
            <span className={`stamp ${s.tone}`}>{s.label}</span>
            {detail && <span className="text-gray-500">{detail}</span>}
          </p>
        </div>
      </div>
      {call.status === "VOICEMAIL" && (call.voicemailRecordingId || call.voicemailSec !== null) && (
        <audio controls preload="none" src={`/api/app/calls/${call.id}/voicemail`} className="mt-2 w-full h-9" />
      )}
    </div>
  );
}
