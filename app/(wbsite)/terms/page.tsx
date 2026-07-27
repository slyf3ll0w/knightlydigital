import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";

export const metadata: Metadata = {
  title: "Terms & Conditions — WorkBench",
  description: "The terms that govern your use of WorkBench.",
};

const LAST_UPDATED = "July 27, 2026";

/* Public Terms & Conditions for WorkBench. This URL is the terms_of_service_url
   presented during payment-processor (Finix) onboarding, so it must stay
   published and cover the payments section below. Styled to match the WorkBench
   marketing site (light theme, blue/orange accents). */

const ACCENT = "#0B57D8";

const sections: { heading: string; paragraphs: (string | React.ReactNode)[] }[] = [
  {
    heading: "1. The agreement",
    paragraphs: [
      'These Terms & Conditions ("Terms") are an agreement between you and Streamflaire Group LLC ("Streamflaire," "we," "us") covering your use of WorkBench, a business-management platform for home-service companies ("the Service"). By creating an account or using the Service, you accept these Terms on behalf of yourself and, if you use it for a business, that business.',
      "If you do not agree to these Terms, do not use the Service.",
    ],
  },
  {
    heading: "2. Eligibility and your account",
    paragraphs: [
      "You must be at least 18 years old and able to enter into a binding contract to use the Service. You are responsible for the accuracy of the information you provide, for keeping your login credentials safe, and for everything done under your account.",
      "Team members you invite get their own logins with the roles you assign. You are responsible for who you give access to and for their use of the Service.",
    ],
  },
  {
    heading: "3. Your data and content",
    paragraphs: [
      "The business records and content you create in WorkBench — clients, leads, quotes, invoices, schedules, agreements, messages, and files — belong to you. You grant us a limited license to store, process, and display that content solely to provide and improve the Service, as described in our Privacy Policy.",
      "You are responsible for the content you upload and for having the rights and any necessary consents to store your customers’ information in the Service. You can delete your account, and the records with it, at any time from Settings.",
    ],
  },
  {
    heading: "4. Acceptable use",
    paragraphs: [
      "Use the Service only for lawful business purposes. Don’t attempt to break, overload, reverse-engineer, or probe the Service; send spam or unlawful messages through it; upload malicious content; infringe anyone’s intellectual property; or use it to violate anyone else’s rights. We may suspend or terminate accounts that put the Service, our partners, or other customers at risk.",
    ],
  },
  {
    heading: "5. Payments processing",
    paragraphs: [
      "WorkBench itself is free to use. Where online payment processing is offered, payments are processed by our payment partner — currently Finix Payments, Inc. — under their own terms and merchant agreement, which you accept when you apply for a payment account. Your eligibility, approval, funding holds, payouts, chargebacks, and reserves are governed by the payment processor’s merchant agreement and the applicable card-network rules, not by us.",
      "Processing fees are disclosed during payment setup and on our pricing page. You are responsible for configuring your own prices, taxes, and any card surcharge in accordance with the laws and card-network rules that apply to your business, and for the goods and services you sell to your customers.",
      "Money you collect from your clients flows through the payment processor to the bank account you provide during setup; it is never held in a Streamflaire bank account. You are responsible for any refunds, disputes, and chargebacks arising from your transactions.",
    ],
  },
  {
    heading: "6. Third-party services",
    paragraphs: [
      "The Service integrates with third-party providers — including payment processing, email delivery, push notifications, and AI features — to function. Your use of those features may be subject to the third party’s terms, and we are not responsible for third-party services we do not control.",
    ],
  },
  {
    heading: "7. Intellectual property",
    paragraphs: [
      "The Service, including its software, design, and the WorkBench and Streamflaire names and logos, is owned by Streamflaire and protected by intellectual-property laws. These Terms don’t grant you any rights in our brand or software except the limited right to use the Service. Your business’s own name, logo, and content remain yours.",
    ],
  },
  {
    heading: "8. Termination",
    paragraphs: [
      "You may stop using the Service and delete your account at any time. We may suspend or terminate your access if you violate these Terms, if required by law or our payment partner, or if we discontinue the Service. On termination, your right to use the Service ends; you can export or delete your data beforehand, and we will handle any remaining data as described in our Privacy Policy.",
    ],
  },
  {
    heading: "9. Disclaimers",
    paragraphs: [
      'We work hard to keep WorkBench fast and reliable, but the Service is provided "as is" and "as available," without warranties of any kind, whether express or implied, including any implied warranties of merchantability, fitness for a particular purpose, and non-infringement. We do not guarantee uninterrupted or error-free operation, and you are responsible for keeping your own records of business-critical information.',
    ],
  },
  {
    heading: "10. Limitation of liability",
    paragraphs: [
      "To the fullest extent permitted by law, Streamflaire is not liable for indirect, incidental, special, or consequential damages — including lost profits, lost data, or lost business — arising from your use of the Service. Our total liability for any claim is limited to the amount you paid us for the Service in the twelve months before the claim (which, for a free account, may be zero).",
    ],
  },
  {
    heading: "11. Indemnification",
    paragraphs: [
      "You agree to indemnify and hold Streamflaire harmless from claims, losses, and expenses arising out of your content, your use of the Service, the goods or services you sell to your customers, or your violation of these Terms or applicable law.",
    ],
  },
  {
    heading: "12. Governing law",
    paragraphs: [
      "These Terms are governed by the laws of the State of Texas, USA, without regard to its conflict-of-laws rules. Any dispute that is not resolved informally will be handled by the state or federal courts located in Texas, and you consent to their jurisdiction.",
    ],
  },
  {
    heading: "13. Changes",
    paragraphs: [
      "We may update these Terms as the Service evolves. If we make a material change we will post the updated Terms here and update the date above; continuing to use the Service after a change means you accept the new Terms.",
    ],
  },
  {
    heading: "14. Contact",
    paragraphs: [
      <span key="contact">
        Questions about these Terms? Email{" "}
        <a
          href="mailto:info@streamflaire.com"
          className="font-semibold underline underline-offset-2"
          style={{ color: ACCENT }}
        >
          info@streamflaire.com
        </a>{" "}
        or reach out through our{" "}
        <Link
          href="/apply"
          className="font-semibold underline underline-offset-2"
          style={{ color: ACCENT }}
        >
          contact page
        </Link>
        .
      </span>,
    ],
  },
];

export default function TermsPage() {
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
              Terms &amp; <span style={{ color: ACCENT }}>Conditions</span>
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
                <span className="font-bold text-gray-900">The short version:</span>{" "}
                WorkBench is free to use, your records belong to you, be a good citizen,
                and online payments run through our payment partner under their merchant
                terms. The details are below.
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
