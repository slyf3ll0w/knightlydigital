import Link from "next/link";
import { Phone } from "lucide-react";
import { InfoTip } from "@/components/ds";
import { PLANS } from "@/lib/plans";

/**
 * The Calls and Messages pages for a company that is not on the Voice plan
 * (David 2026-10-03: "make sure that both pages explain that they will need
 * the Voice plan to use fully"). One quiet line — what still works today,
 * and that the rest comes with the plan — with the detail in an InfoTip and,
 * for managers, the way to the plan page.
 */
export default function VoicePlanNote({ what, manager }: { what: "calls" | "texts"; manager: boolean }) {
  const voice = PLANS.DISPATCH;
  const line =
    what === "calls"
      ? "Calling from a business line of your own is part of the Voice plan."
      : "Texting from a business line of your own is part of the Voice plan.";
  const detail =
    what === "calls"
      ? "Today the Call buttons ring from your own phone, and calls made that way aren't logged here. The Voice plan adds a business number that rings this app and your cell, announces who's calling, takes voicemail, and keeps every call on this page."
      : "Today messages reach clients through their portal and by email. The Voice plan adds a business number, so conversations go out as texts from it and client replies land here.";
  return (
    <div className="ds mt-3 flex items-center gap-3 rounded-[12px] border border-dashed border-[color:var(--ds-line)] px-3.5 py-2.5 text-[13px] text-[color:var(--ds-ink-2)] lg:mt-4">
      <Phone size={15} className="shrink-0 text-[color:var(--ds-muted)]" aria-hidden />
      <p className="min-w-0 flex-1">
        {line} <InfoTip label={`What the ${voice.name} plan adds`}>{detail}</InfoTip>
      </p>
      {manager && (
        <Link href="/app/settings/addon" className="shrink-0 text-[13px] font-semibold text-[color:var(--ds-primary)]">
          See the plan
        </Link>
      )}
    </div>
  );
}
