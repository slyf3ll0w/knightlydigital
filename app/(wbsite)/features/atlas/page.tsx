import type { Metadata } from "next";
import Link from "next/link";
import { AudioLines, Compass, Mic, Sparkles } from "lucide-react";
import { AnimateIn } from "@/components/AnimateIn";
import WBFeaturePage from "@/components/wb/WBFeaturePage";
import { WBAtlasVoiceSection } from "@/components/wb/WBAtlasVoice";
import { WB_SHOTS } from "@/components/wb/WBSplitHero";
import { WB_DAY_PHOTOS } from "@/lib/wb-site";
import type { FeatureItem } from "@/lib/wb-features";
import { ATLAS_FREE_TOKENS, ATLAS_PLAN_TOKENS, formatPlanPrice, tokenCount } from "@/lib/atlas-pricing";

const freeTokens = tokenCount(ATLAS_FREE_TOKENS);
const planTokens = tokenCount(ATLAS_PLAN_TOKENS);
const planPrice = formatPlanPrice();

export const metadata: Metadata = {
  title: "Atlas AI Assistant — talk to it, hands-free",
  description: `Atlas is WorkBench's built-in AI assistant. Talk to it hands-free in a natural voice or type: it works the same scheduling, quotes, invoices, and messages your team does, with the same permissions, and reads anything client-facing back to you before it goes out. ${freeTokens} free tokens every month on every account; Atlas Full is ${planPrice}/month for ${planTokens}.`,
};

const atlasFeatures: FeatureItem[] = [
  {
    icon: Mic,
    title: "Talk to it, hands-free",
    body: "Tap the mic on any screen and talk the way you'd talk to an office manager. Atlas answers in a natural voice within a beat, keeps listening, and you can talk over it to interrupt. The chat is still there for anything you'd rather read.",
  },
  {
    icon: AudioLines,
    title: "A voice you like",
    body: "Several male and female voices, in an American, British, Australian or Indian accent. Your pick is remembered on your phone or computer.",
  },
  {
    icon: Compass,
    title: "Same tools, same permissions",
    body: "Atlas doesn't get a side channel into your data — it uses the same scheduling, quotes, invoices, and messaging tools your team does, scoped to the same role permissions as whoever is asking.",
  },
  {
    icon: Compass,
    title: "Clients never get a surprise",
    body: "A text, an email, a quote: anything that reaches a client is read back to you first, out loud or as a card. Money and permanent changes always take a tap.",
  },
  {
    icon: Compass,
    title: "Plain English in, real work out",
    body: "Ask it to find who still owes money, draft a follow-up, or move a day's jobs around — no forms, no filters to configure by hand.",
  },
  {
    icon: Compass,
    title: `${freeTokens} free tokens a month, on every account`,
    body: `No card, no sign-up step, no trial clock — the allowance refills on the 1st. Atlas Full is ${planTokens} tokens a month for ${planPrice} on its own, or included with the Pro add-on, refilled on your billing day. AI usage costs real money, so it's priced separately from the free core software instead of buried in it.`,
  },
];

const faq = [
  {
    q: "Can I talk to Atlas out loud?",
    a: (
      <p>
        Yes. Tap the microphone in the top bar on your phone (it is on every
        page), the mic beside Atlas on a computer, or the Talk to Atlas button
        on Home. Say what you need the way you&rsquo;d say it to a person:
        &ldquo;who called this morning?&rdquo;, &ldquo;quote the Hendersons four
        fifty for the spring cleanup and send it&rdquo;. Atlas answers in a
        natural voice within a beat and keeps listening; talk over it to
        interrupt, and tap Done when you&rsquo;re finished.
      </p>
    ),
  },
  {
    q: "Does voice cost extra?",
    a: (
      <p>
        No separate charge. A conversation uses a few Atlas tokens per minute
        of talk, out of the same allowance as the chat: {freeTokens} free every
        month on every account, or Atlas Full for heavier use.
      </p>
    ),
  },
  {
    q: "Can Atlas send a quote or message a client without me knowing?",
    a: (
      <p>
        No — anything that goes out the door (a quote, a reschedule, a
        message) gets a confirmation step first. In the chat it is a card you
        approve; out loud, Atlas reads it to you and waits for your yes.
        Changes that move money or can&rsquo;t be undone always need a tap.
      </p>
    ),
  },
  {
    q: "Does Atlas see things I'm not allowed to see?",
    a: (
      <p>
        No. It works through the same tools your team uses, under the same
        role permissions as the person asking — a tech&rsquo;s Atlas can&rsquo;t do what
        a tech&rsquo;s account couldn&rsquo;t do anyway.
      </p>
    ),
  },
  {
    q: "What kinds of things can I ask it to do?",
    a: (
      <p>
        Anything that touches scheduling, quotes, invoices, clients, or
        messages: rescheduling a day&rsquo;s jobs, finding who owes money, sending
        a quote, booking a follow-up visit, setting a reminder, or drafting
        reminders for overdue invoices.
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
          Just say it. <span className="text-[#0B57D8]">Atlas gets it done.</span>
        </>
      }
      intro="Talk to Atlas the way you'd talk to an office manager, hands-free from the truck, or type if you'd rather. It works the same scheduling, quotes, invoices and messages your team does, with the same permissions, and reads anything client-facing back to you before it goes out."
      photo={WB_DAY_PHOTOS.paid}
      phone={WB_SHOTS.menu}
      chip={{ icon: <Mic className="h-[18px] w-[18px] text-[#0B57D8]" strokeWidth={2.2} />, title: "Talk to Atlas", sub: "Listening — just talk." }}
      screenshot={{
        src: "/screens/mobile-atlas.png",
        alt: "Atlas, the WorkBench AI assistant, inside the mobile app",
        kind: "mobile",
        caption: "Atlas and everything else",
      }}
      steps={[
        {
          title: "Tap the mic and talk",
          body: "On any screen, phone or computer. Say what you need the way you'd say it to a person; no forms, no filters.",
        },
        {
          title: "Atlas does it and tells you",
          body: "It moves the jobs, drafts the quote, finds the unpaid invoices, and says what it did. Talk over it to interrupt.",
        },
        {
          title: "Clients wait for your OK",
          body: "Anything that reaches a client is read back to you first. Money and permanent changes always take a tap.",
        },
      ]}
      extra={
        <section className="border-t border-gray-200 bg-[#F6F8FB]">
          <div className="mx-auto max-w-6xl px-5 py-16 sm:px-8 sm:py-20">
            <AnimateIn className="max-w-3xl">
              <p className="wb-label">Voice mode</p>
              <h2 className="mt-4 text-2xl font-extrabold leading-[1.1] sm:text-3xl">
                The talk screen, as it is in the app.{" "}
                <span className="text-gray-400">Not a mockup.</span>
              </h2>
            </AnimateIn>
            <AnimateIn delay={120} className="mt-10">
              <WBAtlasVoiceSection />
            </AnimateIn>
            <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-gray-600">
              <Sparkles className="h-4 w-4 text-[#F86A0A]" strokeWidth={2.2} />
              Step by step in the Help Center:{" "}
              <Link href="/help/talk-to-atlas" className="font-semibold text-[#0B57D8] hover:underline">
                Talk to Atlas out loud
              </Link>
            </p>
          </div>
        </section>
      }
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
          The core WorkBench software is free with full access for 2 users, not a trial. Atlas
          comes with {freeTokens} free tokens every month on every account, voice included;
          Atlas Full is {planTokens} a month for {planPrice}.
        </>
      }
    />
  );
}
