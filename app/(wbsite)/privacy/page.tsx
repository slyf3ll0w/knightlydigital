import type { Metadata } from "next";
import Link from "next/link";
import { AnimateIn } from "@/components/AnimateIn";
import WBHero from "@/components/wb/WBHero";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "How WorkBench collects, uses, and protects your information — and why we never sell it.",
};

const LAST_UPDATED = "November 24, 2026";

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
      "How you found us. When you arrive at our website we note the page you came from, any campaign tags on the link, and, if you clicked one of our ads, the click ID the advertising platform (such as Google or Meta) attached to that link. If you sign up or contact us, that is kept with your record so we know which of our advertising works. See “Advertising” below.",
      "Push notification subscriptions. If you turn on notifications, we store the device subscription needed to deliver them. You can turn notifications off at any time in your profile or your device settings.",
    ],
  },
  {
    heading: "3. Your clients’ information",
    paragraphs: [
      "Businesses using WorkBench upload and manage information about their own customers — names, contact details, service addresses, job history, and the payments those customers make. That information belongs to the business that entered it. We act as a processor on that business’s behalf: we use it only to provide the Service to that business, and we never sell it or use it for our own advertising.",
      "A business can choose to connect its own advertising account (Google Ads, or Facebook and Instagram ads through Meta). This is optional and off until an owner or admin of that business turns it on. When it is on, and one of that business’s customers reached it by clicking a link from that platform, WorkBench reports back to the business’s own advertising account that the click led to a lead, an appointment, a quote, a job or a payment. What is sent is the click ID or lead ID that the platform itself created, the step, its time, and for a payment the amount. WorkBench does not send the customer’s name, email address, phone number or street address. If the business connects its Facebook Page, the answers people give on that business’s Facebook or Instagram lead forms are delivered from Meta into the business’s WorkBench account.",
      "If you are a customer of a business that uses WorkBench and have questions about your information, please contact that business directly — they control their records.",
    ],
  },
  {
    heading: "4. How we use information",
    paragraphs: [
      "We use the information we collect to operate the Service: authenticating you, storing your business records, sending the emails and notifications you or your workflows trigger (for example quotes, invoices, booking confirmations, receipts, and reminders), processing payments you accept, preventing spam and abuse, providing support, and improving the product.",
      "We do not sell personal information, and we do not share it with third parties for their own marketing. Text messaging originator opt-in data and consent (the mobile number a customer provides and their choice to receive texts) are excluded from every category of sharing described in this policy; this information will not be shared with any third parties, and will not be sold or shared with third parties for promotional or marketing purposes.",
    ],
  },
  {
    heading: "5. Payments",
    paragraphs: [
      "Where you enable online payments, card and bank payments are processed by our payment partner, Square (Block, Inc.), through the Square account you connect to WorkBench, under Square's own privacy policy and seller agreement. The business and banking details needed for processing, payouts, and fraud prevention are collected and handled by Square. We receive transaction records — amounts, status, estimated fees, and refunds — and an access token for your Square account so we can take payments on your behalf and show them to you inside WorkBench, but we do not receive or store full card numbers.",
      "Money your customers pay flows through the payment processor to the bank account you provide during setup. It is never held in a Streamflaire bank account.",
    ],
  },
  {
    heading: "6. AI features and connected AI apps",
    paragraphs: [
      "Some features — such as the setup wizard, estimate tools, and the built-in assistant — are powered by third-party AI models from Anthropic (Claude) and Google (Gemini). When you use these features, the relevant text you provide, and for the assistant the specific business records needed to answer your request, are sent to the AI provider to generate a response. We only send what is needed to power the feature you are using, and we do not use your data to train third-party models.",
      "Connected AI apps. An owner or admin can choose to connect a third-party AI app (for example Claude or ChatGPT) to their WorkBench account. This is optional and off until that person turns it on. When they do, the records that person asks the app about are sent to the company that provides that app, including client names, contact details, addresses, jobs, quotes, invoices, and payments. That company’s own terms and privacy policy apply to what it receives.",
      "A connected app can read what the person who connected it can see, and can prepare changes that the person must approve inside WorkBench. It cannot save, send, or delete anything on its own, and it cannot move money. We keep a record of which actions a connected app took and when, for 90 days, but not the data it read. A connection can be removed at any time in Settings → Connected apps, changing your password ends every connection you made, and the account owner can turn connected apps off for the whole company.",
    ],
  },
  {
    heading: "7. Google Calendar sync",
    paragraphs: [
      "WorkBench can connect to a team member’s own Google Calendar. This is optional, per person, and turned on only by that person from My Profile → Calendar sync. When connected, WorkBench (a) writes that person’s WorkBench schedule — the jobs they are assigned to, their appointments, and their blocked-off time — into their Google Calendar and keeps those entries updated, and (b) reads the events on their primary Google Calendar so that time they are already busy is shown as blocked time in WorkBench and is not booked over.",
      "What we read and keep. From Google we read each event’s start and end time, whether it is marked busy or free, its status, and its title. We store only the start/end times and, by default, the label “Busy” — the event title is stored only if the person turns on “Show the event names to my team.” Events marked Free in Google are ignored. We do not read attendees, descriptions, attachments, or any calendar other than the primary one, and we do not use Google Calendar data for advertising, profiling, or training AI models.",
      "Access tokens. The Google access and refresh tokens that let WorkBench do this are stored encrypted (AES-256-GCM) and used only for the purposes above. Disconnecting Google Calendar in WorkBench deletes the tokens, removes the events WorkBench created in Google, and deletes the mirrored busy time from WorkBench. You can also revoke WorkBench’s access at any time from your Google Account permissions page.",
      "Limited Use disclosure. WorkBench’s use and transfer to any other app of information received from Google APIs will adhere to the Google API Services User Data Policy, including the Limited Use requirements. In plain terms: Google user data is used only to provide the calendar sync feature the person turned on, is never sold, is never used for ads, and is not shared with anyone except as needed to provide that feature, with the person’s consent, for security purposes, or to comply with the law.",
    ],
  },
  {
    heading: "8. Service providers",
    paragraphs: [
      "We rely on a small number of vendors to run the Service, and they only receive the data required to do their job: cloud hosting and database infrastructure (Railway), payment processing (Square / Block, Inc.), transactional email delivery (Resend), bot and spam protection (Cloudflare Turnstile), push-notification delivery (Apple Push Notification service and Firebase Cloud Messaging), and AI processing (Anthropic and Google). Each vendor is bound by its own terms and privacy commitments.",
      "Advertising platforms (Google and Meta) receive only what is described under “Your clients’ information” and “Advertising”: a click or lead ID they created themselves and what it led to.",
    ],
  },
  {
    heading: "9. Cookies",
    paragraphs: [
      "Inside the Service we use essential cookies only — primarily a session cookie that keeps you signed in.",
      "On our public website (not inside the Service or your clients’ portal) we use Microsoft Clarity to see how visitors use our pages: clicks, scrolling and page recordings that help us fix confusing or broken parts of the site. Clarity sets its own cookies, and Microsoft may use a Microsoft cookie that it also uses on other sites. What you type into forms is hidden from these recordings. Microsoft’s handling of this data is described in the Microsoft Privacy Statement (privacy.microsoft.com). Apart from Clarity, we do not place an advertising platform’s tracking code (a “pixel”) on our website or in the Service.",
    ],
  },
  {
    heading: "10. Advertising",
    paragraphs: [
      "We advertise WorkBench on platforms such as Google and Meta (Facebook and Instagram). If you reach our website by clicking one of our ads and then contact us, book a call or sign up, we may tell that platform that its click led to that step, so our advertising can be measured and improved. We send the click ID the platform attached to the link, the step and its time, the address of the page you landed on and your browser type. We do not send your name, email address, phone number or business details, and we do not sell or share your information for anyone else’s marketing.",
      "The advertising platform handles what it receives under its own privacy policy, and you can control how ads are shown to you in your Google or Meta account settings.",
    ],
  },
  {
    heading: "11. Data retention and deletion",
    paragraphs: [
      "We keep your information for as long as your account is active. Business owners can permanently delete their account and company data at any time from Settings inside the app (Danger Zone → Delete company…). Team members can ask the business owner, or contact us, to remove their account. Some records may persist briefly in encrypted backups before being cycled out, and we may retain limited transaction records where the law or our payment partner requires it.",
    ],
  },
  {
    heading: "12. Your rights",
    paragraphs: [
      "Depending on where you live, you may have the right to access, correct, export, or delete your personal information, and to object to certain processing. You can exercise most of these directly in the app — editing your profile and company records, or deleting your account. For anything you can’t do yourself, email us and we’ll help. We won’t discriminate against you for exercising these rights.",
    ],
  },
  {
    heading: "13. Security",
    paragraphs: [
      "All traffic to the Service is encrypted in transit (HTTPS). Passwords are stored hashed, access to production systems is restricted, sensitive payment data is handled by our PCI-compliant payment partner rather than stored by us, and client-facing links use unguessable tokens. No system is perfectly secure, but we take reasonable measures appropriate to the data we hold, and we will notify affected users of any breach as required by law.",
    ],
  },
  {
    heading: "14. Children",
    paragraphs: [
      "WorkBench is a business tool intended for adults. It is not directed to children under 13, and we do not knowingly collect information from children.",
    ],
  },
  {
    heading: "15. Changes to this policy",
    paragraphs: [
      "We may update this policy as the Service evolves. When we do, we will update the date at the top of this page, and for significant changes we will notify you in the app or by email.",
    ],
  },
  {
    heading: "16. Contact us",
    paragraphs: [
      <span key="contact">
        Questions about this policy or your data? Email{" "}
        <a
          href="mailto:contact@workbenchfsm.com"
          className="font-semibold underline underline-offset-2"
          style={{ color: ACCENT }}
        >
          contact@workbenchfsm.com
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
      <WBHero>
        <div className="max-w-3xl">
          <AnimateIn>
            <h1 className="text-4xl font-extrabold leading-[1.08] sm:text-5xl">
              Privacy <span style={{ color: ACCENT }}>Policy</span>
            </h1>
            <p className="mt-5 text-sm text-gray-500">Last updated: {LAST_UPDATED}</p>
          </AnimateIn>
        </div>
      </WBHero>

      {/* ── Body ── */}
      <section className="border-t border-gray-200 bg-white">
        <div className="mx-auto max-w-3xl px-5 py-14 sm:px-8 sm:py-16">
          <AnimateIn>
            <div className="rounded-2xl border border-blue-100 bg-blue-50/60 px-5 py-4">
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
