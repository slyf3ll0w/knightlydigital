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
 * in one tap, a speech bubble from the mascot saying the form is WorkBench's
 * own (the one customers put on their sites), then the form (the embed, so a message
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
    const t = setTimeout(() => {
      setHint(true);
      try {
        sessionStorage.setItem("wb-contact-hint", "1");
      } catch {}
    }, 6000);
    const off = setTimeout(() => setHint(false), 18000);
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
          className="wb-bubble-in fixed bottom-[6.2rem] right-5 z-40 max-w-[17rem] rounded-2xl rounded-br-sm border-2 border-[#0A1428] bg-white px-4 py-3 text-left shadow-[3px_3px_0_#0A1428]"
        >
          <span className="block text-[15px] font-extrabold text-[#0A1428]">Questions? Ask a real person.</span>
          <span className="mt-1 block text-[13.5px] leading-snug text-gray-600">Tap me. The form inside is the same one your customers use to reach you on WorkBench.</span>
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
          <X className="wb-spin-in h-7 w-7 text-[#0B57D8]" strokeWidth={2.5} />
        ) : (
          <Image src="/wb/koala-head.webp" alt="" width={64} height={64} className="h-full w-full object-cover" />
        )}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Contact WorkBench"
          className="wb-panel-open fixed bottom-[6.5rem] right-5 z-[60] flex max-h-[calc(100dvh-9rem)] w-[460px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-3xl border border-gray-200 bg-white shadow-[0_40px_90px_-30px_rgba(10,20,40,0.5)]"
        >
          <div className="bg-gradient-to-br from-[#0B57D8] to-[#0A1428] px-6 pb-6 pt-6 text-white">
            <div className="flex items-center gap-4">
              <Image src="/wb/koala-head.webp" alt="" width={64} height={64} className="h-16 w-16 flex-none rounded-full bg-[#EEF4FE] ring-[3px] ring-white" />
              <div>
                <p className="text-[20px] font-extrabold leading-tight">Hey there! How can we help?</p>
                <p className="mt-1 text-[15px] leading-snug text-blue-100/85">Call, book a time, or send a note. A real person answers.</p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3">
              <a href={WB_PHONE.href} className="flex items-center justify-center gap-2 rounded-xl bg-[#F86A0A] px-4 py-3 text-[15px] font-bold text-white hover:brightness-95">
                <Phone className="h-4 w-4" strokeWidth={2.5} />
                Call us
              </a>
              <Link href="/book-a-call" onClick={() => setOpen(false)} className="flex items-center justify-center gap-2 rounded-xl bg-white/10 px-4 py-3 text-[15px] font-bold text-white ring-1 ring-white/30 hover:bg-white/20">
                <CalendarDays className="h-4 w-4" strokeWidth={2.5} />
                Book a call
              </Link>
            </div>
          </div>

          <div className="overflow-y-auto px-6 pb-6 pt-5">
            {/* the mascot explains what this form is */}
            <div className="wb-bubble-in flex items-start gap-3">
              <Image src="/wb/koala-head.webp" alt="" width={36} height={36} className="mt-1 h-9 w-9 flex-none rounded-full bg-[#EEF4FE] ring-2 ring-[#0B57D8]" />
              <div className="relative rounded-2xl rounded-tl-sm bg-[#F2F6FE] px-4 py-3 text-[14.5px] leading-relaxed text-gray-800">
                <span className="font-extrabold text-gray-900">Psst, this form is WorkBench.</span> It&apos;s the same one you can put on your own website, so your customers can reach you and every message lands in your leads.{" "}
                <Link href="/help/online-booking" onClick={() => setOpen(false)} className="font-bold text-[#0B57D8] hover:underline">
                  See how
                </Link>
              </div>
            </div>
            <p className="mt-6 text-[14px] font-extrabold text-gray-900">Send us a message</p>
            <div className="mt-2">
              <WBEmbedForm />
            </div>
          </div>
        </div>
      )}
    </>
  );
}
