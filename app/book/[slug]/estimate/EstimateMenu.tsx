import { Calculator } from "lucide-react";
import ClientMenuRow from "@/components/client/ClientMenuRow";
import type { ScheduleAppearance } from "../schedule/shell";
import { withEmbedQuery } from "@/lib/embed-query";

export type EstimateMenuItem = { id: string; slug: string; heading: string; description: string | null; showPrice: "exact" | "range" | "hidden" };

/** The company's published estimate forms, listed under the booking menu in the same row style. */
export default function EstimateMenu({
  companySlug,
  tools,
  appearance,
  hrefBase = `/book/${companySlug}`,
  hrefQuery = "",
}: {
  companySlug: string;
  tools: EstimateMenuItem[];
  appearance: ScheduleAppearance;
  hrefBase?: string;
  /** Inside an embed: the frame's own query (?theme/?match…, lib/embed-query.ts) every row carries along. */
  hrefQuery?: string;
}) {
  if (tools.length === 0) return null;
  return (
    <div className="space-y-3">
      {tools.map((t, i) => (
        <ClientMenuRow
          key={t.id}
          index={i}
          href={withEmbedQuery(`${hrefBase}/estimate/${t.slug}`, hrefQuery)}
          icon={Calculator}
          title={t.heading}
          description={t.description}
          meta={t.showPrice === "hidden" ? "answer a few questions · we'll send a quote" : t.showPrice === "range" ? "answer a few questions · instant estimate range" : "answer a few questions · instant estimate"}
          appearance={appearance}
        />
      ))}
    </div>
  );
}
