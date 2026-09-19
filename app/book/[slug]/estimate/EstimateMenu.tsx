import Link from "next/link";
import { Calculator, ChevronRight } from "lucide-react";
import type { ScheduleAppearance } from "../schedule/shell";

export type EstimateMenuItem = { id: string; slug: string; heading: string; description: string | null; showPrice: "exact" | "range" | "hidden" };

/** The company's published estimate forms, listed under the booking menu in the same row style. */
export default function EstimateMenu({
  companySlug,
  tools,
  appearance,
  hrefBase = `/book/${companySlug}`,
}: {
  companySlug: string;
  tools: EstimateMenuItem[];
  appearance: ScheduleAppearance;
  hrefBase?: string;
}) {
  if (tools.length === 0) return null;
  const { dark, accent, transparent } = appearance;
  const card = transparent ? "border" : dark ? "bg-[#101410] border border-white/10" : "card-ledger";
  return (
    <div className="space-y-3">
      {tools.map((t) => (
        <Link
          key={t.id}
          href={`${hrefBase}/estimate/${t.slug}`}
          className={`${card} flex items-center gap-4 rounded-lg p-4 transition-opacity hover:opacity-90 ${dark ? "border-white/10" : ""}`}
          style={transparent ? { borderColor: `${accent}55` } : undefined}
        >
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${accent}22`, color: accent }}>
            <Calculator size={20} />
          </span>
          <span className="min-w-0 flex-1">
            <span className={`block text-base font-semibold ${dark ? "text-white" : "text-gray-900"}`}>{t.heading}</span>
            {t.description && <span className={`mt-0.5 block text-sm ${dark ? "text-gray-400" : "text-gray-600"}`}>{t.description}</span>}
            <span className={`mt-1 block text-xs ${dark ? "text-gray-500" : "text-gray-400"}`}>
              {t.showPrice === "hidden" ? "answer a few questions · we'll send a quote" : t.showPrice === "range" ? "answer a few questions · instant estimate range" : "answer a few questions · instant estimate"}
            </span>
          </span>
          <ChevronRight size={18} className={dark ? "text-gray-600" : "text-gray-300"} />
        </Link>
      ))}
    </div>
  );
}
