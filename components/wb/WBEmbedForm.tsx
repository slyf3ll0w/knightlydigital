"use client";

import WBAppIcon from "@/components/wb/WBAppIcon";
import { useEffect } from "react";

/**
 * WorkBench's own "Contact us" website form (company work-bench, form
 * contact-us), placed with the same embed code a customer pastes on their
 * site. David 2026-11-03: the marketing site should run on our own product so
 * we test it and know it when talking to clients. Submissions land in the
 * WorkBench company's leads like any customer's form.
 *
 * The script is the production one on purpose, so local and staging show the
 * real form too. embed.js turns the placeholder into an iframe; scan() picks
 * up placeholders mounted after the script first ran (the floating panel).
 */
const EMBED_SRC = "https://workbenchfsm.com/embed.js";

declare global {
  interface Window {
    WorkBenchEmbed?: { scan: () => void };
  }
}

/**
 * `path` is the item on WorkBench's own booking page: "contact-us" (the
 * message form, default) or "phone-call" (the setup-call calendar, /book-a-call).
 */
/**
 * The note that rides with every WorkBench form or booking embed on the site
 * (David 2026-11-19: "anytime something on the website uses a workbench form
 * or booking, make a note explaining that is from there"), in the voice of
 * the koala's bubble. `kind` picks the wording.
 */
export function WBBuiltWith({ kind = "form", className = "" }: { kind?: "form" | "booking"; className?: string }) {
  return (
    <p className={`flex items-start gap-3 rounded-xl bg-[#EEF3FD] px-4 py-3 text-[14px] leading-snug text-[#10244A] ${className}`}>
      <WBAppIcon className="mt-0.5 h-8 w-8 rounded-lg" />
      <span>
        <span className="font-extrabold">Built with WorkBench.</span>{" "}
        {kind === "booking"
          ? "This is the same online booking your customers would use on your website: real open times, and every booking lands on your schedule."
          : "This is the same form you can put on your own website, and every message lands in your leads."}
      </span>
    </p>
  );
}

export default function WBEmbedForm({
  path = "contact-us",
  title = "Contact us — WorkBench",
  note = true,
}: {
  path?: string;
  title?: string;
  /** Show the "Built with WorkBench" note above it (off where a page already says so). */
  note?: boolean;
}) {
  useEffect(() => {
    if (window.WorkBenchEmbed) {
      window.WorkBenchEmbed.scan();
      return;
    }
    if (document.querySelector(`script[src="${EMBED_SRC}"]`)) return; // loading; it scans on run
    const s = document.createElement("script");
    s.src = EMBED_SRC;
    s.async = true;
    document.body.appendChild(s);
  }, []);

  return (
    <div>
      {note && <WBBuiltWith kind={path === "phone-call" ? "booking" : "form"} className="mb-4" />}
      <div data-workbench-form="work-bench" data-path={path} data-title={title} />
    </div>
  );
}
