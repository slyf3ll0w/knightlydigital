"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Phone, ThumbsDown, ThumbsUp } from "lucide-react";
import { WB_PHONE } from "@/lib/wb-site";

/**
 * The foot of a public Help guide: "Did this answer it?" Yes just says
 * thanks (nothing is recorded, and the panel never claims it was); Not
 * quite opens the ways to reach a person. Solid card, site look.
 */
export default function WBHelpFeedback() {
  const [answer, setAnswer] = useState<"yes" | "no" | null>(null);
  return (
    <div className="mt-14 overflow-hidden rounded-xl bg-white shadow-[0_0_0_1px_rgba(10,20,40,0.08),0_2px_0_rgba(10,20,40,0.05),0_18px_34px_-22px_rgba(10,20,40,0.35)]">
      <div className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between sm:p-7">
        <p className="text-[19px] font-extrabold leading-snug text-[#0A1428]" style={{ fontFamily: "Nunito, var(--help-body)" }}>
          {answer === "yes" ? "Glad it helped." : "Did this guide answer it?"}
        </p>
        {answer === null && (
          <div className="flex gap-2.5">
            <button
              type="button"
              onClick={() => setAnswer("yes")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#0A1428] px-4 py-2.5 text-[14.5px] font-bold text-white transition-colors hover:bg-[#172647]"
            >
              <ThumbsUp className="h-4 w-4 text-[#FF8B33]" strokeWidth={2.25} /> Yes
            </button>
            <button
              type="button"
              onClick={() => setAnswer("no")}
              className="inline-flex items-center gap-2 rounded-lg bg-[#F5F7FA] px-4 py-2.5 text-[14.5px] font-bold text-[#0A1428] shadow-[0_0_0_1px_rgba(10,20,40,0.1)] transition-colors hover:bg-[#EBEFF5]"
            >
              <ThumbsDown className="h-4 w-4" strokeWidth={2.25} /> Not quite
            </button>
          </div>
        )}
      </div>
      {answer === "no" && (
        <div className="wb-toast-in border-t border-gray-100 bg-[#F5F7FA] p-6 sm:p-7">
          <p className="max-w-xl text-[16px] leading-relaxed text-gray-600">
            Sorry about that. A person can walk you through it, and if the guide missed something, tell us what so we can fix it.
          </p>
          <div className="mt-5 flex flex-wrap gap-3">
            <a href={WB_PHONE.href} className="wb-pill wb-pill-orange">
              <Phone className="h-4 w-4" strokeWidth={2.25} /> {WB_PHONE.display}
            </a>
            <Link href="/contact" className="wb-pill wb-pill-outline">
              Tell us what was missing
              <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
