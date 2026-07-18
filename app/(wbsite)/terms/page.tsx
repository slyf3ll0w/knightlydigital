import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Terms of Service',
  description: 'The terms that govern your use of WorkBench.',
};

const LAST_UPDATED = 'July 17, 2026';

/* Plain-language terms for WorkBench. This page is also the terms_of_service_url
   shown inside the payment-processing onboarding flow (Finix), so it must stay
   published and cover the payments section below. */

const sections: { heading: string; paragraphs: (string | React.ReactNode)[] }[] = [
  {
    heading: '1. The agreement',
    paragraphs: [
      'These terms are an agreement between you and Streamflaire Media Group ("Streamflaire," "we," "us") covering your use of WorkBench, a business-management platform for home-service companies ("the Service"). By creating an account or using the Service you accept these terms on behalf of yourself and, if you use it for a business, that business.',
    ],
  },
  {
    heading: '2. Your account',
    paragraphs: [
      'You are responsible for the accuracy of the information you provide, for keeping your login credentials safe, and for everything done under your account. Team members you invite get their own logins with the roles you assign; you are responsible for who you give access to.',
    ],
  },
  {
    heading: '3. Your data',
    paragraphs: [
      'The business records you create in WorkBench — clients, quotes, invoices, schedules, messages — belong to you. We process them only to provide the Service, as described in our Privacy Policy. You can delete your account, and the records with it, at any time from Settings.',
    ],
  },
  {
    heading: '4. Acceptable use',
    paragraphs: [
      'Use the Service only for lawful business purposes. Don’t attempt to break, overload, or probe the Service, send spam through it, upload malicious content, or use it to violate anyone else’s rights. We may suspend accounts that put the Service or other customers at risk.',
    ],
  },
  {
    heading: '5. Payments processing',
    paragraphs: [
      'WorkBench itself is free to use. Where online payment processing is offered, payments are processed by our payment partners — currently Finix Payments, Inc. — under their own terms and merchant agreement, which you accept when you apply for a payment account. Approval, holds, payouts, and chargebacks are governed by the processor’s merchant agreement and card-network rules.',
      'Processing fees are disclosed during payment setup and on our pricing page. You are responsible for configuring your own prices, taxes, and any card surcharge in accordance with the laws and card-network rules that apply to your business.',
      'Money you collect from your clients flows to the bank account you provide during payment setup; it is never held in a Streamflaire bank account.',
    ],
  },
  {
    heading: '6. The Service is provided "as is"',
    paragraphs: [
      'We work hard to keep WorkBench fast and reliable, but the Service is provided "as is" and "as available," without warranties of any kind. We do not guarantee uninterrupted or error-free operation.',
      'To the fullest extent permitted by law, Streamflaire is not liable for indirect, incidental, or consequential damages — including lost profits or lost data — arising from your use of the Service. Our total liability for any claim is limited to the amount you paid us for the Service in the twelve months before the claim (which, for a free account, may be zero).',
    ],
  },
  {
    heading: '7. Changes',
    paragraphs: [
      'We may update these terms as the Service evolves. If we make a material change we will post the updated terms here and update the date above; continuing to use the Service after a change means you accept the new terms.',
    ],
  },
  {
    heading: '8. Contact',
    paragraphs: [
      <span key="contact">
        Questions about these terms? Email{' '}
        <a
          href="mailto:info@streamflaire.com"
          className="font-medium underline underline-offset-2"
          style={{ color: '#16A34A' }}
        >
          info@streamflaire.com
        </a>{' '}
        or reach out through our{' '}
        <Link
          href="/apply"
          className="font-medium underline underline-offset-2"
          style={{ color: '#16A34A' }}
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
      {/* ── HERO ── */}
      <section className="pt-[148px] pb-16 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <p
            className="text-xs font-bold uppercase tracking-widest mb-5"
            style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Legal
          </p>
          <h1
            className="text-4xl sm:text-5xl font-bold text-white leading-tight mb-4"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            Terms of Service
          </h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
            Last updated: {LAST_UPDATED}
          </p>
        </div>
      </section>

      {/* ── BODY ── */}
      <section className="py-16 bg-paper">
        <div className="max-w-3xl mx-auto px-6 lg:px-8">
          <p className="text-base leading-relaxed text-gray-700 mb-12">
            The short version: WorkBench is free to use, your records belong to you, be a good
            citizen, and online payments run through our payment partner under their merchant
            terms. The details are below.
          </p>

          <div className="flex flex-col gap-10">
            {sections.map((s) => (
              <div key={s.heading}>
                <h2
                  className="text-lg font-bold text-gray-900 mb-3"
                  style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {s.heading}
                </h2>
                <div className="flex flex-col gap-3">
                  {s.paragraphs.map((p, i) => (
                    <p key={i} className="text-sm leading-relaxed text-gray-600">
                      {p}
                    </p>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}
