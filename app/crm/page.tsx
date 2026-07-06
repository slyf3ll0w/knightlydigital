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

const OXANIUM = { fontFamily: 'Oxanium, system-ui, sans-serif' } as const;

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
            style={OXANIUM}
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
            Clients, scheduling, quotes, invoicing, payments, and an AI assistant — built for
            trades and home service businesses. Every feature included. Free for everyone.
          </p>

          {/* CTAs */}
          <div className="flex flex-wrap justify-center gap-4 mb-14">
            <Link
              href="/contact"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 text-white transition-opacity hover:opacity-90"
              style={{ backgroundColor: '#22C55E', ...OXANIUM }}
            >
              Get Started Free →
            </Link>
            <a
              href="#pricing"
              className="text-sm font-bold uppercase tracking-wider px-8 py-4 transition-all hover:bg-white hover:text-black"
              style={{
                border: '1.5px solid rgba(255,255,255,0.3)',
                color: 'rgba(255,255,255,0.85)',
                ...OXANIUM,
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
                  style={{ color: 'rgba(255,255,255,0.45)', ...OXANIUM }}
                >
                  {stat}
                </span>
              </div>
            ))}
          </div>

        </div>
      </section>

      {/* ── PRICING ── */}
      <section id="pricing" className="py-20 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">
          <AnimateIn className="mb-10">
            <p
              className="text-xs font-bold uppercase tracking-widest mb-4"
              style={{ color: '#22C55E', ...OXANIUM }}
            >
              Pricing & Features
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold"
              style={{ color: '#0A0A0F', ...OXANIUM }}
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
              style={{ color: '#22C55E', ...OXANIUM }}
            >
              Built for Your Trade
            </p>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white max-w-xl leading-tight"
              style={OXANIUM}
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
              style={{ color: '#22C55E', ...OXANIUM, lineHeight: 1 }}
            >
              01
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-5"
              style={OXANIUM}
            >
              The Core Operation
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              Clients, incoming work, the schedule, and the pipeline — the four things every
              service business runs on, in one place.
            </p>
          </AnimateIn>

          <div className="grid md:grid-cols-2 gap-5">
            {[
              {
                kicker: 'Client Database',
                hook: 'Every customer. One record.',
                copy: 'The full history of every quote, job, invoice, and payment under one name — with custom fields for whatever your trade tracks. Switching over? The CSV importer reads Jobber and Housecall Pro exports as-is.',
                delay: 0,
              },
              {
                kicker: 'Online Booking & Requests',
                hook: 'New leads while you sleep.',
                copy: 'Booking forms you can embed on your website or share anywhere. Customers can even pick a real time slot from your live availability — and you approve it before it touches the calendar.',
                delay: 120,
              },
              {
                kicker: 'Scheduling & Appointments',
                hook: 'Drag it onto the calendar. Done.',
                copy: 'Month, week, and day views with crew assignment. Estimate appointments — phone, video, or in-person — live on the same calendar, so sales visits and job visits never collide.',
                delay: 60,
              },
              {
                kicker: 'Job Pipeline',
                hook: 'Know where every job stands.',
                copy: 'Active, invoiced, paid — every job in a clear pipeline, with before-and-after photos, notes, and assignments on the record instead of a text thread.',
                delay: 180,
              },
            ].map((f) => (
              <AnimateIn key={f.kicker} delay={f.delay}>
                <div
                  className="card-lift p-8 flex flex-col h-full"
                  style={{ border: '1px solid rgba(255,255,255,0.09)', backgroundColor: '#111511', borderLeft: '3px solid #22C55E' }}
                >
                  <p
                    className="text-xs font-bold uppercase tracking-widest mb-3"
                    style={{ color: '#22C55E', ...OXANIUM }}
                  >
                    {f.kicker}
                  </p>
                  <p className="text-xl font-bold text-white mb-3" style={OXANIUM}>
                    {f.hook}
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
                    {f.copy}
                  </p>
                </div>
              </AnimateIn>
            ))}
          </div>
        </div>
      </section>

      {/* ── SECTION 02: THE MONEY FLOW ── paper ── */}
      <section className="py-24 bg-paper">
        <div className="max-w-7xl mx-auto px-6 lg:px-8">

          <AnimateIn className="mb-14">
            <span
              className="text-6xl font-bold block mb-4"
              style={{ color: '#22C55E', ...OXANIUM, lineHeight: 1 }}
            >
              02
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold mb-5"
              style={{ color: '#0A0A0F', ...OXANIUM }}
            >
              The Money Flow
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              Five steps from handshake to paid — no disconnected apps, nothing re-entered,
              nobody chasing checks.
            </p>
          </AnimateIn>

          {/* The five steps */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
            {[
              {
                step: '1',
                title: 'Quote',
                copy: 'Built from your price book, with optional add-ons and discounts. The customer approves online with an e-signature.',
              },
              {
                step: '2',
                title: 'Deposit',
                copy: 'Take money down — percent, fixed, or the full amount — collected before the work starts.',
              },
              {
                step: '3',
                title: 'Invoice',
                copy: 'One click turns the finished job into an invoice. The deposit nets out automatically.',
              },
              {
                step: '4',
                title: 'Payment',
                copy: 'Card & ACH on a branded pay page — surcharge option built in. Cash, check, Venmo, Zelle? Recorded in the same ledger.',
              },
              {
                step: '5',
                title: 'Reminders',
                copy: 'Overdue? It follows up at the due date, then 3, 7, and 14 days — and stops the moment they pay.',
              },
            ].map((s, i) => (
              <AnimateIn key={s.step} delay={i * 80}>
                <div className="card-lift h-full bg-white" style={{ border: '1px solid #E5E7EB' }}>
                  <div style={{ height: '4px', backgroundColor: '#22C55E' }} />
                  <div className="p-6">
                    <p className="mb-3" style={{ ...OXANIUM, color: '#22C55E', fontSize: '2rem', fontWeight: 700, lineHeight: 1 }}>
                      {s.step}
                    </p>
                    <p
                      className="text-sm font-bold uppercase tracking-widest mb-2.5"
                      style={{ color: '#0A0A0F', ...OXANIUM }}
                    >
                      {s.title}
                    </p>
                    <p className="text-sm leading-relaxed" style={{ color: '#6B7280' }}>
                      {s.copy}
                    </p>
                  </div>
                </div>
              </AnimateIn>
            ))}
          </div>

          {/* Insights bar */}
          <AnimateIn className="mb-10">
            <div
              className="flex flex-wrap items-center justify-between gap-4 p-7"
              style={{ backgroundColor: '#0C0F0C', border: '1px solid rgba(255,255,255,0.08)' }}
            >
              <div>
                <p
                  className="text-xs font-bold uppercase tracking-widest mb-1.5"
                  style={{ color: '#22C55E', ...OXANIUM }}
                >
                  Expenses & Profit Insights
                </p>
                <p className="text-lg font-bold text-white" style={OXANIUM}>
                  Know what you made — not just what you billed.
                </p>
              </div>
              <p className="text-sm max-w-md leading-relaxed" style={{ color: 'rgba(255,255,255,0.5)' }}>
                Log expenses by category and the insights dashboard shows revenue, outstanding
                balances, and where the money went.
              </p>
            </div>
          </AnimateIn>

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
                    <p className="text-xl font-bold text-white mb-2" style={OXANIUM}>
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
              style={{ color: '#22C55E', ...OXANIUM, lineHeight: 1 }}
            >
              03
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold mb-5"
              style={{ color: '#0A0A0F', ...OXANIUM }}
            >
              Built for the Field
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: '#6B7280' }}>
              Your techs aren&apos;t at a desk. The tool works where the work happens — on the
              roof, in the crawlspace, in the driveway when the job is done.
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
                    style={{ color: '#22C55E', ...OXANIUM }}
                  >
                    Mobile-Friendly Field Access
                  </p>
                  <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.6)' }}>
                    The full tool works in any phone browser — no app to download, no version to
                    update. And techs get their own logins with tech-level permissions: they see
                    their schedule and their jobs, not your books.
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
                      className="px-5 py-4 bg-white"
                      style={{ border: '1px solid #E5E7EB', borderLeft: '3px solid #22C55E' }}
                    >
                      <p className="text-sm font-bold mb-0.5" style={{ color: '#0A0A0F', ...OXANIUM }}>
                        {item.label}
                      </p>
                      <p className="text-xs" style={{ color: '#6B7280' }}>{item.sub}</p>
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
              style={{ color: '#22C55E', ...OXANIUM }}
            >
              Built for Every Vertical
            </p>
            <h2
              className="text-2xl lg:text-3xl font-bold text-white max-w-lg leading-tight"
              style={OXANIUM}
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
              style={{ color: '#22C55E', ...OXANIUM, lineHeight: 1 }}
            >
              04
            </span>
            <h2
              className="text-3xl lg:text-4xl font-bold text-white mb-5"
              style={OXANIUM}
            >
              Grow & Manage
            </h2>
            <p className="text-base max-w-2xl leading-relaxed" style={{ color: 'rgba(255,255,255,0.55)' }}>
              The features that usually live behind a &ldquo;Pro plan&rdquo; paywall. Included here.
            </p>
          </AnimateIn>

          <div
            className="grid grid-cols-1 md:grid-cols-2"
            style={{ border: '1px solid rgba(255,255,255,0.09)' }}
          >
            {[
              {
                title: 'Recurring Services & Subscriptions',
                desc: 'Sell monthly, quarterly, or annual plans — the invoice (and the job) creates itself every cycle.',
              },
              {
                title: 'Automatic Review Requests',
                desc: 'The moment a job wraps, the customer gets a link to your review page — while they\'re still happy.',
              },
              {
                title: 'Branded Client Portal',
                desc: 'Clients log in with a magic link and see their quotes, invoices, and history. No passwords, no "can you resend that?" calls.',
              },
              {
                title: 'Contracts & E-Signatures',
                desc: 'Send agreements with any quote and collect a timestamped signature online — you can even block work until it\'s signed.',
              },
              {
                title: 'Team Roles & Lead Routing',
                desc: 'Owner, admin, sales, and tech roles — leads route to the right person automatically. Unlimited users, never per-seat.',
              },
              {
                title: 'Atlas, Your AI Assistant',
                desc: 'Ask "who owes me money?" and get a real answer from your data. Atlas drafts quotes, sends invoices, and sets your account up in about two minutes.',
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
                <div className="flex items-start gap-3 mb-3">
                  <div style={{ width: '22px', height: '2px', backgroundColor: '#22C55E', marginTop: '10px', flexShrink: 0 }} />
                  <h3
                    className="text-base font-bold text-white leading-snug"
                    style={OXANIUM}
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
                style={{ color: '#22C55E', ...OXANIUM }}
              >
                Why It&apos;s Free
              </p>
              <h2
                className="text-3xl lg:text-4xl font-bold mb-6 leading-tight"
                style={{ color: '#0A0A0F', ...OXANIUM }}
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
                  style={{ color: '#ffffff', ...OXANIUM }}
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
              style={OXANIUM}
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
              style={{ color: '#22C55E', ...OXANIUM }}
            >
              Get Started Free →
            </Link>
          </AnimateIn>
        </div>
      </section>
    </>
  );
}
