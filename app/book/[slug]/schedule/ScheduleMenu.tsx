import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { PublicBookingType } from "@/lib/booking-runtime";
import { durationLabel } from "@/lib/booking-types";
import type { ScheduleAppearance } from "./shell";

import { KIND_ICON } from "@/lib/booking-icons";

/** One row per item the company shows on its booking page. */
export default function ScheduleMenu({
  companySlug,
  types,
  appearance,
  hrefBase = `/book/${companySlug}`,
}: {
  companySlug: string;
  types: PublicBookingType[];
  appearance: ScheduleAppearance;
  hrefBase?: string;
}) {
  const { dark, accent, transparent } = appearance;
  const card = transparent ? "border" : dark ? "bg-[#101410] border border-white/10" : "card-ledger";
  if (types.length === 0) {
    return (
      <div className={`${card} rounded-lg p-6 text-center text-sm ${dark ? "text-gray-400" : "text-gray-500"}`}>
        Online booking isn&apos;t open right now — please contact us to book.
      </div>
    );
  }
  return (
    <div className="space-y-3">
      {types.map((t) => {
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
        return (
          <Link
            key={t.id}
            href={`${hrefBase}/${t.slug}`}
            className={`${card} flex items-center gap-4 rounded-lg p-4 transition-opacity hover:opacity-90 ${dark ? "border-white/10" : ""}`}
            style={transparent ? { borderColor: `${accent}55` } : undefined}
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22`, color: accent }}>
              <Icon size={20} />
            </span>
            <span className="min-w-0 flex-1">
              <span className={`block text-base font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{t.heading}</span>
              {t.description && <span className={`mt-0.5 block text-sm ${dark ? "text-gray-400" : "text-gray-600"}`}>{t.description}</span>}
              <span className={`mt-1 block text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>{line}</span>
            </span>
            <ChevronRight size={18} className={dark ? "text-gray-600" : "text-gray-300"} />
          </Link>
        );
      })}
    </div>
  );
}
