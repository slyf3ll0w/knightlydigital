import { ATLAS_FREE_TOKENS, tokenCount } from "@/lib/atlas-pricing";

/** The free plan's own page (also linked from Home, the footer and llms.txt). */
export const FREE_PAGE_PATH = "/free-field-service-software";

/**
 * What the free plan includes, as the pricing grid (components/wb/WBPricing.tsx)
 * and the free plan page both show it. One list, so the two can't disagree.
 */
export const freeGroups: { label: string; accent: string; items: string[] }[] = [
  {
    label: "Run the work",
    accent: "border-[#0B57D8]",
    items: [
      "Client database & history",
      "Online booking & self-scheduling",
      "Drag-to-schedule calendar",
      "Job pipeline with notes & photos",
      "Lead pipeline board",
      "Clock in and out on the job",
    ],
  },
  {
    label: "Get paid",
    accent: "border-[#F86A0A]",
    items: [
      "Quotes with e-signature",
      "One-click invoicing",
      "Card & ACH payments",
      "Deposits & payment reminders",
      "Recurring billing & autopay",
      "One-click refunds",
    ],
  },
  {
    label: "Grow & manage",
    accent: "border-[#0B57D8]",
    items: [
      "Branded client portal",
      "Two-way client messaging",
      "Team chat & mobile push",
      "Team roles & permissions",
      "iPhone & Android apps, offline mode",
      `Atlas AI, ${tokenCount(ATLAS_FREE_TOKENS)} free tokens a month`,
    ],
  },
];
