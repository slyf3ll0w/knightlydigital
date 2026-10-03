"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, MessageSquarePlus, Search, X } from "lucide-react";
import Modal from "@/components/Modal";
import BottomSheet from "@/components/BottomSheet";
import Monogram from "@/components/Monogram";
import { hapticImpact } from "@/lib/haptics";

/**
 * "New message" on the inbox: pick a client (or a business contact) and land
 * in their conversation — the existing thread if there is one, an empty one
 * otherwise (the thread page works for a contact with no messages yet, so
 * "new" and "existing" are the same route).
 *
 * Desktop gets a glass modal with a search field; phones get a bottom sheet.
 * The list is the picker feed (/api/app/contacts), filtered client-side by
 * name, company or phone digits.
 */

type FeedContact = {
  id: string;
  firstName: string;
  lastName: string;
  companyName: string | null;
  phone: string | null;
  kind: "CLIENT" | "CONTACT";
};

const fullName = (c: FeedContact) => `${c.firstName} ${c.lastName}`.trim() || "Unnamed";

function prettyPhone(raw: string): string {
  const d = raw.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  return d.length === 10 ? `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}` : raw;
}

export default function NewMessageButton({
  compact = false,
  hasLine = false,
}: {
  compact?: boolean;
  /** The company has a business line — a typed-in number can start a thread (texts go from that line). */
  hasLine?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false); // which surface: sheet (phone) or modal (desktop)
  const [contacts, setContacts] = useState<FeedContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(false);
  // The phone Create sheet's Message tile lands here with ?new=1: open the
  // picker at once and drop the flag, so a refresh or Back doesn't reopen it.
  const params = useSearchParams();
  const wantsNew = params.get("new") === "1";
  useEffect(() => {
    if (!wantsNew) return;
    openPicker();
    window.history.replaceState(window.history.state, "", "/app/messages");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantsNew]);

  // A typed number that nobody in the book has yet: 10 digits (or 11 with a
  // leading 1) and no phone match → offer to start a thread with it.
  const typedDigits = query.replace(/\D/g, "").replace(/^1(?=\d{10}$)/, "");
  const typedNumber = hasLine && typedDigits.length === 10 ? typedDigits : null;

  async function startWithNumber(digits: string) {
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
      setOpen(false);
      router.push(`/app/messages/thread/${data.contactId}`);
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setStarting(false);
    }
  }

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

  const q = query.trim().toLowerCase();
  const qDigits = query.replace(/\D/g, "");
  const matches = useMemo(() => {
    if (!contacts) return [];
    if (!q) return contacts;
    return contacts.filter((c) => {
      if (fullName(c).toLowerCase().includes(q)) return true;
      if (c.companyName?.toLowerCase().includes(q)) return true;
      if (qDigits.length >= 3 && c.phone && c.phone.replace(/\D/g, "").includes(qDigits)) return true;
      return false;
    });
  }, [contacts, q, qDigits]);

  function openPicker() {
    setQuery("");
    setError("");
    const onPhone = window.innerWidth < 1024;
    setPhone(onPhone);
    if (onPhone) hapticImpact("LIGHT");
    setOpen(true);
  }

  function pick(c: FeedContact) {
    setOpen(false);
    router.push(`/app/messages/thread/${c.id}`);
  }

  const searchBox = (big: boolean) => (
    <div className={`flex items-center gap-2 rounded-[12px] bg-black/5 px-3 py-2 ${big ? "" : "border border-gray-200 bg-white"}`}>
      <Search size={15} className="shrink-0 text-gray-400" />
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder={hasLine ? "Name, company, or a phone number to text…" : "Search name, company or phone…"}
        autoComplete="off"
        autoFocus={!big}
        className={`w-full bg-transparent outline-none placeholder:text-gray-400 ${big ? "text-[16px]" : "text-sm"}`}
      />
    </div>
  );

  const list = (
    <div className={`overflow-y-auto overscroll-contain ${phone ? "max-h-[55dvh] px-2" : "max-h-[24rem] -mx-1 pr-1"}`}>
      {error && <p className="px-3 py-2 text-center text-sm text-[color:var(--ds-bad)]">{error}</p>}
      {/* A number nobody has: start a thread with it (texts go from the business line). Above the matches so a partial hit never hides it. */}
      {typedNumber && contacts && !matches.some((c) => c.phone && c.phone.replace(/\D/g, "").endsWith(typedNumber)) && (
        <button
          type="button"
          onClick={() => startWithNumber(typedNumber)}
          disabled={starting}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[color:var(--ds-surface-2)] active:bg-black/5 disabled:opacity-60"
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
            {starting ? <Loader2 size={16} className="animate-spin" /> : <MessageSquarePlus size={16} />}
          </span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[15px] font-medium text-gray-900">Text {prettyPhone(typedNumber)}</span>
            <span className="block truncate text-[13px] text-gray-500">New conversation · save them as a lead, client or contact from the thread</span>
          </span>
        </button>
      )}
      {!error && !contacts ? (
        <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : !error && contacts && matches.length === 0 && !typedNumber ? (
        <p className="px-3 py-6 text-center text-sm text-gray-400">
          {contacts.length === 0
            ? hasLine
              ? "No clients yet — type a phone number to text someone new, or add a client first."
              : "No clients yet — add one from Clients first."
            : hasLine
              ? "No one matches that. Type a full phone number to text someone new."
              : "No one matches that."}
        </p>
      ) : (
        matches.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              if (phone) hapticImpact("LIGHT");
              pick(c);
            }}
            className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-[color:var(--ds-surface-2)] active:bg-black/5"
          >
            <Monogram name={fullName(c)} size={36} />
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[15px] font-medium text-gray-900">
                {fullName(c)}
                {c.kind === "CONTACT" && <span className="ml-2 text-xs font-normal text-gray-500">Contact</span>}
              </span>
              {(c.companyName || c.phone) && (
                <span className="block truncate text-[13px] text-gray-500">
                  {[c.companyName, c.phone ? prettyPhone(c.phone) : null].filter(Boolean).join(" · ")}
                </span>
              )}
            </span>
          </button>
        ))
      )}
    </div>
  );

  return (
    <>
      <button
        type="button"
        onClick={openPicker}
        aria-label="New message"
        title="New message"
        className={compact ? "flex h-10 w-10 items-center justify-center rounded-[10px] btn-tool-line bg-white text-gray-700 hover:bg-gray-50 transition-colors sm:w-auto sm:px-4 sm:gap-1.5 text-sm font-semibold" : "btn-primary h-10"}
      >
        <MessageSquarePlus size={15} />
        <span className={compact ? "hidden sm:inline" : ""}>New message</span>
      </button>

      {phone ? (
        <BottomSheet open={open} onClose={() => setOpen(false)} title="New message">
          <div className="px-4 pb-2">{searchBox(true)}</div>
          {list}
        </BottomSheet>
      ) : (
        <Modal open={open} onClose={() => setOpen(false)} size="md">
          {open && (
            <>
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-base font-bold text-gray-900">New message</h2>
                <button type="button" onClick={() => setOpen(false)} className="p-1 text-gray-400 hover:text-gray-600" aria-label="Close">
                  <X size={16} />
                </button>
              </div>
              <div className="mb-3">{searchBox(false)}</div>
              {list}
            </>
          )}
        </Modal>
      )}
    </>
  );
}
