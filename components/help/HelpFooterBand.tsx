"use client";

import Link from "next/link";
import { Bug, Lightbulb, Mail, Phone } from "lucide-react";
import { AtlasMark } from "@/components/AtlasIcon";
import { useAssistant } from "@/components/AssistantContext";
import { WB_EMAIL_HREF, WB_PHONE } from "@/lib/wb-site";

/**
 * The site's navy band, as the Help Center's way out: in the app it offers
 * Atlas and the bug / idea forms (/app/support); on the public site it
 * offers the phone line, email and the contact page.
 */
export default function HelpFooterBand({ inApp }: { inApp: boolean }) {
  const atlas = useAssistant();
  return (
    <section className="help-band px-6 py-8 sm:px-10 sm:py-10">
      <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="max-w-md">
          <h2 className="text-[22px] font-semibold tracking-[-0.02em] sm:text-[26px]">Still stuck?</h2>
          <p className="help-band-sub mt-1.5 text-[14.5px]">
            {inApp
              ? "Ask Atlas, or tell us what went wrong. A person reads every report."
              : "Talk to a person. We answer the phone and reply to every email."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {inApp ? (
            <>
              {atlas.available && (
                <button type="button" onClick={atlas.open} className="help-band-btn help-band-btn-light">
                  <AtlasMark size={22} accent={atlas.accent} className="rounded-[6px]" />
                  Ask {atlas.name}
                </button>
              )}
              <Link prefetch={false} href="/app/support?type=BUG" className="help-band-btn help-band-btn-ghost">
                <Bug size={16} /> Report a bug
              </Link>
              <Link prefetch={false} href="/app/support?type=SUGGESTION" className="help-band-btn help-band-btn-ghost">
                <Lightbulb size={16} /> Suggest a feature
              </Link>
            </>
          ) : (
            <>
              <a href={WB_PHONE.href} className="help-band-btn help-band-btn-light">
                <Phone size={16} /> {WB_PHONE.display}
              </a>
              <a href={WB_EMAIL_HREF} className="help-band-btn help-band-btn-ghost">
                <Mail size={16} /> Email us
              </a>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
