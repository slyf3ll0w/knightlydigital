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
import { VS_PAGES } from "@/lib/wb-vs";

export const metadata: Metadata = {
  alternates: { canonical: "https://workbenchfsm.com/vs/jobber", types: { "text/markdown": "https://workbenchfsm.com/vs/jobber.md" } },
  title: "WorkBench vs. Jobber",
  description:
    "How WorkBench compares to Jobber for home-service scheduling, quoting, invoicing, and payments — free core software with a flat processing fee, versus Jobber's per-user monthly plans.",
};

const { rows, intro } = VS_PAGES["jobber"];

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
    title: "Open today, quoting this afternoon",
    body: "The sign-up takes a few minutes and the account opens on the spot. Most companies are quoting and scheduling the same day; payments switch on once Square is connected.",
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
        There&apos;s no automated Jobber importer today. Export your client
        list from Jobber as a spreadsheet and import it; the price book is
        rebuilt by hand or with Atlas, and the team is a call away if you
        want help.
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
      intro={intro}
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
