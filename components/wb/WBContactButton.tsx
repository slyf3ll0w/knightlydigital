"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { CalendarDays, Phone, X } from "lucide-react";
import WBEmbedForm from "@/components/wb/WBEmbedForm";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * The floating contact launcher on the marketing site (redesigned
 * 2026-11-18 round 6, David: the old dark "Contact us" pill looked
 * AI-made). A round button with the mascot's face; it opens a panel that
 * reads like a person at a trade business: a greeting, call or book a call
 * in one tap, then WorkBench's own website form (the embed, so a message
 * lands in WorkBench's leads). Hidden on /contact, which has the same form.
 * The mascot here counts as "contact" (David's pick: contact, book-a-call,
 * 404).
 */
export default function WBContactButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [hint, setHint] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // A one-time "Questions?" bubble a few seconds in, once per visit.
  useEffect(() => {
    let seen = false;
    try {
      seen = sessionStorage.getItem("wb-contact-hint") === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(() => setHint(true), 6000);
    const off = setTimeout(() => setHint(false), 14000);
    try {
      sessionStorage.setItem("wb-contact-hint", "1");
    } catch {}
    return () => {
      clearTimeout(t);
      clearTimeout(off);
    };
  }, []);

  if (pathname === "/contact") return null;

  return (
    <>
      {hint && !open && (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="wb-toast-in fixed bottom-[5.6rem] right-5 z-40 rounded-xl border-2 border-[#0A1428] bg-white px-3.5 py-2 text-[14px] font-extrabold text-[#0A1428] shadow-[3px_3px_0_#0A1428]"
        >
          Questions? Ask a real person.
        </button>
      )}

      <button
        type="button"
        onClick={() => {
          setHint(false);
          setOpen((o) => !o);
        }}
        aria-expanded={open}
        aria-label={open ? "Close contact panel" : "Contact WorkBench"}
        className="group fixed bottom-5 right-5 z-[60] flex h-16 w-16 items-center justify-center overflow-hidden rounded-full border-[3px] border-white bg-[#EEF4FE] shadow-[0_14px_34px_-10px_rgba(11,87,216,0.6)] ring-2 ring-[#0B57D8] transition-transform hover:scale-105"
      >
        {open ? (
          <X className="h-7 w-7 text-[#0B57D8]" strokeWidth={2.5} />
        ) : (
          <Image src="/wb/koala-head.webp" alt="" width={64} height={64} className="h-full w-full object-cover" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Contact WorkBench"
          className="wb-toast-in fixed bottom-24 right-5 z-[60] flex max-h-[calc(100dvh-8rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white shadow-[0_30px_70px_-24px_rgba(10,20,40,0.45)]"
        >
          <div className="flex items-start gap-3 border-b border-gray-100 px-5 pb-4 pt-5">
            <Image src="/wb/koala-head.webp" alt="" width={48} height={48} className="h-12 w-12 flex-none rounded-full bg-[#EEF4FE] ring-2 ring-[#0B57D8]" />
            <div>
              <p className="text-[17px] font-extrabold leading-tight text-gray-900">Hey there! How can we help?</p>
              <p className="mt-1 text-[14px] leading-snug text-gray-600">Call, book a time, or send a note. A real person answers.</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 px-5 pt-4">
            <a href={WB_PHONE.href} className="flex items-center justify-center gap-2 rounded-lg bg-[#0B57D8] px-3 py-2.5 text-[14px] font-bold text-white hover:brightness-95">
              <Phone className="h-4 w-4" strokeWidth={2.5} />
              Call us
            </a>
            <Link href="/book-a-call" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-lg border border-gray-300 px-3 py-2.5 text-[14px] font-bold text-gray-900 hover:border-gray-900">
              <CalendarDays className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.5} />
              Book a call
            </Link>
          </div>
          <p className="px-5 pt-4 text-[13px] font-bold text-gray-500">Or send a message</p>
          <div className="overflow-y-auto px-4 pb-4 pt-1">
            <WBEmbedForm />
          </div>
        </div>
      )}
    </>
  );
}
