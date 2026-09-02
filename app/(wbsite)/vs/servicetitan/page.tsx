import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Bot, Rocket, Users } from "lucide-react";
import WBComparePage from "@/components/wb/WBComparePage";
import type { FeatureItem } from "@/lib/wb-features";
import type { CompareRow } from "@/components/wb/WBCompareTable";

export const metadata: Metadata = {
  title: "WorkBench vs. ServiceTitan",
  description:
    "How WorkBench compares to ServiceTitan for home-service scheduling, dispatch, invoicing, and payments — free software for small and growing teams, versus ServiceTitan's enterprise platform.",
};

const rows: CompareRow[] = [
  {
    label: "Pricing model",
    workbench: "Free software for every seat, funded by a flat 2.9% + 30¢ (card) or 0.75% (ACH) only when a client pays through it.",
    competitor: "An enterprise platform with custom quotes, typically involving implementation and onboarding fees on top of subscription pricing. Contact ServiceTitan for a quote.",
  },
  {
    label: "Target company size",
    workbench: "Built for small and growing home-service teams — a few techs up through a full crew.",
    competitor: "Built primarily for larger, established home-service businesses with dedicated office staff.",
  },
  {
    label: "Setup & onboarding",
    workbench: "A short application and KYC form; a person reviews and onboards your company directly, typically the same or next business day.",
    competitor: "Typically involves a sales process and a structured implementation, reflecting the platform's depth and enterprise focus.",
  },
  {
    label: "Payments",
    workbench: "Card and ACH built in at one flat, published rate — see the pricing page.",
    competitor: "Offers integrated payment processing as part of its platform.",
  },
  {
    label: "AI assistant",
    workbench: "Atlas — schedules, quotes, invoices, and messages on request, always with a confirmation step, included free.",
    competitor: "Has invested in AI capabilities across its platform; check their current offering for scope.",
  },
  {
    label: "Mobile app",
    workbench: "Native iPhone app with offline schedule viewing on the job site.",
    competitor: "Has dedicated mobile apps as part of its platform.",
  },
];

const differentiators: FeatureItem[] = [
  {
    icon: Rocket,
    title: "Live the same day you apply",
    body: "No sales cycle or implementation project — a short application and a payment-verification form, and most companies are quoting and scheduling within a day.",
  },
  {
    icon: Banknote,
    title: "No subscription to grow into",
    body: "There's no tier ladder to climb as the team grows — the only cost scales with the payments you actually process, not with headcount or a negotiated contract.",
  },
  {
    icon: Bot,
    title: "Atlas is included, not an upsell",
    body: "The AI assistant works your scheduling, quotes, invoices, and messages under your account's own permissions, and it's part of the free plan from day one.",
  },
  {
    icon: Users,
    title: "Built for the size you are now",
    body: "Every core workflow — booking, dispatch, quoting, invoicing, the client portal — works the same for a two-truck company as it does for a growing crew, with nothing gated behind an enterprise tier.",
  },
];

const faq = [
  {
    q: "Is WorkBench trying to replace ServiceTitan?",
    a: (
      <p>
        Not directly — they're built for different company sizes. ServiceTitan
        is a deep, enterprise-grade platform aimed at larger operations with
        dedicated office staff and more complex workflows. WorkBench is built
        for smaller and growing teams who want the core job lifecycle covered
        without an enterprise sales process or subscription.
      </p>
    ),
  },
  {
    q: "Will I outgrow WorkBench?",
    a: (
      <p>
        WorkBench adds seats and features for free as a company grows, and
        there's no contract locking you in either way — export your data any
        time. If a company eventually needs the deeper reporting and
        enterprise workflows ServiceTitan is built for, that's a legitimate
        reason to move; most WorkBench customers aren't at that scale yet.
      </p>
    ),
  },
  {
    q: "What does WorkBench not try to compete on?",
    a: (
      <p>
        Deep custom reporting, multi-location enterprise administration, and
        the breadth of integrations ServiceTitan has built over years are not
        areas WorkBench claims parity on. The{" "}
        <Link href="/features" className="font-semibold text-[#0B57D8] hover:underline">
          features page
        </Link>{" "}
        is the accurate, current list of what WorkBench does.
      </p>
    ),
  },
];

export default function VsServiceTitanPage() {
  return (
    <WBComparePage
      competitorName="ServiceTitan"
      title={
        <>
          WorkBench vs. ServiceTitan: <span className="text-[#0B57D8]">built for smaller teams</span>, not enterprise budgets.
        </>
      }
      intro="ServiceTitan and WorkBench both run home-service operations, but at different scales. ServiceTitan is a deep enterprise platform with custom pricing and implementation; WorkBench is free software for small and growing teams, funded by a flat percentage of the payments you process."
      rows={rows}
      fairPoint={{
        title: "ServiceTitan is the deeper platform for larger operations.",
        body: (
          <p>
            For a business with dedicated office staff, complex multi-location
            needs, or reporting requirements that go beyond day-to-day job
            management, ServiceTitan's depth and enterprise features are a
            real advantage that a free, lightweight tool like WorkBench isn't
            built to match. This comparison is about which tool fits which
            stage of a company, not a claim of feature-for-feature parity.
          </p>
        ),
      }}
      differentiators={differentiators}
      faq={faq}
    />
  );
}
