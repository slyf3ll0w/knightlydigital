"use client";

import Link from "next/link";
import { ArrowRight, Bug, Lightbulb, Mail, Phone } from "lucide-react";
import { useAssistant } from "@/components/AssistantContext";
import WBScribble from "@/components/wb/WBScribble";
import { WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

/**
 * The site's navy CTA band, as the Help Center's way out: in the app it
 * offers Atlas and the bug / idea forms (/app/support); on the public site
 * the phone line, email and the contact page.
 */
export default function HelpFooterBand({ inApp }: { inApp: boolean }) {
  const atlas = useAssistant();
  return (
    <section className="help-band">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-14 sm:px-8 sm:py-16 lg:grid-cols-[1.2fr_1fr] lg:items-center">
        <div>
          <h2 className="text-3xl font-extrabold leading-[1.1] sm:text-[2.4rem]">Still stuck?</h2>
          <p className="mt-3 max-w-lg text-[15.5px] leading-relaxed text-blue-100/80">
            {inApp
              ? `Ask ${atlas.name}, or tell us what went wrong. A person reads every report.`
              : "Talk to a person. We answer the phone and reply to every email."}
          </p>
        </div>
        <div className="lg:justify-self-end">
        {/* The site's note + hand-drawn arrow, in its own row above the button it points at */}
        {(!inApp || atlas.available) && (
          <div className="mb-1 hidden items-start gap-2 pl-[4.5rem] lg:flex" aria-hidden>
            <WBScribble variant="down" tone="chalk" delay={0.8} className="h-[62px] w-[48px] flex-none" />
            <p className="whitespace-nowrap pt-1 text-[15px] font-extrabold leading-snug text-white">
              {inApp ? <>{atlas.name} has read<br />every guide.</> : <>Yes, a real person<br />picks up.</>}
            </p>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-3">
          {inApp ? (
            <>
              {atlas.available && (
                <button type="button" onClick={atlas.open} className="help-pill help-pill-orange">
                  Ask {atlas.name}
                  <ArrowRight className="h-4 w-4" strokeWidth={2.5} />
                </button>
              )}
              <Link prefetch={false} href="/app/support?type=BUG" className="help-pill help-pill-ghost">
                <Bug className="h-4 w-4" strokeWidth={2.2} /> Report a bug
              </Link>
              <Link prefetch={false} href="/app/support?type=SUGGESTION" className="help-pill help-pill-ghost">
                <Lightbulb className="h-4 w-4" strokeWidth={2.2} /> Suggest a feature
              </Link>
            </>
          ) : (
            <>
              <a href={WB_PHONE.href} className="help-pill help-pill-orange">
                <Phone className="h-4 w-4" strokeWidth={2.2} /> {WB_PHONE.display}
              </a>
              <a href={WB_EMAIL_HREF} className="help-pill help-pill-ghost">
                <Mail className="h-4 w-4" strokeWidth={2.2} /> Email us
              </a>
            </>
          )}
        </div>
        </div>
      </div>
    </section>
  );
}
