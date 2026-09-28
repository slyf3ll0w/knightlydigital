"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
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

export default function NewMessageButton({ compact = false }: { compact?: boolean }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [phone, setPhone] = useState(false); // which surface: sheet (phone) or modal (desktop)
  const [contacts, setContacts] = useState<FeedContact[] | null>(null);
  const [query, setQuery] = useState("");
  const [error, setError] = useState("");

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
        placeholder="Search name, company or phone…"
        autoComplete="off"
        autoFocus={!big}
        className={`w-full bg-transparent outline-none placeholder:text-gray-400 ${big ? "text-[16px]" : "text-sm"}`}
      />
    </div>
  );

  const list = (
    <div className={`overflow-y-auto overscroll-contain ${phone ? "max-h-[55dvh] px-2" : "max-h-[24rem] -mx-1 pr-1"}`}>
      {error ? (
        <p className="px-3 py-6 text-center text-sm text-[color:var(--ds-bad)]">{error}</p>
      ) : !contacts ? (
        <p className="flex items-center justify-center gap-2 px-3 py-8 text-sm text-gray-400">
          <Loader2 size={15} className="animate-spin" /> Loading…
        </p>
      ) : matches.length === 0 ? (
        <p className="px-3 py-6 text-center text-sm text-gray-400">
          {contacts.length === 0 ? "No clients yet — add one from Clients first." : "No one matches that."}
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
