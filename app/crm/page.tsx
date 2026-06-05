import type { Metadata } from 'next';
import Link from 'next/link';
import Image from 'next/image';
import { AnimateIn } from '@/components/AnimateIn';
import { SketchUnderline } from '@/components/SketchUnderline';

export const metadata: Metadata = {
  title: 'Free CRM for Service Businesses',
  description:
    'Job pipeline, scheduling, quoting, invoicing, online payments, and review automation — all 14 features, free forever. No plans, no upsell, no catch.',
};

function CheckIcon() {
  return (
    <svg className="w-4 h-4 flex-shrink-0" viewBox="0 0 24 24" fill="none" stroke="#22C55E" strokeWidth="2.5">
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}

const allFeatures = [
  'Customer & Contact Database',
  'Job & Work-Order Pipeline',
  'Scheduling Calendar with Tech Assignment',
  'Quotes & Estimates (online acceptance)',
  'One-Step Invoicing from Completed Jobs',
  'Photo & Note Attachments per Job',
  'Mobile-Friendly Field Access',
  'Online Payments — Card + ACH + Pay-by-Link',
  'Surcharging (pass card fees to homeowner)',
  'Automated Payment Reminders',
  'Recurring Jobs & Service Plans',
  'Online Booking / Request Service Form',
  'Automatic Review Request After Payment',
  'Neighbor & Radius Mail (add-on)',
];

export default function CRMPage() {
  return (
    <>
      {/* ── HERO ── */}
      <section
        className="pt-[148px] pb-24 bg-dot-pattern"
        style={{ backgroundColor: '#0C0F0C' }}
      >
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <div
            className="inline-flex items-center gap-2 mb-7 px-4 py-2"
            style={{ border: '1px solid rgba(34,197,94,0.3)', backgroundColor: 'rgba(34,197,94,0.07)' }}
          >
            <div style={{ width: '6px', height: '6px', backgroundColor: '#22C55E' }} />
            <span
              className="text-xs font-bold uppercase tracking-widest"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Free Forever — No Plans, No Upsell
            </span>
          </div>
          <h1
            className="text-4xl sm:text-5xl lg:text-6xl font-bold text-white leading-tight max-w-4xl mb-6"
            style={{ fontFamily: 'Oxanium, system-ui, sans-serif' }}
          >
            The CRM Built to{' '}
            <SketchUnderline color="#22C55E">Run a Service Business.</SketchUnderline>
          </h1>
          <p className="text-lg max-w-2xl leading-relaxed mb-10" style={{ color: 'rgba(255,255,255,0.6)' }}>
            Job pipeline, scheduling calendar, quoting, invoicing, online payments, and automated review requests — built specifically for trades and home service businesses. Every feature below is included. Free for everyone.
          </p>
          <div className="flex flex-wrap gap-4">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Get Started Free →
            </Link>
            <a
              href="#features"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-white hover:text-black"
              style={{
                border: '1.5px solid rgba(255,255,255,0.25)',
                color: 'rgba(255,255,255,0.8)',
                fontFamily: 'Oxanium, system-ui, sans-serif',
              }}
            >
              See All Features
            </a>
          </div>
        </div>
      </section>

      {/* ── ALL FEATURES AT A GLANCE ── */}
      <section id="features" className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimateIn className="mb-10">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              Everything Included
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold"
              style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}
            >
              14 Features. <SketchUnderline>One Price: Free.</SketchUnderline>
            </h2>
          </AnimateIn>

          <AnimateIn>
            <div className="grid sm:grid-cols-2 gap-3">
              {allFeatures.map((feature) => (
                <div
                  key={feature}
                  className="flex items-center gap-3 px-5 py-4 bg-white"
                  style={{ border: '1px solid #E5E7EB' }}
                >
                  <CheckIcon />
                  <span className="text-sm font-medium" style={{ color: '#0A0A0F', fontFamily: 'Oxanium, system-ui, sans-serif' }}>
                    {feature}
                  </span>
                </div>
              ))}
            </div>
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
              The foundation every service business needs — contacts, jobs, and a schedule that actually tells you what&apos;s happening and who&apos;s doing it.
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
                  Customer & Contact Database
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Every customer in one place — name, address, phone, and a full history of every job, quote, invoice, and payment. No more digging through texts or spreadsheets to find what you quoted someone last April. Search any customer, pull up the full picture in seconds.
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
                  Job & Work-Order Pipeline
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Every job moves through a clear pipeline: Lead → Scheduled → In Progress → Complete → Invoiced → Paid. View it as a drag-and-drop board or a sortable list. One click moves a job forward. You always know exactly where every piece of work stands — and what needs attention today.
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
                  Scheduling Calendar with Tech Assignment
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Drag a job onto a day in the calendar, assign a tech, and it&apos;s on the schedule. Your crew sees what&apos;s on their day. Your office sees where everyone is. No double-bookings, no missed appointments, no &ldquo;I thought you were handling that.&rdquo; Built for businesses running more than one truck.
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
                  Photo & Note Attachments per Job
                </p>
                <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                  Before-and-after photos, job notes, and any relevant documentation stored directly on the job record — not buried in a camera roll or a text thread. Protects you in disputes, builds trust with homeowners, and the before/after content feeds your neighbor marketing later.
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
              From the first quote to the final payment, every dollar moves through one tool — no disconnected apps, no re-entering data, no chasing checks manually.
            </p>
          </AnimateIn>

          {/* Payment image + quote cards row */}
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
                    Quotes & Estimates
                  </p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#374151' }}>
                    Build a quote in the tool, send it to the customer by email or text, and they accept it online with a single click. No PDFs emailed back and forth. No confusion over what was agreed. The approved quote becomes the job record automatically.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    This is the front of the money flow — when the customer accepts, everything downstream (scheduling, invoicing, payment) is already connected.
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
                    One-Step Invoicing
                  </p>
                  <p className="text-sm leading-relaxed mb-4" style={{ color: '#374151' }}>
                    When a job is marked complete, flip it to an invoice in one click. All the details carry over — customer info, job notes, line items. Nothing to re-enter. Send it immediately from the same screen.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                    Most service businesses leave money on the table because invoicing is a pain. We made it impossible to avoid.
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
                    Online Payments
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Card, ACH, and pay-by-link — all processed through your own payment processor so funds go directly to your account. Send a payment link in a text message. The customer pays in 30 seconds. No more waiting on checks.
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
                    Surcharging
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Pass card processing fees to the homeowner instead of absorbing them yourself. Fully disclosed at checkout. Handled automatically — you don&apos;t configure anything per job. On a $1,500 invoice, that&apos;s roughly $45 back in your pocket.
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
                    Payment Reminders
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: '#374151' }}>
                    Unpaid invoice? The system sends follow-up reminders automatically on a schedule you set — 3 days, 7 days, 14 days. You stop chasing, the relationship stays clean, and you get paid faster.
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
                      Card, ACH, or pay-by-link — no separate payment app required.
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
              Your techs aren&apos;t at a desk. The tool needs to work where the work happens — on the roof, in the crawlspace, in the driveway when the job is done.
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
                    The full tool works on any phone browser — no app to download, no version to update. A tech can mark a job complete, upload before-and-after photos, add job notes, and send the invoice before they back out of the driveway.
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    Responsive web is the right call here. Everyone has a browser. Not everyone has the right app installed. We don&apos;t make your field guys jump through hoops.
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

      {/* ── SECTION 04: GROWTH ── dark ── */}
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
              Growing After Every Job
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              A finished job isn&apos;t just revenue — it&apos;s a review, a repeat customer, a booking, and a neighborhood introduction. These features turn every completed job into three more.
            </p>
          </AnimateIn>

          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ border: '1px solid rgba(255,255,255,0.09)' }}
          >
            {[
              {
                title: 'Recurring Jobs & Service Plans',
                desc: 'Set up maintenance contracts and recurring visits — weekly, monthly, or seasonal. Lawn care, pool service, pest control, HVAC tune-ups, any business that runs on repeat visits. The job creates itself on the schedule. You stop manually rebooking. The revenue becomes predictable.',
                addon: false,
              },
              {
                title: 'Online Booking & Request Service Form',
                desc: 'An embeddable "Request Service" form you can put on your website, your Google Business Profile, or anywhere a homeowner might find you. They fill it out, and it drops straight into your job pipeline as a new lead. No phone tag. No missed messages at 10pm. New leads show up while you sleep.',
                addon: false,
              },
              {
                title: 'Automatic Review Request After Payment',
                desc: 'The moment a job is paid, the system sends a review request to the customer. Hit them while they\'re happy and the experience is still fresh — not three weeks later when they\'ve already moved on. More Google reviews, less manual follow-up.',
                addon: false,
              },
              {
                title: 'Neighbor & Radius Mail',
                desc: 'You just finished a job at 142 Maple Street. The tool can trigger a direct mail drop to the surrounding block — "We were just next door. Here\'s what we did." This is how you turn one job into three. Works because you were literally just there. That\'s the whole pitch.',
                addon: true,
              },
            ].map((item, i) => (
              <div
                key={item.title}
                className="p-8"
                style={{
                  borderRight: i % 2 === 0 ? '1px solid rgba(255,255,255,0.09)' : 'none',
                  borderBottom: i < 2 ? '1px solid rgba(255,255,255,0.09)' : 'none',
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
                    {item.addon && (
                      <span
                        className="ml-2 text-xs font-normal px-2 py-0.5"
                        style={{ color: '#22C55E', border: '1px solid rgba(34,197,94,0.4)', fontFamily: 'Oxanium, system-ui, sans-serif' }}
                      >
                        add-on
                      </span>
                    )}
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
                Most CRM tools give you 90 days free, let you build your whole operation inside them, then hit you with a $49–$149/month bill right when you depend on them. They call it a free trial. We call it a sales tactic.
              </p>
              <p className="text-base leading-relaxed mb-5" style={{ color: '#6B7280' }}>
                There is no paid version of this tool. There is no higher plan. Every feature listed on this page — the job pipeline, the scheduling calendar, the payment processing, the review automation, all of it — is included. Free. For every service business.
              </p>
              <p className="text-base leading-relaxed" style={{ color: '#6B7280' }}>
                The tool exists because we believe the businesses we work with deserve software that actually helps them run. The goal isn&apos;t to hook you on a subscription — it&apos;s to run your operation well enough that when you&apos;re ready to build something custom, we&apos;re the ones you call.
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
                    'All 14 features — included from day one',
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
              Get started with Streamflare and the job manager is yours — no trial, no card required. Let&apos;s talk about what your business needs.
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
