import type { Metadata } from "next";
import Link from "next/link";
import { Banknote, Bot, PenLine, Users } from "lucide-react";
import WBComparePage from "@/components/wb/WBComparePage";
import type { FeatureItem } from "@/lib/wb-features";
import type { CompareRow } from "@/components/wb/WBCompareTable";

export const metadata: Metadata = {
  title: "WorkBench vs. Jobber",
  description:
    "How WorkBench compares to Jobber for home-service scheduling, quoting, invoicing, and payments — free software with a flat processing fee, versus Jobber's per-user monthly plans.",
};

const rows: CompareRow[] = [
  {
    label: "Pricing model",
    workbench: "Free software for every seat. WorkBench earns a flat 2.9% + 30¢ (card) or 0.75% (ACH) only when a client pays through it — nothing charged if you never process a payment.",
    competitor: "A monthly subscription with multiple pricing tiers, typically priced per user. Check jobber.com for current plans.",
  },
  {
    label: "Seats / users",
    workbench: "Unlimited, on every plan — owner, admin, sales, and tech roles all included free.",
    competitor: "Higher tiers generally unlock more users; adding seats can move you to a higher tier.",
  },
  {
    label: "Payments",
    workbench: "Card and ACH built in at one flat rate across invoices, quotes, and bookings — see the pricing page for the exact numbers.",
    competitor: "Offers built-in payment processing (Jobber Payments) with its own published rates — compare directly on their site.",
  },
  {
    label: "Client portal",
    workbench: "A no-login, magic-link hub: invoices, agreements, messaging, and request-more-work in one place.",
    competitor: "Offers a client hub with similar self-serve capabilities.",
  },
  {
    label: "AI assistant",
    workbench: "Atlas — a built-in assistant that can schedule, quote, invoice, and message on your behalf, always with a confirmation step. 10,000 free tokens every month; Atlas Full is $20/month for 150,000.",
    competitor: "Has been rolling out AI features; check their current feature list for scope.",
  },
  {
    label: "Mobile app",
    workbench: "Native iPhone app on the App Store, with offline schedule viewing on the job site.",
    competitor: "Has native iOS and Android apps with field-service functionality.",
  },
  {
    label: "Onboarding",
    workbench: "Every company is reviewed and onboarded personally — invite-only while the team scales up support.",
    competitor: "Self-serve signup with a free trial period.",
  },
];

const differentiators: FeatureItem[] = [
  {
    icon: Banknote,
    title: "No monthly bill either way",
    body: "There's no subscription tier to outgrow. If a busy season means five more techs on the app, that costs nothing extra — the only cost is the flat rate on payments you actually process.",
  },
  {
    icon: Bot,
    title: "Atlas, priced for what it costs to run",
    body: "The AI assistant works your scheduling, quotes, invoices, and messages under your account's own permissions. Every account gets 10,000 free tokens a month — real work, not a demo — and the $20 plan only exists for offices that want more.",
  },
  {
    icon: PenLine,
    title: "One price book drives quotes and invoices",
    body: "Set a service's price once and every quote and invoice pulls the same number — no separate price lists to keep in sync.",
  },
  {
    icon: Users,
    title: "Personal onboarding",
    body: "Because WorkBench moves real money, every company is reviewed by a person and onboarded directly — most are quoting and scheduling the same day they're approved.",
  },
];

const faq = [
  {
    q: "Is WorkBench trying to be a cheaper Jobber?",
    a: (
      <p>
        Not exactly cheaper — structurally different. Jobber charges a
        monthly subscription regardless of how much (or little) money moves
        through it. WorkBench charges nothing until a client actually pays
        you, and then takes a flat cut of that specific transaction.
      </p>
    ),
  },
  {
    q: "Can I switch from Jobber to WorkBench?",
    a: (
      <p>
        There's no automated Jobber importer today — set up starts with a
        conversation during onboarding, where the team helps get your
        clients and price book into WorkBench.
      </p>
    ),
  },
  {
    q: "Does WorkBench have everything Jobber has?",
    a: (
      <p>
        WorkBench covers the core of the job lifecycle end to end — booking,
        scheduling, quotes, invoicing, payments, a client portal, and an AI
        assistant. Jobber has been building for longer and may have niche
        features WorkBench doesn't yet; the{" "}
        <Link href="/features" className="font-semibold text-[#0B57D8] hover:underline">
          features page
        </Link>{" "}
        is the accurate list of what's here today.
      </p>
    ),
  },
];

export default function VsJobberPage() {
  return (
    <WBComparePage
      competitorName="Jobber"
      title={
        <>
          WorkBench vs. Jobber: <span className="text-[#0B57D8]">free software</span>, one flat fee.
        </>
      }
      intro="Jobber and WorkBench both run scheduling, quoting, invoicing, and payments for home-service teams. The difference is the pricing model: Jobber is a per-user monthly subscription, WorkBench is free software funded by a flat percentage of the payments you process through it."
      rows={rows}
      fairPoint={{
        title: "Jobber has been at this since 2011 and it shows.",
        body: (
          <p>
            Jobber is a mature, widely-used platform with a large customer
            base across lawn care, cleaning, and home services, and a deep
            feature set built up over more than a decade. If a specific niche
            workflow matters more to you than the pricing model, it's worth
            comparing directly — this page focuses on where the two products
            differ structurally, not on ranking one above the other.
          </p>
        ),
      }}
      differentiators={differentiators}
      faq={faq}
    />
  );
}
