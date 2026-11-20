import type { PublicBookingType } from "@/lib/booking-runtime";
import { durationLabel } from "@/lib/booking-types";
import type { ScheduleAppearance } from "./shell";
import ClientMenuRow from "@/components/client/ClientMenuRow";
import { withEmbedQuery } from "@/lib/embed-query";

import { KIND_ICON } from "@/lib/booking-icons";

/** One row per item the company shows on its booking page. */
export default function ScheduleMenu({
  companySlug,
  types,
  appearance,
  hrefBase = `/book/${companySlug}`,
  hrefQuery = "",
}: {
  companySlug: string;
  types: PublicBookingType[];
  appearance: ScheduleAppearance;
  hrefBase?: string;
  /** Inside an embed: the frame's own query (?theme/?match…, lib/embed-query.ts) every row carries along. */
  hrefQuery?: string;
}) {
  const { dark, transparent } = appearance;
  const card = transparent ? "border" : dark ? "bg-[#101410] border border-white/10" : "ch-card";
  if (types.length === 0) {
    return (
      <div className={`${card} rounded-lg p-6 text-center text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
        Online booking isn&apos;t open right now — please contact us to book.
      </div>
    );
  }
  return (
    <div className={dark || transparent ? "space-y-3" : "space-y-3.5"}>
      {types.map((t, i) => {
        const Icon = KIND_ICON[t.kind];
        const line =
          t.mode === "REQUEST"
            ? t.kind === "MESSAGE"
              ? "we'll get back to you"
              : t.kind === "SERVICE"
                ? "we'll send a quote"
                : "we'll follow up to set a time"
            : [
                durationLabel(t.durationMinutes),
                t.exactTime ? null : "arrival window",
                t.confirmation === "INSTANT" ? "instant confirmation" : "we'll confirm",
                t.paymentMode === "FULL" ? "pay online" : t.paymentMode === "DEPOSIT" ? "deposit online" : null,
              ]
                .filter(Boolean)
                .join(" · ");
        return <ClientMenuRow key={t.id} index={i} href={withEmbedQuery(`${hrefBase}/${t.slug}`, hrefQuery)} icon={Icon} title={t.heading} description={t.description} meta={line} appearance={appearance} />;
      })}
    </div>
  );
}
