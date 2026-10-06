"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Grid3x3, Loader2, MessageSquarePlus, PhoneCall, Search, X } from "lucide-react";
import Modal from "@/components/Modal";
import BottomSheet from "@/components/BottomSheet";
import Monogram from "@/components/Monogram";
import { hapticImpact } from "@/lib/haptics";
import { telHref } from "@/lib/messaging";
import { callFromLine, useLineCalling } from "@/lib/line-calling";

/**
 * Pick someone to reach: type a name, company or number, tap a row.
 *
 *   message → land in their conversation (the existing thread or an empty
 *             one — same route); a typed number nobody has starts a thread
 *             when the company has a line.
 *   call    → dial them right away — from the business line when it's set
 *             up (lib/line-calling.ts, like every Call button), else the
 *             phone's own dialer. A typed number dials as-is; Keypad opens
 *             the Calls page's pad.
 *
 * Used by the inbox's New message button and the phone Create sheet's Call
 * and Message tiles (David 2026-10-06: the tiles open this picker instead of
 * dropping you on the Calls page). `sheet` = phone bottom sheet, else a
 * desktop modal. The list is the picker feed (/api/app/contacts: clients,
 * leads and business contacts), filtered client-side.
 */

type FeedContact = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string | null;
  status?: string;
  kind: "CLIENT" | "CONTACT";
};

const fullName = (c: FeedContact) => `${c.firstName} ${c.lastName}`.trim() || "Unnamed";

function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

