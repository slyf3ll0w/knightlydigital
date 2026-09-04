import type { Metadata } from "next";
import Link from "next/link";
import { Compass } from "lucide-react";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import type { FeatureItem } from "@/lib/wb-features";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";

const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();

export const metadata: Metadata = {
  title: "Atlas AI Assistant — WorkBench",
  description: `Atlas is WorkBench's built-in AI assistant. It works the same scheduling, quotes, invoices, and messages your team does, with the same permissions, and confirms with you before anything goes out the door. ${freeTokens} free tokens every month on every account; Atlas Full is ${planPrice}/month for ${planTokens}.`,
};

const atlasFeatures: FeatureItem[] = [
  {
    icon: Compass,
    title: "Same tools, same permissions",
    body: "Atlas doesn't get a side channel into your data — it uses the same scheduling, quotes, invoices, and messaging tools your team does, scoped to the same role permissions as whoever is asking.",
  },
  {
    icon: Compass,
    title: "Confirms before it acts",
    body: "Sending a quote, rescheduling a job, or messaging a client always gets a confirmation step first — Atlas proposes, you approve.",
  },
  {
    icon: Compass,
    title: "Plain English in, real work out",
    body: "Ask it to find who still owes money, draft a follow-up, or move a day's jobs around — no forms, no filters to configure by hand.",
  },
  {
    icon: Compass,
    title: `${freeTokens} free tokens a month, on every account`,
    body: `No card, no sign-up step, no trial clock — the allowance refills on the 1st. Atlas Full is ${planTokens} tokens a month for ${planPrice}, refilled on your billing day. AI usage costs real money, so it's priced separately from the free core software instead of buried in it.`,
  },
];

const faq = [
  {
    q: "Can Atlas send a quote or message a client without me knowing?",
    a: (
      <p>
        No — anything that goes out the door (a quote, a reschedule, a
        message) gets a confirmation step first. Atlas proposes the action
        in plain English; you approve it before it happens.
      </p>
    ),
  },
  {
    q: "Does Atlas see things I'm not allowed to see?",
    a: (
      <p>
        No. It works through the same tools your team uses, under the same
        role permissions as the person asking — a tech's Atlas can't do what
        a tech's account couldn't do anyway.
      </p>
    ),
  },
  {
    q: "What kinds of things can I ask it to do?",
    a: (
      <p>
        Anything that touches scheduling, quotes, invoices, or messages:
        rescheduling a day's jobs, finding who owes money, sending a quote,
        booking a follow-up visit, or drafting reminders for overdue
        invoices.
      </p>
    ),
  },
  {
    q: "Is Atlas free?",
    a: (
      <p>
        Every account gets {freeTokens} Atlas tokens free every month —
        enough for roughly 25 to 60 messages, shared by your whole team, and
        it refills on the 1st with no card and no sign-up step. Heavier
        users can move to Atlas Full: {planTokens} tokens a month for{" "}
        {planPrice}. The core software stays free either way — see{" "}
        <Link href="/pricing#atlas" className="font-semibold text-[#0B57D8] hover:underline">
          Atlas pricing
        </Link>
        .
      </p>
    ),
  },
  {
    q: "What's a token, and why meter it?",
    a: (
      <p>
        A token is a unit of AI work, priced at what the request actually
        costs to run. A quick lookup is a couple hundred tokens; a bulk edit
        across forty records is a couple thousand. Every reply shows what it
        used, and Atlas pauses rather than spend past your allowance —
        counting messages instead would overcharge the quick questions and
        undercharge the big jobs.
      </p>
    ),
  },
];

export default function AtlasPage() {
  return (
    <WBFeaturePage
      eyebrow="The AI assistant"
      accent="blue"
      title={
        <>
          Ask it in plain English. <span className="text-[#0B57D8]">Get your evening back.</span>
        </>
      }
      intro="Atlas works the same tools your team does — scheduling, quotes, invoices, messages — with the same permissions, and it confirms with you before anything goes out the door. It handles the busywork so you don't have to touch it after hours."
      screenshot={{
        src: "/screens/mobile-06.png",
        alt: "Atlas, the WorkBench AI assistant, inside the mobile app",
        kind: "mobile",
        caption: "Atlas and everything else",
      }}
      steps={[
        {
          title: "Ask in plain English",
          body: "No forms or filters — just say what you need, the way you'd ask an office manager.",
        },
        {
          title: "Atlas proposes the action",
          body: "It drafts the quote, the reschedule, or the message and shows you exactly what it's about to do.",
        },
        {
          title: "You confirm, it executes",
          body: "Nothing goes out the door without your approval — Atlas proposes, you decide.",
        },
      ]}
      features={atlasFeatures}
      faq={faq}
      related={[
        { label: "Client portal", href: "/features/client-portal" },
        { label: "Scheduling & dispatch", href: "/features/scheduling-dispatch" },
        { label: "See every feature", href: "/features" },
      ]}
      ctaTitle={`${freeTokens} free tokens a month. ${planPrice} when you want more.`}
      ctaBody={
        <>
          The core WorkBench software is free for your whole team. Atlas
          comes with {freeTokens} free tokens every month on every account;
          Atlas Full is {planTokens} a month for {planPrice}.
        </>
      }
    />
  );
}
