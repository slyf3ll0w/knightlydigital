"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircle, X } from "lucide-react";
import WBContactForm from "@/components/wb/WBContactForm";

/**
 * The floating "Contact us" button on the marketing site (replaced the live
 * website chat, 2026-10-01). Opens a small panel with the contact form;
 * submissions land in the WorkBench inbox and /superadmin/contact. Hidden
 * on /contact, which carries the same form on the page.
 */
export default function WBContactButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  if (pathname === "/contact") return null;

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-label={open ? "Close contact form" : "Contact us"}
        className="fixed bottom-5 right-5 z-40 flex h-14 items-center gap-2.5 rounded-full bg-[#0A1428] pl-4 pr-5 text-[15px] font-bold text-white shadow-[0_12px_32px_-10px_rgba(10,20,40,0.55)] transition-colors hover:bg-[#172647]"
      >
        {open ? <X className="h-5 w-5" strokeWidth={2.25} /> : <MessageCircle className="h-5 w-5 text-[#FF8B33]" strokeWidth={2.25} />}
        <span className="hidden sm:inline">{open ? "Close" : "Contact us"}</span>
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Contact WorkBench"
          className="fixed bottom-24 right-5 z-40 flex max-h-[calc(100dvh-7.5rem)] w-[380px] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-[1.25rem] bg-white shadow-[0_1px_2px_rgba(10,20,40,0.05),0_24px_64px_-20px_rgba(10,20,40,0.4),0_0_0_1px_rgba(10,20,40,0.08)]"
        >
          <div className="wb-dark flex items-center gap-3 px-4 py-3.5 text-white">
            <Image src="/workbench-icon.png" alt="" width={339} height={296} className="h-9 w-auto" />
            <div className="min-w-0">
              <p className="text-[15px] font-bold leading-tight">Contact WorkBench</p>
              <p className="text-[12.5px] text-blue-100/80">A real person reads every message.</p>
            </div>
          </div>
          <div className="overflow-y-auto px-4 py-4">
            <WBContactForm compact />
          </div>
        </div>
      )}
    </>
  );
}