export default function ReachPicker({
  open,
  onClose,
  mode,
  sheet,
  hasLine = false,
}: {
  open: boolean;
  onClose: () => void;
  mode: "message" | "call";
  sheet: boolean;
  /** The company has a business line — a typed-in number can start a text thread. */
  hasLine?: boolean;
}) {
  const router = useRouter();
  const lineCalls = useLineCalling();
  const [contacts, setContacts] = useState<FeedContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  const calling = mode === "call";
  const title = calling ? "Call" : "New message";

  // Fresh search each time it opens
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setError("");
  }, [open]);

  useEffect(() => {
    if (!open || contacts) return;
    let stopped = false;
    fetch("/api/app/contacts")
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("load"))))
      .then((d: FeedContact[]) => {
        if (!stopped) setContacts(Array.isArray(d) ? d : []);
      })
      .catch(() => {
        if (!stopped) setError("Couldn't load your clients. Try again.");
      });
    return () => {
      stopped = true;
    };
  }, [open, contacts]);

  // A typed number: 10 digits (or 11 with a leading 1). Calls dial any
  // number; texts need the line to send from.
  const typedDigits = query.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const typedNumber = typedDigits.length === 10 && (calling || hasLine) ? typedDigits : null;

  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, "");
  const matches = useMemo(() => {
    if (!contacts) return [];
    // Nobody to dial without a number
    const pool = calling ? contacts.filter((c) => c.phone) : contacts;
    if (!q) return pool;
    return pool.filter((c) => {
      if (fullName(c).toLowerCase().includes(q)) return true;
      if (c.companyName?.toLowerCase().includes(q)) return true;
      if (qDigits.length >= 3 && c.phone && c.phone.replace(/\D/g, "").includes(qDigits)) return true;
      return false;
    });
  }, [contacts, q, qDigits, calling]);
  const typedIsKnown = typedNumber
    ? matches.some((c) => c.phone && c.phone.replace(/\D/g, "").endsWith(typedNumber))
    : false;

  function dial(phone: string, contactId: string | null, label: string) {
    onClose();
    if (lineCalls) void callFromLine({ contactId, to: phone, label });
    else window.location.href = telHref(phone);
  }

  async function textNumber(digits: string) {
    if (starting) return;
    setStarting(true);
    setError("");
    try {
      const res = await fetch("/api/app/messages/new-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone: digits }),
      });
      const data = (await res.json().catch(() => null)) as { contactId?: string; error?: string } | null;
      if (!res.ok || !data?.contactId) {
        setError(data?.error ?? "Couldn't start that conversation. Try again.");
        return;
      }
      onClose();
      router.push(`/app/messages/thread/${data.contactId}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

  function pick(c: FeedContact) {
    if (sheet) hapticImpact("LIGHT");
    if (calling) {
      if (c.phone) dial(c.phone, c.id, fullName(c));
      return;
    }
    onClose();
    router.push(`/app/messages/thread/${c.id}`);
  }

  const placeholder = calling
    ? "Name, company, or a number to call…"
    : hasLine
      ? "Name, company, or a phone number to text…"
      : "Search name, company or phone…";

  const searchBox = (
    <div className={`flex items-center gap-2 rounded-[12px] bg-black/5 px-3 py-2 ${sheet ? "" : "border border-gray-200 bg-white"}`}>
      <Search size={15} className="shrink-0 text-gray-400" />
      <input
        type="search"
        inputMode={calling ? "text" : undefined}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
        autoFocus={!sheet}
        className={`w-full bg-transparent outline-none placeholder:text-gray-400 ${sheet ? "text-[16px]" : "text-sm"}`}
      />
    </div>
  );

  const actionRow = (icon: React.ReactNode, label: string, sub: string, onClick: () => void) => (
    <button
      type="button"
      onClick={onClick}
      disabled={starting}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[color:var(--ds-surface-2)] active:bg-black/5 disabled:opacity-60"
    >
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
        {icon}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-medium text-gray-900">{label}</span>
        <span className="block truncate text-[13px] text-gray-500">{sub}</span>
      </span>
    </button>
  );

  const emptyText = !contacts
    ? ""
    : contacts.length === 0
      ? calling
        ? "No clients yet — type a phone number to call it."
        : hasLine
          ? "No clients yet — type a phone number to text someone new, or add a client first."
          : "No clients yet — add one from Clients first."
      : calling
        ? "No one with a phone number matches that. Type a full number to call it."
        : hasLine
          ? "No one matches that. Type a full phone number to text someone new."
          : "No one matches that.";

  const list = (
    <div className={`overflow-y-auto overscroll-contain ${sheet ? "max-h-[55dvh] px-2" : "max-h-[24rem] -mx-1 pr-1"}`}>
      {error && <p className="px-3 py-2 text-center text-sm text-[color:var(--ds-bad)]">{error}</p>}
      {/* A number nobody has — above the matches so a partial hit never hides it */}
      {typedNumber && contacts && !typedIsKnown &&
        (calling
          ? actionRow(<PhoneCall size={16} />, `Call ${prettyPhone(typedNumber)}`, lineCalls ? "From your business line" : "From this phone", () =>
              dial(typedNumber, null, prettyPhone(typedNumber))
            )
          : actionRow(
              starting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />,
              `Text ${prettyPhone(typedNumber)}`,
              "New conversation · save them as a lead, client or contact from the thread",
              () => textNumber(typedNumber)
            ))}
      {!error && !contacts ? (
        <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : !error && contacts && matches.length === 0 && !typedNumber ? (
        <p className="px-3 py-6 text-center text-sm text-gray-400">{emptyText}</p>
      ) : (
        matches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => pick(c)}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[color:var(--ds-surface-2)] active:bg-black/5"
          >
            <Monogram name={fullName(c)} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-gray-900">
                {fullName(c)}
                {c.kind === "CONTACT" ? (
                  <span className="ml-2 text-xs font-normal text-gray-500">Contact</span>
                ) : c.status === "LEAD" ? (
                  <span className="ml-2 text-xs font-normal text-gray-500">Lead</span>
                ) : null}
              </span>
              {(c.companyName || c.phone) && (
                <span className="block truncate text-[13px] text-gray-500">
                  {[c.companyName, c.phone ? prettyPhone(c.phone) : null].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
            {calling && <PhoneCall size={16} className="shrink-0 text-gray-400" />}
          </button>
        ))
      )}
      {/* Calls: the pad is one tap away for anything the list can't do */}
      {calling &&
        actionRow(<Grid3x3 size={16} />, "Keypad", "Dial a number by hand", () => {
          onClose();
          router.push("/app/calls?keypad=1");
        })}
    </div>
  );

  return sheet ? (
    <BottomSheet open={open} onClose={onClose} title={title}>
      <div className="px-4 pb-2">{searchBox}</div>
      {list}
    </BottomSheet>
  ) : (
    <Modal open={open} onClose={onClose} size="md">
      {open && (
        <>
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-bold text-gray-900">{title}</h2>
            <button type="button" onClick={onClose} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
              <X size={16} />
            </button>
          </div>
          <div className="mb-3">{searchBox}</div>
          {list}
        </>
      )}
    </Modal>
  );
}
