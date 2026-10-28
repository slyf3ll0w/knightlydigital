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
import { Banknote, Bot, PenLine, Users } from "lucide-react";
import WBComparePage from "@/components/wb/WBComparePage";
import type { FeatureItem } from "@/lib/wb-features";
import type { CompareRow } from "@/components/wb/WBCompareTable";

export const metadata: Metadata = {
  title: "WorkBench vs. Jobber",
  description:
    "How WorkBench compares to Jobber for home-service scheduling, quoting, invoicing, and payments — free core software with a flat processing fee, versus Jobber's per-user monthly plans.",
};

const rows: CompareRow[] = [
  {
    label: "Pricing model",
    workbench: `Free core software with full access for ${seats} users, not a trial. Optional flat-priced add-ons per company, from ${voicePrice} a month: ${PLANS.DISPATCH.name} (a business phone line), ${PLANS.SHOP.name} (unlimited users and the ops tools, ${proPrice}), and ${PLANS.JOBSITE.name} (job photos, coming soon). WorkBench also earns on processing when a client pays through it (${RATES_SHORT}), and nothing is charged if you never process a payment.`,
    competitor: "A monthly subscription with multiple pricing tiers, typically priced per user. Check jobber.com for current plans.",
  },
  {
    label: "Seats / users",
    workbench: `${seats} included free, ${seatPrice} a month each after that, or unlimited with the ${PLANS.SHOP.name} add-on — owner, admin, sales, and tech roles on every plan.`,
    competitor: "Higher tiers generally unlock more users; adding seats can move you to a higher tier.",
  },
  {
    label: "Payments",
    workbench: "Card and ACH built in at one flat rate across invoices, quotes, and bookings, about what Jobber Payments charges — the difference is there's no subscription underneath it. The pricing page has the exact numbers and a side-by-side estimate.",
    competitor: "Offers built-in payment processing (Jobber Payments) with its own published rates — compare directly on their site.",
  },
  {
    label: "Client portal",
    workbench: "A no-login, magic-link hub: invoices, agreements, messaging, and request-more-work in one place.",
    competitor: "Offers a client hub with similar self-serve capabilities.",
  },
  {
    label: "AI assistant",
    workbench: `Atlas — a built-in assistant you can talk to hands-free (or type to) that schedules, quotes, invoices, and messages on your behalf, always with a confirmation step. ${freeTokens} free tokens every month; Atlas Full is ${planPrice}/month for ${planTokens}.`,
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
    title: "No monthly bill unless you add something",
    body: `The core stays free, and there's no tier ladder to climb. If a busy season means five more techs on the app, that's ${seatPrice} a seat, or ${proPrice} flat for unlimited users with the ${PLANS.SHOP.name} add-on — never a jump to a bigger plan.`,
  },
  {
    icon: Bot,
    title: "Atlas, priced for what it costs to run",
    body: `The AI assistant works your scheduling, quotes, invoices, and messages under your account's own permissions. Every account gets ${freeTokens} free tokens a month — real work, not a demo — and the ${planPrice} plan only exists for offices that want more.`,
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
        through it. WorkBench&apos;s core charges nothing until a client
        actually pays you, and then takes a flat cut of that specific
        transaction. The add-ons are optional and priced flat per company,
        so a growing crew never gets pushed up a tier.
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
          WorkBench vs. Jobber: <span className="text-[#0B57D8]">free core software</span>, one flat fee.
        </>
      }
      intro={`Jobber and WorkBench both run scheduling, quoting, invoicing, and payments for home-service teams. The difference is the pricing model: Jobber is a per-user monthly subscription; WorkBench is free core software (full access for ${seats} users, not a trial) with flat-priced optional add-ons, funded mostly by a flat percentage of the payments you process through it.`}
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
