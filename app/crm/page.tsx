import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';
import { HubPricing } from '@/components/HubPricing';

export const metadata: Metadata = {
  title: 'Free Job Manager for Service Businesses',
  description:
    'Clients, scheduling, quotes with e-signature, invoicing, card & ACH payments, recurring services, client portal, and an AI assistant — every feature free forever. No plans, no upsell, no catch.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

export default function CRMPage() {
  return (
    <>
      {/* ── HERO — centered, landscape photo ── */}
      <section
        className="relative overflow-hidden flex items-center"
        style={{ minHeight: '700px', paddingTop: '148px', paddingBottom: '100px' }}
      >
        {/* Background image */}
        <Image
          src="https://images.unsplash.com/photo-1565402170291-8491f14678db?w=1800&q=90"
          alt="Aerial view of a suburban neighborhood"
          fill
          className="object-cover object-center"
          priority
          sizes="100vw"
        />

        {/* Gradient overlay — dark enough for text, slight green tint at top */}
        <div
          className="absolute inset-0"
          style={{
            background: 'linear-gradient(to bottom, rgba(6,14,6,0.70) 0%, rgba(6,14,6,0.88) 100%)',
          }}
        />

        {/* Centered content */}
        <div className="relative z-10 w-full max-w-4xl mx-auto px-6 lg:px-8 flex flex-col items-center text-center">

          {/* Headline */}
          <h1
            className="text-5xl sm:text-6xl lg:text-7xl font-bold text-white leading-tight mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            The Free Job Manager
            <br />
            <span style={{ color: '#22C55E' }}>
              <SketchUnderline color="#22C55E">Built for Your Trade.</SketchUnderline>
            </span>
          </h1>

          {/* Subheadline */}
          <p
            className="text-lg lg:text-xl leading-relaxed mb-10 max-w-2xl"
            style={{ color: 'rgba(255,255,255,0.68)' }}
          >
            Clients, scheduling, quotes, invoicing, payments, recurring services, and an AI
            assistant — built for trades and home service businesses.
            Every feature included. Free for everyone.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap justify-center gap-4 mb-14">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Get Started Free →
            </Link>
            <a
              href="#pricing"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-white hover:text-black"
              style={{
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: 'rgba(255,255,255,0.85)',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              Pricing & Features
            </a>
          </div>

          {/* Stat strip */}
          <div
            className="flex items-center justify-center pt-8"
            style={{ borderTop: '1px solid rgba(255,255,255,0.12)' }}
          >
            {['Free Forever', 'Unlimited Users', 'No Credit Card Required'].map((stat, i) => (
              <div key={stat} className="flex items-center">
                {i > 0 && (
                  <span className="mx-5" style={{ color: '#22C55E', fontSize: '1rem', lineHeight: 1 }}>·</span>
                )}
                <span
                  className="text-xs uppercase tracking-widest font-medium"
                  style={{ color: 'rgba(255,255,255,0.45)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  {stat}
                </span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── PRICING + ALL FEATURES ── */}
      <section id="pricing" className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimateIn className="mb-10">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Pricing & Features
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              One Plan. <SketchUnderline>Everything In It.</SketchUnderline>
            </h2>
          </AnimateIn>

          <AnimateIn>
            <HubPricing />
          </AnimateIn>
        </div>
      </section>

      {/* ── FULL-WIDTH IMAGE STRIP 1 — on the job site ── */}
      <section className="relative overflow-hidden" style={{ height: '380px' }}>
        <Image
          src="https://plus.unsplash.com/premium_photo-1683134512538-7b390d0adc9e?w=1400&q=85"
          alt="Home service technician on the job"
          fill
          className="object-cover"
          sizes="100vw"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{ background: 'linear-gradient(to right, rgba(12,15,12,0.90) 0%, rgba(12,15,12,0.65) 50%, rgba(12,15,12,0.2) 100%)' }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Built for Your Trade
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white max-w-xl leading-tight"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              The tool your crew needs — from the office to the job site.
            </h2>
          </div>
        </div>
      </section>

      {/* ── SECTION 01: THE CORE OPERATION ── dark ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <span
              className="text-6xl font-bold block mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
            >
              01
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-5"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              The Core Operation
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              The foundation every service business needs — clients, incoming work, a schedule
              that actually tells you what&apos;s happening, and a pipeline that shows where every
              job stands.
            </p>
          </AnimateIn>

          <div className="grid md:grid-cols-2 gap-5">

            <AnimateIn delay={0}>
              <div
                className="card-lift p-8 flex flex-col h-full"
                style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-4"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Client Database
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Every customer in one place — contact info, notes, and the full history of every
                  quote, job, invoice, and payment. Add your own custom fields (gate codes, pet
                  names, referral source — whatever your business tracks). Switching from Jobber or
                  Housecall Pro? The CSV importer auto-maps their exports and brings your whole
                  client list over in minutes.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={120}>
              <div
                className="card-lift p-8 flex flex-col h-full"
                style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-4"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Online Booking & Requests
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Build booking forms and embed them on your website or share the link anywhere.
                  Customers can even pick a real time slot from your live availability — you approve
                  it before it lands on the calendar, so nothing gets double-booked. Every
                  submission drops into your Requests inbox as a new lead. No phone tag, no missed
                  messages at 10pm.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={60}>
              <div
                className="card-lift p-8 flex flex-col h-full"
                style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-4"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Scheduling & Appointments
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Month, week, and day views with drag-to-schedule — pull an unscheduled job onto a
                  day, assign a tech, done. Estimate appointments (phone, video, or in-person) share
                  the same calendar, so sales visits and job visits never collide. Your crew sees
                  their day; your office sees everyone&apos;s.
                </p>
              </div>
            </AnimateIn>

            <AnimateIn delay={180}>
              <div
                className="card-lift p-8 flex flex-col h-full"
                style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
              >
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-4"
                  style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  Job Pipeline, Photos & Notes
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Every job moves through a clear pipeline from active work to invoiced and paid.
                  Before-and-after photos, job notes, and crew assignments live on the job record —
                  not buried in a camera roll or a text thread. You always know exactly where every
                  piece of work stands and what needs attention today.
                </p>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── SECTION 02: THE MONEY FLOW ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <span
              className="text-6xl font-bold block mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
            >
              02
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold mb-5"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              The Money Flow
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              From the first quote to the final payment, every dollar moves through one tool — no
              disconnected apps, no re-entering data, no chasing checks manually.
            </p>
          </AnimateIn>

          {/* Quote + invoice cards row */}
          <div className="grid lg:grid-cols-2 gap-6 mb-6">

            <AnimateIn delay={0}>
              <div
                className="card-lift h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                <div className="p-8">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Quotes, E-Signatures & Deposits
                  </p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#374151' }}>
                    Build a quote from your price book, add optional upgrade items the customer can
                    take or leave, and send it. They approve it online with a typed e-signature —
                    no PDFs emailed back and forth, no confusion over what was agreed.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    Need money down? Set a deposit per service or company-wide — percent, fixed, or
                    full amount. Collecting it issues a deposit invoice, and the final bill nets it
                    out automatically.
                  </p>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={120}>
              <div
                className="card-lift h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                <div className="p-8">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    One-Click Invoicing
                  </p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#374151' }}>
                    When a job is marked complete, flip it to an invoice in one click. Customer
                    info, line items, and job notes carry over — nothing to re-enter. Send it
                    immediately from the same screen.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    Most service businesses leave money on the table because invoicing is a pain.
                    We made it impossible to avoid.
                  </p>
                </div>
              </div>
            </AnimateIn>

          </div>

          <div className="grid md:grid-cols-3 gap-5 mb-10">

            <AnimateIn delay={0}>
              <div
                className="card-lift h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                <div className="p-7">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Card & ACH Payments
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Every invoice gets a branded payment page — send the link by email or text and
                    the customer pays by card or bank transfer. Card surcharging is built in, so you
                    can pass processing fees to the customer instead of eating them. Cash, check,
                    Venmo, Zelle? Record those too — every payment lands in one ledger.
                  </p>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={100}>
              <div
                className="card-lift h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                <div className="p-7">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Automatic Payment Reminders
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Unpaid invoice? The system follows up for you — at the due date, then 3, 7, and
                    14 days past due — and stops the moment it&apos;s paid. You stop chasing, the
                    relationship stays clean, and you get paid faster.
                  </p>
                </div>
              </div>
            </AnimateIn>

            <AnimateIn delay={200}>
              <div
                className="card-lift h-full bg-white"
                style={{ border: '1px solid #E5E7EB' }}
              >
                <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                <div className="p-7">
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#6B7280', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Expenses & Profit Insights
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Log expenses by category and see what you actually made — not just what you
                    billed. The insights dashboard shows revenue, outstanding balances, and where
                    the money went, so you run the business on numbers instead of gut feel.
                  </p>
                </div>
              </div>
            </AnimateIn>

          </div>

          {/* Inline payment photo */}
          <AnimateIn>
            <div className="relative overflow-hidden" style={{ height: '260px' }}>
              <Image
                src="https://images.unsplash.com/photo-1653330963134-329a61aedc68?w=1200&q=85"
                alt="Customer paying via smartphone"
                fill
                className="object-cover"
                sizes="(max-width: 1280px) 100vw, 1280px"
              />
              <div
                className="absolute inset-0 flex items-center justify-end"
                style={{ background: 'linear-gradient(to left, rgba(12,15,12,0.88) 0%, rgba(12,15,12,0.5) 50%, rgba(12,15,12,0.1) 100%)' }}
              >
                <div className="max-w-7xl mx-auto px-6 lg:px-8 w-full flex justify-end">
                  <div className="max-w-sm text-right">
                    <p
                      className="text-xl font-bold text-white mb-2"
                      style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                    >
                      &ldquo;Send a link. They pay. Done.&rdquo;
                    </p>
                    <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>
                      Card or ACH on a branded payment page — no separate payment app required.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </AnimateIn>

        </div>
      </section>

      {/* ── SECTION 03: THE FIELD ── paper-warm ── */}
      <section className="py-24 bg-paper-warm">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-12">
            <span
              className="text-6xl font-bold block mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
            >
              03
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold mb-5"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Built for the Field
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              Your techs aren&apos;t at a desk. The tool needs to work where the work happens — on
              the roof, in the crawlspace, in the driveway when the job is done.
            </p>
          </AnimateIn>

          <div className="grid lg:grid-cols-2 gap-10 items-stretch">

            {/* Left: field photo */}
            <AnimateIn>
              <div className="relative overflow-hidden h-full" style={{ minHeight: '380px' }}>
                <Image
                  src="https://plus.unsplash.com/premium_photo-1661964300839-f02563414f19?w=800&q=85"
                  alt="Service technician using smartphone on the job site"
                  fill
                  className="object-cover"
                  sizes="(max-width: 1024px) 100vw, 50vw"
                />
                <div
                  className="absolute inset-0"
                  style={{ background: 'linear-gradient(135deg, rgba(12,15,12,0.25) 0%, transparent 60%)' }}
                />
              </div>
            </AnimateIn>

            {/* Right: content */}
            <AnimateIn delay={150}>
              <div className="flex flex-col gap-0 h-full">
                <div
                  className="p-8 mb-5"
                  style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-4"
                    style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    Mobile-Friendly Field Access
                  </p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    The full tool works on any phone browser — no app to download, no version to
                    update. A tech can mark a job complete, upload before-and-after photos, add job
                    notes, and send the invoice before they back out of the driveway.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Techs get their own logins with tech-level permissions — they see their
                    schedule and their jobs, not your books.
                  </p>
                </div>
                <div className="flex flex-col gap-3">
                  {[
                    { label: 'Mark jobs complete from the job site', sub: 'Status updates in real time — office knows instantly.' },
                    { label: 'Upload before & after photos on the spot', sub: 'Stored on the job record. No digging through camera rolls.' },
                    { label: 'Send the invoice before you leave', sub: 'Customer gets it while they\'re still happy about the work.' },
                  ].map((item) => (
                    <div
                      key={item.label}
                      className="flex items-start gap-4 px-5 py-4 bg-white"
                      style={{ border: '1px solid #E5E7EB' }}
                    >
                      <CheckIcon />
                      <div>
                        <p className="text-sm font-bold mb-0.5" style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                          {item.label}
                        </p>
                        <p className="text-xs" style={{ color: '#6B7280' }}>{item.sub}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── FULL-WIDTH IMAGE STRIP 2 — outdoor service work ── */}
      <section className="relative overflow-hidden" style={{ height: '320px' }}>
        <Image
          src="https://plus.unsplash.com/premium_photo-1661884973994-d7625e52631a?w=1400&q=85"
          alt="Contractor working outdoors on a job site"
          fill
          className="object-cover object-top"
          sizes="100vw"
        />
        <div
          className="absolute inset-0 flex items-center"
          style={{ background: 'linear-gradient(to right, rgba(12,15,12,0.85) 0%, rgba(12,15,12,0.55) 55%, rgba(12,15,12,0.15) 100%)' }}
        >
          <div className="max-w-7xl mx-auto px-6 lg:px-8">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-3"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Built for Every Vertical
            </p>
            <h2
              className="text-2xl lg:text-3xl font-bold text-white max-w-lg leading-tight"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Lawn care, roofing, HVAC, plumbing, pest, pool — if you run jobs, this runs your business.
            </h2>
          </div>
        </div>
      </section>

      {/* ── SECTION 04: GROW & MANAGE ── dark ── */}
      <section className="py-24 bg-dot-pattern" style={{ backgroundColor: '#0C0F0C' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <span
              className="text-6xl font-bold block mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif', lineHeight: 1 }}
            >
              04
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-5"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Grow & Manage
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              The features that usually live behind a &ldquo;Pro plan&rdquo; paywall — automation,
              e-signatures, a client portal, team management, and an AI assistant. Included here.
            </p>
          </AnimateIn>

          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ border: '1px solid rgba(255,255,255,0.09)' }}
          >
            {[
              {
                title: 'Recurring Services & Subscriptions',
                desc: 'Sell a service on repeat — monthly, quarterly, semiannual, or annual — and the system invoices it every cycle automatically, and can put the job on the schedule too. Lawn care, pool service, pest control, maintenance plans: the revenue becomes predictable and you stop manually rebooking.',
              },
              {
                title: 'Automatic Review Requests',
                desc: 'The moment a job wraps up, the system emails the customer a link to your review page. Hit them while they\'re happy and the experience is still fresh — not three weeks later when they\'ve moved on. More Google reviews, zero manual follow-up.',
              },
              {
                title: 'Branded Client Portal',
                desc: 'Your clients get their own portal — they log in with a magic link (no passwords to forget), see their quotes, invoices, and job history, and can request new work. Fewer "can you resend that invoice?" calls, and a more professional front door for your business.',
              },
              {
                title: 'Contracts & E-Signatures',
                desc: 'Build contract templates once, send them with any quote, and collect a legally-timestamped typed signature online. You can even require a signed agreement before a quote can become a job — no more starting work on a handshake.',
              },
              {
                title: 'Team Roles & Lead Routing',
                desc: 'Owner, admin, sales, and tech roles — each person sees what their job needs and nothing more. Route new leads to the right salesperson automatically, control who sees payment info, and add as many users as you want. No per-seat pricing, ever.',
              },
              {
                title: 'Atlas, Your AI Assistant',
                desc: 'Ask Atlas anything about your business — "who owes me money?", "what\'s on the schedule Friday?" — and it answers from your real data. It can draft quotes, send invoices, and update settings, always showing you a confirmation before anything happens. Plus an AI setup wizard that builds your price book and booking form in about two minutes.',
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className="p-8"
                style={{
                  borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.09)' : 'none',
                  borderBottom: i < 4 ? '1px solid rgba(255,255,255,0.09)' : 'none',
                  backgroundColor: '#111511',
                }}
              >
                <div className="flex items-start gap-3 mb-4">
                  <div style={{ width: '22px', height: '2px', backgroundColor: '#22C55E', marginTop: '10px', flexShrink: 0 }} />
                  <h3
                    className="text-base font-bold text-white leading-snug"
                    style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
                  >
                    {item.title}
                  </h3>
                </div>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>
                  {item.desc}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── WHY FREE ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div className="grid lg:grid-cols-2 gap-16 items-start">

            <AnimateIn>
              <p
                className="text-xs font-bold uppercase tracking-widest mb-4"
                style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                Why It&apos;s Free
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
              >
                No Trial. No Tiers. No{' '}
                <SketchUnderline>&ldquo;Upgrade to Unlock.&rdquo;</SketchUnderline>
              </h2>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                Most CRM tools give you 90 days free, let you build your whole operation inside
                them, then hit you with a $49–$149/month bill right when you depend on them. They
                call it a free trial. We call it a sales tactic.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                There is no paid version of this tool. There is no higher plan. Every feature
                listed on this page — the job pipeline, the scheduling calendar, the payments, the
                automation, the AI assistant, all of it — is included. Free. For every service
                business.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                The tool exists because we believe the businesses we work with deserve software
                that actually helps them run. The goal isn&apos;t to hook you on a subscription —
                it&apos;s to run your operation well enough that when you&apos;re ready to build
                something custom, we&apos;re the ones you call.
              </p>
            </AnimateIn>

            <AnimateIn delay={150}>
              <div
                className="p-8"
                style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
              >
                <p
                  className="text-xl font-bold mb-6 tracking-wide"
                  style={{ color: '#ffffff', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                >
                  WHAT &ldquo;FREE FOREVER&rdquo; ACTUALLY MEANS:
                </p>
                <ul className="flex flex-col gap-4 mb-8">
                  {[
                    'Every feature — included from day one',
                    'No feature gates behind a paid tier',
                    'No 30-day or 90-day trial that expires',
                    'No per-seat pricing as your team grows',
                    'No price hike after the first year',
                    'No bait-and-switch — this is the whole product',
                  ].map((item) => (
                    <li key={item} className="flex items-start gap-3 text-sm text-white">
                      <CheckIcon />
                      {item}
                    </li>
                  ))}
                </ul>
                <div
                  className="p-5"
                  style={{ borderLeft: '4px solid #22C55E', backgroundColor: 'rgba(34,197,94,0.07)' }}
                >
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.7)' }}>
                    Ready to get started?{' '}
                    <Link href="/contact" className="underline" style={{ color: '#22C55E' }}>
                      Reach out
                    </Link>{' '}
                    and we&apos;ll get you set up — no credit card, no commitment, no catch.
                  </p>
                </div>
              </div>
            </AnimateIn>

          </div>
        </div>
      </section>

      {/* ── CTA STRIP ── */}
      <section className="py-20" style={{ backgroundColor: '#22C55E' }}>
        <div className="max-w-7xl mx-auto px-6 lg:px-8 text-center">
          <AnimateIn>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-4"
              style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Ready to Run a Tighter Operation?
            </h2>
            <p className="text-base mb-10 max-w-xl mx-auto" style={{ color: 'rgba(255,255,255,0.85)' }}>
              Get started with Streamflaire and the job manager is yours — no trial, no card
              required. Let&apos;s talk about what your business needs.
            </p>
            <Link
              href="/contact"
              className="inline-block bg-white font-bold text-sm uppercase tracking-wider px-10 py-4 transition-all hover:shadow-lg hover:-translate-y-0.5"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Get Started Free →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
