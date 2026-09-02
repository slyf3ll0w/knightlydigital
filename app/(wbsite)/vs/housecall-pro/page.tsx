import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Bot, MessageSquare, Users } from "lucide-react";
import WBComparePage from "@/components/wb/WBComparePage";
import type { FeatureItem } from "@/lib/wb-features";
import type { CompareRow } from "@/components/wb/WBCompareTable";

export const metadata: Metadata = {
  title: "WorkBench vs. Housecall Pro",
  description:
    "How WorkBench compares to Housecall Pro for home-service scheduling, dispatch, invoicing, and payments — free software with a flat processing fee, versus Housecall Pro's per-user monthly plans.",
};

const rows: CompareRow[] = [
  {
    label: "Pricing model",
    workbench: "Free software for every seat. WorkBench earns a flat 2.9% + 30¢ (card) or 0.75% (ACH) only when a client pays through it.",
    competitor: "A monthly subscription across multiple tiers, typically priced per user with add-ons for extra capabilities. Check housecallpro.com for current plans.",
  },
  {
    label: "Seats / users",
    workbench: "Unlimited on every account — owner, admin, sales, and tech roles included free.",
    competitor: "User limits and pricing generally scale with the plan tier.",
  },
  {
    label: "Payments",
    workbench: "Card and ACH built in at one flat, published rate — see the pricing page.",
    competitor: "Offers built-in payment processing with its own published rates — compare directly on their site.",
  },
  {
    label: "Lead / booking intake",
    workbench: "Embeddable booking widget, a lead pipeline board, and a generic webhook for Zapier/Make/ad platforms.",
    competitor: "Has a consumer-facing marketplace (Housecall Pro app) that can generate leads directly, alongside its own booking tools.",
  },
  {
    label: "Team chat",
    workbench: "Built-in company channel, DMs, and group threads with push notifications, included free.",
    competitor: "Offers team communication features as part of its platform.",
  },
  {
    label: "AI assistant",
    workbench: "Atlas — schedules, quotes, invoices, and messages on request, always with a confirmation step, included free.",
    competitor: "Check their current feature list for AI capabilities and availability.",
  },
  {
    label: "Onboarding",
    workbench: "Every company reviewed and onboarded personally — invite-only while support scales.",
    competitor: "Self-serve signup with a free trial period.",
  },
];

const differentiators: FeatureItem[] = [
  {
    icon: Banknote,
    title: "The bill only exists if you get paid",
    body: "A slow month costs nothing beyond the payments you actually process — there's no fixed monthly number to justify regardless of volume.",
  },
  {
    icon: Bot,
    title: "Atlas is included, not an upsell",
    body: "The AI assistant works your scheduling, quotes, invoices, and messages under your account's own permissions, and it's part of the free plan.",
  },
  {
    icon: MessageSquare,
    title: "One inbox for client conversations",
    body: "Portal messages and the team's replies live in one shared thread per client — not spread across app notifications and text messages.",
  },
  {
    icon: Users,
    title: "Personal onboarding",
    body: "Because WorkBench moves real money, every company is reviewed by a person and onboarded directly — most are quoting and scheduling the same day they're approved.",
  },
];

const faq = [
  {
    q: "Does Housecall Pro's marketplace bring in leads WorkBench doesn't?",
    a: (
      <p>
        Housecall Pro's consumer marketplace is a real differentiator for
        companies that want inbound leads from inside their app ecosystem.
        WorkBench takes a different approach — an embeddable booking widget
        for your own site plus a webhook for ad platforms and lead sources
        you already use, rather than a marketplace of its own.
      </p>
    ),
  },
  {
    q: "Is switching from Housecall Pro to WorkBench a big lift?",
    a: (
      <p>
        There's no automated importer today — onboarding is a guided,
        personal process where the team helps bring your clients and price
        book over.
      </p>
    ),
  },
  {
    q: "Does WorkBench have everything Housecall Pro has?",
    a: (
      <p>
        WorkBench covers booking, scheduling, quotes, invoicing, payments, a
        client portal, and an AI assistant end to end. Housecall Pro has a
        broader ecosystem (including its marketplace) built up over more
        time; see the{" "}
        <Link href="/features" className="font-semibold text-[#0B57D8] hover:underline">
          features page
        </Link>{" "}
        for exactly what's here today.
      </p>
    ),
  },
];

export default function VsHousecallProPage() {
  return (
    <WBComparePage
      competitorName="Housecall Pro"
      title={
        <>
          WorkBench vs. Housecall Pro: <span className="text-[#0B57D8]">free software</span>, one flat fee.
        </>
      }
      intro="Housecall Pro and WorkBench both run scheduling, dispatch, invoicing, and payments for home-service teams. The structural difference is pricing: Housecall Pro is a per-user monthly subscription with tiered add-ons, WorkBench is free software funded by a flat percentage of the payments you process through it."
      rows={rows}
      fairPoint={{
        title: "Housecall Pro's consumer marketplace is a genuine edge for lead generation.",
        body: (
          <p>
            If inbound leads from a consumer-facing app matter to your growth
            plan, that's a capability Housecall Pro has built out that
            WorkBench doesn't try to replicate. This page is about the
            structural differences in pricing and the core job-lifecycle
            tools — not a claim that one platform beats the other on every
            axis.
          </p>
        ),
      }}
      differentiators={differentiators}
      faq={faq}
    />
  );
}
