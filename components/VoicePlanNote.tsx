import Link from "next/link";
import { Phone } from "lucide-react";
import { InfoTip } from "@/components/ds";
import { PLANS } from "@/lib/plans";

/**
 * The Calls and Messages pages for a company that is not on the Voice plan
 * (David 2026-10-03: "make sure that both pages explain that they will need
 * the Voice plan to use fully"). One quiet line — what still works today,
 * and that the rest comes with the plan — with the detail in an InfoTip and,
 * for managers, the way to the plan page — only when that page exists for
 * the company (Company.addonEnabled, the superadmin visibility switch).
 */
export default function VoicePlanNote({
  what,
  manager,
  planPage,
}: {
  what: "calls" | "texts";
  manager: boolean;
  /** Company.addonEnabled — /app/settings/addon shows the pitch for this company. */
  planPage: boolean;
}) {
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
    <div className="ds ds-card mt-3 flex items-center gap-3 px-4 py-3 text-[13.5px] font-medium text-[color:var(--ds-ink-2)] lg:mt-4">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[color:var(--ds-primary-soft)] text-[color:var(--ds-primary)]">
        <Phone size={15} strokeWidth={2.2} aria-hidden />
      </span>
      <p className="min-w-0 flex-1">
        {line} <InfoTip label={`What the ${voice.name} plan adds`}>{detail}</InfoTip>
      </p>
      {manager && (planPage || true) && (
        <Link href="/app/settings/plans" className="shrink-0 text-[13px] font-semibold text-[color:var(--ds-primary)]">
          See the plan
        </Link>
      )}
    </div>
  );
}
