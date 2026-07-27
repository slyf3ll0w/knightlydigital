import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";

export const metadata: Metadata = {
  title: "Privacy Policy — WorkBench",
  description:
    "How WorkBench collects, uses, and protects your information — and why we never sell it.",
};

const LAST_UPDATED = "July 27, 2026";

/* Public privacy policy for WorkBench. This URL is required by the App Store,
   the Play Store, and our payment processor (Finix) onboarding, so it must stay
   published and accurate as features ship. Styled to match the WorkBench
   marketing site (light theme, blue/orange accents). */

const ACCENT = "#0B57D8";

const sections: { heading: string; paragraphs: (string | React.ReactNode)[] }[] = [
  {
    heading: "1. Who we are",
    paragraphs: [
      'Streamflaire Group LLC ("Streamflaire," "we," "us") operates WorkBench, a business-management platform for home-service companies ("the Service"), available on the web and as a native iPhone app. We are headquartered in Allen, Texas, USA.',
      "This policy explains what information we collect, how we use it, and the choices you have. By using the website or the Service, you agree to the practices described here.",
    ],
  },
  {
    heading: "2. Information we collect",
    paragraphs: [
      "Account information. When you create an account we collect your name, email address, phone number, and a password (stored only in hashed form). Business owners may also provide company details such as a business name, logo, service area, business hours, and branding.",
      "Business records you create. The Service exists to run your business, so we store the records you and your team create: clients and their contact details, leads and pipeline stages, service requests, quotes, invoices, appointments and schedules, agreements and e-signatures, payments, team chat messages, photos, and notes.",
      "Payment and payout information. If you enable online payments, we collect the information needed to set up and operate your payment account — such as your business and ownership details, tax identifiers, and the bank account where your payouts are deposited. This information is collected and processed by our payment partner (see “Payments” below). We do not store full card numbers on our servers.",
      "Automatically collected information. We collect limited technical information needed to run the Service — such as IP address, browser and device type, and login timestamps — for security and troubleshooting. We do not run third-party advertising trackers.",
      "Push notification subscriptions. If you turn on notifications, we store the device subscription needed to deliver them. You can turn notifications off at any time in your profile or your device settings.",
    ],
  },
  {
    heading: "3. Your clients’ information",
    paragraphs: [
      "Businesses using WorkBench upload and manage information about their own customers — names, contact details, service addresses, job history, and the payments those customers make. That information belongs to the business that entered it. We act as a processor on that business’s behalf: we use it only to provide the Service to that business, and we never sell it or use it for advertising.",
      "If you are a customer of a business that uses WorkBench and have questions about your information, please contact that business directly — they control their records.",
    ],
  },
  {
    heading: "4. How we use information",
    paragraphs: [
      "We use the information we collect to operate the Service: authenticating you, storing your business records, sending the emails and notifications you or your workflows trigger (for example quotes, invoices, booking confirmations, receipts, and reminders), processing payments you accept, preventing spam and abuse, providing support, and improving the product.",
      "We do not sell personal information, and we do not share it with third parties for their own marketing.",
    ],
  },
  {
    heading: "5. Payments",
    paragraphs: [
      "Where you enable online payments, card and bank payments are processed by our payment partner, Finix Payments, Inc., under their own privacy policy and merchant terms. When you apply for or use a payment account, the business and banking details needed for underwriting, processing, payouts, and fraud prevention are collected and handled by Finix. We receive transaction records — amounts, status, fees, payout summaries, and disputes — so we can show them to you inside WorkBench, but we do not receive or store full card numbers.",
      "Money your customers pay flows through the payment processor to the bank account you provide during setup. It is never held in a Streamflaire bank account.",
    ],
  },
  {
    heading: "6. AI features",
    paragraphs: [
      "Some features — such as the setup wizard and the built-in assistant — are powered by third-party AI models (currently Google Gemini). When you use these features, the relevant text you provide, and for the assistant the specific business records needed to answer your request, are sent to the AI provider to generate a response. We only send what is needed to power the feature you are using, and we do not use your data to train third-party models.",
    ],
  },
  {
    heading: "7. Service providers",
    paragraphs: [
      "We rely on a small number of vendors to run the Service, and they only receive the data required to do their job: cloud hosting and database infrastructure (Railway), payment processing (Finix Payments, Inc.), transactional email delivery (Resend), bot and spam protection (Cloudflare Turnstile), push-notification delivery (Apple Push Notification service and Firebase Cloud Messaging), and AI processing (Google). Each vendor is bound by its own terms and privacy commitments.",
    ],
  },
  {
    heading: "8. Cookies",
    paragraphs: [
      "We use essential cookies only — primarily a session cookie that keeps you signed in. We do not use advertising or cross-site tracking cookies.",
    ],
  },
  {
    heading: "9. Data retention and deletion",
    paragraphs: [
      "We keep your information for as long as your account is active. Business owners can permanently delete their account and company data at any time from Settings inside the app (Danger Zone → Delete account). Team members can ask the business owner, or contact us, to remove their account. Some records may persist briefly in encrypted backups before being cycled out, and we may retain limited transaction records where the law or our payment partner requires it.",
    ],
  },
  {
    heading: "10. Your rights",
    paragraphs: [
      "Depending on where you live, you may have the right to access, correct, export, or delete your personal information, and to object to certain processing. You can exercise most of these directly in the app — editing your profile and company records, or deleting your account. For anything you can’t do yourself, email us and we’ll help. We won’t discriminate against you for exercising these rights.",
    ],
  },
  {
    heading: "11. Security",
    paragraphs: [
      "All traffic to the Service is encrypted in transit (HTTPS). Passwords are stored hashed, access to production systems is restricted, sensitive payment data is handled by our PCI-compliant payment partner rather than stored by us, and client-facing links use unguessable tokens. No system is perfectly secure, but we take reasonable measures appropriate to the data we hold, and we will notify affected users of any breach as required by law.",
    ],
  },
  {
    heading: "12. Children",
    paragraphs: [
      "WorkBench is a business tool intended for adults. It is not directed to children under 13, and we do not knowingly collect information from children.",
    ],
  },
  {
    heading: "13. Changes to this policy",
    paragraphs: [
      "We may update this policy as the Service evolves. When we do, we will update the date at the top of this page, and for significant changes we will notify you in the app or by email.",
    ],
  },
  {
    heading: "14. Contact us",
    paragraphs: [
      <span key="contact">
        Questions about this policy or your data? Email{" "}
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

export default function PrivacyPage() {
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
              Privacy <span style={{ color: ACCENT }}>Policy</span>
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
                <span className="font-bold text-gray-900">The short version:</span> we
                collect what we need to run the product, we never sell your data, your
                clients&apos; records belong to you, payments are handled by a dedicated
                processor, and you can delete everything yourself at any time. The details
                are below.
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
