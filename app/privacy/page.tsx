import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = {
  title: 'Privacy Policy',
  description:
    'How Streamflaire and Streamflaire Hub collect, use, and protect your information.',
};

const LAST_UPDATED = 'July 9, 2026';

/* Generic policy covering both the marketing site and Streamflaire Hub.
   Both app stores require a public privacy-policy URL, so this page is a
   Play Store / App Store prerequisite — keep it accurate as features ship. */

const sections: { heading: string; paragraphs: (string | React.ReactNode)[] }[] = [
  {
    heading: '1. Who we are',
    paragraphs: [
      'Streamflaire Media Group ("Streamflaire," "we," "us") operates this website and Streamflaire Hub, a business-management platform for home-service companies ("the Service"). We are headquartered in Allen, Texas, USA.',
      'This policy explains what information we collect, how we use it, and the choices you have. By using the website or the Service, you agree to the practices described here.',
    ],
  },
  {
    heading: '2. Information we collect',
    paragraphs: [
      'Account information. When you create an account we collect your name, email address, phone number, and a password (stored only in hashed form). Business owners may also provide company details such as a business name, logo, service area, business hours, and branding.',
      'Business records you create. The Service exists to manage your business, so we store the records you and your team create: clients and their contact details, service requests, quotes, invoices, appointments, payments you record, agreements, team chat messages, photos, and notes.',
      'Automatically collected information. We collect limited technical information needed to run the Service — such as IP address, browser and device type, and login timestamps — for security and troubleshooting. We do not run third-party advertising trackers.',
      'Push notification subscriptions. If you turn on notifications, we store the device subscription needed to deliver them. You can turn notifications off at any time in your profile or device settings.',
    ],
  },
  {
    heading: '3. Your clients’ information',
    paragraphs: [
      'Businesses using Streamflaire Hub upload and manage information about their own customers (names, contact details, addresses, job history). That information belongs to the business that entered it. We process it only to provide the Service to that business and never sell it or use it for advertising.',
      'If you are a customer of a business that uses Streamflaire Hub and have questions about your information, please contact that business directly — they control their records.',
    ],
  },
  {
    heading: '4. How we use information',
    paragraphs: [
      'We use the information we collect to operate the Service: authenticating you, storing your business records, sending the emails and notifications you or your workflows trigger (for example quotes, invoices, booking confirmations, and reminders), preventing spam and abuse, providing support, and improving the product.',
      'We do not sell personal information, and we do not share it with third parties for their own marketing.',
    ],
  },
  {
    heading: '5. AI features',
    paragraphs: [
      'Some features — such as the setup wizard and the built-in assistant — are powered by third-party AI models (currently Google Gemini). When you use these features, the relevant text you provide (and, for the assistant, relevant business records needed to answer your request) is sent to the AI provider to generate a response. We only send what is needed to power the feature you are using.',
    ],
  },
  {
    heading: '6. Service providers',
    paragraphs: [
      'We rely on a small number of vendors to run the Service, and they only receive the data required to do their job: cloud hosting and database infrastructure (Railway), transactional email delivery (Resend), bot and spam protection (Cloudflare Turnstile), and AI processing (Google). Payment processing, where offered, is handled by dedicated payment providers — we do not store full card numbers on our servers.',
    ],
  },
  {
    heading: '7. Cookies',
    paragraphs: [
      'We use essential cookies only — primarily a session cookie that keeps you signed in. We do not use advertising or cross-site tracking cookies.',
    ],
  },
  {
    heading: '8. Data retention and deletion',
    paragraphs: [
      'We keep your information for as long as your account is active. Business owners can permanently delete their account and company data at any time from Settings inside the app (Danger Zone → Delete account). Team members can ask the business owner or contact us to remove their account. Some records may persist briefly in encrypted backups before being cycled out.',
    ],
  },
  {
    heading: '9. Security',
    paragraphs: [
      'All traffic to the Service is encrypted in transit (HTTPS). Passwords are stored hashed, access to production systems is restricted, and client-facing links use unguessable tokens. No system is perfectly secure, but we take reasonable measures appropriate to the data we hold, and we will notify affected users of any breach as required by law.',
    ],
  },
  {
    heading: '10. Children',
    paragraphs: [
      'The website and the Service are business tools intended for adults. They are not directed to children under 13, and we do not knowingly collect information from children.',
    ],
  },
  {
    heading: '11. Changes to this policy',
    paragraphs: [
      'We may update this policy as the Service evolves. When we do, we will update the date at the top of this page, and for significant changes we will notify you in the app or by email.',
    ],
  },
  {
    heading: '12. Contact us',
    paragraphs: [
      <span key="contact">
        Questions about this policy or your data? Email{' '}
        <a
          href="mailto:info@streamflaremedia.com"
          className="font-medium underline underline-offset-2"
          style={{ color: '#16A34A' }}
        >
          info@streamflaremedia.com
        </a>{' '}
        or reach out through our{' '}
        <Link
          href="/contact"
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

export default function PrivacyPage() {
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
            Privacy Policy
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
            The short version: we collect what we need to run the product, we never sell your
            data, your clients&apos; records belong to you, and you can delete everything
            yourself at any time. The details are below.
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
