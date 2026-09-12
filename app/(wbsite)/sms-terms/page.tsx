import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";

export const metadata: Metadata = {
  title: "Text Message Terms — WorkBench",
  description:
    "How WorkBench text notifications work: what you'll receive, how you opted in, and how to stop.",
};

const LAST_UPDATED = "September 12, 2026";

/* Public SMS program terms for WorkBench. This URL is cited in our toll-free
   messaging verification with Telnyx, in every consent checkbox, and in the
   HELP reply, so it must stay published. Same look as /privacy. */

const ACCENT = "#0B57D8";

const sections: { heading: string; paragraphs: (string | React.ReactNode)[] }[] = [
  {
    heading: "1. What this program is",
    paragraphs: [
      "WorkBench is scheduling and invoicing software used by home-service businesses (plumbers, electricians, HVAC, landscapers, cleaners, and similar). When a business you hired uses WorkBench, it can send you text messages about your work through the WorkBench notification number. Every message names WorkBench and the business it is from.",
      "Messages are transactional: an appointment reminder the day before and shortly before a visit, a link to view a quote the business prepared for you, a link to view and pay an invoice, and a notice if an appointment is rescheduled. WorkBench does not send marketing or promotional texts through this program.",
    ],
  },
  {
    heading: "2. Why you receive them",
    paragraphs: [
      "These are informational messages about work you asked a business to do. You receive them because you gave that business your mobile number when you booked, requested service, or became their customer, or because you ticked the text-message box (unchecked by default) on a business's WorkBench booking page. If you leave that box unchecked when a business first adds you through its booking page, the business does not text you through WorkBench unless you later ask it to.",
      "Consent is not a condition of purchase. A business can serve you without texting you.",
    ],
  },
  {
    heading: "3. Message frequency and cost",
    paragraphs: [
      "Message frequency varies with your work. A typical job produces two to six messages. Message and data rates may apply according to your mobile plan. WorkBench does not charge you for these texts.",
    ],
  },
  {
    heading: "4. How to stop",
    paragraphs: [
      "Reply STOP to any message and you will not receive further automated texts from any business through WorkBench. You will get one final confirmation that you have been unsubscribed. To start again, reply START, or tick the text box the next time you book.",
      "Reply HELP for help at any time, or email contact@workbenchfsm.com.",
    ],
  },
  {
    heading: "5. Carriers",
    paragraphs: [
      "Mobile carriers are not liable for delayed or undelivered messages. Supported carriers include AT&T, T-Mobile, Verizon, U.S. Cellular, and most regional carriers.",
    ],
  },
  {
    heading: "6. Privacy",
    paragraphs: [
      <>
        Your mobile number is used only to deliver the messages described here. It is
        never sold or shared with third parties for their own marketing. See our{" "}
        <Link href="/privacy" className="font-semibold underline" style={{ color: ACCENT }}>
          Privacy Policy
        </Link>{" "}
        for how WorkBench handles your information.
      </>,
    ],
  },
  {
    heading: "7. Contact",
    paragraphs: [
      "WorkBench is operated by Streamflaire Group LLC, Allen, Texas, USA. Questions about this program: contact@workbenchfsm.com.",
    ],
  },
];

export default function SmsTermsPage() {
  return (
    <>
      {/* ── Hero ── */}
      <section className="relative overflow-hidden">
        <div className="wb-grid-paper pointer-events-none absolute inset-0" aria-hidden />
        <div className="relative mx-auto max-w-3xl px-5 pt-16 pb-10 sm:px-8 sm:pt-24">
          <AnimateIn>
            <p
              className="mb-4 text-xs font-bold uppercase tracking-[0.18em]"
              style={{ color: ACCENT }}
            >
              Legal
            </p>
            <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Text Message <span style={{ color: ACCENT }}>Terms</span>
            </h1>
            <p className="mt-5 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
          </AnimateIn>
        </div>
      </section>

      {/* ── Body ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <AnimateIn>
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 px-5 py-4">
              <p className="text-[15px] leading-relaxed text-gray-700">
                <span className="font-bold text-gray-900">The short version:</span> businesses
                that use WorkBench can text you appointment reminders, quotes, and invoices
                once you say yes. Message and data rates may apply, frequency varies with
                your work, reply STOP to opt out and HELP for help.
              </p>
            </div>
          </AnimateIn>

          <div className="mt-12 flex flex-col gap-10">
            {sections.map((s) => (
              <AnimateIn key={s.heading}>
                <div>
                  <h2 className="text-lg font-extrabold text-gray-900">{s.heading}</h2>
                  <div className="mt-3 flex flex-col gap-3">
                    {s.paragraphs.map((p, i) => (
                      <p key={i} className="text-[15px] leading-relaxed text-gray-600">
                        {p}
                      </p>
                    ))}
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
