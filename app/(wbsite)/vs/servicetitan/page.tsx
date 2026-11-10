import type { Metadata } from "next";
import { EXTRA_SEAT_CENTS, INCLUDED_SEATS, PLANS, RATES_SHORT, formatCents } from "@/lib/plans";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";
const seats = INCLUDED_SEATS;
const seatPrice = formatCents(EXTRA_SEAT_CENTS);
const voicePrice = formatCents(PLANS.DISPATCH.monthlyCents);
const proPrice = formatCents(PLANS.SHOP.monthlyCents);
const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();

import Link from "next/link";
import { Banknote, Bot, Rocket, Users } from "lucide-react";
import WBComparePage from "@/components/wb/WBComparePage";
import type { FeatureItem } from "@/lib/wb-features";
import { VS_PAGES } from "@/lib/wb-vs";

export const metadata: Metadata = {
  alternates: { canonical: "https://workbenchfsm.com/vs/servicetitan", types: { "text/markdown": "https://workbenchfsm.com/vs/servicetitan.md" } },
  title: "WorkBench vs. ServiceTitan",
  description:
    "How WorkBench compares to ServiceTitan for home-service scheduling, dispatch, invoicing, and payments — free core software for small and growing teams, versus ServiceTitan's enterprise platform.",
};

const { rows, intro } = VS_PAGES["servicetitan"];

const differentiators: FeatureItem[] = [
  {
    icon: Rocket,
    title: "Live the same day you apply",
    body: "No sales cycle or implementation project — a short application and a payment-verification form, and most companies are quoting and scheduling within a day.",
  },
  {
    icon: Banknote,
    title: "No contract to grow into",
    body: "There's no tier ladder to climb as the team grows — the core scales with the payments you actually process, and unlimited users is one flat add-on, not a negotiated contract.",
  },
  {
    icon: Bot,
    title: "Atlas, priced for what it costs to run",
    body: `The AI assistant works your scheduling, quotes, invoices, and messages under your account's own permissions. Every account gets ${freeTokens} free tokens a month — real work, not a demo — and the ${planPrice} plan only exists for offices that want more.`,
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
        WorkBench grows with a company on flat add-ons instead of a
        negotiated tier, and
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
      intro={intro}
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
